import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_BROKERS } from '../src/data/brokers';
import { runBrokerScan, isSyntheticDomain, getBrokerRecordSearchUrl } from '../src/utils/scanEngine';
import { UserProfile, ScanResult } from '../src/types';
import { 
  generateMarkdownReport, 
  generatePlainTextReport, 
  generateAsciiDocReport,
  generateMeReport
} from '../src/utils/exportEngines';
import { SEARCH_TYPES, MAX_STORED_SEARCHES } from '../src/utils/searchProfiles';
import { getExhaustiveBrokerRegistry, triggerAutonomousRegistryExpansion } from '../src/utils/dynamicBrokerRegistry';
import {
  generateDirectDarkWebLinks,
  generateDarkWebFindingsForProfile,
  buildSourceTakedownNotice,
} from '../src/utils/darkWebEngine';

test('1. False-Positive Problem: Out-of-State Jurisdiction Disqualification (TX vs CA)', () => {
  const caUser: UserProfile = {
    firstName: 'John',
    lastName: 'Smith',
    currentCity: 'Los Angeles',
    currentState: 'CA',
    birthYear: '1985',
    phoneNumbers: ['(310) 555-0199'],
    emails: ['john.smith@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  const results = runBrokerScan(caUser);
  const txBroker = DATA_BROKERS.find((b) => b.id.includes('texas') || b.domain.includes('texas'));
  if (txBroker) {
    const txResult = results.find((r) => r.brokerId === txBroker.id);
    if (txResult) {
      assert.strictEqual(txResult.status, 'clean');
      assert.strictEqual(txResult.mockListingData.matchConfidence, 'HOMONYM_DISQUALIFIED');
      assert(txResult.disqualifiedReason?.includes('Jurisdiction Conflict'));
    }
  }
});

test('2. Disqualification of Synthetic / Template Pattern Domains', () => {
  assert(isSyntheticDomain('capublicrecords.org'), 'Should detect capublicrecords.org as synthetic');
  assert(isSyntheticDomain('txcourtdockets.net'), 'Should detect txcourtdockets.net as synthetic');
  assert(!isSyntheticDomain('whitepages.com'), 'Should not flag whitepages.com as synthetic');
  assert(!isSyntheticDomain('spokeo.com'), 'Should not flag spokeo.com as synthetic');
});

test('3. Multi-State Cross-Jurisdiction Matching (Jane Doe CA in TX)', () => {
  const crossStateUser: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1990',
    phoneNumbers: ['(916) 555-0199'],
    emails: ['jane.doe@gmail.com'],
    relatives: [],
    previousLocations: ['Austin, TX', 'Dallas, TX'],
  };

  const results = runBrokerScan(crossStateUser);
  // Jane Doe has prior residence in TX, so national and TX-related records should match with cross-state attribution
  const txBroker = DATA_BROKERS.find((b) => b.domain.includes('texas') || b.id.includes('texas'));
  if (txBroker) {
    const txResult = results.find((r) => r.brokerId === txBroker.id);
    if (txResult) {
      assert(
        txResult.status === 'exposed' || txResult.mockListingData.crossStateEvidence !== undefined,
        'Should recognize TX cross-state jurisdiction tie'
      );
    }
  }
});

test('4. Multi-Format Export Engines (.md, .txt, .adoc)', () => {
  const user: UserProfile = {
    firstName: 'Alex',
    lastName: 'Morgan',
    currentCity: 'Seattle',
    currentState: 'WA',
    birthYear: '1987',
    phoneNumbers: ['(206) 555-0188'],
    emails: ['alex.morgan@privacy.org'],
    relatives: [],
    previousLocations: [],
  };

  const results = runBrokerScan(user);
  const stats = {
    totalBrokers: results.length,
    exposedBrokers: results.filter((r) => r.status === 'exposed').length,
    cleanBrokers: results.filter((r) => r.status === 'clean').length,
    totalRecordsExposed: 12,
    criticalBrokers: 3,
    highRiskBrokers: 4,
    mediumRiskBrokers: 2,
    exposureScore: 68,
    inProgressRemovals: 2,
    removedBrokers: 1,
  };

  const md = generateMarkdownReport(results, stats, user);
  assert(md.includes('# synOUT Exposure & Autonomous Removal Dossier'), 'Markdown header check');
  assert(md.includes('Alex Morgan'), 'Markdown contains user name');
  assert(md.includes('| Broker Name | Domain |'), 'Markdown contains table');

  const txt = generatePlainTextReport(results, stats, user);
  assert(txt.includes('synOUT - AUTONOMOUS DATA BROKER & EXPOSURE AUDIT REPORT'), 'Plain text header check');
  assert(txt.includes('SUMMARY OF EXPOSURE'), 'Plain text contains summary');

  const adoc = generateAsciiDocReport(results, stats, user);
  assert(adoc.startsWith('= synOUT Exposure & Autonomous Removal Dossier'), 'AsciiDoc document title');
  assert(adoc.includes('|==='), 'AsciiDoc contains table syntax');

  const me = generateMeReport(results, stats, user);
  assert(me.includes('.\\" synOUT Exposure & Autonomous Removal Dossier (.me macro format)'), 'Me roff macro comment');
  assert(me.includes('.sh 1 "EXECUTIVE SUMMARY"'), 'Me roff macro section header');
  assert(me.includes('.ip "Subject:" 18'), 'Me roff indented paragraph');
});

test('5. 10 Distinct Search Vectors Quota', () => {
  assert.strictEqual(SEARCH_TYPES.length, 10, 'Must support exactly 10 search types');
  assert.strictEqual(MAX_STORED_SEARCHES, 10, 'Quota limit must be 10 search profiles');

  const expectedTypes = [
    'STANDARD_IDENTITY',
    'CROSS_STATE_JURISDICTION',
    'REVERSE_PHONE',
    'EMAIL_BREACH',
    'VEHICLE_REGISTRATION',
    'COURT_CRIMINAL_DOCKET',
    'PROPERTY_DEED_TAX',
    'FAMILY_MAIDEN_NAME',
    'CORPORATE_EXECUTIVE',
    'DARK_WEB_STEALER_LOG',
  ];

  expectedTypes.forEach((t) => {
    assert(SEARCH_TYPES.some((s) => s.type === t), `Must support search type ${t}`);
  });
});

test('6. Exhaustive Self-Expanding Dynamic Broker Registry', () => {
  const initialPool = getExhaustiveBrokerRegistry();
  assert(initialPool.length >= 20, 'Broker pool must contain extensive verified entries');

  const expansion = triggerAutonomousRegistryExpansion();
  assert(expansion.totalRegistrySize >= initialPool.length, 'Registry size must dynamically grow');
});

test('7. Removal Lifecycle Integrity: Never Auto-Mark Removed', () => {
  const sampleUser: UserProfile = {
    firstName: 'Sarah',
    lastName: 'Connor',
    currentCity: 'Denver',
    currentState: 'CO',
    birthYear: '1984',
    phoneNumbers: ['(303) 555-0144'],
    emails: ['sconnor@cyberdyne.org'],
    relatives: [],
    previousLocations: [],
  };

  const results = runBrokerScan(sampleUser);
  const exposed = results.find((r) => r.status === 'exposed')!;

  assert.strictEqual(exposed.removalStatus, 'found');

  // Dispatched state is submitted, never removed
  const submitted: ScanResult = { ...exposed, removalStatus: 'submitted' };
  assert.strictEqual(submitted.removalStatus, 'submitted');
  assert.notStrictEqual(submitted.removalStatus, 'removed');
});

test('8. Record Search URL Query Construction', () => {
  const sampleUser: UserProfile = {
    firstName: 'Sarah',
    lastName: 'Connor',
    currentCity: 'Denver',
    currentState: 'CO',
    birthYear: '1984',
    phoneNumbers: ['(303) 555-0144'],
    emails: ['sconnor@cyberdyne.org'],
    relatives: [],
    previousLocations: [],
  };

  const wp = DATA_BROKERS.find((b) => b.domain === 'whitepages.com')!;
  const wpUrl = getBrokerRecordSearchUrl(wp, sampleUser);
  assert(wpUrl.toLowerCase().includes('sarah'), 'Whitepages search URL contains first name');
  assert(wpUrl.toLowerCase().includes('connor'), 'Whitepages search URL contains last name');
});

test('9. Dark Web Direct Link Generator & Source-Specific Step-by-Step Removal Guides', () => {
  const sampleUser: UserProfile = {
    firstName: 'Elena',
    lastName: 'Vance',
    currentCity: 'Austin',
    currentState: 'TX',
    birthYear: '1990',
    phoneNumbers: ['(512) 555-0192'],
    emails: ['elena.vance@privacy.example'],
    relatives: [],
    previousLocations: [],
  };

  const emailLinks = generateDirectDarkWebLinks('elena.vance@privacy.example', 'email', 'TX');
  assert(emailLinks.length >= 7, 'Must generate comprehensive deep/dark web links for email selector');
  assert(
    emailLinks.some((l) => l.directUrl.includes('.onion/search/?q=') && l.requiresTorBrowser),
    'Must include a direct Tor v3 .onion hidden service query URI'
  );
  assert(
    emailLinks.some((l) => l.directUrl.includes('ahmia.fi/search')),
    'Must include Ahmia Tor relay search link'
  );
  assert(
    emailLinks.some((l) => l.directUrl.includes('intelx.io')),
    'Must include Intelligence X darknet archive link'
  );

  const scanResults = runBrokerScan(sampleUser);
  const findings = generateDarkWebFindingsForProfile(sampleUser, scanResults);
  assert(findings.length >= 6, 'Must generate findings across distinct dark web & deep web source categories');

  for (const finding of findings) {
    assert(finding.torOnionUri.includes('.onion'), `Finding ${finding.id} must expose a direct .onion URI`);
    assert(finding.deepWebUrl.startsWith('https://'), `Finding ${finding.id} must expose a direct deep web URL`);
    assert(finding.manualRemovalSteps.length >= 4, `Finding ${finding.id} must provide multi-step manual removal instructions`);
    const notice = buildSourceTakedownNotice(finding, sampleUser);
    assert(notice.includes('Elena Vance'), 'Source notice must populate subject full name');
    assert(notice.includes(finding.hostContact), 'Source notice must target specific host contact');
  }
});

test('10. Repository Secret Hygiene: Zero Plaintext Google API Keys in Tracked Source & Gitignored Provisioned Config', () => {
  const rootDir = process.cwd();
  const gitignoreContent = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  assert(
    gitignoreContent.includes('firebase-applet-config.json'),
    '.gitignore must exclude provisioned firebase-applet-config.json so credentials are never tracked in git'
  );

  const googleKeyRegex = /AIza[0-9A-Za-z_-]{35}/;

  function scanDirForSecrets(dirPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git' ||
        entry.name === 'firebase-applet-config.json'
      ) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirForSecrets(fullPath);
      } else if (/\.(ts|tsx|js|json|yml|yaml|html|env|example|md)$/i.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.strictEqual(
          googleKeyRegex.test(content),
          false,
          `Plaintext Google API key detected in tracked file ${fullPath}`
        );
      }
    }
  }

  scanDirForSecrets(rootDir);
});

test('11. Universal User-Connected Email Dispatch (Zero Firebase Required) & SSRF Guard', async () => {
  const {
    detectProviderFromEmail,
    resolveSmtpTransportSettings,
    isSafePublicSmtpHost,
    buildWebmailComposeUrls,
  } = await import('../src/utils/emailProviderConfig');

  assert.strictEqual(detectProviderFromEmail('alice@gmail.com'), 'gmail');
  assert.strictEqual(detectProviderFromEmail('bob@outlook.com'), 'outlook');
  assert.strictEqual(detectProviderFromEmail('carol@yahoo.com'), 'yahoo');
  assert.strictEqual(detectProviderFromEmail('dave@icloud.com'), 'icloud');
  assert.strictEqual(detectProviderFromEmail('erin@proton.me'), 'proton');
  assert.strictEqual(detectProviderFromEmail('frank@customdomain.org'), 'custom');

  const gmailSmtp = resolveSmtpTransportSettings({ provider: 'gmail' });
  assert.strictEqual(gmailSmtp.host, 'smtp.gmail.com');
  assert.strictEqual(gmailSmtp.port, 465);
  assert.strictEqual(gmailSmtp.secure, true);

  const outlookSmtp = resolveSmtpTransportSettings({ provider: 'outlook' });
  assert.strictEqual(outlookSmtp.host, 'smtp.office365.com');
  assert.strictEqual(outlookSmtp.port, 587);

  // SSRF protection must block localhost, cloud metadata, and RFC1918 private IPs
  assert.strictEqual(isSafePublicSmtpHost('localhost').valid, false);
  assert.strictEqual(isSafePublicSmtpHost('127.0.0.1').valid, false);
  assert.strictEqual(isSafePublicSmtpHost('169.254.169.254').valid, false);
  assert.strictEqual(isSafePublicSmtpHost('10.0.0.5').valid, false);
  assert.strictEqual(isSafePublicSmtpHost('192.168.1.10').valid, false);
  assert.strictEqual(isSafePublicSmtpHost('172.20.0.1').valid, false);
  assert.strictEqual(isSafePublicSmtpHost('smtp.fastmail.com').valid, true);

  assert.throws(
    () =>
      resolveSmtpTransportSettings({
        provider: 'custom',
        customHost: '127.0.0.1',
        customPort: 587,
      }),
    /blocked/i
  );

  const webmail = buildWebmailComposeUrls(
    'privacy@spokeo.com',
    'CCPA Deletion Notice',
    'Delete my records.'
  );
  assert(webmail.gmailUrl.includes('mail.google.com'));
  assert(webmail.outlookUrl.includes('outlook.live.com'));
  assert(webmail.yahooUrl.includes('compose.mail.yahoo.com'));
  assert(webmail.mailtoUrl.startsWith('mailto:privacy%40spokeo.com'));

  // Verify user email dispatch modules remain 100% independent of Firebase
  const emailStoreSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'services', 'emailConnectionStore.ts'),
    'utf8'
  );
  const emailProviderSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'utils', 'emailProviderConfig.ts'),
    'utf8'
  );
  assert.strictEqual(
    emailStoreSrc.includes('firebase') || emailProviderSrc.includes('firebase'),
    false,
    'Email connection & dispatch engine must not depend on Firebase'
  );
});

test('12. Global Project Naming & Brand Consistency (synOUT Everywhere — Zero Legacy Project Names)', () => {
  const rootDir = process.cwd();

  // 1. Canonical project manifests must identify as synOUT
  const metadata = JSON.parse(fs.readFileSync(path.join(rootDir, 'metadata.json'), 'utf8'));
  assert.strictEqual(metadata.name, 'synOUT', 'metadata.json name must be synOUT');

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'synout', 'package.json name must be synout');

  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'site.webmanifest'), 'utf8'));
  assert.strictEqual(manifest.name, 'synOUT', 'site.webmanifest name must be synOUT');
  assert.strictEqual(manifest.short_name, 'synOUT', 'site.webmanifest short_name must be synOUT');

  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert(html.includes('<title>synOUT'), 'index.html <title> must start with synOUT');
  assert(html.includes('content="synOUT"'), 'index.html meta tags must declare synOUT');
  assert(html.includes('"name": "synOUT"'), 'index.html Schema.org JSON-LD must declare synOUT');

  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  assert(readme.startsWith('# synOUT'), 'README.md must be titled # synOUT');

  // 2. Zero occurrences of legacy/placeholder project names across repository source & config files
  const forbiddenPatterns = [
    /gemini[\s_-]+project/i,
    /sun-remove/i,
    /"name":\s*"react-example"/i,
  ];

  function scanForLegacyNames(dirPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanForLegacyNames(fullPath);
      } else {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        if (relPath === 'tests/audit.test.ts') continue;
        if (/\.(ts|tsx|js|json|py|yml|yaml|html|md|webmanifest|lock|example|css)$/i.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of forbiddenPatterns) {
            assert.strictEqual(
              pattern.test(content),
              false,
              `Legacy project name matching ${pattern} found in ${relPath}`
            );
          }
        }
      }
    }
  }

  scanForLegacyNames(rootDir);
});

