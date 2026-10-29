import { UserProfile } from '../types';
import { LiveRelistingProbeDiff, RelistingCadenceDays } from './relistingMonitorEngine';
import {
  getEmailConnectionState,
  resolveActiveConnectedEmailFromState,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import { buildWebmailComposeUrls, detectWebmailLauncherFromEmail } from './emailProviderConfig';
import { sessionFetch } from '../services/sessionClient';

export interface RelistingDigestLogEntry {
  id: string;
  sentAtIso: string;
  recipientEmail: string;
  resurfacedCount: number;
  brokerNames: string[];
  autoReRemovalTriggered: boolean;
  deliveryChannel: 'direct_email' | 'server_digest_relay' | 'webmail_ready';
  messageId: string;
  webmailComposeUrl?: string;
}

export interface RelistingAlertSettings {
  autoEmailAlertOnResurface: boolean;
  autoTriggerReRemovalOnResurface: boolean;
  recipientEmailOverride: string;
  alertHistory: RelistingDigestLogEntry[];
}

const ALERT_SETTINGS_KEY = 'synout_relisting_alerts_v1';

const DEFAULT_ALERT_SETTINGS: RelistingAlertSettings = {
  autoEmailAlertOnResurface: true,
  autoTriggerReRemovalOnResurface: true,
  recipientEmailOverride: '',
  alertHistory: [],
};

export function loadRelistingAlertSettings(): RelistingAlertSettings {
  if (typeof window === 'undefined') return DEFAULT_ALERT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(ALERT_SETTINGS_KEY);
    if (!raw) return DEFAULT_ALERT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RelistingAlertSettings>;
    return {
      autoEmailAlertOnResurface: parsed.autoEmailAlertOnResurface !== false,
      autoTriggerReRemovalOnResurface: parsed.autoTriggerReRemovalOnResurface !== false,
      recipientEmailOverride:
        typeof parsed.recipientEmailOverride === 'string' ? parsed.recipientEmailOverride : '',
      alertHistory: Array.isArray(parsed.alertHistory) ? parsed.alertHistory.slice(0, 25) : [],
    };
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

export function saveRelistingAlertSettings(settings: RelistingAlertSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ALERT_SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        alertHistory: settings.alertHistory.slice(0, 25),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function resolveDigestRecipientEmail(
  settings: RelistingAlertSettings,
  profile: UserProfile | null
): string {
  const override = settings.recipientEmailOverride.trim();
  if (override && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(override)) {
    return override;
  }
  const connEmail = resolveActiveConnectedEmailFromState(getEmailConnectionState());
  if (connEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(connEmail)) {
    return connEmail;
  }
  const profileEmail = profile?.emails?.find((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''));
  return profileEmail || '';
}

export function buildRelistingDigestEmail(params: {
  profile: UserProfile | null;
  resurfacedDiffs: LiveRelistingProbeDiff[];
  cadenceDays: RelistingCadenceDays;
  autoReRemovalTriggered: boolean;
  isTestDigest?: boolean;
}): { subject: string; body: string } {
  const {
    profile,
    resurfacedDiffs,
    cadenceDays,
    autoReRemovalTriggered,
    isTestDigest = false,
  } = params;

  const subjectName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : 'Protected Consumer';
  const count = resurfacedDiffs.length;

  const subject = isTestDigest
    ? `[synOUT Test Digest] ${cadenceDays}-Day Re-Listing Alert Verification (${subjectName})`
    : `[synOUT Security Alert] ${count} Data Broker(s) Republished Your Removed Profile — Auto-Re-Removal ${
        autoReRemovalTriggered ? 'Dispatched' : 'Ready'
      }`;

  const brokerLines =
    resurfacedDiffs.length > 0
      ? resurfacedDiffs
          .map(
            (d, idx) =>
              `${idx + 1}. ${d.brokerName} (${d.brokerDomain})\n` +
              `   - Live Inspection URL: ${d.probeUrl}\n` +
              `   - Snapshot SHA-256: ${d.snapshotSha256}\n` +
              `   - Prior Baseline SHA-256: ${d.previousSha256 || 'Initial Removal Baseline'}\n` +
              `   - Detected At: ${d.checkedAtIso}`
          )
          .join('\n\n')
      : `1. Sample Verification Check (No active broker regressions detected during test run)\n` +
        `   - Cadence: Every ${cadenceDays} days\n` +
        `   - Auto-Re-Removal Engine: ${autoReRemovalTriggered ? 'ENABLED' : 'MANUAL'}`;

  const body = `synOUT AUTOMATED ${cadenceDays}-DAY RE-LISTING SURVEILLANCE DIGEST
========================================================================
Protected Subject: ${subjectName}
Surveillance Cadence: ${cadenceDays}-Day Rolling SHA-256 Snapshot Audit
Generated Timestamp: ${new Date().toISOString()}
Alert Type: ${isTestDigest ? 'CONNECTIVITY & ALERT DELIVERY VERIFICATION' : 'LIVE BROKER RE-PUBLICATION ALERT'}

1. SUMMARY OF DETECTED RE-LISTINGS
------------------------------------------------------------------------
${
  isTestDigest
    ? 'This is a verification digest confirming that synOUT will alert this inbox whenever a previously purged data broker acquires fresh credit-header, utility, or voter feeds and republishes your personal profile.'
    : `synOUT detected ${count} previously removed or suppressed data broker(s) re-displaying profile tokens matching ${subjectName}:`
}

${brokerLines}

2. AUTOMATED RE-REMOVAL ACTION TAKEN
------------------------------------------------------------------------
${
  autoReRemovalTriggered
    ? '- synOUT automatically triggered repeat statutory suppression (CCPA § 1798.105 / Delete Act / TDPSA) and queued headless web-form + checkbox re-submission for every resurfaced broker.'
    : '- Resurfaced brokers have been flagged in your 45-Day SLA Tracker & Re-Listing Monitor for immediate 1-click re-suppression.'
}

3. RECOMMENDED ESCALATION IF RE-LISTING PERSISTS
------------------------------------------------------------------------
Under the California Delete Act (Cal. Civ. Code § 1798.99.82) and state data broker laws, brokers must honor ongoing opt-out/suppression directives rather than re-ingesting consumer records every 30-90 days. Open synOUT -> State Registries & Complaints to download a signed PDF Regulator Complaint Packet with these SHA-256 snapshot hashes attached.

--
synOUT Autonomous Privacy & Data Broker Suppression Engine`;

  return { subject, body };
}

export async function dispatchRelistingDigestAlert(params: {
  recipientEmail: string;
  profile: UserProfile | null;
  resurfacedDiffs: LiveRelistingProbeDiff[];
  cadenceDays: RelistingCadenceDays;
  autoReRemovalTriggered: boolean;
  isTestDigest?: boolean;
}): Promise<RelistingDigestLogEntry> {
  const {
    recipientEmail,
    profile,
    resurfacedDiffs,
    cadenceDays,
    autoReRemovalTriggered,
    isTestDigest = false,
  } = params;

  const cleanRecipient = recipientEmail.trim().toLowerCase();
  if (!cleanRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecipient)) {
    throw new Error('Enter a valid alert recipient email address first.');
  }

  const { subject, body } = buildRelistingDigestEmail({
    profile,
    resurfacedDiffs,
    cadenceDays,
    autoReRemovalTriggered,
    isTestDigest,
  });

  const connState = getEmailConnectionState();
  const isDirectConnected =
    (connState.mode === 'smtp' && Boolean(connState.smtp?.verified && connState.smtp?.credentialId)) ||
    (connState.mode === 'oauth' && Boolean(connState.oauthAccessToken && !connState.oauthTokenExpired));

  const senderName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim() || 'synOUT Monitor'
    : 'synOUT Monitor';
  const brokerNames =
    resurfacedDiffs.length > 0
      ? resurfacedDiffs.map((d) => d.brokerName)
      : ['Test Surveillance Verification'];

  if (isDirectConnected) {
    const sent = await sendEmailViaConnectedAccount({
      recipientEmail: cleanRecipient,
      subject,
      body,
      senderName,
      brokerId: 'relisting-digest-alert',
      brokerName: 'synOUT Re-Listing Monitor',
      brokerDomain: 'synout.local',
      bccSelf: false,
    });
    return {
      id: `digest-${Date.now()}`,
      sentAtIso: new Date().toISOString(),
      recipientEmail: cleanRecipient,
      resurfacedCount: resurfacedDiffs.length,
      brokerNames,
      autoReRemovalTriggered,
      deliveryChannel: 'direct_email',
      messageId: sent.messageId,
    };
  }

  // Record & attempt server-side session digest relay; provide 1-Click Webmail self-alert URL when no direct background email token is active
  let messageId = `<digest-${Date.now()}@alert.synout.privacy>`;
  try {
    const res = await sessionFetch('/api/monitoring/send-relisting-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientEmail: cleanRecipient,
        subject,
        body,
        brokerNames,
        resurfacedCount: resurfacedDiffs.length,
      }),
    });
    const data = await res.json().catch(() => null);
    if (data?.messageId) {
      messageId = String(data.messageId);
    }
    if (data?.deliveredViaSmtp) {
      return {
        id: `digest-${Date.now()}`,
        sentAtIso: new Date().toISOString(),
        recipientEmail: cleanRecipient,
        resurfacedCount: resurfacedDiffs.length,
        brokerNames,
        autoReRemovalTriggered,
        deliveryChannel: 'server_digest_relay',
        messageId,
      };
    }
  } catch {
    // Graceful local fallback when running on static hosting
  }

  const urls = buildWebmailComposeUrls(cleanRecipient, subject, body);
  const launcher = detectWebmailLauncherFromEmail(cleanRecipient);
  const composeUrl =
    launcher === 'gmail'
      ? urls.gmailUrl
      : launcher === 'outlook'
      ? urls.outlookUrl
      : launcher === 'yahoo'
      ? urls.yahooUrl
      : urls.mailtoUrl;

  return {
    id: `digest-${Date.now()}`,
    sentAtIso: new Date().toISOString(),
    recipientEmail: cleanRecipient,
    resurfacedCount: resurfacedDiffs.length,
    brokerNames,
    autoReRemovalTriggered,
    deliveryChannel: 'webmail_ready',
    messageId,
    webmailComposeUrl: composeUrl,
  };
}
