import test, { after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { URLSearchParams } from 'node:url';
import type { UserProfile } from '../src/types/index.ts';
import {
  assertSafeOutboundUrl,
  classifyNonPublicIpAddress,
  hasAlternateNumericIpEncoding,
  redactPiiForLogs,
  validatePublicOptOutUrlSyntax,
} from '../src/server/urlSafety.ts';
import {
  clearSessionSmtpCredentials,
  mintSessionToken,
  resolveSessionSmtpCredential,
  storeSessionSmtpCredential,
} from '../src/server/sessionSecurity.ts';
import {
  getAutomationCapabilities,
  shutdownBrowserAutomation,
} from '../src/server/browserAutomation/BrowserAutomationService.ts';
import {
  approveAndSubmitWorkflow,
  cancelSessionWorkflowJob,
  completeWorkflowEmailVerification,
  executeStandaloneVerificationLink,
  getSessionWorkflowJob,
  listSessionWorkflowJobs,
  purgeSessionWorkflows,
  recheckWorkflowListingRemoval,
  recordManualHandoffCompletion,
  startOptOutWorkflow,
} from '../src/server/browserAutomation/WorkflowRunner.ts';
import { enrichFieldOverridesWithAdapter } from '../src/server/browserAutomation/BrokerAdapters.ts';
import { submitWebFormViaRelay } from '../src/server/optOutCrawler.ts';
import {
  getExhaustiveBrokerRegistry,
  triggerAutonomousRegistryExpansion,
} from '../src/utils/dynamicBrokerRegistry.ts';
import { runBrokerScan } from '../src/utils/scanEngine.ts';

const TEST_PROFILE: UserProfile = {
  firstName: 'Jane',
  lastName: 'Doe',
  currentCity: 'Sacramento',
  currentState: 'CA',
  currentZip: '95814',
  currentStreet: '400 Capitol Mall',
  birthYear: String(new Date().getFullYear() - 38),
  phoneNumbers: ['(916) 555-0144'],
  emails: ['jane.doe@privacy.example'],
  relatives: ['Robert Doe'],
  previousLocations: [],
};

async function readPostBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface MockBrokerState {
  submissions: Array<Record<string, string>>;
  verifiedTokens: string[];
  listingRemoved: boolean;
  lastVerifyQuery: string;
}

async function startMockBrokerServer(): Promise<{
  baseUrl: string;
  state: MockBrokerState;
  close: () => Promise<void>;
}> {
  const state: MockBrokerState = {
    submissions: [],
    verifiedTokens: [],
    listingRemoved: false,
    lastVerifyQuery: '',
  };

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    // 1. Broker homepage with disguised footer opt-out link
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><title>MockPeopleIndex Directory</title></head>
  <body>
    <header><h1>Public Directory Search</h1></header>
    <footer>
      <a href="/about">About Us</a>
      <a href="/terms">Terms</a>
      <a href="/your-privacy-choices">Your Privacy Choices &amp; Do Not Sell My Personal Information</a>
    </footer>
  </body>
</html>`);
      return;
    }

    // 2. Client-side JS SPA opt-out form with CSRF token, honeypot, SSN trap, marketing box & SSRF subresource probe
    if (req.method === 'GET' && pathname === '/your-privacy-choices') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><title>Consumer Privacy Suppression Portal</title></head>
  <body>
    <div id="spa-root">Loading privacy portal...</div>
    <img src="http://169.254.169.254/latest/meta-data/iam/security-credentials/" alt="" />
    <script>
      document.getElementById('spa-root').innerHTML = \`
        <h1>Suppress My Personal Information</h1>
        <form method="POST" action="/submit-spa-optout">
          <input type="hidden" name="csrf_token" value="CSRF-SPA-998877" />
          <label for="f_name">First Name *</label>
          <input id="f_name" name="first_name" type="text" required />
          <label for="l_name">Last Name *</label>
          <input id="l_name" name="last_name" type="text" required />
          <label for="c_email">Email Address *</label>
          <input id="c_email" name="email" type="email" required />
          <label for="c_phone">Phone Number</label>
          <input id="c_phone" name="phone" type="tel" />
          <label for="c_city">City *</label>
          <input id="c_city" name="city" type="text" required />
          <label for="c_state">State *</label>
          <select id="c_state" name="state" required>
            <option value="">Select State</option>
            <option value="TX">Texas</option>
            <option value="CA">California</option>
            <option value="NY">New York</option>
          </select>
          <label for="req_type">Request Type *</label>
          <select id="req_type" name="request_type" required>
            <option value="access">Access My Data</option>
            <option value="delete">Delete &amp; Opt Out of Sale</option>
          </select>
          <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off" />
          <label for="ssn_opt">Social Security Number (Optional)</label>
          <input id="ssn_opt" name="ssn" type="text" />
          <label><input type="checkbox" name="marketing_newsletter" value="yes" /> Subscribe to promotional partner offers</label>
          <label><input type="checkbox" name="attest_identity" value="true" required /> I declare under penalty that I am the consumer requesting deletion *</label>
          <button type="submit">Submit Opt-Out Request</button>
        </form>
      \`;
    </script>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/submit-spa-optout') {
      const raw = await readPostBody(req);
      const form = Object.fromEntries(new URLSearchParams(raw).entries());
      state.submissions.push(form);

      if (form.csrf_token !== 'CSRF-SPA-998877') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><p class="error-message">Invalid CSRF token mismatch.</p></body></html>');
        return;
      }
      if (form.website) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><p>Honeypot triggered.</p></body></html>');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><title>Opt-Out Request Received</title></head>
  <body>
    <h1>Your Opt-Out Request Has Been Received</h1>
    <p>Confirmation ID: OPT-2026-99418</p>
    <p>We will suppress your listing within 15 business days.</p>
  </body>
</html>`);
      return;
    }

    // 3. Broker that acknowledges receipt WITHOUT issuing any confirmation ticket code
    if (req.method === 'GET' && pathname === '/no-ticket-form') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <form method="POST" action="/no-ticket-submit">
      <label for="nf_full">Full Name *</label>
      <input id="nf_full" name="full_name" required />
      <label for="nf_email">Email *</label>
      <input id="nf_email" name="email" type="email" required />
      <button type="submit">Remove My Listing</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/no-ticket-submit') {
      const raw = await readPostBody(req);
      state.submissions.push(Object.fromEntries(new URLSearchParams(raw).entries()));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h2>We have received your opt-out request</h2>
    <p>Your information will be removed from public search results.</p>
  </body>
</html>`);
      return;
    }

    // 4. Broker returning HTTP 200 validation error page
    if (req.method === 'GET' && pathname === '/validation-error-form') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <form method="POST" action="/validation-error-submit">
      <label for="ve_email">Email *</label>
      <input id="ve_email" name="email" type="email" required />
      <button type="submit">Submit Request</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/validation-error-submit') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <div role="alert" class="error">Validation failed: missing required field record_token.</div>
  </body>
</html>`);
      return;
    }

    // 5. Multi-step Record Search -> Homonym Disqualification -> Wizard Step -> Final Submit
    if (req.method === 'GET' && pathname === '/lookup') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Locate Your Public Record</h1>
    <form method="GET" action="/lookup-results">
      <label for="q_first">First Name *</label>
      <input id="q_first" name="first_name" required />
      <label for="q_last">Last Name *</label>
      <input id="q_last" name="last_name" required />
      <button type="submit">Search Records</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'GET' && pathname === '/lookup-results') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Matching Directory Listings</h1>
    <div class="record-card" data-record-id="homonym_tx_99">
      <strong>Jane Doe</strong> — Age 64 — Austin, TX — Relatives: Mark Doe
      <a href="/wizard-step1?rec=homonym_tx_99">Opt Out This Record</a>
    </div>
    <div class="record-card" data-record-id="match_ca_01">
      <strong>Jane Doe</strong> — Age 38 — Sacramento, CA — Relatives: Robert Doe
      <a href="/wizard-step1?rec=match_ca_01">Opt Out This Record</a>
    </div>
  </body>