test('13. Persistent Email Connection Store & Real Opt-Out-of-All Email Dispatch Wiring', async () => {
  const {
    findBrokerById,
    hasVerifiedEmailReceipt,
    buildStatutoryNoticeForBroker,
    getEmailConnectionState,
    setEmailConnectionMode,
  } = await import('../src/services/emailConnectionStore');

  // 1. Must resolve brokers from both static catalog and dynamic discovery pool
  const wp = findBrokerById('whitepages');
  assert(wp && wp.privacyEmail === 'support@whitepages.com', 'Should resolve Whitepages privacy email');
  const spf = findBrokerById('searchpeoplefree');
  assert(spf && spf.privacyEmail === 'privacy@searchpeoplefree.com', 'Should resolve discovery pool broker');

  // 2. Must distinguish real SMTP/Gmail Message-IDs from legacy local simulation codes (BAT-/SYN-)
  const baseExposed = {
    id: 'res-1',
    brokerId: 'whitepages',
    status: 'exposed' as const,
    mockListingData: {
      fullName: 'Jane Doe',
      age: 36,
      locations: ['Sacramento, CA'],
      phones: ['(916) 555-0144'],
      emails: ['synovamedia@gmail.com'],
      relatives: [],
      recordsCount: 1,
      riskLevel: 'Critical' as const,
      leakTypes: ['Address'],
      profiles: [],
      matchConfidence: 'VERIFIED_PUBLIC_RECORD' as const,
    },
  };

  assert.strictEqual(
    hasVerifiedEmailReceipt({ ...baseExposed, removalStatus: 'found' }),
    false,
    'Unsent exposed record should not report verified receipt'
  );
  assert.strictEqual(
    hasVerifiedEmailReceipt({
      ...baseExposed,
      removalStatus: 'submitted',
      optOutConfirmationCode: 'BAT-4921-SYN',
    }),
    false,
    'Legacy simulated BAT- code must remain eligible for real email dispatch'
  );
  assert.strictEqual(
    hasVerifiedEmailReceipt({
      ...baseExposed,
      removalStatus: 'submitted',
      optOutConfirmationCode: '<abc123def@smtp.gmail.com>',
    }),
    true,
    'Real SMTP Message-ID receipt must be recognized as verified email transmission'
  );

  // 3. Statutory notice builder must populate user-connected sender email
  const notice = buildStatutoryNoticeForBroker(
    wp!,
    {
      firstName: 'Jane',
      lastName: 'Doe',
      currentCity: 'Sacramento',
      currentState: 'CA',
      birthYear: '1988',
      phoneNumbers: ['(916) 555-0144'],
      emails: ['old@example.com'],
      relatives: [],
      previousLocations: [],
    },
    'synovamedia@gmail.com'
  );
  assert(notice.body.includes('<synovamedia@gmail.com>'), 'FROM line must use connected sender email');
  assert(
    notice.body.includes('confirmation of compliance to synovamedia@gmail.com'),
    'Compliance reply directive must use connected sender email'
  );

  // 4. Global connection store retains mode state across reads without unmounting loss
  setEmailConnectionMode('oauth');
  assert.strictEqual(getEmailConnectionState().mode, 'oauth');
  setEmailConnectionMode('smtp');
  assert.strictEqual(getEmailConnectionState().mode, 'smtp');

  // 5. RemovalQueueModal ("Opt Out of All") must invoke real sendEmailViaConnectedAccount, never fake setInterval
  const modalSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'RemovalQueueModal.tsx'),
    'utf8'
  );
  assert(
    modalSource.includes('sendEmailViaConnectedAccount'),
    'RemovalQueueModal must invoke real sendEmailViaConnectedAccount'
  );
  assert.strictEqual(
    modalSource.includes('setInterval('),
    false,
    'RemovalQueueModal must not contain fake setInterval batch simulation'
  );
});

test('14. Dynamic Broker Export Resolution, Self-Test Email Verification & Crawler Opt-Out Wiring', async () => {
  const { computeScanStats, runBrokerScan } = await import('../src/utils/scanEngine');
  const { generateMarkdownReport, generatePlainTextReport } = await import('../src/utils/exportEngines');

  const profile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  const results = runBrokerScan(profile);
  const stats = computeScanStats(results);
  const md = generateMarkdownReport(results, stats, profile);
  const txt = generatePlainTextReport(results, stats, profile);

  // Seed discovery brokers (e.g. SearchPeopleFree, Nuwber) must resolve proper names & privacy emails in exports
  assert(md.includes('SearchPeopleFree'), 'Markdown export must resolve dynamic discovery broker names');
  assert(md.includes('privacy@searchpeoplefree.com'), 'Markdown export must resolve dynamic broker privacy emails');
  assert(txt.includes('NUWBER'), 'Plain-text export must resolve Nuwber discovery broker');

  // Verify self-test email & crawler opt-out wiring in components
  const gmailCenterSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'GmailDispatchCenter.tsx'),
    'utf8'
  );
  assert(
    gmailCenterSrc.includes('Send Test Email to Myself'),
    'GmailDispatchCenter must provide a confirmed self-test email verification action'
  );

  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  assert(
    appSrc.includes('handleBrokerDiscovered') && appSrc.includes('handlePurgeSession'),
    'App.tsx must wire live crawler discovery opt-out and session purge handlers'
  );
});

test('15. End-to-End Connected Email Surfaces (LegalNoticeModal, BrokerDirectory, Specialty Bureaus, DIY & POA)', async () => {
  const {
    findBrokerById,
    hasVerifiedEmailReceipt,
    buildStatutoryNoticeForBroker,
  } = await import('../src/services/emailConnectionStore');

  const wp = findBrokerById('whitepages')!;

  // 1. DIY web-form codes must not be misclassified as verified SMTP/Gmail receipts
  assert.strictEqual(
    hasVerifiedEmailReceipt({
      id: 'diy-1',
      brokerId: 'whitepages',
      status: 'exposed',
      removalStatus: 'submitted',
      optOutConfirmationCode: 'DIY-FORM-M9ABC',
      mockListingData: {
        fullName: 'Jane Doe',
        age: 36,
        locations: ['Sacramento, CA'],
        phones: [],
        emails: [],
        relatives: [],
        recordsCount: 1,
        riskLevel: 'Critical',
        leakTypes: ['Address'],
        profiles: [],
        matchConfidence: 'VERIFIED_PUBLIC_RECORD',
      },
    }),
    false,
    'Manual web-form DIY-FORM- log must remain distinct from verified email Message-ID receipts'
  );

  // 2. Signed Power of Attorney must automatically embed into statutory email notices
  const noticeWithPoa = buildStatutoryNoticeForBroker(
    wp,
    {
      firstName: 'Jane',
      lastName: 'Doe',
      currentCity: 'Sacramento',
      currentState: 'CA',
      birthYear: '1988',
      phoneNumbers: ['(916) 555-0144'],
      emails: ['synovamedia@gmail.com'],
      relatives: [],
      previousLocations: [],
      powerOfAttorney: {
        fullName: 'Jane Doe',
        address: 'Sacramento, CA',
        state: 'CA',
        signedDate: 'October 24, 2026',
        isSigned: true,
        authCode: 'POA-SYN-778899',
        agentName: 'synOUT Privacy Automation Representative',
        scopeOfAuthority: 'Limited statutory opt-out representation.',
      },
    },
    'synovamedia@gmail.com'
  );
  assert(
    noticeWithPoa.body.includes('POA-SYN-778899') &&
      noticeWithPoa.body.includes('AUTHORIZED AGENT & POWER OF ATTORNEY DESIGNATION'),
    'Signed Power of Attorney code must be embedded into statutory opt-out emails'
  );

  // 3. Verify all remaining surfaces wire real connected-email sending and zero AI sparkle clutter
  const legalModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'LegalNoticeModal.tsx'),
    'utf8'
  );
  assert(
    legalModalSrc.includes('sendEmailViaConnectedAccount') &&
      !legalModalSrc.includes('Refine with Legal AI'),
    'LegalNoticeModal must send via connected email and use deterministic statutory templates'
  );

  const directorySrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'BrokerDirectory.tsx'),
    'utf8'
  );
  assert(
    directorySrc.includes('onSendBrokerOptOut') && directorySrc.includes('Send Opt-Out Email'),
    'BrokerDirectory must allow direct opt-out email dispatch from the 700+ registry'
  );

  const bureausSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'ManualVerificationGuides.tsx'),
    'utf8'
  );
  assert(
    bureausSrc.includes('sendEmailViaConnectedAccount') &&
      bureausSrc.includes('privacy.information.requests@lexisnexis.com'),
    'ManualVerificationGuides must support real connected-email dispatch to specialty bureau compliance desks'
  );

  const diySrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'DiyOptOutAssistantModal.tsx'),
    'utf8'
  );
  assert(
    diySrc.includes('sendEmailViaConnectedAccount'),
    'DiyOptOutAssistantModal must support sending statutory demands via connected email'
  );

  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  assert(
    appSrc.includes('clearAllSavedSearches') && appSrc.includes('handleDirectBrokerOptOut'),
    'App.tsx must wire directory direct opt-out and full saved-search purge'
  );
});

test('16. Vite Dev Client HMR WebSocket Suppression (Zero Unhandled @vite/client:225 WebSocket Errors)', async () => {
  const { createServer } = await import('vite');
  const viteServer = await createServer({
    server: {
      middlewareMode: true,
      hmr: false,
      ws: false,
    },
    appType: 'spa',
  });

  try {
    const transformedClient = await viteServer.transformRequest('/@vite/client');
    assert(transformedClient && transformedClient.code, 'Vite should serve /@vite/client for CSS injection');
    assert(
      transformedClient.code.includes(
        'const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, disconnect() {}, send() {} });'
      ),
      '/@vite/client must replace createWebSocketModuleRunnerTransport with a silent no-op transport when HMR is disabled'
    );
    assert(
      transformedClient.code.includes('updateStyle') &&
        transformedClient.code.includes('createHotContext'),
      '/@vite/client must preserve updateStyle and createHotContext exports'
    );
  } finally {
    await viteServer.close();
  }
});

test('17. 45-Day Statutory SLA Countdown, Overdue Cure Escalation, Regulatory Complaints & RFC 5545 .ics Export', async () => {
  const {
    computeBrokerSlaStatus,
    buildStatutoryEscalationNotice,
    buildRegulatoryComplaintDossier,
    generateIcsCalendarEvent,
  } = await import('../src/utils/statutorySlaEngine');
  const { findBrokerById } = await import('../src/services/emailConnectionStore');

  const wp = findBrokerById('whitepages')!;
  const nowMs = Date.parse('2026-10-24T12:00:00.000Z');
  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  // 1. On-track submission (10 days ago -> 35 days remaining)
  const tenDaysAgoIso = new Date(nowMs - 10 * 24 * 60 * 60 * 1000).toISOString();
  const onTrackResult: ScanResult = {
    id: 'sla-1',
    brokerId: 'whitepages',
    status: 'exposed',
    removalStatus: 'submitted',
    submittedAtIso: tenDaysAgoIso,
    optOutConfirmationCode: '<receipt-10d@smtp.gmail.com>',
    mockListingData: {
      fullName: 'Jane Doe',
      age: 36,
      locations: ['Sacramento, CA'],
      phones: [],
      emails: [],
      relatives: [],
      recordsCount: 1,
      riskLevel: 'Critical',
      leakTypes: ['Address'],
      profiles: [],
      matchConfidence: 'VERIFIED_PUBLIC_RECORD',
    },
  };
  const slaOnTrack = computeBrokerSlaStatus(onTrackResult, nowMs, 45);
  assert.strictEqual(slaOnTrack.state, 'on_track');
  assert.strictEqual(slaOnTrack.daysElapsed, 10);
  assert.strictEqual(slaOnTrack.daysRemaining, 35);

  // 2. Approaching deadline (41 days ago -> 4 days remaining)
  const fortyOneDaysAgoIso = new Date(nowMs - 41 * 24 * 60 * 60 * 1000).toISOString();
  const slaApproaching = computeBrokerSlaStatus(
    { ...onTrackResult, submittedAtIso: fortyOneDaysAgoIso },
    nowMs,
    45
  );
  assert.strictEqual(slaApproaching.state, 'approaching_deadline');
  assert.strictEqual(slaApproaching.daysRemaining, 4);

  // 3. Overdue (48 days ago -> -3 days remaining)
  const fortyEightDaysAgoIso = new Date(nowMs - 48 * 24 * 60 * 60 * 1000).toISOString();
  const overdueResult: ScanResult = {
    ...onTrackResult,
    submittedAtIso: fortyEightDaysAgoIso,
  };
  const slaOverdue = computeBrokerSlaStatus(overdueResult, nowMs, 45);
  assert.strictEqual(slaOverdue.state, 'overdue');
  assert(slaOverdue.daysRemaining <= 0);

  // 4. Escalation notice embeds prior Message-ID receipt & CPPA enforcement warning
  const escalation = buildStatutoryEscalationNotice(
    wp,
    overdueResult,
    profile,
    'synovamedia@gmail.com'
  );
  assert(escalation.subject.includes('<receipt-10d@smtp.gmail.com>'));
  assert(escalation.body.includes('California Privacy Protection Agency (CPPA)'));

  // 5. Regulatory complaint dossier builds full evidentiary timeline
  const complaint = buildRegulatoryComplaintDossier(
    'CPPA',
    wp,
    overdueResult,
    profile,
    'synovamedia@gmail.com'
  );
  assert(complaint.includes('California Privacy Protection Agency (CPPA)'));
  assert(complaint.includes('<receipt-10d@smtp.gmail.com>'));
  assert(complaint.includes('Whitepages'));

  // 6. RFC 5545 .ics calendar event format
  const ics = generateIcsCalendarEvent({
    title: 'synOUT 45-Day SLA Audit',
    description: 'Verify Whitepages deletion.',
    startDate: new Date(nowMs),
    durationMinutes: 30,
    url: 'https://whitepages.com',
  });
  assert(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));
  assert(ics.includes('SUMMARY:synOUT 45-Day SLA Audit'));
  assert(ics.endsWith('END:VCALENDAR'));
});

test('18. Search Engine De-Indexing Site-Dorks & HTTP 410 / X-Robots-Tag Cache Purge Notices', async () => {
  const {
    SEARCH_ENGINE_PORTALS,
    buildBrokerSearchEngineDorks,
    buildWebmasterCachePurgeNotice,
    updateDeindexItemStatus,
  } = await import('../src/utils/searchDeindexEngine');

  assert.strictEqual(SEARCH_ENGINE_PORTALS.length, 5, 'Must cover Google, Bing, DuckDuckGo, Yahoo, and Brave');

  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  const dorks = buildBrokerSearchEngineDorks('spokeo.com', profile);
  assert.strictEqual(dorks.length, 5);
  assert(dorks[0].query.includes('site:spokeo.com "Jane Doe" "Sacramento"'));
  assert(dorks.some((d) => d.searchUrl.startsWith('https://www.google.com/search?q=')));
  assert(dorks.some((d) => d.searchUrl.startsWith('https://www.bing.com/search?q=')));
  assert(dorks.some((d) => d.searchUrl.startsWith('https://search.brave.com/search?q=')));

  const purgeNotice = buildWebmasterCachePurgeNotice(
    'https://spokeo.com/Jane-Doe/California',
    'Spokeo',
    'spokeo.com',
    'privacy@spokeo.com',
    profile,
    'synovamedia@gmail.com'
  );
  assert(purgeNotice.subject.includes('HTTP 410 / NOINDEX'));
  assert(purgeNotice.body.includes('X-Robots-Tag: noindex, noarchive, nosnippet'));
  assert(purgeNotice.body.includes('https://spokeo.com/Jane-Doe/California'));

  const updatedQueue = updateDeindexItemStatus(
    [
      {
        id: 'd-1',
        url: 'https://spokeo.com/Jane-Doe/California',
        brokerName: 'Spokeo',
        engine: 'google',
        status: 'detected',
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      },
    ],
    'd-1',
    'deindexed',
    '<cache-purge@smtp.gmail.com>'
  );
  assert.strictEqual(updatedQueue[0].status, 'deindexed');
  assert.strictEqual(updatedQueue[0].emailReceipt, '<cache-purge@smtp.gmail.com>');
});

