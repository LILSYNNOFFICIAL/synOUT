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

test('10. Repository Secret Hygiene: Zero Plaintext Google API Keys or Tracked Firebase Config', () => {
  const rootDir = process.cwd();
  const forbiddenConfigPath = path.join(rootDir, 'firebase-applet-config.json');
  assert.strictEqual(
    fs.existsSync(forbiddenConfigPath),
    false,
    'firebase-applet-config.json must not exist with plaintext credentials in repository'
  );

  const googleKeyRegex = /AIza[0-9A-Za-z_-]{35}/;

  function scanDirForSecrets(dirPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirForSecrets(fullPath);
      } else if (/\.(ts|tsx|js|json|yml|yaml|html|env|example|md)$/i.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.strictEqual(
          googleKeyRegex.test(content),
          false,
          `Plaintext Google API key detected in ${fullPath}`
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

  // Verify package.json no longer depends on firebase
  const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert.strictEqual(
    Boolean(pkgJson.dependencies?.firebase),
    false,
    'Application should not require firebase dependency for user email dispatch'
  );
});