</html>`);
      return;
    }

    if (req.method === 'GET' && pathname === '/wizard-step1') {
      const rec = reqUrl.searchParams.get('rec') || 'unknown';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Step 1: Confirm Jurisdiction (${rec})</h1>
    <form method="GET" action="/wizard-final">
      <input type="hidden" name="selected_record" value="${rec}" />
      <label for="w_city">Current City *</label>
      <input id="w_city" name="city" required />
      <button type="submit">Continue</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'GET' && pathname === '/wizard-final') {
      const rec = reqUrl.searchParams.get('selected_record') || 'unknown';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Step 2: Finalize Email Verification</h1>
    <form method="POST" action="/wizard-submit">
      <input type="hidden" name="record_id" value="${rec}" />
      <label for="wf_email">Verification Email *</label>
      <input id="wf_email" name="email" type="email" required />
      <button type="submit">Confirm Removal</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/wizard-submit') {
      const raw = await readPostBody(req);
      const parsed = Object.fromEntries(new URLSearchParams(raw).entries());
      state.submissions.push(parsed);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Check Your Email Inbox</h1>
    <p>A verification link has been sent to confirm your email address to complete removal for ${parsed.record_id}.</p>
  </body>
</html>`);
      return;
    }

    // 6. Ambiguous multi-candidate page (two matching Sacramento CA listings)
    if (req.method === 'GET' && pathname === '/ambiguous-results') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Select Your Listing</h1>
    <div class="record-card" data-record-id="ca_dup_a">
      Jane Doe — Age 38 — Sacramento, CA
      <a href="/wizard-final?selected_record=ca_dup_a">Remove Record</a>
    </div>
    <div class="record-card" data-record-id="ca_dup_b">
      Jane Doe — Age 39 — Sacramento, CA
      <a href="/wizard-final?selected_record=ca_dup_b">Remove Record</a>
    </div>
  </body>
</html>`);
      return;
    }

    // 7. Inbound email verification landing page
    if (req.method === 'GET' && pathname === '/verify-email') {
      state.lastVerifyQuery = reqUrl.search;
      const token = reqUrl.searchParams.get('token') || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Confirm Email Suppression</h1>
    <form method="POST" action="/verify-email-complete">
      <input type="hidden" name="token" value="${token}" />
      <button type="submit">Confirm Opt-Out</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/verify-email-complete') {
      const raw = await readPostBody(req);
      const parsed = Object.fromEntries(new URLSearchParams(raw).entries());
      state.verifiedTokens.push(parsed.token || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Suppression Confirmed</h1>
    <p>Ticket #: VER-TICKET-88210</p>
  </body>
</html>`);
      return;
    }

    // 8. Public profile listing endpoint for post-submission recheck
    if (req.method === 'GET' && pathname === '/public-profile/jane-doe') {
      if (state.listingRemoved) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html>
<html>
  <body>
    <h1>0 results — Profile has been removed</h1>
  </body>
</html>`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <div class="person-card" data-record-id="live_1">
      Jane Doe — Age 38 — Sacramento, CA — (916) 555-0144
      <a href="/optout">Opt Out</a>
    </div>
  </body>
</html>`);
      return;
    }

    // 9. CAPTCHA & WAF challenge portals
    if (req.method === 'GET' && pathname === '/captcha-portal') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <form method="POST" action="/should-never-post">
      <input name="email" type="email" required />
      <div class="g-recaptcha" data-sitekey="test-site-key"></div>
      <button type="submit">Submit Opt-Out</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'GET' && pathname === '/waf-challenge') {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><head><title>Just a moment...</title></head><body>__cf_chl_opt</body></html>');
      return;
    }

    // 10. Excessive government ID demand form (11 CCR § 7060)
    if (req.method === 'GET' && pathname === '/excessive-id-form') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <form method="POST" action="/should-never-post">
      <label for="id_email">Email *</label>
      <input id="id_email" name="email" type="email" required />
      <label for="id_ssn">Full Social Security Number *</label>
      <input id="id_ssn" name="ssn_required" type="text" required />
      <button type="submit">Submit Deletion</button>
    </form>
  </body>