test('19. AES-256-GCM Encrypted Workspace Vault, Scan Regression Diffing & Expanded 12-Bureau Hub', async () => {
  const {
    encryptWorkspaceBundle,
    decryptWorkspaceBundle,
    isEncryptedVaultJson,
    computeScanRegressionDiff,
    createSnapshotFromScan,
  } = await import('../src/utils/workspaceVault');
  const { BUREAU_GUIDES } = await import('../src/components/ManualVerificationGuides');

  assert(
    BUREAU_GUIDES.length >= 12,
    'Specialty Bureaus hub must cover 12+ clearinghouses including The Work Number, NCTUE, DMAchoice, Do Not Call/CNAM, and CA Delete Act'
  );
  assert(BUREAU_GUIDES.some((b) => b.id === 'theworknumber'));
  assert(BUREAU_GUIDES.some((b) => b.id === 'nctue'));
  assert(BUREAU_GUIDES.some((b) => b.id === 'dmachoice'));
  assert(BUREAU_GUIDES.some((b) => b.id === 'ca_delete_act'));

  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  // 1. Regression diff detects previously removed broker that resurfaced as exposed/found
  const priorResults: ScanResult[] = [
    {
      id: 'r-wp',
      brokerId: 'whitepages',
      status: 'exposed',
      removalStatus: 'removed',
      mockListingData: {
        fullName: 'Jane Doe',
        age: 36,
        locations: ['Sacramento, CA'],
        phones: [],
        emails: [],
        relatives: [],
        recordsCount: 1,
        riskLevel: 'Critical',
        leakTypes: ['Address'],
        profiles: [],
        matchConfidence: 'VERIFIED_PUBLIC_RECORD',
      },
    },
  ];
  const priorSnapshot = createSnapshotFromScan(profile, priorResults, 25);

  const currentResultsAfterResurface: ScanResult[] = [
    {
      ...priorResults[0],
      removalStatus: 'found',
    },
  ];
  const diff = computeScanRegressionDiff(currentResultsAfterResurface, [priorSnapshot]);
  assert.strictEqual(diff.hasBaseline, true);
  assert(
    diff.relistedBrokerIds.includes('whitepages'),
    'Must flag whitepages as a re-listed regression after prior removal'
  );

  // 2. AES-256-GCM + PBKDF2-SHA256 encryption & decryption roundtrip
  const sampleBundle = {
    schema: 'synOUT-workspace-vault-v1' as const,
    exportedAtIso: new Date().toISOString(),
    profile,
    scanResults: priorResults,
    deindexQueue: [],
    bureauProgress: {
      lexisnexis: { freezePlaced: true, pinSaved: true, updatedAtIso: new Date().toISOString() },
    },
    scanSnapshots: [priorSnapshot],
  };

  const encrypted = await encryptWorkspaceBundle(sampleBundle, 'strong-vault-passphrase');
  const serialized = JSON.stringify(encrypted);
  assert.strictEqual(isEncryptedVaultJson(serialized), true);
  assert(
    !serialized.includes('Sacramento'),
    'Encrypted vault ciphertext must not leak plaintext PII'
  );

  const decrypted = await decryptWorkspaceBundle(encrypted, 'strong-vault-passphrase');
  assert.strictEqual(decrypted.profile?.firstName, 'Jane');
  assert.strictEqual(decrypted.bureauProgress.lexisnexis.freezePlaced, true);

  await assert.rejects(
    () => decryptWorkspaceBundle(encrypted, 'wrong-passphrase'),
    /Invalid vault passphrase/i
  );
});

test('20. Sandboxed Iframe Runtime Resilience (AppErrorBoundary, Guarded Storage & Safe Clipboard)', () => {
  const rootDir = process.cwd();
  const mainSrc = fs.readFileSync(path.join(rootDir, 'src', 'main.tsx'), 'utf8');
  assert(
    mainSrc.includes('AppErrorBoundary') && mainSrc.includes('getDerivedStateFromError'),
    'src/main.tsx must wrap App in AppErrorBoundary for resilient iframe error recovery'
  );

  // Components must use copyTextToClipboard rather than unawaited navigator.clipboard.writeText
  const componentsDir = path.join(rootDir, 'src', 'components');
  for (const entry of fs.readdirSync(componentsDir)) {
    if (!entry.endsWith('.tsx')) continue;
    const content = fs.readFileSync(path.join(componentsDir, entry), 'utf8');
    assert.strictEqual(
      content.includes('navigator.clipboard.writeText('),
      false,
      `${entry} must use copyTextToClipboard() instead of unguarded navigator.clipboard.writeText()`
    );
  }
});

test('21. Broker Reply Triage, Tracking URL Sanitizer & 11 CCR § 7060 Verification Counter-Notices', async () => {
  const {
    sanitizeTrackingUrl,
    analyzeBrokerReplyEmail,
    buildIdMinimizationCounterNotice,
    buildExemptionRebuttalNotice,
  } = await import('../src/utils/replyTriageEngine');
  const { findBrokerById } = await import('../src/services/emailConnectionStore');

  const spokeo = findBrokerById('spokeo')!;
  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  // 1. Tracking URL sanitizer removes ad/email trackers while preserving verification token
  const urlReport = sanitizeTrackingUrl(
    'https://www.spokeo.com/optout/verify?token=9988aabb&ticket=OPT-7712&utm_source=email&fbclid=IwAR555&mc_eid=deadbeef',
    'spokeo.com'
  );
  assert.strictEqual(
    urlReport.sanitizedUrl,
    'https://www.spokeo.com/optout/verify?token=9988aabb&ticket=OPT-7712'
  );
  assert.strictEqual(urlReport.matchesBrokerDomain, true);
  assert.strictEqual(urlReport.strippedParams.length, 3);

  // 2. Detects unlawful Driver's License / SSN verification demands
  const idReply = analyzeBrokerReplyEmail(
    `Case #REQ-442910: Please reply with an unredacted copy of your Driver's License and Social Security Number to complete your deletion request.`,
    spokeo
  );
  assert.strictEqual(idReply.category, 'EXCESSIVE_ID_DEMAND');
  assert(idReply.extractedTicketIds.includes('REQ-442910'));
  assert(idReply.excessiveIdTriggers.some((t) => t.includes("Driver's License")));

  const counter = buildIdMinimizationCounterNotice(
    spokeo,
    profile,
    'synovamedia@gmail.com',
    'REQ-442910'
  );
  assert(counter.subject.includes('11 CCR § 7060'));
  assert(counter.body.includes('Cal. Code Regs. tit. 11, § 7060'));
  assert(counter.body.includes('REQ-442910'));

  // 3. Detects boilerplate public-records exemption refusals and builds statutory rebuttal
  const refusalReply = analyzeBrokerReplyEmail(
    `Reference ID: LGL-99102: We deny your deletion request because our directory only publishes publicly available government records.`,
    spokeo
  );
  assert.strictEqual(refusalReply.category, 'EXEMPTION_CLAIM_OR_REFUSAL');
  const rebuttal = buildExemptionRebuttalNotice(
    spokeo,
    profile,
    'synovamedia@gmail.com',
    'LGL-99102'
  );
  assert(rebuttal.body.includes('SB 362'));
  assert(rebuttal.body.includes('Tex. Bus. & Com. Code § 541.101'));

  // 4. Flags external domain phishing mismatch in confirmation link replies
  const phishingReply = analyzeBrokerReplyEmail(
    `Click the link below to confirm your opt-out request:\nhttps://evil-phishing-tracker.net/verify?token=12345`,
    spokeo
  );
  assert.strictEqual(phishingReply.category, 'CONFIRMATION_LINK_REQUIRED');
  assert.strictEqual(phishingReply.hasDomainMismatchWarning, true);

  // 5. Recognizes confirmed deletions
  const confirmedReply = analyzeBrokerReplyEmail(
    `Confirmation #DEL-88201: Your personal record has been removed and added to our permanent suppression list.`,
    spokeo
  );
  assert.strictEqual(confirmedReply.category, 'DELETION_CONFIRMED');
  assert(confirmedReply.extractedTicketIds.includes('DEL-88201'));
});

test('22. Pure Binary JPEG & PNG EXIF / GPS / XMP Metadata Inspector & Stripper', async () => {
  const { inspectAndStripImageMetadataBytes } = await import('../src/utils/replyTriageEngine');

  // Construct valid JPEG stream: SOI (FFD8) + APP0 JFIF (FFE0) + APP1 Exif+GPS (FFE1) + COM (FFFE) + SOS (FFDA) + scan bytes + EOI (FFD9)
  const jfifPayload = new TextEncoder().encode('JFIF\0\x01\x02');
  const jfifLen = jfifPayload.length + 2;

  const exifPayload = new TextEncoder().encode('Exif\0\0MM\0*\0\0\0\x08GPS');
  const exifLen = exifPayload.length + 2;

  const comPayload = new TextEncoder().encode('iPhone 16 Pro Serial 99812');
  const comLen = comPayload.length + 2;

  const sosHeader = new Uint8Array([0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 0xaa, 0xbb]);
  const eoi = new Uint8Array([0xff, 0xd9]);

  const rawJpeg = new Uint8Array(
    2 + (2 + jfifLen) + (2 + exifLen) + (2 + comLen) + sosHeader.length + eoi.length
  );
  let pos = 0;
  rawJpeg.set([0xff, 0xd8], pos);
  pos += 2;
  rawJpeg.set([0xff, 0xe0, (jfifLen >> 8) & 0xff, jfifLen & 0xff], pos);
  rawJpeg.set(jfifPayload, pos + 4);
  pos += 2 + jfifLen;
  rawJpeg.set([0xff, 0xe1, (exifLen >> 8) & 0xff, exifLen & 0xff], pos);
  rawJpeg.set(exifPayload, pos + 4);
  pos += 2 + exifLen;
  rawJpeg.set([0xff, 0xfe, (comLen >> 8) & 0xff, comLen & 0xff], pos);
  rawJpeg.set(comPayload, pos + 4);
  pos += 2 + comLen;
  rawJpeg.set(sosHeader, pos);
  pos += sosHeader.length;
  rawJpeg.set(eoi, pos);

  const report = inspectAndStripImageMetadataBytes(rawJpeg);
  assert.strictEqual(report.format, 'JPEG');
  assert.strictEqual(report.hadExif, true);
  assert.strictEqual(report.hadGps, true);
  assert(report.bytesRemoved >= exifLen + comLen, 'Must strip APP1 EXIF/GPS and COM segments');
  assert.strictEqual(report.cleanedBytes[0], 0xff);
  assert.strictEqual(report.cleanedBytes[1], 0xd8);

  // Re-inspecting the cleaned JPEG must confirm zero remaining EXIF/GPS segments
  const secondPass = inspectAndStripImageMetadataBytes(report.cleanedBytes);
  assert.strictEqual(secondPass.hadExif, false);
  assert.strictEqual(secondPass.hadGps, false);
  assert.strictEqual(secondPass.bytesRemoved, 0);
});

test('23. Upstream Public Records Petitions, Canary Alias Leak Attribution & Vault Persistence', async () => {
  const {
    UPSTREAM_PUBLIC_RECORD_GUIDES,
    buildPublicRecordSuppressionLetter,
    generateCanaryAliasRecord,
    attributeLeakFromRawEmail,
    buildVendorLeakAuditDemand,
  } = await import('../src/utils/publicRecordsFirewall');
  const { encryptWorkspaceBundle, decryptWorkspaceBundle } = await import(
    '../src/utils/workspaceVault'
  );

  assert.strictEqual(
    UPSTREAM_PUBLIC_RECORD_GUIDES.length,
    6,
    'Must cover Assessor Deeds, Voter Rolls, DMV DPPA, WHOIS, SOS/UCC, and USPS NCOA'
  );

  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['jane.doe@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  const assessorPetition = buildPublicRecordSuppressionLetter('county_assessor_deed', profile, {
    agencyName: 'Sacramento County Assessor',
    parcelOrVoterId: 'APN 009-142-19',
    senderEmail: 'jane.doe@gmail.com',
  });
  assert(assessorPetition.body.includes('Sacramento County Assessor'));
  assert(assessorPetition.body.includes('APN 009-142-19'));
  assert(assessorPetition.body.includes('Cal. Gov. Code § 7928.205'));

  // Canary alias generation & forensic leak attribution
  const canary = generateCanaryAliasRecord({
    baseEmail: 'jane.doe@gmail.com',
    vendorName: 'CVS ExtraCare',
    vendorDomain: 'cvs.com',
    deterministicSeed: 'seed-1234',
  });
  assert(canary.aliasEmail.startsWith('jane.doe+cvsextracare-'));
  assert(canary.aliasEmail.endsWith('@gmail.com'));

  const attribution = attributeLeakFromRawEmail(
    `Delivered-To: ${canary.aliasEmail}\nFrom: spam@ad-exchange.example\nSubject: Special Offer`,
    [canary]
  );
  assert.strictEqual(attribution.matched, true);
  assert.strictEqual(attribution.matchedRecord?.vendorName, 'CVS ExtraCare');

  const auditDemand = buildVendorLeakAuditDemand(canary, profile, 'jane.doe@gmail.com');
  assert(auditDemand.subject.includes('CCPA § 1798.115'));
  assert(auditDemand.body.includes(canary.aliasEmail));
  assert(auditDemand.body.includes('CVS ExtraCare'));

  // Verify AES-256-GCM Vault preserves canaryAliases and publicRecordProgress
  const encrypted = await encryptWorkspaceBundle(
    {
      schema: 'synOUT-workspace-vault-v1',
      exportedAtIso: new Date().toISOString(),
      profile,
      scanResults: [],
      deindexQueue: [],
      bureauProgress: {},
      scanSnapshots: [],
      canaryAliases: [canary],
      publicRecordProgress: {
        county_assessor_deed: {
          completed: true,
          updatedAtIso: new Date().toISOString(),
        },
      },
    },
    'vault-passphrase-2026'
  );
  const restored = await decryptWorkspaceBundle(encrypted, 'vault-passphrase-2026');
  assert.strictEqual(restored.canaryAliases?.length, 1);
  assert.strictEqual(restored.canaryAliases?.[0].aliasEmail, canary.aliasEmail);
  assert.strictEqual(restored.publicRecordProgress?.county_assessor_deed?.completed, true);
});

test('24. Cryptographic SHA-256 Chain-of-Custody Manifest & Statutory Civil Penalty Calculator', async () => {
  const {
    sha256Hex,
    computeStatutoryDamagesEstimate,
    buildSignedChainOfCustodyManifest,
    formatChainOfCustodyMarkdown,
  } = await import('../src/utils/evidenceDossierEngine');

  const digest = await sha256Hex('synOUT-integrity-test');
  assert.strictEqual(digest.length, 64, 'SHA-256 hex digest must be 64 hex characters');

  const nowMs = Date.parse('2026-10-24T12:00:00.000Z');
  const fiftyFiveDaysAgoIso = new Date(nowMs - 55 * 24 * 60 * 60 * 1000).toISOString();

  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: [],
  };

  const overdueEscalatedResult: ScanResult = {
    id: 'ev-wp',
    brokerId: 'whitepages',
    status: 'exposed',
    removalStatus: 'submitted',
    submittedAtIso: fiftyFiveDaysAgoIso,
    optOutConfirmationCode: '<msg-991@smtp.gmail.com>',
    escalationCount: 1,
    brokerConfirmationTicket: 'CASE-77812',
    mockListingData: {
      fullName: 'Jane Doe',
      age: 36,
      locations: ['Sacramento, CA'],
      phones: [],
      emails: [],
      relatives: [],
      recordsCount: 1,
      riskLevel: 'Critical',
      leakTypes: ['Address'],
      profiles: [],
      matchConfidence: 'VERIFIED_PUBLIC_RECORD',
    },
  };

  const damages = computeStatutoryDamagesEstimate([overdueEscalatedResult], 'CA', nowMs);
  assert.strictEqual(damages.overdueCount, 1);
  assert.strictEqual(damages.intentionalOrRepeatCount, 1);
  // 10 days overdue * $200 Delete Act + $7,500 intentional CCPA penalty = $9,500
  assert.strictEqual(damages.totalDeleteActAccruedUsd, 2000);
  assert.strictEqual(damages.totalConservativeUsd, 9500);

  const manifest = await buildSignedChainOfCustodyManifest(
    profile,
    [overdueEscalatedResult],
    'synovamedia@gmail.com',
    nowMs
  );
  assert.strictEqual(manifest.schema, 'synOUT-chain-of-custody-v1');
  assert.strictEqual(manifest.manifestSha256.length, 64);
  assert.strictEqual(manifest.entries.length, 1);
  assert.strictEqual(manifest.entries[0].recordSha256.length, 64);
  assert.strictEqual(manifest.entries[0].brokerConfirmationTicket, 'CASE-77812');

  const md = formatChainOfCustodyMarkdown(manifest);
  assert(md.includes(manifest.manifestSha256));
  assert(md.includes('$9,500'));
});

test('25. Broker Contact Mitigation: Custom DPO Overrides, Bounced Failover, Vault Persistence & Verified Real Expansion Domains', async () => {
  const {
    resolveBrokerContactProfile,
    setBrokerCustomEmail,
    markBrokerEmailBounced,
    clearBrokerContactOverrides,
    getBrokerContactOverrides,
  } = await import('../src/utils/brokerContactResolver');
  const { findBrokerById, buildStatutoryNoticeForBroker } = await import(
    '../src/services/emailConnectionStore'
  );
  const { encryptWorkspaceBundle, decryptWorkspaceBundle } = await import(
    '../src/utils/workspaceVault'
  );

  clearBrokerContactOverrides();

  try {
    const intelius = findBrokerById('intelius')!;
    assert(intelius, 'Intelius must exist in broker catalog');

    // 1. Default resolution includes parent-entity fallback DPOs (PeopleConnect)
    const initialContact = resolveBrokerContactProfile(intelius);
    assert(
      initialContact.allValidCandidates.includes('privacy@peopleconnect.us'),
      'PeopleConnect subsidiary brokers must expose privacy@peopleconnect.us in valid DPO candidates'
    );

    // 2. Marking primary email as bounced automatically promotes the verified fallback DPO
    const defaultPrimary = initialContact.effectivePrimaryEmail;
    markBrokerEmailBounced('intelius', defaultPrimary);
    const reroutedContact = resolveBrokerContactProfile(intelius);
    assert.strictEqual(reroutedContact.reroutedFromBounced, true);
    assert.notStrictEqual(reroutedContact.effectivePrimaryEmail, defaultPrimary);

    // 3. Explicit custom DPO override takes top priority and propagates into statutory notices
    setBrokerCustomEmail('intelius', 'dpo-custom@peopleconnect.us');
    const customContact = resolveBrokerContactProfile(intelius);
    assert.strictEqual(customContact.hasCustomOverride, true);
    assert.strictEqual(customContact.effectivePrimaryEmail, 'dpo-custom@peopleconnect.us');

    const profile: UserProfile = {
      firstName: 'Jane',
      lastName: 'Doe',
      currentCity: 'Sacramento',
      currentState: 'CA',
      birthYear: '1988',
      phoneNumbers: ['(916) 555-0144'],
      emails: ['synovamedia@gmail.com'],
      relatives: [],
      previousLocations: [],
    };
    const notice = buildStatutoryNoticeForBroker(intelius, profile, 'synovamedia@gmail.com');
    assert(
      notice.body.includes('dpo-custom@peopleconnect.us'),
      'Statutory notice must address the active custom DPO override'
    );

    // 4. Encrypted Workspace Vault preserves brokerContactOverrides
    const encrypted = await encryptWorkspaceBundle(
      {
        schema: 'synOUT-workspace-vault-v1',
        exportedAtIso: new Date().toISOString(),
        profile,
        scanResults: [],
        deindexQueue: [],
        bureauProgress: {},
        scanSnapshots: [],
        brokerContactOverrides: getBrokerContactOverrides(),
      },
      'vault-contact-passphrase'
    );
    const restored = await decryptWorkspaceBundle(encrypted, 'vault-contact-passphrase');
    assert.strictEqual(
      restored.brokerContactOverrides?.intelius?.customEmail,
      'dpo-custom@peopleconnect.us'
    );

    // 5. Dynamic expansion pool uses real MX-capable domains (zero dead truepeoplesearch.net or omnidataindex.org)
    triggerAutonomousRegistryExpansion();
    triggerAutonomousRegistryExpansion();
    const fullPool = getExhaustiveBrokerRegistry();
    for (const broker of fullPool) {
      assert(
        !broker.domain.includes('truepeoplesearch.net') &&
          !broker.domain.endsWith('index.org') &&
          !isSyntheticDomain(broker.domain),
        `Registry broker ${broker.id} (${broker.domain}) must not use dead or synthetic domains`
      );
    }
  } finally {
    clearBrokerContactOverrides();
  }
});

test('26. Server-Side DNS MX / RFC 7505 Null MX Pre-Flight Failover & Mailer-Daemon 550 Bounce Triage', async () => {
  const {
    verifyRecipientCandidatesDns,
    isRecipientRejectionSmtpError,
  } = await import('../src/server/dnsMxValidator');
  const { analyzeBrokerReplyEmail } = await import('../src/utils/replyTriageEngine');
  const { findBrokerById } = await import('../src/services/emailConnectionStore');

  const mockDnsAdapter = {
    async resolveMx(hostname: string) {
      if (hostname === 'dead-broker-domain.com') {
        const err = new Error('queryMx ENOTFOUND dead-broker-domain.com') as NodeJS.ErrnoException;
        err.code = 'ENOTFOUND';
        throw err;
      }
      if (hostname === 'null-mx-broker.com') {
        // RFC 7505 Null MX explicitly rejects all inbound mail
        return [{ exchange: '.', priority: 0 }];
      }
      if (hostname === 'peopleconnect.us') {
        return [{ exchange: 'mx1.peopleconnect.us', priority: 10 }];
      }
      return [];
    },
    async resolve4() {
      const err = new Error('ENOTFOUND') as NodeJS.ErrnoException;
      err.code = 'ENOTFOUND';
      throw err;
    },
  };

  // 1. Dead primary NXDOMAIN automatically fails over to verified parent DPO
  const failoverRes = await verifyRecipientCandidatesDns(
    'privacy@dead-broker-domain.com',
    ['privacy@null-mx-broker.com', 'privacy@peopleconnect.us'],
    mockDnsAdapter
  );
  assert.strictEqual(failoverRes.valid, true);
  assert.strictEqual(failoverRes.mxVerified, true);
  assert.strictEqual(failoverRes.usedFallback, true);
  assert.strictEqual(failoverRes.recommendedEmail, 'privacy@peopleconnect.us');

  // 2. RFC 7505 Null MX with zero valid fallbacks blocks send cleanly before SMTP bounce
  const blockedRes = await verifyRecipientCandidatesDns(
    'privacy@null-mx-broker.com',
    ['optout@dead-broker-domain.com'],
    mockDnsAdapter
  );
  assert.strictEqual(blockedRes.valid, false);
  assert.strictEqual(blockedRes.mxVerified, false);
  assert.strictEqual(blockedRes.recommendedEmail, null);

  // 3. SMTP 550 / 5.1.1 recipient rejection classifier
  assert.strictEqual(
    isRecipientRejectionSmtpError(new Error('550 5.1.1 <optout@broker.com>: Recipient address rejected: User unknown')),
    true
  );
  assert.strictEqual(
    isRecipientRejectionSmtpError(new Error('Connection timeout')),
    false
  );

  // 4. Mailer-Daemon NDR bounce triage extracts bounced address & recommends verified fallback DPO
  const fastPeople = findBrokerById('fastpeoplesearch')!;
  const ndrRaw = `From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
Subject: Delivery Status Notification (Failure)

Address not found
Your message wasn't delivered to privacy@fastpeoplesearch.com because the address couldn't be found, or is unable to receive mail.
550 5.1.1 The email account that you tried to reach does not exist.
Final-Recipient: rfc822; privacy@fastpeoplesearch.com`;

  const bounceAnalysis = analyzeBrokerReplyEmail(ndrRaw, fastPeople);
  assert.strictEqual(bounceAnalysis.category, 'DELIVERY_BOUNCE_NDR');
  assert(bounceAnalysis.bouncedAddresses.includes('privacy@fastpeoplesearch.com'));
  assert(
    bounceAnalysis.recommendedFallbackEmail &&
      bounceAnalysis.recommendedFallbackEmail !== 'privacy@fastpeoplesearch.com',
    'Must recommend a non-bounced fallback compliance email when primary bounces'
  );
});

test('27. Red NUKE ALL Mass Removal Engine, Multi-Channel Target Matrix & Mass BCC Webmail Batches', async () => {
  const {
    buildNukeAllTargetMatrix,
    buildMassBccWebmailBatches,
  } = await import('../src/utils/nukeAllEngine');

  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: ['Austin, TX'],
  };

  const scanResults = runBrokerScan(profile);
  const deindexQueue = [
    {
      id: 'deindex-spokeo-1',
      url: 'https://www.spokeo.com/Jane-Doe/California/p12345',
      brokerId: 'spokeo',
      brokerName: 'Spokeo',
      engine: 'google' as const,
      status: 'detected' as const,
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    },
  ];

  const targets = buildNukeAllTargetMatrix({
    profile,
    senderEmail: 'synovamedia@gmail.com',
    scanResults,
    bureauProgress: {},
    deindexQueue,
    includeExposedBrokers: true,
    includeFullBrokerCatalog: true,
    includeSpecialtyBureaus: true,
    includeWebmasterDeindex: true,
    includeAlreadyDispatched: false,
  });

  assert(targets.length >= 25, 'NUKE ALL matrix must aggregate exposed brokers, website catalog, bureaus, and deindex URLs');
  assert(targets.some((t) => t.kind === 'exposed_broker'), 'Must include exposed scan brokers');
  assert(targets.some((t) => t.kind === 'catalog_broker'), 'Must include remaining catalog websites');
  assert(targets.some((t) => t.kind === 'specialty_bureau'), 'Must include commercial specialty bureaus');
  assert(targets.some((t) => t.kind === 'webmaster_deindex'), 'Must include cached website de-index URLs');
  assert(
    targets.every((t) => !t.recipientEmail.endsWith('.gov')),
    'Must never mass-blast .gov regulatory agency addresses during commercial broker nuke'
  );

  const bccBatches = buildMassBccWebmailBatches(targets, profile, 'synovamedia@gmail.com', 15);
  assert(bccBatches.length >= 2, 'Should split large recipient pools into URL-safe BCC batches');
  assert(bccBatches[0].gmailUrl.includes('mail.google.com/mail/?view=cm'));
  assert(bccBatches[0].gmailUrl.includes('&bcc='));
  assert(bccBatches[0].outlookUrl.includes('outlook.live.com'));

  // Verify red NUKE ALL buttons and NukeAllModal are wired across key UI components
  const rootDir = process.cwd();
  for (const relFile of [
    'src/components/Navbar.tsx',
    'src/components/HeroSection.tsx',
    'src/components/ExposureReport.tsx',
    'src/components/BrokerDirectory.tsx',
    'src/components/RemovalTracker.tsx',
    'src/components/GmailDispatchCenter.tsx',
    'src/components/NukeAllModal.tsx',
  ]) {
    const src = fs.readFileSync(path.join(rootDir, relFile), 'utf8');
    assert(
      src.includes('NUKE ALL') && src.includes('bg-red-600'),
      `${relFile} must render a prominent red NUKE ALL action`
    );
  }
});

test('28. Email Login System: Multi-Port SMTP Failover, App Password Normalization, OAuth Client Validation & Instant Webmail Login', async () => {
  const {
    normalizeAppPassword,
    inferCustomSmtpDefaults,
    resolveSmtpFailoverCandidates,
    classifySmtpAuthError,
    detectWebmailLauncherFromEmail,
  } = await import('../src/utils/emailProviderConfig');
  const { isValidGoogleOAuthClientId } = await import('../src/services/googleAuth');
  const {
    connectWebmailSenderAccount,
    disconnectWebmailSenderAccount,
    purgeAllEmailConnections,
    getEmailConnectionState,
    resolveActiveConnectedEmailFromState,
    buildStatutoryNoticeForBroker,
  } = await import('../src/services/emailConnectionStore');

  // 1. Provider-aware App Password normalization
  assert.strictEqual(
    normalizeAppPassword('gmail', ' abcd efgh-ijkl mnop '),
    'abcdefghijklmnop',
    'Gmail App Password must strip spaces and hyphens'
  );
  assert.strictEqual(
    normalizeAppPassword('icloud', ' abcd-efgh-ijkl-mnop '),
    'abcd-efgh-ijkl-mnop',
    'Apple iCloud App-Specific Password must preserve hyphens while trimming whitespace'
  );
  assert.strictEqual(
    normalizeAppPassword('outlook', 'wxyz 1234 abcd 5678'),
    'wxyz1234abcd5678',
    'Outlook 4x4 grouped App Password must strip block spaces'
  );

  // 2. Custom domain SMTP auto-detection (Zoho, Fastmail, AOL)
  const zohoDefaults = inferCustomSmtpDefaults('privacy@zoho.com');
  assert(zohoDefaults && zohoDefaults.host === 'smtp.zoho.com' && zohoDefaults.port === 465);
  const fastmailDefaults = inferCustomSmtpDefaults('ops@fastmail.com');
  assert(fastmailDefaults && fastmailDefaults.host === 'smtp.fastmail.com');
  const aolDefaults = inferCustomSmtpDefaults('member@aol.com');
  assert(aolDefaults && aolDefaults.host === 'smtp.aol.com');

  // 3. Multi-port SMTP failover candidates (465 <-> 587 + Outlook secondary relay)
  const gmailCandidates = resolveSmtpFailoverCandidates({ provider: 'gmail' });
  assert.strictEqual(gmailCandidates.length, 2);
  assert.strictEqual(gmailCandidates[0].port, 465);
  assert.strictEqual(gmailCandidates[1].port, 587);

  const outlookCandidates = resolveSmtpFailoverCandidates({ provider: 'outlook' });
  assert(outlookCandidates.length >= 3);
  assert(outlookCandidates.some((c) => c.host === 'smtp-mail.outlook.com' && c.port === 587));

  // 4. Structured SMTP error diagnostics
  const appPassErr = classifySmtpAuthError(
    new Error('535-5.7.8 Username and Password not accepted'),
    'gmail'
  );
  assert.strictEqual(appPassErr.code, 'APP_PASSWORD_REQUIRED');
  assert.strictEqual(appPassErr.suggestOAuth, true);
  assert.strictEqual(appPassErr.suggestWebmail, true);

  const msBasicErr = classifySmtpAuthError(
    new Error('535 5.7.139 Authentication unsuccessful, basic authentication is disabled'),
    'outlook'
  );
  assert.strictEqual(msBasicErr.code, 'MICROSOFT_BASIC_AUTH_DISABLED');

  const blockedPortErr = classifySmtpAuthError(new Error('connect ETIMEDOUT 142.250.1.108:465'), 'gmail');
  assert.strictEqual(blockedPortErr.code, 'SMTP_PORT_BLOCKED');

  // 5. Google OAuth 2.0 Web Client ID validator rejects API keys & client secrets
  assert.strictEqual(
    isValidGoogleOAuthClientId('123456789012-abc123def456ghi.apps.googleusercontent.com'),
    true
  );
  assert.strictEqual(isValidGoogleOAuthClientId('AIzaShortKeyRejectCheck'), false);
  assert.strictEqual(isValidGoogleOAuthClientId('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d'), false);
  assert.strictEqual(isValidGoogleOAuthClientId('invalid-client-id'), false);

  // 6. Instant Webmail Sender Login & active sender propagation
  assert.strictEqual(detectWebmailLauncherFromEmail('alice@gmail.com'), 'gmail');
  assert.strictEqual(detectWebmailLauncherFromEmail('bob@outlook.com'), 'outlook');
  assert.strictEqual(detectWebmailLauncherFromEmail('carol@yahoo.com'), 'yahoo');
  assert.strictEqual(detectWebmailLauncherFromEmail('dan@proton.me'), 'mailto');

  const webmailConn = connectWebmailSenderAccount({
    userEmail: 'Alice.Privacy@Gmail.com',
    senderName: 'Alice Privacy',
    rememberInBrowser: false,
  });
  assert.strictEqual(webmailConn.userEmail, 'alice.privacy@gmail.com');
  assert.strictEqual(webmailConn.preferredLauncher, 'gmail');
  assert.strictEqual(
    resolveActiveConnectedEmailFromState(getEmailConnectionState()),
    'alice.privacy@gmail.com'
  );

  const sampleProfile: UserProfile = {
    firstName: 'Alice',
    lastName: 'Privacy',
    currentCity: 'San Jose',
    currentState: 'CA',
    birthYear: '1991',
    phoneNumbers: [],
    emails: [],
    relatives: [],
    previousLocations: [],
  };
  const notice = buildStatutoryNoticeForBroker(
    DATA_BROKERS[0],
    sampleProfile,
    resolveActiveConnectedEmailFromState(getEmailConnectionState()) || 'fallback@example.com'
  );
  assert(
    notice.body.includes('alice.privacy@gmail.com'),
    'Statutory opt-out notice must embed the signed-in Webmail sender address'
  );

  disconnectWebmailSenderAccount();
  await purgeAllEmailConnections();
  assert.strictEqual(getEmailConnectionState().webmailSender, null);

  // 7. Entry point & GitHub Pages build hygiene: canonical /index.html isolated from Vite publicDir ('static')
  const rootDir = process.cwd();
  const viteCfg = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
  assert(
    viteCfg.includes("publicDir: 'static'") &&
      !fs.existsSync(path.join(rootDir, 'static', 'index.html')),
    'Vite publicDir must be isolated to /static without a static/index.html that could overwrite dist/index.html'
  );
  assert(
    !fs.existsSync(path.join(rootDir, 'app.html')),
    'Duplicate app.html must not exist; index.html is the single canonical entry point'
  );
  const rootIndexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert(
    rootIndexHtml.includes('synOUT') && !rootIndexHtml.includes('<title>Cookie check</title>'),
    'index.html must serve the canonical synOUT app shell, never the Cookie check placeholder'
  );
});