</html>`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral mock broker server');
  }

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

after(async () => {
  purgeSessionWorkflows();
  clearSessionSmtpCredentials();
  await shutdownBrowserAutomation();
});

test('29. SSRF & DNS-Rebinding Guard: Alternate IPv4 Encodings, IPv6 Mapped/NAT64 Ranges & Non-HTTP Schemes', async () => {
  // 1. Non-canonical decimal, hex, octal, and shorthand IPv4 hostnames
  assert.ok(hasAlternateNumericIpEncoding('2130706433'), 'Must block decimal integer IPv4 (127.0.0.1)');
  assert.ok(hasAlternateNumericIpEncoding('2852039166'), 'Must block decimal metadata IPv4 (169.254.169.254)');
  assert.ok(hasAlternateNumericIpEncoding('0x7f000001'), 'Must block hex integer IPv4');
  assert.ok(hasAlternateNumericIpEncoding('0x7f.0.0.1'), 'Must block dotted hex IPv4');
  assert.ok(hasAlternateNumericIpEncoding('0177.0.0.1'), 'Must block octal IPv4');
  assert.ok(hasAlternateNumericIpEncoding('127.1'), 'Must block 2-part shorthand IPv4');
  assert.ok(hasAlternateNumericIpEncoding('10.0.1'), 'Must block 3-part shorthand IPv4');
  assert.strictEqual(hasAlternateNumericIpEncoding('93.184.216.34'), null, 'Canonical public IPv4 must pass encoding check');

  // 2. IPv4 and IPv6 private, loopback, CGNAT, cloud-metadata, and NAT64 CIDR blocks
  for (const blockedIp of [
    '0.0.0.0',
    '10.24.0.5',
    '100.64.1.10',
    '100.100.100.200',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.25',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b::7f00:1',
    'fd00:ec2::254',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ]) {
    assert.ok(
      classifyNonPublicIpAddress(blockedIp),
      `Expected non-public IP ${blockedIp} to be blocked`
    );
  }
  assert.strictEqual(classifyNonPublicIpAddress('93.184.216.34'), null);
  assert.strictEqual(classifyNonPublicIpAddress('2606:2800:220:1:248:1893:25c8:1946'), null);

  // 3. Syntax checks for forbidden schemes, embedded credentials, internal suffixes, and blocked ports
  assert.strictEqual(validatePublicOptOutUrlSyntax('file:///etc/passwd').valid, false);
  assert.strictEqual(validatePublicOptOutUrlSyntax('gopher://127.0.0.1:6379/_INFO').valid, false);
  assert.strictEqual(validatePublicOptOutUrlSyntax('javascript:alert(1)').valid, false);
  assert.strictEqual(validatePublicOptOutUrlSyntax('https://admin:secret@spokeo.com/optout').valid, false);
  assert.strictEqual(validatePublicOptOutUrlSyntax('http://metadata.google.internal/computeMetadata/v1/').valid, false);
  assert.strictEqual(validatePublicOptOutUrlSyntax('https://redis.svc.cluster.local/optout').valid, false);
  assert.strictEqual(validatePublicOptOutUrlSyntax('https://spokeo.com:6379/optout').valid, false);

  // 4. DNS-rebinding defense: public-looking domain resolving to internal / metadata A or AAAA records
  await assert.rejects(
    () =>
      assertSafeOutboundUrl('https://rebind-broker.example/optout', {
        dnsLookup: async () => [{ address: '169.254.169.254', family: 4 }],
      }),
    /Blocked private or non-public DNS resolution/i
  );

  await assert.rejects(
    () =>
      assertSafeOutboundUrl('https://rebind-ipv6.example/optout', {
        dnsLookup: async () => [{ address: 'fd00:ec2::254', family: 6 }],
      }),
    /Blocked private or non-public DNS resolution/i
  );

  const safeResolved = await assertSafeOutboundUrl('https://verified-broker.example/optout', {
    dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  assert.strictEqual(safeResolved.valid, true);
  assert.deepStrictEqual(safeResolved.resolvedAddresses, ['93.184.216.34']);

  // 5. Log PII redaction
  const redacted = redactPiiForLogs(
    'Submitting for jane.doe@privacy.example phone (916) 555-0144 SSN 123-45-6789 Bearer eyJhbGciOiJIUzI1NiJ9.secret'
  );
  assert.ok(!redacted.includes('jane.doe@privacy.example'));
  assert.ok(!redacted.includes('555-0144'));
  assert.ok(!redacted.includes('123-45-6789'));
  assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiJ9'));
});

test('30. Playwright Headless Browser Engine: Disguised Portal Discovery, SPA Form Fill, CSRF Preservation, Honeypot/SSN Skip & Subresource SSRF Block', async () => {
  const caps = getAutomationCapabilities();
  assert.strictEqual(caps.headlessBrowserAvailable, true, 'Headless Chromium must be available in test runtime');

  const mock = await startMockBrokerServer();
  const sessionId = mintSessionToken();

  try {
    // Start from root homepage URL so WorkflowRunner discovers `/your-privacy-choices`, hydrates SPA,
    // blocks the embedded 169.254.169.254 <img> request, skips honeypot/SSN/marketing, preserves CSRF, and submits!
    const job = await startOptOutWorkflow({
      sessionId,
      brokerId: 'mock-spa-broker',
      brokerName: 'MockPeopleIndex',
      brokerDomain: '127.0.0.1',
      targetUrl: mock.baseUrl,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      senderEmail: 'jane.connected@privacy.example',
      disclosurePolicy: {
        allowPhone: false, // Explicitly disallow optional phone disclosure
        allowStreetAddress: false,
        allowZip: true,
        allowBirthYearOrAge: true,
        allowAuthorizedAgent: true,
        minimumRequiredFieldConfidence: 0.72,
      },
      allowLoopbackForTests: true,
    });

    assert.strictEqual(job.state, 'awaiting_broker_processing');
    assert.strictEqual(job.brokerConfirmationCode, 'OPT-2026-99418');
    assert.ok(job.internalSubmissionId.startsWith('JOB-SUB-'));
    assert.ok(job.targetUrl.endsWith('/your-privacy-choices'), 'Must discover disguised /your-privacy-choices link');

    // Verify exact payload received by mock broker server
    assert.strictEqual(mock.state.submissions.length, 1);
    const posted = mock.state.submissions[0];
    assert.strictEqual(posted.csrf_token, 'CSRF-SPA-998877', 'Must preserve hidden CSRF token');
    assert.strictEqual(posted.first_name, 'Jane');
    assert.strictEqual(posted.last_name, 'Doe');
    assert.strictEqual(posted.email, 'jane.connected@privacy.example');
    assert.strictEqual(posted.city, 'Sacramento');
    assert.strictEqual(posted.state, 'CA', 'Must map California <select> option to CA');
    assert.strictEqual(posted.request_type, 'delete', 'Must select deletion/opt-out option');
    assert.strictEqual(posted.attest_identity, 'true');
    assert.strictEqual(posted.phone || '', '', 'Must withhold optional phone when allowPhone is false');
    assert.strictEqual(posted.website || '', '', 'Must never populate hidden honeypot trap');
    assert.strictEqual(posted.ssn || '', '', 'Must never populate optional SSN field');
    assert.strictEqual(posted.marketing_newsletter, undefined, 'Must never check promotional marketing checkbox');

    // Verify subresource SSRF interception blocked 169.254.169.254 inside Playwright
    assert.ok(
      job.ssrfBlockedRequests.some((u) => u.includes('169.254.169.254')),
      'Playwright route interceptor must block cloud-metadata subresource requests'
    );

    // Verify signed cryptographic SubmissionEvidenceArtifact
    assert.ok(job.evidence, 'Must generate SubmissionEvidenceArtifact');
    assert.strictEqual(job.evidence!.domSnapshotSha256.length, 64);
    assert.strictEqual(job.evidence!.evidenceManifestSha256.length, 64);
    assert.strictEqual(job.evidence!.brokerConfirmationCode, 'OPT-2026-99418');
    assert.ok(
      !job.evidence!.redactedResponseExcerpt.includes('jane.connected@privacy.example'),
      'Evidence excerpt must redact raw PII'
    );

    // Verify idempotency deduplication prevents double submission on identical retry
    const duplicateJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'mock-spa-broker',
      brokerName: 'MockPeopleIndex',
      brokerDomain: '127.0.0.1',
      targetUrl: mock.baseUrl,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      senderEmail: 'jane.connected@privacy.example',
      allowLoopbackForTests: true,
    });
    assert.strictEqual(duplicateJob.jobId, job.jobId, 'Duplicate submission in same session must return existing job');
    assert.strictEqual(mock.state.submissions.length, 1, 'Must not double-POST to broker portal');
  } finally {
    await mock.close();
  }
});

test('31. Honest Outcome Classification: Zero Fabricated Tickets, Validation Error Rejection & Relay Honesty', async () => {
  const mock = await startMockBrokerServer();
  const sessionId = mintSessionToken();

  try {
    // 1. Broker acknowledges receipt WITHOUT issuing a ticket code -> brokerConfirmationCode MUST be null
    const noTicketJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'no-ticket-broker',
      brokerName: 'NoTicketDirectory',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/no-ticket-form`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });

    assert.strictEqual(noTicketJob.state, 'awaiting_broker_processing');
    assert.strictEqual(
      noTicketJob.brokerConfirmationCode,
      null,
      'Must never invent a fake SUBMIT-* or WEBFORM-* ticket when broker did not issue one'
    );
    assert.ok(noTicketJob.internalSubmissionId.startsWith('JOB-SUB-'));

    // 2. HTTP 200 form validation failure must transition to `failed`, never `submitted`
    const invalidJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'validation-fail-broker',
      brokerName: 'StrictValidationBroker',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/validation-error-form`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });

    assert.strictEqual(invalidJob.state, 'failed');
    assert.strictEqual(invalidJob.brokerConfirmationCode, null);

    // 3. Direct HTTP form relay also separates internalSubmissionId from null brokerConfirmationCode
    const relayRes = await submitWebFormViaRelay({
      actionUrl: `${mock.baseUrl}/no-ticket-submit`,
      method: 'POST',
      fields: {
        full_name: 'Jane Doe',
        email: 'jane.doe@privacy.example',
      },
      allowLoopbackForTests: true,
    });
    assert.strictEqual(relayRes.success, true);
    assert.strictEqual(relayRes.brokerConfirmationCode, null);
    assert.strictEqual(relayRes.confirmationTicket, '');
    assert.ok(relayRes.internalSubmissionId.startsWith('JOB-RELAY-'));
  } finally {
    await mock.close();
  }
});

test('32. Multi-Step Record Search, Homonym Disqualification, Ambiguous Candidate Selection, Email Verification & Live Removal Recheck', async () => {
  const mock = await startMockBrokerServer();
  const sessionId = mintSessionToken();

  try {
    // 1. Lookup -> disqualifies Austin TX homonym (Age 64) -> auto-selects Sacramento CA (Age 38) -> advances Step 1 -> submits Step 2 -> awaiting_email_verification
    const wizardJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'wizard-broker',
      brokerName: 'MultiStepPeopleSearch',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/lookup`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });

    assert.strictEqual(wizardJob.state, 'awaiting_email_verification');
    assert.strictEqual(wizardJob.selectedCandidateId, 'match_ca_01');
    const txCandidate = wizardJob.candidateRecords.find((c) => c.candidateId === 'homonym_tx_99');
    assert.ok(txCandidate && txCandidate.disqualifiedHomonym, 'Out-of-state TX homonym must be disqualified');
    assert.strictEqual(mock.state.submissions.at(-1)?.record_id, 'match_ca_01');

    // 2. Reject external phishing verification link & failed SPF/DKIM email header
    await assert.rejects(
      () =>
        completeWorkflowEmailVerification({
          sessionId,
          jobId: wizardJob.jobId,
          verificationUrl: 'https://evil-phishing-tracker.example/verify?token=steal',
        }),
      /Could not resolve|Domain Mismatch Blocked/i
    );

    await assert.rejects(
      () =>
        completeWorkflowEmailVerification({
          sessionId,
          jobId: wizardJob.jobId,
          verificationUrl: `${mock.baseUrl}/verify-email?token=tok_valid_1`,
          rawEmailText: 'Authentication-Results: mx.google.com; spf=fail smtp.mailfrom=spoof',
        }),
      /SPF\/DKIM\/DMARC/i
    );

    // 3. Complete legitimate inbound email verification link (stripping utm_source & fbclid trackers)
    const verifiedJob = await completeWorkflowEmailVerification({
      sessionId,
      jobId: wizardJob.jobId,
      verificationUrl: `${mock.baseUrl}/verify-email?token=tok_valid_99&utm_source=email&fbclid=IwAR123`,
    });

    assert.strictEqual(verifiedJob.state, 'awaiting_broker_processing');
    assert.strictEqual(verifiedJob.brokerConfirmationCode, 'VER-TICKET-88210');
    assert.ok(mock.state.verifiedTokens.includes('tok_valid_99'));
    assert.ok(
      !mock.state.lastVerifyQuery.includes('utm_source') &&
        !mock.state.lastVerifyQuery.includes('fbclid'),
      'Tracking query parameters must be stripped before visiting verification URL'
    );

    // 4. Post-submission live recheck: stays awaiting_broker_processing while record is still online,
    //    then transitions to removal_verified ONLY after the listing actually disappears!
    const stillPresentJob = await recheckWorkflowListingRemoval({
      sessionId,
      jobId: wizardJob.jobId,
      checkUrl: `${mock.baseUrl}/public-profile/jane-doe`,
    });
    assert.strictEqual(stillPresentJob.state, 'awaiting_broker_processing');
    assert.strictEqual(stillPresentJob.recheckResult?.listingStillPresent, true);
    assert.strictEqual(stillPresentJob.recheckResult?.verifiedRemoved, false);

    mock.state.listingRemoved = true;
    const confirmedRemovedJob = await recheckWorkflowListingRemoval({
      sessionId,
      jobId: wizardJob.jobId,
      checkUrl: `${mock.baseUrl}/public-profile/jane-doe`,
    });
    assert.strictEqual(confirmedRemovedJob.state, 'removal_verified');
    assert.strictEqual(confirmedRemovedJob.recheckResult?.listingStillPresent, false);
    assert.strictEqual(confirmedRemovedJob.recheckResult?.verifiedRemoved, true);

    // 5. Ambiguous in-state duplicate candidates pause for user confirmation, then resume cleanly
    const ambiguousJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'ambiguous-broker',
      brokerName: 'AmbiguousDirectory',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/ambiguous-results`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });
    assert.strictEqual(ambiguousJob.state, 'awaiting_user_input');
    assert.strictEqual(ambiguousJob.blocker?.kind, 'ambiguous_record_match');

    const resumedJob = await approveAndSubmitWorkflow({
      sessionId,
      jobId: ambiguousJob.jobId,
      selectedCandidateId: 'ca_dup_b',
    });
    assert.strictEqual(resumedJob.state, 'awaiting_email_verification');
    assert.strictEqual(resumedJob.selectedCandidateId, 'ca_dup_b');
    assert.strictEqual(mock.state.submissions.at(-1)?.record_id, 'ca_dup_b');
  } finally {
    await mock.close();
  }
});

test('33. Anti-Bot CAPTCHA/WAF Pause, 11 CCR § 7060 Excessive ID Pause, Manual Handoff & Worker Unavailable Fallback', async () => {
  const mock = await startMockBrokerServer();
  const sessionId = mintSessionToken();

  try {
    // 1. Google reCAPTCHA pauses cleanly without evasion
    const captchaJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'captcha-broker',
      brokerName: 'RecaptchaPortal',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/captcha-portal`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });
    assert.strictEqual(captchaJob.state, 'blocked');
    assert.strictEqual(captchaJob.blocker?.kind, 'recaptcha');
    assert.strictEqual(captchaJob.blocker?.requiresHumanAction, true);

    // User completes manual Bookmarklet handoff without confirmation code -> submitted_unconfirmed
    const handedOffUnconfirmed = recordManualHandoffCompletion({
      sessionId,
      jobId: captchaJob.jobId,
    });
    assert.strictEqual(handedOffUnconfirmed.state, 'submitted_unconfirmed');
    assert.strictEqual(handedOffUnconfirmed.brokerConfirmationCode, null);

    // 2. Cloudflare WAF HTTP 403 challenge pauses cleanly
    const wafJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'waf-broker',
      brokerName: 'CloudflareProtectedBroker',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/waf-challenge`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });
    assert.strictEqual(wafJob.state, 'blocked');
    assert.strictEqual(wafJob.blocker?.kind, 'cloudflare_waf');

    // 3. Required SSN field pauses under 11 CCR § 7060 data-minimization guard
    const ssnJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'ssn-demand-broker',
      brokerName: 'UnlawfulIdBroker',
      brokerDomain: '127.0.0.1',
      targetUrl: `${mock.baseUrl}/excessive-id-form`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });
    assert.strictEqual(ssnJob.state, 'awaiting_user_input');
    assert.strictEqual(ssnJob.blocker?.kind, 'excessive_id_demand');

    // 4. Static / workerless environment fallback (`forceWorkerUnavailableForTests: true`)
    const unavailableJob = await startOptOutWorkflow({
      sessionId,
      brokerId: 'static-mode-broker',
      brokerName: 'StaticFallbackBroker',
      brokerDomain: 'spokeo.com',
      targetUrl: 'https://www.spokeo.com/optout',
      mode: 'inspect_and_preview',
      profile: TEST_PROFILE,
      forceWorkerUnavailableForTests: true,
    });
    assert.strictEqual(unavailableJob.state, 'blocked');
    assert.strictEqual(unavailableJob.blocker?.kind, 'worker_unavailable');
  } finally {
    await mock.close();
  }
});

test('34. Per-Session Job & Encrypted Credential Vault Isolation + Honest Non-Synthetic Broker Registry', async () => {
  const sessionA = mintSessionToken();
  const sessionB = mintSessionToken();

  // 1. Encrypted server-side RAM SMTP credential vault isolates sessions strictly
  const stored = storeSessionSmtpCredential(sessionA, {
    provider: 'gmail',
    userEmail: 'alice@gmail.com',
    normalizedAuthPass: 'abcdefghijklmnop',
    resolvedHost: 'smtp.gmail.com',
    resolvedPort: 465,
    resolvedSecure: true,
  });
  assert.ok(stored.credentialId.startsWith('cred_'));

  assert.strictEqual(
    resolveSessionSmtpCredential(sessionB, stored.credentialId),
    null,
    'Session B must never decrypt Session A SMTP credentialId'
  );
  const decryptedA = resolveSessionSmtpCredential(sessionA, stored.credentialId);
  assert.strictEqual(decryptedA?.userEmail, 'alice@gmail.com');
  assert.strictEqual(decryptedA?.normalizedAuthPass, 'abcdefghijklmnop');

  clearSessionSmtpCredentials(sessionA);
  assert.strictEqual(
    resolveSessionSmtpCredential(sessionA, stored.credentialId),
    null,
    'Purged session credential must be immediately wiped from RAM vault'
  );

  // 2. Workflow jobs are isolated per sessionId
  const jobA = await startOptOutWorkflow({
    sessionId: sessionA,
    brokerId: 'spokeo',
    brokerName: 'Spokeo',
    brokerDomain: 'spokeo.com',
    targetUrl: 'https://www.spokeo.com/optout',
    mode: 'inspect_and_preview',
    profile: TEST_PROFILE,
    forceWorkerUnavailableForTests: true,
  });

  assert.ok(getSessionWorkflowJob(sessionA, jobA.jobId));
  assert.strictEqual(
    getSessionWorkflowJob(sessionB, jobA.jobId),
    null,
    'Session B must never access Session A workflow job'
  );
  assert.strictEqual(listSessionWorkflowJobs(sessionB).length, 0);
  assert.throws(
    () => cancelSessionWorkflowJob(sessionB, jobA.jobId),
    /Workflow job not found/i
  );

  // 3. Registry honesty: zero synthetic `-affiliate-` domains, and scan results explicitly labeled heuristic_risk_estimate
  triggerAutonomousRegistryExpansion();
  triggerAutonomousRegistryExpansion();
  const fullRegistry = getExhaustiveBrokerRegistry();
  assert.ok(
    fullRegistry.every((b) => !b.id.includes('-affiliate-') && !b.domain.includes('-affiliate-')),
    'Dynamic broker registry must never fabricate synthetic -affiliate- entries'
  );

  const scanResults = runBrokerScan(TEST_PROFILE);
  const exposed = scanResults.filter((r) => r.status === 'exposed');
  assert.ok(exposed.length > 0);
  for (const item of exposed) {
    assert.strictEqual(item.verificationSource, 'heuristic_exposure_estimate');
    assert.strictEqual(item.liveProbeStatus, 'unprobed');
  }
});

test('35. Standalone Harvested Verification Link Execution & Broker Playbook Field Enrichment', async () => {
  const mock = await startMockBrokerServer();

  try {
    // 1. Reject phishing domain mismatch before launching Chromium
    await assert.rejects(
      () =>
        executeStandaloneVerificationLink({
          verificationUrl: 'https://evil-phishing.example/verify?token=steal',
          expectedBrokerDomain: 'spokeo.com',
        }),
      /Could not resolve|Domain Mismatch Blocked/i
    );

    // 2. Execute harvested confirmation link in isolated Chromium without prior RAM workflow job
    const standalone = await executeStandaloneVerificationLink({
      verificationUrl: `${mock.baseUrl}/verify-email?token=harvest_tok_77&utm_source=email&mc_eid=track99`,
      expectedBrokerDomain: '127.0.0.1',
      allowLoopbackForTests: true,
    });

    assert.strictEqual(standalone.verified, true);
    assert.strictEqual(standalone.brokerConfirmationCode, 'VER-TICKET-88210');
    assert.strictEqual(standalone.evidenceSha256.length, 64);
    assert.ok(mock.state.verifiedTokens.includes('harvest_tok_77'));
    assert.ok(
      !mock.state.lastVerifyQuery.includes('utm_source') &&
        !mock.state.lastVerifyQuery.includes('mc_eid'),
      'Standalone verification executor must strip email trackers prior to navigation'
    );

    // 3. Broker Playbook field enrichment injects deterministic profile URLs for Spokeo/Whitepages
    const { resolveBrokerPlaybook } = await import('../src/utils/brokerAdapterCatalog.ts');
    const spokeoPlaybook = resolveBrokerPlaybook('spokeo.com')!;
    const mockUrlPage = {
      evaluate: async () => ['profile_url'],
    } as any;

    const spokeoEnriched = await enrichFieldOverridesWithAdapter({
      page: mockUrlPage,
      playbook: spokeoPlaybook,
      brokerDomain: 'spokeo.com',
      profile: TEST_PROFILE,
      existingOverrides: {},
      extractedListingUrl: null,
    });
    assert.strictEqual(
      spokeoEnriched.profile_url,
      'https://www.spokeo.com/Jane-Doe/CA/Sacramento'
    );

    // Live extracted listing URL takes priority over synthesized slug, while explicit user override wins overall
    const liveListingEnriched = await enrichFieldOverridesWithAdapter({
      page: mockUrlPage,
      playbook: spokeoPlaybook,
      brokerDomain: 'spokeo.com',
      profile: TEST_PROFILE,
      existingOverrides: {},
      extractedListingUrl: 'https://www.spokeo.com/Jane-Doe/California/p99887766',
    });
    assert.strictEqual(
      liveListingEnriched.profile_url,
      'https://www.spokeo.com/Jane-Doe/California/p99887766'
    );
  } finally {
    await mock.close();
  }
});

test('36. Navbar Dropdown Stacking Layer Above Sub-Bar & Hover/Click Selection Persistence', async () => {
  const { createServer: createViteServer } = await import('vite');
  const { chromium } = await import('playwright-core');
  const { resolveChromiumExecutablePath } = await import(
    '../src/server/browserAutomation/BrowserAutomationService.ts'
  );

  const vite = await createViteServer({
    server: { port: 0, host: '127.0.0.1', hmr: false, ws: false },
    appType: 'spa',
  });
  await vite.listen();
  const addr = vite.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const appUrl = `http://127.0.0.1:${port}`;

  const execPath = resolveChromiumExecutablePath();
  assert.ok(execPath, 'Chromium binary must be available for Playwright UI layer verification');

  const browser = await chromium.launch({
    headless: true,
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(appUrl, { waitUntil: 'networkidle' });

    // 1. Click "Suppression" category button -> dropdown opens & pins on top of bottom horizontal sub-bar
    const suppressionBtn = page.locator('nav[aria-label="Primary Categories"] button', {
      hasText: 'Suppression',
    });
    await suppressionBtn.click();

    const menu = page.locator('[role="menu"]');
    await menu.waitFor({ state: 'visible' });

    // Verify at the exact Y coordinate of the bottom horizontal sub-bar (.glass-subnav),
    // document.elementFromPoint hits the dropdown menu (top layer), NEVER .glass-subnav!
    const topLayerHitCheck = await page.evaluate(() => {
      const menuEl = document.querySelector('[role="menu"]') as HTMLElement | null;
      const subnavEl = document.querySelector('.glass-subnav') as HTMLElement | null;
      if (!menuEl || !subnavEl) return { ok: false, reason: 'missing elements' };
      const menuRect = menuEl.getBoundingClientRect();
      const subnavRect = subnavEl.getBoundingClientRect();
      // Pick X inside dropdown and Y right in the middle of .glass-subnav
      const testX = Math.round(menuRect.left + menuRect.width / 2);
      const testY = Math.round(subnavRect.top + subnavRect.height / 2);
      const hitEl = document.elementFromPoint(testX, testY);
      return {
        ok: Boolean(hitEl && menuEl.contains(hitEl) && !subnavEl.contains(hitEl)),
        hitTag: hitEl?.tagName || null,
        insideMenu: Boolean(hitEl && menuEl.contains(hitEl)),
        insideSubnav: Boolean(hitEl && subnavEl.contains(hitEl)),
      };
    });
    assert.strictEqual(
      topLayerHitCheck.ok,
      true,
      `Dropdown menu must be the top hit-test layer over .glass-subnav (got ${JSON.stringify(topLayerHitCheck)})`
    );

    // Move mouse outside slightly while pinned -> must NOT vanish!
    await page.mouse.move(100, 300);
    await page.waitForTimeout(350);
    assert.strictEqual(
      await menu.isVisible(),
      true,
      'Clicked/pinned category dropdown must stay open until item selection or outside click'
    );

    // Select an item inside the dropdown ("Search De-Indexing") -> navigates and closes dropdown
    await menu.locator('[role="menuitem"]', { hasText: 'Search De-Indexing' }).click();
    await page.locator('h1', { hasText: 'Search Snippet' }).waitFor({ state: 'visible' });
    assert.strictEqual(await menu.count(), 0, 'Dropdown closes cleanly after selecting menu item');

    // 2. Pure Hover + Diagonal Cursor Movement Test:
    // Hover "Discovery", move diagonally across "Suppression"'s corner into "Discovery"'s dropdown, and click "Dark Web & Leaks"
    const discoveryBtn = page.locator('nav[aria-label="Primary Categories"] button', {
      hasText: 'Discovery',
    });
    const discBox = (await discoveryBtn.boundingBox())!;
    await page.mouse.move(discBox.x + discBox.width / 2, discBox.y + discBox.height / 2);
    await menu.waitFor({ state: 'visible' });

    const darkWebItem = menu.locator('[role="menuitem"]', { hasText: 'Dark Web & Leaks' });
    const itemBox = (await darkWebItem.boundingBox())!;

    // Smoothly step cursor from trigger across the gap into the menu item
    await page.mouse.move(itemBox.x + itemBox.width * 0.75, itemBox.y + itemBox.height / 2, {
      steps: 8,
    });
    await page.waitForTimeout(80);
    assert.strictEqual(
      await darkWebItem.isVisible(),
      true,
      'Dropdown must stay open when moving cursor from trigger across sub-bar to select an item'
    );
    await page.mouse.click(itemBox.x + itemBox.width * 0.75, itemBox.y + itemBox.height / 2);
    await page.locator('h1', { hasText: 'Dark Web Links' }).waitFor({ state: 'visible' });
  } finally {
    await browser.close();
    await vite.close();
  }
});