test('29. Compartmentalized Glassmorphic Navigation, Inbox Harvester Safety, Multi-Step Playbooks, 30/60/90d Re-Listing Monitor & State Regulator Packets', async () => {
  const { buildNavCompartments } = await import('../src/components/Navbar');
  const {
    base64UrlDecodeUtf8,
    extractDecodedBodyFromGmailPayload,
  } = await import('../src/services/gmailApi');
  const {
    verifyHarvesterLinkSafety,
    harvestBrokerEmailPayload,
  } = await import('../src/utils/inboxHarvesterEngine');
  const {
    listAllBrokerPlaybooks,
    resolveBrokerPlaybook,
    synthesizeBrokerCandidateProfileUrl,
  } = await import('../src/utils/brokerAdapterCatalog');
  const { computeRelistingSchedule } = await import('../src/utils/relistingMonitorEngine');
  const {
    REGULATOR_AGENCIES,
    getSynchronizedStateBrokerRegistry,
    generateRegulatorComplaintPacket,
  } = await import('../src/utils/stateRegistryEngine');
  const { findBrokerById } = await import('../src/services/emailConnectionStore');

  // 1. Categorized Glassmorphic Navigation covers all 16 AppTabs + 3 modal actions across 5 compartments
  const compartments = buildNavCompartments({
    exposedCount: 7,
    removedCount: 3,
    isPoaSigned: true,
    activeConnectedEmail: 'alice@gmail.com',
  });
  assert.deepStrictEqual(
    compartments.map((c) => c.id),
    ['discovery', 'suppression', 'monitoring', 'registries', 'workspace']
  );

  const allTabIds = compartments.flatMap((c) => c.items.map((i) => i.tab).filter(Boolean));
  for (const requiredTab of [
    'home',
    'scanner',
    'report',
    'darkweb',
    'webforms',
    'inbox',
    'gmail',
    'deindex',
    'tracker',
    'monitoring',
    'directory',
    'registries',
    'bureaus',
    'firewall',
    'profiles',
    'guide',
  ]) {
    assert(allTabIds.includes(requiredTab as any), `Compartmentalized Navbar must include tab "${requiredTab}"`);
  }
  const allActions = compartments.flatMap((c) => c.items.map((i) => i.action).filter(Boolean));
  assert.deepStrictEqual(allActions.sort(), ['nuke', 'poa', 'vault']);

  const cssSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
  for (const glassToken of ['glass-nav', 'glass-popover', 'glass-panel', 'glass-card', 'synout-mesh-bg']) {
    assert(cssSrc.includes(glassToken), `src/index.css must define ${glassToken}`);
  }

  // 2. Gmail recursive MIME decoding + Harvester link safety & classification
  const htmlRaw = '<html><body>Please confirm removal: <a href="https://www.spokeo.com/optout/confirm?token=abc999&utm_source=email">Confirm</a></body></html>';
  const b64UrlHtml = Buffer.from(htmlRaw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.strictEqual(base64UrlDecodeUtf8(b64UrlHtml), htmlRaw);
  const extractedMimeBody = extractDecodedBodyFromGmailPayload({
    mimeType: 'multipart/alternative',
    parts: [{ mimeType: 'text/html', body: { data: b64UrlHtml } }],
  });
  assert(extractedMimeBody.includes('https://www.spokeo.com/optout/confirm?token=abc999&utm_source=email'));

  const spokeo = findBrokerById('spokeo')!;
  const safeSpokeo = verifyHarvesterLinkSafety(
    'https://www.spokeo.com/optout/confirm?token=abc999&utm_source=email&fbclid=IwAR1',
    spokeo,
    'spokeo.com'
  );
  assert(safeSpokeo, 'Valid HTTPS Spokeo confirmation link must pass safety check');
  assert.strictEqual(safeSpokeo!.sanitizedUrl, 'https://www.spokeo.com/optout/confirm?token=abc999');
  assert.strictEqual(safeSpokeo!.trustedReason, 'exact_broker_domain');

  const safeOneTrust = verifyHarvesterLinkSafety(
    'https://privacyportal.onetrust.com/webform/verify?token=ot123',
    spokeo,
    'spokeo.com'
  );
  assert(safeOneTrust && safeOneTrust.trustedReason === 'trusted_privacy_processor');

  // Reject HTTP, private IP, phishing domain, and marketing unsubscribe traps
  assert.strictEqual(verifyHarvesterLinkSafety('http://www.spokeo.com/optout/confirm?token=1', spokeo, 'spokeo.com'), null);
  assert.strictEqual(verifyHarvesterLinkSafety('https://127.0.0.1/optout/confirm?token=1', spokeo, 'spokeo.com'), null);
  assert.strictEqual(verifyHarvesterLinkSafety('https://evil-phishing.net/optout/confirm?token=1', spokeo, 'spokeo.com'), null);
  assert.strictEqual(verifyHarvesterLinkSafety('https://www.spokeo.com/newsletter/unsubscribe?id=1', spokeo, 'spokeo.com'), null);

  const harvestedVerify = harvestBrokerEmailPayload({
    id: 'msg-1',
    messageId: 'msg-1',
    from: 'Spokeo Privacy <privacy@spokeo.com>',
    subject: 'Confirm your opt-out request (Case #SPK-44210)',
    date: '2026-10-25T10:00:00Z',
    bodyText: extractedMimeBody,
  });
  assert.strictEqual(harvestedVerify.classification, 'verification_link_ready');
  assert.strictEqual(harvestedVerify.extractedTicketId, 'SPK-44210');
  assert.strictEqual(harvestedVerify.safeVerificationLinks.length, 1);

  const harvestedConfirmed = harvestBrokerEmailPayload({
    id: 'msg-2',
    messageId: 'msg-2',
    from: 'Whitepages <support@whitepages.com>',
    subject: 'Your suppression request is complete',
    date: '2026-10-25T11:00:00Z',
    bodyText: 'Ticket #WP-99812: Your personal record has been removed and added to our suppression list.',
  });
  assert.strictEqual(harvestedConfirmed.classification, 'removal_confirmed');
  assert.strictEqual(harvestedConfirmed.extractedTicketId, 'WP-99812');

  // 3. Dedicated Multi-Step Broker Playbook Adapters
  const playbooks = listAllBrokerPlaybooks();
  assert(playbooks.length >= 10, 'Must expose 10+ deterministic multi-step broker playbooks');
  assert.strictEqual(resolveBrokerPlaybook('spokeo.com')?.adapterId, 'spokeo-playbook');
  assert.strictEqual(resolveBrokerPlaybook('truthfinder.com')?.adapterId, 'peopleconnect-hub-playbook');
  assert.strictEqual(resolveBrokerPlaybook('neighborwho.com')?.adapterId, 'beenverified-network-playbook');

  const testProfile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['jane@example.com'],
    relatives: [],
    previousLocations: [],
  };
  assert.strictEqual(
    synthesizeBrokerCandidateProfileUrl('spokeo.com', testProfile),
    'https://www.spokeo.com/Jane-Doe/CA/Sacramento'
  );
  assert.strictEqual(
    synthesizeBrokerCandidateProfileUrl('whitepages.com', testProfile),
    'https://www.whitepages.com/name/Jane-Doe/Sacramento-CA'
  );

  // 4. Automated 30/60/90-Day Re-Listing Surveillance Schedule
  const nowMs = Date.parse('2026-10-25T12:00:00.000Z');
  const fortyDaysAgoIso = new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString();
  const sampleRemoved: ScanResult = {
    id: 'rel-1',
    brokerId: 'spokeo',
    status: 'exposed',
    removalStatus: 'removed',
    verifiedRemovedAtIso: fortyDaysAgoIso,
    mockListingData: {
      fullName: 'Jane Doe',
      age: 38,
      locations: ['Sacramento, CA'],
      phones: [],
      emails: [],
      relatives: [],
      recordsCount: 1,
      riskLevel: 'Critical',
      leakTypes: ['Address'],
      profiles: [],
      matchConfidence: 'VERIFIED_PUBLIC_RECORD',
    },
  };
  const sched30 = computeRelistingSchedule([sampleRemoved], 30, nowMs);
  assert.strictEqual(sched30[0].isDueForSweep, true, '40-day-old removal must be due on 30-day cadence');
  const sched60 = computeRelistingSchedule([sampleRemoved], 60, nowMs);
  assert.strictEqual(sched60[0].isDueForSweep, false, '40-day-old removal must not yet be due on 60-day cadence');
  assert.strictEqual(sched60[0].daysUntilNextSweep, 20);

  // 5. State Data Broker Registry Sync & Regulator Complaint Packet
  assert.strictEqual(REGULATOR_AGENCIES.length, 5);
  const stateRegistry = getSynchronizedStateBrokerRegistry();
  assert(stateRegistry.length >= 25);
  assert(stateRegistry.some((r) => r.cppaRegistrationCode.startsWith('CPPA-DB-') && r.drop2026Mandated));

  const overdueSubmitted: ScanResult = {
    ...sampleRemoved,
    id: 'overdue-wp',
    brokerId: 'whitepages',
    removalStatus: 'submitted',
    submittedAtIso: new Date(nowMs - 55 * 24 * 60 * 60 * 1000).toISOString(),
    optOutConfirmationCode: '<msg-wp-55@gmail.com>',
    brokerConfirmationTicket: 'WP-CASE-551',
  };
  const packet = await generateRegulatorComplaintPacket({
    agencyId: 'CPPA',
    profile: testProfile,
    results: [overdueSubmitted],
    senderEmail: 'jane@example.com',
    selectedBrokerIds: ['whitepages'],
  });
  assert(packet.packetId.startsWith('PKT-CPPA-'));
  assert.strictEqual(packet.manifest.manifestSha256.length, 64);
  assert.strictEqual(packet.targetBrokers.length, 1);
  assert(packet.formalComplaintText.includes('Whitepages'));
  assert(packet.markdownDossier.includes('https://cppa.ca.gov/webapplications/complaint'));
});

test('30. Dual-Channel Form + Checkbox Automation & Friendly Email UX Across All Surfaces', () => {
  const rootDir = path.resolve(process.cwd(), 'src');

  // Legacy dead simulation file must not exist
  assert.strictEqual(
    fs.existsSync(path.join(rootDir, 'components', 'RealtimeProtectionView.tsx')),
    false,
    'Legacy unimported RealtimeProtectionView.tsx must remain removed'
  );

  const heroSrc = fs.readFileSync(path.join(rootDir, 'components', 'HeroSection.tsx'), 'utf8');
  assert(heroSrc.includes('onOpenWebForms'), 'HeroSection must wire onOpenWebForms for web-form card');

  const listingSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'ListingDetailModal.tsx'),
    'utf8'
  );
  assert(
    listingSrc.includes('onOpenAutomatedNavigator') &&
      /Auto-Fill &(amp;)? Submit Form/.test(listingSrc),
    'ListingDetailModal must expose side-by-side Auto-Fill & Submit Form and Legal Email removal'
  );

  const navSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'AutomatedRemovalNavigator.tsx'),
    'utf8'
  );
  assert(
    navSrc.includes('formatWorkflowStepAction') &&
      navSrc.includes('candidateRecords') &&
      navSrc.includes('onSwitchToEmailOptOut'),
    'AutomatedRemovalNavigator must format workflow steps in plain English, render candidate record picker, and offer 1-click Email fallback'
  );

  const queueSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'RemovalQueueModal.tsx'),
    'utf8'
  );
  assert(
    queueSrc.includes('onOpenAutomatedNavigator') && queueSrc.includes('Auto-Fill'),
    'RemovalQueueModal must offer 1-click Auto-Fill Form switching for portal-preferred and bounced brokers'
  );

  const diySrc = fs.readFileSync(
    path.join(rootDir, 'components', 'DiyOptOutAssistantModal.tsx'),
    'utf8'
  );
  assert(
    diySrc.includes('onOpenAutomatedNavigator') &&
      /Auto-Fill &(amp;)? Submit Form For Me/.test(diySrc),
    'DiyOptOutAssistantModal must let users delegate form filling & checkbox checking in 1 click'
  );

  const legalSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'LegalNoticeModal.tsx'),
    'utf8'
  );
  assert(
    legalSrc.includes('onOpenAutomatedNavigator') && legalSrc.includes('Auto-Fill Form'),
    'LegalNoticeModal must offer 1-click Auto-Fill Form handoff alongside statutory email'
  );

  const triageSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'BrokerReplyTriageModal.tsx'),
    'utf8'
  );
  assert(
    triageSrc.includes('/api/inbox/execute-verification-link') &&
      triageSrc.includes('Click &amp; Confirm For Me') &&
      triageSrc.includes('Auto-Fill Online Form For Me'),
    'BrokerReplyTriageModal must execute confirmation links (with checkbox checking) and offer form fallback on bounced replies'
  );

  const trackerSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'RemovalTracker.tsx'),
    'utf8'
  );
  assert(
    trackerSrc.includes('onOpenAutomatedNavigator') && trackerSrc.includes('Auto-Fill Form'),
    'RemovalTracker must expose 1-click Auto-Fill Form alongside Send Email'
  );

  const gmailSrc = fs.readFileSync(
    path.join(rootDir, 'components', 'GmailDispatchCenter.tsx'),
    'utf8'
  );
  assert(
    gmailSrc.includes('Send Test Email to Myself') &&
      gmailSrc.includes('1-Click Webmail (Easiest — No Password Needed)'),
    'GmailDispatchCenter must offer friendly 1-Click Webmail option alongside guided OAuth and App Password setup'
  );

  const appSrc = fs.readFileSync(path.join(rootDir, 'App.tsx'), 'utf8');
  assert(
    appSrc.includes('onSwitchToEmailOptOut=') &&
      appSrc.includes('onOpenWebForms=') &&
      appSrc.includes('onVerificationLinkCompleted='),
    'App.tsx must wire all dual-channel Form, Email, and Confirmation Link callbacks'
  );
});

test('31. GitHub Pages Static Bundle Isolation (/static publicDir) & Base-URL Brand Asset Resolution', () => {
  const repoRoot = process.cwd();

  const viteConfigSrc = fs.readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8');
  assert(
    viteConfigSrc.includes("publicDir: 'static'") &&
      viteConfigSrc.includes("'/synOUT/public/'"),
    'vite.config.ts must isolate source static assets in /static and preserve /synOUT/public/ base URL for GitHub Pages'
  );

  assert(
    fs.existsSync(path.join(repoRoot, 'static', 'synout-logo.svg')),
    '/static/synout-logo.svg must exist for both local root and GitHub Pages builds'
  );
  assert(
    fs.existsSync(path.join(repoRoot, 'static', 'site.webmanifest')),
    '/static/site.webmanifest must exist for PWA manifest delivery'
  );

  const navbarSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'Navbar.tsx'),
    'utf8'
  );
  const splashSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'SplashScreen.tsx'),
    'utf8'
  );
  assert(
    navbarSrc.includes('${import.meta.env.BASE_URL}synout-logo.svg') &&
      splashSrc.includes('${import.meta.env.BASE_URL}synout-logo.svg'),
    'Navbar and SplashScreen must resolve synout-logo.svg via import.meta.env.BASE_URL so it works on both / and /synOUT/public/'
  );
});

test('32. Zero Unexplained Optional Env Prompts, Friendly Webmail Default & Universal Automatic Form + Checkbox Fallback', async () => {
  const repoRoot = process.cwd();

  // 1. Optional advanced overrides in .env.example must stay commented out so users are never prompted for confusing keys
  const envExample = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
  const activeEnvLines = envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  for (const forbiddenUncommented of [
    'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
    'BROWSER_WORKER_URL',
    'SYNOUT_DISABLE_BROWSER_WORKER',
    'VITE_GOOGLE_OAUTH_CLIENT_ID',
  ]) {
    assert(
      !activeEnvLines.some((line) => line.startsWith(`${forbiddenUncommented}=`)),
      `.env.example must keep ${forbiddenUncommented} commented out so end users are not prompted for optional overrides`
    );
  }

  // 2. Email connection store defaults unconfigured users to friendly zero-password 1-Click Webmail mode
  const { purgeAllEmailConnections, getEmailConnectionState } = await import(
    '../src/services/emailConnectionStore'
  );
  await purgeAllEmailConnections();
  assert.strictEqual(
    getEmailConnectionState().mode,
    'webmail',
    'Unconfigured email store must default to non-intimidating 1-Click Webmail mode'
  );

  // 3. GmailDispatchCenter must automatically fall back to startWorkflowClient (filling forms & checking boxes) when email is unavailable or bounces
  const gmailCenterSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'GmailDispatchCenter.tsx'),
    'utf8'
  );
  assert(
    gmailCenterSrc.includes('startWorkflowClient') &&
      gmailCenterSrc.includes('onBrokerFormSubmitted') &&
      gmailCenterSrc.includes('autoFallbackToWebForms'),
    'GmailDispatchCenter must automatically fill out online forms and check boxes when email is unavailable or bounces'
  );

  // 4. ExposureReport and BrokerDirectory must trigger hands-free AutomatedRemovalNavigator directly from Auto-Fill Form
  const reportSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ExposureReport.tsx'),
    'utf8'
  );
  const directorySrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'BrokerDirectory.tsx'),
    'utf8'
  );
  assert(
    reportSrc.includes('onOpenAutomatedNavigator(broker, result)') &&
      directorySrc.includes('onOpenAutomatedNavigator(broker, existingResult)') &&
      directorySrc.includes('Auto-Remove via Form'),
    'ExposureReport and BrokerDirectory must run hands-free form filling + checkbox checking in 1 click'
  );
});

test('33. Cloud-Synced Encrypted Accounts, PWA Compliance, PDF Legal Packets & Automated Re-Listing Digest Alerts', async () => {
  const repoRoot = process.cwd();

  // 1. Formatted PDF Legal & Regulator Packet Generation (%PDF-1.7 binary verification)
  const {
    generateRegulatorComplaintPdf,
    generateBrokerEscalationPdf,
    generateMasterComplianceAuditPdf,
  } = await import('../src/utils/pdfPacketGenerator');
  const { generateRegulatorComplaintPacket } = await import('../src/utils/stateRegistryEngine');
  const { findBrokerById } = await import('../src/services/emailConnectionStore');

  const poaProfile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    previousLocations: ['Austin, TX'],
    powerOfAttorney: {
      isSigned: true,
      fullName: 'Jane Doe',
      address: 'Sacramento, CA',
      signedDate: 'Oct 28, 2026',
      authCode: 'POA-SYNOUT-99210',
      state: 'CA',
      agentName: 'synOUT Authorized Privacy Agent',
      scopeOfAuthority: 'CCPA § 1798.105, Delete Act SB 362 & TDPSA Statutory Deletion',
    },
  };

  const sampleResult: ScanResult = {
    id: 'pdf-test-wp',
    brokerId: 'whitepages',
    status: 'exposed',
    removalStatus: 'submitted',
    submittedAtIso: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
    optOutConfirmationCode: '<msg-pdf-50@gmail.com>',
    brokerConfirmationTicket: 'WP-PDF-501',
    mockListingData: {
      fullName: 'Jane Doe',
      age: 38,
      locations: ['Sacramento, CA'],
      phones: ['(916) 555-0144'],
      emails: ['synovamedia@gmail.com'],
      relatives: [],
      recordsCount: 2,
      riskLevel: 'Critical',
      leakTypes: ['Address', 'Phone'],
      profiles: ['https://www.whitepages.com/name/Jane-Doe/Sacramento-CA'],
      matchConfidence: 'VERIFIED_PUBLIC_RECORD',
    },
  };

  const regulatorPacket = await generateRegulatorComplaintPacket({
    agencyId: 'CPPA',
    profile: poaProfile,
    results: [sampleResult],
    senderEmail: 'synovamedia@gmail.com',
    selectedBrokerIds: ['whitepages'],
  });

  const regPdfBytes = await generateRegulatorComplaintPdf(regulatorPacket, poaProfile);
  assert(regPdfBytes.byteLength > 1500, 'Regulator complaint PDF must produce non-empty binary payload');
  assert.strictEqual(
    Buffer.from(regPdfBytes.slice(0, 8)).toString('ascii'),
    '%PDF-1.7',
    'Regulator complaint PDF must begin with %PDF-1.7 header'
  );

  const whitepages = findBrokerById('whitepages')!;
  const escPdfBytes = await generateBrokerEscalationPdf({
    agencyId: 'CPPA',
    broker: whitepages,
    result: sampleResult,
    profile: poaProfile,
    senderEmail: 'synovamedia@gmail.com',
  });
  assert(escPdfBytes.byteLength > 1500, 'Single-broker escalation PDF must produce non-empty binary payload');
  assert.strictEqual(Buffer.from(escPdfBytes.slice(0, 8)).toString('ascii'), '%PDF-1.7');

  const auditPdfBytes = await generateMasterComplianceAuditPdf({
    results: [sampleResult],
    profile: poaProfile,
    senderEmail: 'synovamedia@gmail.com',
  });
  assert(auditPdfBytes.byteLength > 1500, 'Master SLA compliance audit PDF must produce non-empty binary payload');
  assert.strictEqual(Buffer.from(auditPdfBytes.slice(0, 8)).toString('ascii'), '%PDF-1.7');

  // 2. Automated Re-Listing Digest Alerts & Auto-Re-Removal Wiring
  const { buildRelistingDigestEmail } = await import('../src/utils/relistingDigestEngine');
  const liveDigest = buildRelistingDigestEmail({
    profile: poaProfile,
    resurfacedDiffs: [
      {
        brokerId: 'spokeo',
        brokerName: 'Spokeo',
        brokerDomain: 'spokeo.com',
        probeUrl: 'https://www.spokeo.com/Jane-Doe/CA/Sacramento',
        httpStatus: 200,
        checkedAtIso: '2026-10-28T12:00:00.000Z',
        snapshotSha256: 'a'.repeat(64),
        previousSha256: 'b'.repeat(64),
        outcome: 'resurfaced_regression',
        summary: 'Resurfaced profile detected on Spokeo.',
      },
    ],
    cadenceDays: 30,
    autoReRemovalTriggered: true,
    isTestDigest: false,
  });
  assert(liveDigest.subject.includes('1 Data Broker(s) Republished Your Removed Profile'));
  assert(liveDigest.body.includes('Spokeo (spokeo.com)'));
  assert(liveDigest.body.includes('a'.repeat(64)));

  const testDigest = buildRelistingDigestEmail({
    profile: poaProfile,
    resurfacedDiffs: [],
    cadenceDays: 60,
    autoReRemovalTriggered: true,
    isTestDigest: true,
  });
  assert(testDigest.subject.includes('[synOUT Test Digest]'));
  assert(testDigest.body.includes('CONNECTIVITY & ALERT DELIVERY VERIFICATION'));

  const monitorSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ContinuousMonitoringAutomator.tsx'),
    'utf8'
  );
  const serverSrc = fs.readFileSync(path.join(repoRoot, 'server.ts'), 'utf8');
  assert(
    monitorSrc.includes('Send Test Digest Alert') &&
      monitorSrc.includes('onAutoReRemoveResurfaced') &&
      serverSrc.includes('/api/monitoring/send-relisting-digest'),
    'ContinuousMonitoringAutomator and server.ts must wire Re-Listing Digest Alerts and automatic repeat removal'
  );

  // 3. Installable Desktop & Mobile PWA Compliance (PNG headers, dimensions, manifest, iOS tag & UI buttons)
  const expectedIcons: Array<{ file: string; width: number; height: number }> = [
    { file: 'apple-touch-icon.png', width: 180, height: 180 },
    { file: 'pwa-192x192.png', width: 192, height: 192 },
    { file: 'pwa-512x512.png', width: 512, height: 512 },
    { file: 'pwa-maskable-512x512.png', width: 512, height: 512 },
  ];

  for (const icon of expectedIcons) {
    const iconBuf = fs.readFileSync(path.join(repoRoot, 'static', icon.file));
    assert.deepStrictEqual(
      Array.from(iconBuf.subarray(0, 8)),
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${icon.file} must have valid PNG magic signature`
    );
    assert.strictEqual(iconBuf.readUInt32BE(16), icon.width, `${icon.file} width must equal ${icon.width}`);
    assert.strictEqual(iconBuf.readUInt32BE(20), icon.height, `${icon.file} height must equal ${icon.height}`);
  }

  const staticManifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'static', 'site.webmanifest'), 'utf8')
  );
  assert.strictEqual(staticManifest.display, 'standalone');
  assert(
    staticManifest.icons.some((i: any) => i.sizes === '192x192' && i.purpose === 'any') &&
      staticManifest.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'any') &&
      staticManifest.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'maskable'),
    'site.webmanifest must declare separate purpose: "any" (192x192 & 512x512) and purpose: "maskable" (512x512) PNG icons'
  );

  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  assert(indexHtml.includes('apple-touch-icon.png'), 'index.html must reference PNG apple-touch-icon.png for iOS Safari');

  const navbarSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'Navbar.tsx'), 'utf8');
  const appSrc = fs.readFileSync(path.join(repoRoot, 'src', 'App.tsx'), 'utf8');
  assert(navbarSrc.includes('PWAInstallButton'), 'Navbar must mount PWAInstallButton for in-app installation');
  assert(appSrc.includes('<OfflineIndicator />'), 'App.tsx must mount OfflineIndicator connectivity banner');

  // 4. Cloud-Synced Zero-Knowledge Encrypted Accounts & Firestore Hardening
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'firebase-blueprint.json'), 'utf8')
  );
  assert(
    blueprint.entities?.UserAccount &&
      blueprint.entities?.UserPrivateContact &&
      blueprint.entities?.EncryptedCloudVault,
    'firebase-blueprint.json must declare UserAccount, split PII UserPrivateContact, and EncryptedCloudVault entities'
  );

  const rulesSrc = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
  assert(
    rulesSrc.includes("rules_version = '2';") &&
      rulesSrc.includes('allow read, write: if false;') &&
      rulesSrc.includes('isValidEncryptedCloudVault'),
    'firestore.rules must enforce default-deny global safety net and strict schema blueprint helpers'
  );

  const fbClientSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'services', 'firebaseClient.ts'),
    'utf8'
  );
  const cloudSyncSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'services', 'cloudVaultSync.ts'),
    'utf8'
  );
  const vaultModalSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'WorkspaceVaultModal.tsx'),
    'utf8'
  );
  assert(
    fbClientSrc.includes('getDocFromServer') && fbClientSrc.includes('handleFirestoreError'),
    'firebaseClient.ts must validate connection via getDocFromServer and expose structured handleFirestoreError'
  );
  assert(
    cloudSyncSrc.includes('signInWithPopup') &&
      cloudSyncSrc.includes('250000') &&
      vaultModalSrc.includes('signInCloudVaultWithGoogle') &&
      appSrc.includes('registerRemoteVaultRestoreHandler'),
    'Cloud Vault Sync must use Google signInWithPopup, 250k-iteration PBKDF2 AES-256-GCM encryption, and live cross-device sync'
  );
});

test('34. D3 Historical Exposure Trend, Full-Scan JSON/CSV Documentation Export & Server-Side Grounded Privacy Advisor', async () => {
  const repoRoot = process.cwd();
  const { computeScanStats, computeInitialBaselineExposureScore } = await import(
    '../src/utils/scanEngine'
  );
  const { buildExposureTrendSeries } = await import('../src/components/ExposureTrendChart');
  const {
    buildFullScanExportRows,
    generateFullScanResultsCsv,
    generateFullScanResultsJson,
  } = await import('../src/utils/csvExport');
  const { createSnapshotFromScan } = await import('../src/utils/workspaceVault');
  const {
    buildAdvisorSystemInstruction,
    extractGroundingMetadataFromResponse,
    classifyGeminiServerError,
  } = await import('../src/server/geminiPrivacyAdvisor');

  const profile: UserProfile = {
    firstName: 'Jane',
    lastName: 'Doe',
    currentCity: 'Sacramento',
    currentState: 'CA',
    birthYear: '1988',
    phoneNumbers: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: ['John Doe'],
    previousLocations: ['Austin, TX'],
  };

  // 1. Dynamic Exposure Score progression & D3 trend series construction
  const baseResults = runBrokerScan(profile);
  const initialStats = computeScanStats(baseResults);
  const baselineScore = computeInitialBaselineExposureScore(baseResults);
  assert.strictEqual(initialStats.exposureScore, baselineScore);
  assert(initialStats.exposedBrokers > 0 && initialStats.cleanBrokers > 0);

  const snap1 = {
    ...createSnapshotFromScan(profile, baseResults, initialStats.exposureScore),
    id: 'snap-t1',
    timestampIso: '2026-09-01T10:00:00.000Z',
  };

  // Mark half of exposed brokers submitted and one-quarter removed
  let exposedSeen = 0;
  const progressedResults: ScanResult[] = baseResults.map((r) => {
    if (r.status !== 'exposed') return r;
    exposedSeen++;
    if (exposedSeen % 4 === 0) {
      return {
        ...r,
        removalStatus: 'removed',
        verifiedRemovedAtIso: '2026-10-10T12:00:00.000Z',
      };
    }
    if (exposedSeen % 2 === 0) {
      return {
        ...r,
        removalStatus: 'submitted',
        submittedAtIso: '2026-10-01T12:00:00.000Z',
        optOutConfirmationCode: `=CMD|' /C calc'!A0`,
      };
    }
    return r;
  });

  const progressedStats = computeScanStats(progressedResults);
  assert(
    progressedStats.exposureScore < initialStats.exposureScore,
    'Live exposureScore must decrease as opt-outs are submitted and confirmed removed'
  );

  const snap2 = {
    ...createSnapshotFromScan(profile, progressedResults, progressedStats.exposureScore),
    id: 'snap-t2',
    timestampIso: '2026-10-12T10:00:00.000Z',
  };

  // Pass snapshots in reverse order to confirm chronological ascending sort
  const seriesWithForecast = buildExposureTrendSeries(
    [snap2, snap1],
    progressedResults,
    progressedStats,
    true
  );
  assert.strictEqual(seriesWithForecast[0].id, 'snap-t1');
  assert.strictEqual(seriesWithForecast[1].id, 'snap-t2');
  assert(seriesWithForecast.some((p) => p.kind === 'current'));
  assert(seriesWithForecast.some((p) => p.kind === 'projected'));

  const seriesRecordedOnly = buildExposureTrendSeries(
    [snap1, snap2],
    progressedResults,
    progressedStats,
    false
  );
  assert.strictEqual(
    seriesRecordedOnly.some((p) => p.kind === 'projected'),
    false,
    'Disabling 45d forecast must omit projected node'
  );

  const d3ChartSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ExposureTrendChart.tsx'),
    'utf8'
  );
  const exposureReportSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ExposureReport.tsx'),
    'utf8'
  );
  assert(
    d3ChartSrc.includes("import * as d3 from 'd3'") &&
      d3ChartSrc.includes('d3.scaleLinear') &&
      /d3\s*\.line/.test(d3ChartSrc) &&
      /d3\s*\.area/.test(d3ChartSrc) &&
      exposureReportSrc.includes('<ExposureTrendChart'),
    'ExposureReport must render D3 ExposureTrendChart directly inside the dossier view'
  );

  // 2. Full Scan Results JSON & CSV Export (ALL scanned brokers: exposed + clean)
  const fullRows = buildFullScanExportRows(profile, progressedResults);
  assert.strictEqual(
    fullRows.length,
    progressedResults.length,
    'Full scan export must include every scanned broker (both exposed and clean)'
  );
  assert(fullRows.some((r) => r.scanStatus === 'exposed'));
  assert(fullRows.some((r) => r.scanStatus === 'clean'));

  const fullCsv = generateFullScanResultsCsv(profile, progressedResults);
  const csvLines = fullCsv.split('\r\n');
  assert.strictEqual(
    csvLines.length,
    progressedResults.length + 1,
    'Full CSV must contain 1 header row plus all exposed & clean scan rows'
  );
  assert(
    fullCsv.includes(`"'=CMD|' /C calc'!A0"`),
    'Full CSV export must neutralize CWE-1236 formula injection payloads'
  );

  const fullJsonRaw = generateFullScanResultsJson(profile, progressedResults, progressedStats, [
    snap2,
    snap1,
  ]);
  const parsedJson = JSON.parse(fullJsonRaw);
  assert.strictEqual(parsedJson.schema, 'synOUT-external-scan-documentation-v1');
  assert.strictEqual(parsedJson.scanResults.length, progressedResults.length);
  assert.strictEqual(parsedJson.summaryStats.totalBrokers, progressedResults.length);
  assert.strictEqual(parsedJson.historicalExposureTrend.length, 2);
  assert.strictEqual(parsedJson.historicalExposureTrend[0].id, 'snap-t1');
  assert(
    exposureReportSrc.includes('exportFullScanResultsJson') &&
      exposureReportSrc.includes('exportFullScanResultsCsv'),
    'ExposureReport must wire both JSON and CSV full-scan exports'
  );

  // 3. Server-Side Multi-Turn Gemini Chat & Google Search Grounding Hygiene
  const counselPrompt = buildAdvisorSystemInstruction('statutory_counsel', {
    jurisdictionState: 'CA',
    exposureScore: progressedStats.exposureScore,
    totalBrokersScanned: progressedStats.totalBrokers,
    exposedCount: progressedStats.exposedBrokers,
  });
  const researcherPrompt = buildAdvisorSystemInstruction('broker_researcher');
  const triagePrompt = buildAdvisorSystemInstruction('rapid_triage');
  assert(counselPrompt.includes('11 CCR § 7060') && counselPrompt.includes('CA'));
  assert(researcherPrompt.includes('Portal Researcher'));
  assert(triagePrompt.includes('Rapid Exposure Triage'));

  const extracted = extractGroundingMetadataFromResponse({
    candidates: [
      {
        groundingMetadata: {
          webSearchQueries: ['Spokeo opt out 2026', 'CCPA data broker registry'],
          groundingChunks: [
            { web: { uri: 'https://cppa.ca.gov/data_broker_registry/', title: 'CPPA Registry' } },
            { web: { uri: 'https://cppa.ca.gov/data_broker_registry/', title: 'Duplicate' } },
            { web: { uri: 'javascript:alert(1)', title: 'Unsafe URI' } },
            { web: { uri: 'https://www.spokeo.com/optout', title: 'Spokeo Opt Out' } },
          ],
        },
      },
    ],
  } as any);
  assert.strictEqual(extracted.citations.length, 2, 'Must deduplicate URLs and reject non-HTTP URIs');
  assert.strictEqual(extracted.citations[0].title, 'CPPA Registry');
  assert.strictEqual(extracted.searchQueries.length, 2);

  const authErr = classifyGeminiServerError(new Error('PERMISSION_DENIED: API key not valid'));
  assert.strictEqual(authErr.httpStatus, 403);
  assert(authErr.userMessage.includes('Settings > Secrets'));

  const serverAdvisorSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'server', 'geminiPrivacyAdvisor.ts'),
    'utf8'
  );
  assert(
    serverAdvisorSrc.includes("'User-Agent': 'aistudio-build'") &&
      serverAdvisorSrc.includes('gemini-3.8-flash') &&
      serverAdvisorSrc.includes('gemini-3.1-flash-lite') &&
      serverAdvisorSrc.includes('googleSearch: {}') &&
      serverAdvisorSrc.includes('ai.chats.create') &&
      !serverAdvisorSrc.includes('response.text()'),
    'Server Gemini advisor must set User-Agent telemetry, support gemini-3.8-flash + googleSearch & gemini-3.1-flash-lite, use ai.chats.create, and read response.text property'
  );

  // Confirm zero client-side @google/genai imports
  for (const clientSubdir of ['components', 'services', 'utils']) {
    const dirPath = path.join(repoRoot, 'src', clientSubdir);
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const src = fs.readFileSync(path.join(dirPath, file), 'utf8');
      assert.strictEqual(
        src.includes('@google/genai'),
        false,
        `Client module src/${clientSubdir}/${file} must never import @google/genai directly`
      );
    }
  }
});

test('35. Profile Quick Fix Helper & Visual PDF Summary Exporter (jspdf + html2canvas)', async () => {
  const repoRoot = process.cwd();
  const { computeScanStats } = await import('../src/utils/scanEngine');
  const { createSnapshotFromScan } = await import('../src/utils/workspaceVault');
  const {
    parsePriorLocationsList,
    normalizeLocationCityState,
    normalizeUsPhoneNumber,
    analyzeProfileDiscrepancies,
    applyAllAutoQuickFixes,
    mergeRescanPreservingProgress,
  } = await import('../src/utils/profileQuickFixEngine');
  const {
    sanitizeClonedStylesheetsForHtml2Canvas,
    buildPdfSummaryDocumentData,
  } = await import('../src/utils/pdfSummaryExporter');

  // 1. Prior address coalescing & phone/location normalization
  assert.deepStrictEqual(
    parsePriorLocationsList(['Austin', 'TX', 'denver, colorado', 'Austin, TX']),
    ['Austin, TX', 'Denver, CO'],
    'Should repair comma-split [City, ST] tokens, normalize state names, and deduplicate'
  );
  assert.deepStrictEqual(
    parsePriorLocationsList('Austin, TX; Seattle, Washington'),
    ['Austin, TX', 'Seattle, WA']
  );
  assert.strictEqual(normalizeLocationCityState('austin, texas'), 'Austin, TX');
  assert.strictEqual(normalizeUsPhoneNumber('1-916-555-0144'), '(916) 555-0144');
  assert.strictEqual(normalizeUsPhoneNumber('9165550144'), '(916) 555-0144');

  // 2. Profile discrepancy detection & 1-click Auto-Fix calibration
  const messyProfile: UserProfile = {
    firstName: 'jane',
    lastName: 'doe',
    currentCity: 'sacramento',
    currentState: 'california',
    birthYear: '',
    phoneNumbers: ['9165550144', '(916) 555-0144'],
    emails: ['JANE.DOE@GMAIL.COM', ''],
    relatives: [],
    previousLocations: ['Sacramento, CA', 'Austin', 'Texas'],
  };

  const initialScan = runBrokerScan(messyProfile);
  const initialAudit = analyzeProfileDiscrepancies(
    messyProfile,
    initialScan,
    'synovamedia@gmail.com'
  );

  assert(
    initialAudit.autoFixableCount >= 4,
    'Should flag outdated self-duplicate prior address, primary state normalization, phone formatting, and connected email sync as 1-click auto-fixable'
  );
  assert(
    initialAudit.skippedRealEstateCount > 0,
    'Missing currentStreet should report skipped Real Estate & Property brokers'
  );

  const autoFixed = applyAllAutoQuickFixes(
    messyProfile,
    initialScan,
    'synovamedia@gmail.com'
  );
  assert.strictEqual(autoFixed.updatedProfile.firstName, 'Jane');
  assert.strictEqual(autoFixed.updatedProfile.lastName, 'Doe');
  assert.strictEqual(autoFixed.updatedProfile.currentCity, 'Sacramento');
  assert.strictEqual(autoFixed.updatedProfile.currentState, 'CA');
  assert.deepStrictEqual(
    autoFixed.updatedProfile.previousLocations,
    ['Austin, TX'],
    'Current city duplicate must be removed from previousLocations while coalescing Austin, TX'
  );
  assert.deepStrictEqual(autoFixed.updatedProfile.phoneNumbers, ['(916) 555-0144']);
  assert.deepStrictEqual(autoFixed.updatedProfile.emails, [
    'jane.doe@gmail.com',
    'synovamedia@gmail.com',
  ]);

  const postAutoAudit = analyzeProfileDiscrepancies(
    autoFixed.updatedProfile,
    initialScan,
    'synovamedia@gmail.com'
  );
  assert(
    postAutoAudit.accuracyScore > initialAudit.accuracyScore,
    'Accuracy score must increase after applying 1-click Auto-Fixes'
  );
  assert.strictEqual(postAutoAudit.autoFixableCount, 0);

  // 3. Inline street/ZIP anchor fix unlocks Real Estate & Property brokers while preserving receipts
  const streetFixItem = postAutoAudit.discrepancies.find(
    (d) => d.id === 'add-street-and-zip-anchor'
  );
  assert(streetFixItem, 'Should suggest adding physical street address and 5-digit ZIP');

  // Simulate user having already submitted one opt-out and confirmed removal on another
  const exposedInitial = initialScan.filter((r) => r.status === 'exposed');
  const submittedBrokerId = exposedInitial[0].brokerId;
  const removedBrokerId = exposedInitial[1].brokerId;
  const scanWithUserProgress: ScanResult[] = initialScan.map((r) => {
    if (r.brokerId === submittedBrokerId) {
      return {
        ...r,
        removalStatus: 'submitted',
        optOutConfirmationCode: '<receipt-123@synout.local>',
        submittedAtIso: '2026-10-15T09:00:00.000Z',
      };
    }
    if (r.brokerId === removedBrokerId) {
      return {
        ...r,
        removalStatus: 'removed',
        verifiedRemovedAtIso: '2026-10-20T09:00:00.000Z',
        webFormSubmittedAtIso: '2026-10-16T09:00:00.000Z',
        webFormConfirmationCode: 'WF-CONF-9981',
      };
    }
    return r;
  });

  const profileWithStreet = streetFixItem!.applyFix(autoFixed.updatedProfile, {
    street: '742 Evergreen Ter',
    zip: '95814',
  });
  const freshAfterStreet = runBrokerScan(profileWithStreet);
  const mergedAfterStreet = mergeRescanPreservingProgress(
    scanWithUserProgress,
    freshAfterStreet
  );

  assert(
    mergedAfterStreet.filter((r) => r.status === 'exposed').length >
      scanWithUserProgress.filter((r) => r.status === 'exposed').length,
    'Adding street parcel address must unlock previously skipped Real Estate & Property brokers'
  );

  const preservedSubmitted = mergedAfterStreet.find((r) => r.brokerId === submittedBrokerId);
  const preservedRemoved = mergedAfterStreet.find((r) => r.brokerId === removedBrokerId);
  assert.strictEqual(preservedSubmitted?.removalStatus, 'submitted');
  assert.strictEqual(
    preservedSubmitted?.optOutConfirmationCode,
    '<receipt-123@synout.local>',
    'Quick Fix re-scan must preserve existing email opt-out Message-ID receipts'
  );
  assert.strictEqual(preservedRemoved?.removalStatus, 'removed');
  assert.strictEqual(
    preservedRemoved?.webFormConfirmationCode,
    'WF-CONF-9981',
    'Quick Fix re-scan must preserve existing web-form removal confirmations'
  );

  // 4. CSS Color Level 4 sanitizer & PDF Summary Document builder (jspdf + html2canvas)
  const rawTailwindV4Css = `
    .card {
      color: oklch(92.8% 0.006 264.531);
      border-color: color-mix(in oklab, oklch(62.3% 0.214 259.815) 40%, transparent);
      background: oklab(0.45 -0.08 0.05);
    }
  `;
  const sanitizedCss = sanitizeClonedStylesheetsForHtml2Canvas(rawTailwindV4Css);
  assert.strictEqual(/oklch|oklab|color-mix/i.test(sanitizedCss), false);
  assert(
    sanitizedCss.includes('rgba(51, 65, 85, 0.22);') && sanitizedCss.includes('#334155;'),
    'Balanced-parenthesis sanitizer must produce valid CSS declarations without stray parentheses'
  );

  const mergedStats = computeScanStats(mergedAfterStreet);
  const baselineSnap = {
    ...createSnapshotFromScan(profileWithStreet, initialScan, 92),
    id: 'snap-pdf-base',
    timestampIso: '2026-09-15T10:00:00.000Z',
  };
  const pdfDoc = buildPdfSummaryDocumentData(
    profileWithStreet,
    mergedAfterStreet,
    mergedStats,
    [baselineSnap]
  );
  assert.strictEqual(pdfDoc.subjectFullName, 'Jane Doe');
  assert.strictEqual(pdfDoc.totalScanned, mergedAfterStreet.length);
  assert.strictEqual(pdfDoc.exposedBrokers, mergedStats.exposedBrokers);
  assert.strictEqual(pdfDoc.baselineScore, 92);
  assert.strictEqual(pdfDoc.scoreDelta, mergedStats.exposureScore - 92);
  assert(pdfDoc.brokerRows.some((row) => row.statusLabel === 'Verified Removed'));
  assert(pdfDoc.brokerRows.some((row) => row.statusLabel === 'Legal Email Sent'));

  // 5. Source wiring assertions for ExposureReport, ProfileQuickFixPanel & pdfSummaryExporter
  const pdfExporterSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'utils', 'pdfSummaryExporter.ts'),
    'utf8'
  );
  const quickFixPanelSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ProfileQuickFixPanel.tsx'),
    'utf8'
  );
  const exposureReportSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ExposureReport.tsx'),
    'utf8'
  );

  assert(
    pdfExporterSrc.includes("from 'jspdf'") &&
      pdfExporterSrc.includes("from 'html2canvas'"),
    'pdfSummaryExporter.ts must use jspdf and html2canvas'
  );
  assert(
    exposureReportSrc.includes('Download PDF Summary') &&
      exposureReportSrc.includes('<ProfileQuickFixPanel') &&
      exposureReportSrc.includes('synout-pdf-summary-sheet'),
    'ExposureReport.tsx must wire Download PDF Summary button, ProfileQuickFixPanel, and printer-friendly summary sheet'
  );
  assert.strictEqual(
    quickFixPanelSrc.includes('style={') || exposureReportSrc.includes('style={'),
    false,
    'Components must use CSS/Tailwind classes with zero inline style attributes'
  );
});

test('36. Global Footer, Privacy Policy (2.1–2.12), Terms of Service (3.1–3.16) & Validated Contact Delivery', async () => {
  const repoRoot = process.cwd();
  const footerSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'Footer.tsx'), 'utf8');
  const privacySrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'PrivacyPolicyPage.tsx'),
    'utf8'
  );
  const termsSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'TermsOfServicePage.tsx'),
    'utf8'
  );
  const contactPageSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'ContactPage.tsx'),
    'utf8'
  );
  const appSrc = fs.readFileSync(path.join(repoRoot, 'src', 'App.tsx'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(repoRoot, 'server.ts'), 'utf8');

  // 1. Global Footer & App routing
  assert(
    footerSrc.includes("onNavigate('privacy')") &&
      footerSrc.includes("onNavigate('terms')") &&
      footerSrc.includes("onNavigate('contact')"),
    'Footer.tsx must expose Privacy, Terms, and Contact navigation actions'
  );
  assert(
    appSrc.includes('<PrivacyPolicyPage') &&
      appSrc.includes('<TermsOfServicePage') &&
      appSrc.includes('<ContactPage'),
    'App.tsx must route Privacy, Terms, and Contact pages inside main layout'
  );

  // 2. Privacy Policy sections 2.1 through 2.12 & accurate scope disclosures
  for (let i = 1; i <= 12; i++) {
    assert(
      privacySrc.includes(`Section 2.${i}`),
      `PrivacyPolicyPage.tsx must include Section 2.${i}`
    );
  }
  assert(
    privacySrc.includes('https://www.googleapis.com/auth/gmail.send') &&
      privacySrc.includes('https://www.googleapis.com/auth/gmail.readonly') &&
      privacySrc.includes('AES-256-GCM'),
    'PrivacyPolicyPage.tsx must document real Google OAuth scopes and AES-256-GCM encryption'
  );

  // 3. Terms of Service sections 3.1 through 3.16 & honest 45-day estimate disclaimer
  for (let i = 1; i <= 16; i++) {
    assert(
      termsSrc.includes(`Section 3.${i}`),
      `TermsOfServicePage.tsx must include Section 3.${i}`
    );
  }
  assert(
    termsSrc.includes('45 calendar days') &&
      termsSrc.includes('planning estimate') &&
      termsSrc.includes('not a law firm'),
    'TermsOfServicePage.tsx must explain 45-day planning estimate and non-law-firm informational scope'
  );

  // 4. Contact validation, recipient/subject enforcement, duplicate & rate-limit guards
  const {
    OPERATOR_CONTACT_RECIPIENT,
    OPERATOR_CONTACT_SUBJECT,
    processAndDeliverContactSubmission,
    resetContactAbuseGuardsForTests,
  } = await import('../src/server/contactDeliveryService');
  const { validateContactFieldsClient } = await import('../src/services/contactClient');

  assert.strictEqual(OPERATOR_CONTACT_RECIPIENT, 'synovamedia@gmail.com');
  assert.strictEqual(OPERATOR_CONTACT_SUBJECT, 'synOUT MESSAGE');
  assert(serverSrc.includes("app.post('/api/contact'"), 'server.ts must mount POST /api/contact');
  const normalizedContactSrc = contactPageSrc.replace(/\s+/g, ' ');
  assert(
    normalizedContactSrc.includes('Message sent successfully!') &&
      normalizedContactSrc.includes(
        'We&apos;ve received your message and will reach out within 72 hours of your submission.'
      ),
    'ContactPage.tsx must display exact post-acceptance 72-hour confirmation copy'
  );

  resetContactAbuseGuardsForTests();

  const emptyClientCheck = validateContactFieldsClient({ name: '', email: 'bad-email', message: '' });
  assert.strictEqual(emptyClientCheck.valid, false);
  assert(emptyClientCheck.errors.name && emptyClientCheck.errors.email && emptyClientCheck.errors.message);

  // Server validation rejects empty / malformed input
  const invalidServer = await processAndDeliverContactSubmission(
    { name: 'A', email: 'not-an-email', message: 'short' },
    'test-client-1'
  );
  assert.strictEqual(invalidServer.httpStatus, 400);
  assert.strictEqual(invalidServer.accepted, false);

  // Honeypot bot rejection
  const honeypotRes = await processAndDeliverContactSubmission(
    {
      name: 'Bot User',
      email: 'bot@example.com',
      message: 'Valid length message body here.',
      honeypot: 'https://spam.example',
    },
    'test-client-bot'
  );
  assert.strictEqual(honeypotRes.httpStatus, 400);
  assert.strictEqual(honeypotRes.accepted, false);

  // Unconfigured provider must return honest 503 without faking success
  const unconfiguredRes = await processAndDeliverContactSubmission(
    {
      name: 'Alex Morgan',
      email: 'alex@example.com',
      message: 'Checking how synOUT handles contact requests when SMTP is unconfigured.',
    },
    'test-client-unconf'
  );
  if (!process.env.CONTACT_SMTP_HOST && !process.env.CONTACT_RESEND_API_KEY) {
    assert.strictEqual(unconfiguredRes.httpStatus, 503);
    assert.strictEqual(unconfiguredRes.accepted, false);
    assert.strictEqual(unconfiguredRes.errorCode, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }

  // Verified provider delivery with exact recipient & subject
  const capturedMails: Array<{
    from: string;
    replyTo: string;
    to: string;
    subject: string;
    text: string;
  }> = [];

  const deliveredRes = await processAndDeliverContactSubmission(
    {
      name: 'Jordan Taylor',
      email: 'jordan.taylor@example.org',
      message: 'Hello synOUT team, I have a question regarding broker follow-up timelines.',
    },
    'test-client-valid',
    {
      customTransporterForTests: {
        sendMail: async (mailOpts) => {
          capturedMails.push(mailOpts);
          return {
            messageId: '<contact-test-001@synout.local>',
            accepted: ['synovamedia@gmail.com'],
            rejected: [],
          };
        },
      },
    }
  );

  assert.strictEqual(deliveredRes.httpStatus, 200);
  assert.strictEqual(deliveredRes.success, true);
  assert.strictEqual(deliveredRes.accepted, true);
  assert.strictEqual(deliveredRes.userMessage, 'Message sent successfully!');
  assert.strictEqual(capturedMails.length, 1);
  assert.strictEqual(capturedMails[0].to, 'synovamedia@gmail.com');
  assert.strictEqual(capturedMails[0].subject, 'synOUT MESSAGE');
  assert.strictEqual(capturedMails[0].replyTo, 'jordan.taylor@example.org');
  assert(
    capturedMails[0].text.includes('Jordan Taylor') &&
      capturedMails[0].text.includes('jordan.taylor@example.org') &&
      capturedMails[0].text.includes('question regarding broker follow-up timelines')
  );

  // Duplicate submission guard blocks accidental double-click re-send
  const duplicateRes = await processAndDeliverContactSubmission(
    {
      name: 'Jordan Taylor',
      email: 'jordan.taylor@example.org',
      message: 'Hello synOUT team, I have a question regarding broker follow-up timelines.',
    },
    'test-client-valid',
    {
      customTransporterForTests: {
        sendMail: async () => ({
          messageId: '<dup@synout>',
          accepted: ['synovamedia@gmail.com'],
        }),
      },
    }
  );
  assert.strictEqual(duplicateRes.httpStatus, 409);
  assert.strictEqual(duplicateRes.accepted, false);
  assert.strictEqual(duplicateRes.errorCode, 'DUPLICATE_SUBMISSION');

  // Provider rejection must NOT claim email was sent
  const rejectedRes = await processAndDeliverContactSubmission(
    {
      name: 'Jordan Taylor',
      email: 'jordan.taylor@example.org',
      message: 'Different message body to test downstream SMTP rejection handling.',
    },
    'test-client-reject',
    {
      customTransporterForTests: {
        sendMail: async () => ({
          accepted: [],
          rejected: ['synovamedia@gmail.com'],
        }),
      },
    }
  );
  assert.strictEqual(rejectedRes.httpStatus, 502);
  assert.strictEqual(rejectedRes.accepted, false);

  // Rate limiting enforces 5 submissions per 15-minute window
  for (let attempt = 1; attempt <= 5; attempt++) {
    await processAndDeliverContactSubmission(
      {
        name: 'Rate Tester',
        email: 'rate@example.org',
        message: `Unique contact rate-limit check message #${attempt} with valid length.`,
      },
      'rate-limited-session',
      {
        customTransporterForTests: {
          sendMail: async () => ({
            messageId: `<rate-${attempt}@synout>`,
            accepted: ['synovamedia@gmail.com'],
          }),
        },
      }
    );
  }
  const sixthAttempt = await processAndDeliverContactSubmission(
    {
      name: 'Rate Tester',
      email: 'rate@example.org',
      message: 'Sixth unique message exceeding 15-minute rate window.',
    },
    'rate-limited-session'
  );
  assert.strictEqual(sixthAttempt.httpStatus, 429);
  assert.strictEqual(sixthAttempt.errorCode, 'RATE_LIMITED');
  resetContactAbuseGuardsForTests();
});