test('37. Animated Brand Splash Screen, Single Persistent Logo Incorporation & Post-Scan-Only NUKE ALL Gating', async () => {
  const { createServer: createViteServer } = await import('vite');
  const { chromium } = await import('playwright-core');
  const { resolveChromiumExecutablePath } = await import(
    '../src/server/browserAutomation/BrowserAutomationService.ts'
  );

  const vite = await createViteServer({
    server: { port: 0, host: '127.0.0.1', hmr: false, ws: false },
    appType: 'spa',
  });
  await vite.listen();
  const addr = vite.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const appUrl = `http://127.0.0.1:${port}`;

  const execPath = resolveChromiumExecutablePath();
  assert.ok(execPath, 'Chromium binary must be available for Playwright UI verification');

  const browser = await chromium.launch({
    headless: true,
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1. Initial load: verify animated brand splash screen renders with synOUT logo
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    const splash = page.getByTestId('synout-splash-screen');
    await splash.waitFor({ state: 'visible' });

    const splashLogoLoaded = await splash
      .locator('img[src="/synout-logo.svg"]')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    assert.strictEqual(splashLogoLoaded, true, 'Splash screen synOUT brand logo must load cleanly');

    // Wait for splash screen to finish its animation & unmount cleanly
    await splash.waitFor({ state: 'detached', timeout: 5000 });

    // 2. Persistent site UI: synOUT logo must be incorporated strictly ONCE
    const persistentLogos = page.locator('img[src="/synout-logo.svg"]');
    assert.strictEqual(
      await persistentLogos.count(),
      1,
      'synOUT logo must be incorporated strictly once in the persistent site UI'
    );
    const navLogoLoaded = await persistentLogos
      .first()
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    assert.strictEqual(navLogoLoaded, true, 'Navbar synOUT logo must load with non-zero dimensions');

    // 3. Before scan: ZERO "NUKE ALL" buttons anywhere on Home, Navbar, Suppression menu, or Broker Directory
    assert.strictEqual(
      await page.locator('button:has-text("NUKE ALL")').count(),
      0,
      'Before running a scan, no NUKE ALL buttons may render on Home or Navbar'
    );

    const suppressionBtn = page.locator(
      'nav[aria-label="Primary Categories"] button[aria-haspopup="menu"]',
      {
        hasText: 'Suppression',
      }
    );
    await suppressionBtn.click();
    const menu = page.locator('[role="menu"]');
    await menu.waitFor({ state: 'visible' });
    assert.strictEqual(
      await menu.locator('[role="menuitem"]:has-text("NUKE ALL")').count(),
      0,
      'Suppression compartment menu must omit NUKE ALL before scan'
    );
    // Close menu
    await suppressionBtn.click();

    // Check Broker Directory before scan as well
    await page.locator('button', { hasText: /Browse \d+ Brokers/i }).click();
    await page.locator('h1', { hasText: 'Broker Directory' }).waitFor({ state: 'visible' });
    assert.strictEqual(
      await page.locator('button:has-text("NUKE ALL")').count(),
      0,
      'Broker Directory must also hide NUKE ALL before user has completed a scan'
    );

    // 4. Complete an exposure scan -> verify "NUKE ALL" appears post-scan and logo remains strictly 1
    await page.locator('header button', { hasText: 'Start Audit' }).click();
    await page.locator('button[type="submit"]', { hasText: 'Run Exposure Audit' }).click();

    // Fast-forward LiveScanner to ExposureReport completion
    const instantBtn = page.locator('button', { hasText: 'Instant Results' });
    await instantBtn.waitFor({ state: 'visible', timeout: 5000 });
    await instantBtn.click();

    await page.locator('header button:has-text("NUKE ALL")').waitFor({
      state: 'visible',
      timeout: 5000,
    });

    assert.ok(
      (await page.locator('button:has-text("NUKE ALL")').count()) >= 1,
      'NUKE ALL button must display after user completes a scan'
    );

    // Verify Suppression compartment dropdown also now includes Mass Suppression (NUKE ALL)
    await suppressionBtn.click();
    await menu.waitFor({ state: 'visible' });
    assert.strictEqual(
      await menu.locator('[role="menuitem"]:has-text("NUKE ALL")').count(),
      1,
      'Suppression compartment menu must display NUKE ALL after scan completion'
    );
    await suppressionBtn.click();

    assert.strictEqual(
      await page.locator('img[src="/synout-logo.svg"]').count(),
      1,
      'synOUT logo count must remain strictly 1 after scan completion'
    );
  } finally {
    await browser.close();
    await vite.close();
  }
});

test('38. Automated Online Form Checkbox Checking: CSS-Styled Hidden Checkboxes, Custom ARIA Checkboxes, Marketing Skip & Candidate Record Checkboxes', async () => {
  const {
    inspectRawOptOutHtml,
    buildUniversalAutoFillScript,
  } = await import('../src/utils/optOutFormEngine.ts');

  const receivedSubmissions: Array<{ route: string; payload: Record<string, string> }> = [];

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    // A. Privacy opt-out form with CSS-styled opacity:0 checkbox + custom ARIA [role="checkbox"] + marketing box
    if (req.method === 'GET' && pathname === '/checkbox-heavy-optout') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><title>Consumer Suppression &amp; Consent Form</title></head>
  <body>
    <h1>Remove My Personal Record</h1>
    <form method="POST" action="/checkbox-heavy-submit">
      <label for="ch_first">First Name *</label>
      <input id="ch_first" name="first_name" type="text" required />
      <label for="ch_last">Last Name *</label>
      <input id="ch_last" name="last_name" type="text" required />
      <label for="ch_email">Email Address *</label>
      <input id="ch_email" name="email" type="email" required />

      <div class="styled-checkbox-wrapper">
        <input
          id="ccpa_consent_box"
          name="ccpa_consent"
          type="checkbox"
          value="confirmed_yes"
          style="opacity: 0; position: absolute; width: 1px; height: 1px;"
          required
        />
        <label for="ccpa_consent_box">
          I confirm I am at least 18 years old and request removal of my personal record *
        </label>
      </div>

      <input type="hidden" id="aria_dns_hidden" name="aria_do_not_sell" value="no" />
      <div
        id="custom_dns_box"
        role="checkbox"
        aria-checked="false"
        tabindex="0"
        style="padding: 8px; border: 1px solid #333; cursor: pointer;"
        onclick="this.setAttribute('aria-checked', 'true'); document.getElementById('aria_dns_hidden').value = 'yes';"
      >
        Do Not Sell or Share My Personal Information
      </div>

      <label>
        <input type="checkbox" name="promo_offers" value="yes" />
        Subscribe to promotional marketing offers from partner sponsors
      </label>

      <button type="submit">Submit Removal Request</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/checkbox-heavy-submit') {
      const raw = await readPostBody(req);
      const parsed = Object.fromEntries(new URLSearchParams(raw).entries());
      receivedSubmissions.push({ route: pathname, payload: parsed });

      if (parsed.ccpa_consent !== 'confirmed_yes' || parsed.aria_do_not_sell !== 'yes' || parsed.promo_offers) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body><div role="alert" class="error">Validation failed: required consent boxes were not properly checked (${JSON.stringify(parsed)}).</div></body></html>`);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Opt-Out Request Confirmed</h1>
    <p>Confirmation ID: CHK-2026-77102</p>
  </body>
</html>`);
      return;
    }

    // B. Multi-step candidate record results using <input type="checkbox"> + "Remove Selected" wizard button
    if (req.method === 'GET' && pathname === '/checkbox-candidate-results') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Select Your Record to Suppress</h1>
    <form method="GET" action="/checkbox-candidate-final">
      <div class="record-card" data-record-id="homonym_chk_tx">
        <label>
          <input type="checkbox" name="selected_records" value="homonym_chk_tx" />
          Jane Doe — Age 64 — Austin, TX — Relatives: Mark Doe
        </label>
      </div>
      <div class="record-card" data-record-id="match_chk_ca_01">
        <label>
          <input type="checkbox" name="selected_records" value="match_chk_ca_01" />
          Jane Doe — Age 38 — Sacramento, CA — Relatives: Robert Doe
        </label>
      </div>
      <button type="submit">Remove Selected</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'GET' && pathname === '/checkbox-candidate-final') {
      const selected = reqUrl.searchParams.get('selected_records') || 'none';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Finalize Suppression for ${selected}</h1>
    <form method="POST" action="/checkbox-candidate-submit">
      <input type="hidden" name="selected_record" value="${selected}" />
      <label for="cf_email">Confirmation Email *</label>
      <input id="cf_email" name="email" type="email" required />
      <label>
        <input type="checkbox" name="confirm_Authorized" required />
        I confirm removal of this listing *
      </label>
      <button type="submit">Submit Opt-Out</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (req.method === 'POST' && pathname === '/checkbox-candidate-submit') {
      const raw = await readPostBody(req);
      const parsed = Object.fromEntries(new URLSearchParams(raw).entries());
      receivedSubmissions.push({ route: pathname, payload: parsed });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <body>
    <h1>Your Opt-Out Request Has Been Received</h1>
    <p>Confirmation ID: CAND-CHK-55190</p>
  </body>
</html>`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const sessionId = mintSessionToken();

  try {
    // 1. Static HTML parser & universal bookmarklet verification
    const rawHtmlRes = await fetch(`${baseUrl}/checkbox-heavy-optout`);
    const rawHtml = await rawHtmlRes.text();
    const inspection = inspectRawOptOutHtml({
      pageUrl: `${baseUrl}/checkbox-heavy-optout`,
      html: rawHtml,
      profile: TEST_PROFILE,
      allowLoopbackForTests: true,
    });
    const primaryForm = inspection.forms[0];
    assert.ok(primaryForm, 'Must parse primary opt-out form');

    const ccpaField = primaryForm.fields.find((f) => f.name === 'ccpa_consent');
    assert.ok(ccpaField, 'Must detect CSS opacity:0 checkbox');
    assert.strictEqual(
      ccpaField!.semanticRole,
      'consent_checkbox',
      'CSS opacity:0 checkbox paired with a <label> must map to consent_checkbox, NEVER honeypot_trap'
    );
    assert.strictEqual(
      ccpaField!.suggestedValue,
      'confirmed_yes',
      'Must preserve custom checkbox value attribute when checking on user behalf'
    );

    const promoField = primaryForm.fields.find((f) => f.name === 'promo_offers');
    assert.ok(promoField);
    assert.strictEqual(promoField!.semanticRole, 'marketing_opt_in');
    assert.strictEqual(promoField!.disclosureAllowed, false);
    assert.strictEqual(promoField!.suggestedValue, '');

    const bookmarkletJs = buildUniversalAutoFillScript(TEST_PROFILE);
    assert.ok(
      bookmarkletJs.includes('[role="checkbox"]'),
      'Universal bookmarklet must check custom ARIA checkboxes on the user behalf'
    );

    // 2. Live Playwright WorkflowRunner on /checkbox-heavy-optout
    const job1 = await startOptOutWorkflow({
      sessionId,
      brokerId: 'mock-checkbox-portal',
      brokerName: 'CheckboxPortal',
      brokerDomain: '127.0.0.1',
      targetUrl: `${baseUrl}/checkbox-heavy-optout`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      senderEmail: 'jane.doe@privacy.example',
      allowLoopbackForTests: true,
    });

    assert.strictEqual(job1.state, 'awaiting_broker_processing');
    assert.strictEqual(job1.brokerConfirmationCode, 'CHK-2026-77102');

    const formPost = receivedSubmissions.find((s) => s.route === '/checkbox-heavy-submit');
    assert.ok(formPost, 'Must submit checkbox-heavy form');
    assert.strictEqual(formPost!.payload.ccpa_consent, 'confirmed_yes', 'Must check CSS-styled hidden checkbox via label');
    assert.strictEqual(formPost!.payload.aria_do_not_sell, 'yes', 'Must click custom ARIA [role="checkbox"]');
    assert.strictEqual(formPost!.payload.promo_offers, undefined, 'Must leave marketing checkbox unchecked');

    // 3. Live Playwright WorkflowRunner on /checkbox-candidate-results (multi-step candidate checkbox selection)
    const job2 = await startOptOutWorkflow({
      sessionId,
      brokerId: 'mock-candidate-checkbox',
      brokerName: 'CandidateCheckboxBroker',
      brokerDomain: '127.0.0.1',
      targetUrl: `${baseUrl}/checkbox-candidate-results`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      senderEmail: 'jane.doe@privacy.example',
      allowLoopbackForTests: true,
    });

    assert.strictEqual(job2.state, 'awaiting_broker_processing');
    assert.strictEqual(job2.brokerConfirmationCode, 'CAND-CHK-55190');

    const candPost = receivedSubmissions.find((s) => s.route === '/checkbox-candidate-submit');
    assert.ok(candPost, 'Must advance past candidate checkbox selection and submit final step');
    assert.strictEqual(
      candPost!.payload.selected_record,
      'match_chk_ca_01',
      'Must check ONLY the matching Sacramento CA candidate checkbox and skip Austin TX homonym'
    );
    assert.strictEqual(
      candPost!.payload.confirm_Authorized,
      'on',
      'Must also check required confirmation checkbox on final wizard step'
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('39. Email Confirmation Landing Page Auto-Checks Required Checkboxes & Skips Marketing Opt-Ins', async () => {
  let lastVerifyPost: Record<string, string> | null = null;

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && reqUrl.pathname === '/optout-start') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
        <html>
          <head><title>VerifyOptOut Broker</title></head>
          <body>
            <form method="POST" action="/optout-request">
              <label for="f_name">Full Name</label>
              <input id="f_name" name="full_name" type="text" required />
              <label for="f_email">Email</label>
              <input id="f_email" name="email" type="email" required />
              <button type="submit">Submit Request</button>
            </form>
          </body>
        </html>`);
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/optout-request') {
      await readPostBody(req);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
        <html>
          <head><title>Check Your Email</title></head>
          <body>
            <h1>Check your inbox to verify your email address</h1>
            <p>We sent a one-time confirmation link to complete your opt-out request.</p>
          </body>
        </html>`);
      return;
    }

    if (req.method === 'GET' && reqUrl.pathname === '/verify-landing') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
        <html>
          <head><title>Finalize Your Opt-Out</title></head>
          <body>
            <h1>Confirm Your Deletion Request</h1>
            <form id="verify-form" method="POST" action="/verify-complete">
              <input type="hidden" name="token" value="${reqUrl.searchParams.get('token') || ''}" />
              <div class="custom-chk">
                <input id="chk_confirm" name="confirm_suppression" type="checkbox" value="yes_suppress" required style="opacity:0;width:1px;height:1px;position:absolute;" />
                <label for="chk_confirm">I confirm permanent suppression of my personal record under CCPA</label>
              </div>
              <div id="aria_verify_box" role="checkbox" aria-checked="false" aria-required="true" tabindex="0">
                I verify that I am the consumer or authorized agent
              </div>
              <input type="hidden" id="aria_verify_val" name="aria_agent_verified" value="no" />
              <div class="marketing-chk">
                <label>
                  <input type="checkbox" name="newsletter_promo" value="subscribe" />
                  Send me promotional partner offers and marketing newsletters
                </label>
              </div>
              <input type="submit" value="Confirm Opt-Out" />
            </form>
            <script>
              document.getElementById('aria_verify_box').addEventListener('click', function() {
                var next = this.getAttribute('aria-checked') !== 'true';
                this.setAttribute('aria-checked', next ? 'true' : 'false');
                document.getElementById('aria_verify_val').value = next ? 'yes' : 'no';
              });
            </script>
          </body>
        </html>`);
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/verify-complete') {
      const raw = await readPostBody(req);
      const parsed = Object.fromEntries(new URLSearchParams(raw).entries());
      lastVerifyPost = parsed;
      if (parsed.confirm_suppression !== 'yes_suppress' || parsed.aria_agent_verified !== 'yes') {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><p>Verification failed: required confirmation boxes were not checked.</p></body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
        <html>
          <head><title>Opt-Out Confirmed</title></head>
          <body>
            <h1>Your opt-out request is confirmed</h1>
            <p>Confirmation Code: VRF-CHK-90412</p>
          </body>
        </html>`);
      return;
    }

    res.writeHead(404).end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const sessionId = mintSessionToken();

  try {
    // 1. Standalone confirmation link execution (used by Inbox Harvester & Reply Triage)
    const standalone = await executeStandaloneVerificationLink({
      verificationUrl: `${baseUrl}/verify-landing?token=tok_standalone_1&utm_source=email`,
      expectedBrokerDomain: '127.0.0.1',
      allowLoopbackForTests: true,
    });

    assert.strictEqual(standalone.verified, true, 'Standalone verification link must succeed');
    assert.strictEqual(
      standalone.checkedBoxesCount,
      2,
      'Must automatically check both CSS opacity:0 required checkbox and ARIA role=checkbox'
    );
    assert.strictEqual(standalone.brokerConfirmationCode, 'VRF-CHK-90412');
    assert.ok(lastVerifyPost, 'Verification form must have been submitted via <input type="submit">');
    assert.strictEqual(lastVerifyPost!.confirm_suppression, 'yes_suppress');
    assert.strictEqual(lastVerifyPost!.aria_agent_verified, 'yes');
    assert.strictEqual(
      lastVerifyPost!.newsletter_promo,
      undefined,
      'Marketing opt-in checkbox on confirmation landing page must remain unchecked'
    );

    // 2. Workflow-linked email verification completion
    lastVerifyPost = null;
    const job = await startOptOutWorkflow({
      sessionId,
      brokerId: 'mock-verify-checkbox',
      brokerName: 'VerifyCheckboxBroker',
      brokerDomain: '127.0.0.1',
      targetUrl: `${baseUrl}/optout-start`,
      mode: 'autonomous_auto_submit',
      profile: TEST_PROFILE,
      senderEmail: 'jane.doe@privacy.example',
      allowLoopbackForTests: true,
    });
    assert.strictEqual(job.state, 'awaiting_email_verification');

    const completedJob = await completeWorkflowEmailVerification({
      sessionId,
      jobId: job.jobId,
      verificationUrl: `${baseUrl}/verify-landing?token=tok_workflow_2`,
    });
    assert.strictEqual(completedJob.state, 'awaiting_broker_processing');
    assert.strictEqual(completedJob.brokerConfirmationCode, 'VRF-CHK-90412');
    assert.ok(completedJob.emailVerification?.summary.includes('checked 2 confirmation checkboxes'));
    assert.ok(lastVerifyPost);
    assert.strictEqual(lastVerifyPost!.newsletter_promo, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