test('37. First-Launch Interactive Tutorial (8 Steps) & Post-Splash Onboarding State Management', async () => {
  const repoRoot = process.cwd();
  const {
    TOTAL_TUTORIAL_STEPS,
    resetOnboardingStateForTests,
    getOnboardingState,
    setOnboardingStep,
    skipOnboardingTutorial,
    completeOnboardingTutorial,
    closeOnboardingTutorial,
    reopenOnboardingTutorial,
  } = await import('../src/utils/onboardingStore');

  assert.strictEqual(TOTAL_TUTORIAL_STEPS, 8);

  resetOnboardingStateForTests();
  assert.strictEqual(getOnboardingState().isOpen, true);
  assert.strictEqual(getOnboardingState().currentStep, 0);
  assert.strictEqual(getOnboardingState().status, 'in_progress');

  // Forward & backward step navigation + bounds clamping
  setOnboardingStep(3);
  assert.strictEqual(getOnboardingState().currentStep, 3);
  setOnboardingStep(2);
  assert.strictEqual(getOnboardingState().currentStep, 2);
  setOnboardingStep(99);
  assert.strictEqual(getOnboardingState().currentStep, 7);
  setOnboardingStep(-5);
  assert.strictEqual(getOnboardingState().currentStep, 0);

  // Skip tutorial closes modal and persists 'skipped'
  skipOnboardingTutorial();
  assert.strictEqual(getOnboardingState().isOpen, false);
  assert.strictEqual(getOnboardingState().status, 'skipped');

  // Reopen tutorial & complete final step
  reopenOnboardingTutorial(0);
  assert.strictEqual(getOnboardingState().isOpen, true);
  completeOnboardingTutorial();
  assert.strictEqual(getOnboardingState().isOpen, false);
  assert.strictEqual(getOnboardingState().status, 'completed');
  assert.strictEqual(getOnboardingState().currentStep, 7);

  // Close tutorial preserves dismissed state without reopening automatically
  reopenOnboardingTutorial(2);
  closeOnboardingTutorial();
  assert.strictEqual(getOnboardingState().isOpen, false);

  const tutorialSrc = fs.readFileSync(
    path.join(repoRoot, 'src', 'components', 'OnboardingTutorialModal.tsx'),
    'utf8'
  );
  const appSrc = fs.readFileSync(path.join(repoRoot, 'src', 'App.tsx'), 'utf8');

  assert(
    tutorialSrc.includes('Take control of your digital privacy.') &&
      tutorialSrc.includes('Connect Your Email') &&
      tutorialSrc.includes('Understand Email Permissions') &&
      tutorialSrc.includes('Search and Discover Exposure') &&
      tutorialSrc.includes('Understand ExposureReport') &&
      tutorialSrc.includes('Submit and Track Opt-Out Requests') &&
      tutorialSrc.includes('Privacy Tactics') &&
      tutorialSrc.includes('Connect Email &amp; Get Started') &&
      tutorialSrc.includes('Explore synOUT on My Own'),
    'OnboardingTutorialModal.tsx must implement all 8 required onboarding steps and final CTAs'
  );
  assert(
    appSrc.includes('{!showSplash && (') && appSrc.includes('<OnboardingTutorialModal'),
    'App.tsx must render OnboardingTutorialModal strictly after SplashScreen completes (!showSplash)'
  );
});

test('38. 45-Day Expected Removal Mini-Timeline & Broker-Specific Privacy Tactics Modal', async () => {
  const repoRoot = process.cwd();
  const {
    EXPECTED_REMOVAL_WINDOW_DAYS,
    addCalendarDaysUtc,
    calculateOptOutTimeline,
    shouldRenderOptOutTimeline,
  } = await import('../src/utils/optOutTimelineEngine');
  const {
    buildBrokerPrivacyTactics,
    isBrokerDocumentationVerified,
    formatPrivacyChecklistForClipboard,
  } = await import('../src/utils/privacyTacticsEngine');
  const { findBrokerById } = await import('../src/services/emailConnectionStore');

  assert.strictEqual(EXPECTED_REMOVAL_WINDOW_DAYS, 45);

  const baseMockListing = {
    fullName: 'Jane Doe',
    age: 38,
    locations: ['Sacramento, CA'],
    phones: ['(916) 555-0144'],
    emails: ['synovamedia@gmail.com'],
    relatives: [],
    recordsCount: 2,
    riskLevel: 'Critical' as const,
    leakTypes: ['Address', 'Phone'],
    profiles: ['https://www.whitepages.com/name/Jane-Doe/Sacramento-CA'],
    matchConfidence: 'VERIFIED_PUBLIC_RECORD' as const,
  };

  // 1. Newly submitted request (Day 0 -> 45 days remaining)
  const newlySubmitted: ScanResult = {
    id: 'tl-new',
    brokerId: 'whitepages',
    status: 'exposed',
    removalStatus: 'submitted',
    submittedAtIso: '2026-10-01T14:30:00.000Z',
    optOutConfirmationCode: '<msg-tl-1@synout>',
    mockListingData: baseMockListing,
  };
  assert.strictEqual(shouldRenderOptOutTimeline(newlySubmitted), true);

  const tlDay0 = calculateOptOutTimeline(newlySubmitted, new Date('2026-10-01T18:00:00.000Z'));
  assert.strictEqual(tlDay0.phase, 'submitted');
  assert.strictEqual(tlDay0.elapsedCalendarDays, 0);
  assert.strictEqual(tlDay0.remainingCalendarDays, 45);
  assert.strictEqual(tlDay0.expectedRemovalIso, '2026-11-15T14:30:00.000Z');

  // 2. Partway through 45-day window (Day 15 -> 30 days remaining) & stability across refreshes
  const tlDay15 = calculateOptOutTimeline(newlySubmitted, new Date('2026-10-16T09:00:00.000Z'));
  assert.strictEqual(tlDay15.phase, 'in_progress');
  assert.strictEqual(tlDay15.elapsedCalendarDays, 15);
  assert.strictEqual(tlDay15.remainingCalendarDays, 30);
  assert.strictEqual(
    tlDay15.expectedRemovalIso,
    tlDay0.expectedRemovalIso,
    'Reopening or refreshing the report must never alter the original expectedRemovalDate'
  );

  // 3. One day remaining (Day 44 -> 1 day remaining)
  const tlDay44 = calculateOptOutTimeline(newlySubmitted, new Date('2026-11-14T12:00:00.000Z'));
  assert.strictEqual(tlDay44.phase, 'in_progress');
  assert.strictEqual(tlDay44.remainingCalendarDays, 1);

  // 4. Expected date is today (Day 45 -> must NOT auto-complete!)
  const tlDay45 = calculateOptOutTimeline(newlySubmitted, new Date('2026-11-15T12:00:00.000Z'));
  assert.strictEqual(tlDay45.phase, 'expected_date_reached');
  assert.notStrictEqual(tlDay45.phase, 'confirmed_removed');
  assert.strictEqual(tlDay45.remainingCalendarDays, 0);

  // 5. Past expected date (Day 60 -> must remain unconfirmed and show follow-up guidance!)
  const tlDay60 = calculateOptOutTimeline(newlySubmitted, new Date('2026-11-30T12:00:00.000Z'));
  assert.strictEqual(tlDay60.phase, 'past_expected_date');
  assert.notStrictEqual(tlDay60.phase, 'confirmed_removed');
  assert(
    tlDay60.pastDueGuidance?.includes(
      'The expected removal date has passed. The broker may still be processing your request.'
    ),
    'Past-expected-date timeline must display required follow-up guidance'
  );
  assert.strictEqual(tlDay60.isActionableFollowUp, true);

  // 6. Confirmed removal (only when genuinely verified)
  const confirmedResult: ScanResult = {
    ...newlySubmitted,
    removalStatus: 'removed',
    verifiedRemovedAtIso: '2026-10-12T10:00:00.000Z',
  };
  const tlConfirmed = calculateOptOutTimeline(
    confirmedResult,
    new Date('2026-10-20T12:00:00.000Z')
  );
  assert.strictEqual(tlConfirmed.phase, 'confirmed_removed');
  assert.strictEqual(tlConfirmed.progressPercent, 100);

  // 7. Failed, Rejected, and Cancelled states must not show false progress toward removal
  const tlFailed = calculateOptOutTimeline({ ...newlySubmitted, removalStatus: 'failed' });
  assert.strictEqual(tlFailed.phase, 'failed');
  assert.strictEqual(tlFailed.progressPercent, 0);

  const tlCancelled = calculateOptOutTimeline({
    ...newlySubmitted,
    workflowState: 'cancelled',
  });
  assert.strictEqual(tlCancelled.phase, 'cancelled');
  assert.strictEqual(tlCancelled.progressPercent, 0);

  // 8. Missing or invalid submission timestamps
  const missingTimestampResult: ScanResult = {
    id: 'tl-invalid-ts',
    brokerId: 'spokeo',
    status: 'exposed',
    removalStatus: 'submitted',
    submittedAtIso: 'invalid-timestamp-value',
    mockListingData: baseMockListing,
  };
  const tlMissing = calculateOptOutTimeline(missingTimestampResult);
  assert.strictEqual(tlMissing.phase, 'timestamp_unavailable');
  assert.strictEqual(tlMissing.expectedRemovalIso, null);

  // 9. Month & year boundaries + Leap-year calendar day accuracy (2024 leap year vs 2025 non-leap year)
  assert.strictEqual(
    addCalendarDaysUtc(new Date('2026-12-01T12:00:00.000Z'), 45).toISOString(),
    '2027-01-15T12:00:00.000Z',
    'Year boundary calculation must add exactly 45 calendar days'
  );
  assert.strictEqual(
    addCalendarDaysUtc(new Date('2024-02-01T00:00:00.000Z'), 45).toISOString(),
    '2024-03-17T00:00:00.000Z',
    'Leap year 2024 (29-day Feb) + 45 calendar days must land on March 17'
  );
  assert.strictEqual(
    addCalendarDaysUtc(new Date('2025-02-01T00:00:00.000Z'), 45).toISOString(),
    '2025-03-18T00:00:00.000Z',
    'Non-leap year 2025 (28-day Feb) + 45 calendar days must land on March 18'
  );

  // 10. Broker-Specific Privacy Tactics Engine & Modal Isolation
  const whitepages = findBrokerById('whitepages')!;
  const spokeo = findBrokerById('spokeo')!;
  assert.strictEqual(isBrokerDocumentationVerified(whitepages), true);
  assert.strictEqual(isBrokerDocumentationVerified(spokeo), true);

  const wpDossier = buildBrokerPrivacyTactics(whitepages, newlySubmitted);
  const spokeoDossier = buildBrokerPrivacyTactics(spokeo, null);

  assert.strictEqual(wpDossier.brokerName, 'Whitepages');
  assert.strictEqual(spokeoDossier.brokerName, 'Spokeo');
  assert.strictEqual(
    wpDossier.recommendations.some((r) => r.title.includes('Spokeo')),
    false,
    'Whitepages Privacy Tactics must never display advice belonging to Spokeo'
  );
  assert.deepStrictEqual(
    [...spokeoDossier.recommendations.map((r) => r.categoryCode)].sort(),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    'Pre-submission Privacy Tactics must provide all structured categories A through G'
  );
  assert.strictEqual(
    spokeoDossier.recommendations[0].categoryCode,
    'A',
    'Minimize Information Provided must lead the tactics list'
  );
  assert.deepStrictEqual(
    [...wpDossier.recommendations.map((r) => r.categoryCode)].sort(),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    'Post-submission Privacy Tactics must cover all categories A through G while prioritizing verification/documentation/follow-up'
  );
  assert(
    wpDossier.recommendations.some(
      (r) => r.sourceLabel === "Source: Broker's official opt-out instructions"
    ),
    'Verified broker tactics must cite official opt-out instructions'
  );

  // Category B (Date of Birth) must never encourage falsifying identity
  const dobTactic = wpDossier.recommendations.find((r) => r.categoryCode === 'B')!;
  assert(
    dobTactic.limitationOrCondition.toLowerCase().includes('never falsify') ||
      dobTactic.limitationOrCondition.toLowerCase().includes('mandatory'),
    'Date of Birth tactic must strictly warn against falsifying identity during mandatory verification'
  );

  // Unverified custom broker must clearly label general guidance
  const customUnverifiedBroker = {
    ...spokeo,
    id: 'custom-unverified-example',
    name: 'Unverified Directory Co',
    domain: 'unverified-directory.example',
    optOutUrl: 'https://unverified-directory.example/privacy',
    instructions: [],
    provenanceSource: undefined,
  };
  const customDossier = buildBrokerPrivacyTactics(customUnverifiedBroker, null);
  assert.strictEqual(customDossier.hasVerifiedBrokerDocumentation, false);
  assert(
    customDossier.recommendations.every(
      (r) =>
        r.sourceLabel ===
        "General privacy recommendation. Verify this broker's requirements before proceeding."
    ),
    'Unverified brokers must label recommendations as general privacy guidance'
  );

  const checklistText = formatPrivacyChecklistForClipboard(wpDossier);
  assert(
    checklistText.includes('Whitepages') &&
      checklistText.includes('[ ] A. Minimize Information Provided')
  );

  // 11. Zero inline style={} check across all newly added/updated components
  const checkedComponentFiles = [
    'PrivacyPolicyPage.tsx',
    'TermsOfServicePage.tsx',
    'ContactPage.tsx',
    'OnboardingTutorialModal.tsx',
    'OptOutMiniTimeline.tsx',
    'PrivacyTacticsModal.tsx',
    'ExposureReport.tsx',
    'Footer.tsx',
  ];
  for (const fileName of checkedComponentFiles) {
    const src = fs.readFileSync(path.join(repoRoot, 'src', 'components', fileName), 'utf8');
    assert.strictEqual(
      src.includes('style={'),
      false,
      `${fileName} must use Tailwind/CSS classes with zero inline style attributes`
    );
  }
});




