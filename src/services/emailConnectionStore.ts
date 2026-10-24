import { useSyncExternalStore } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { EmailProviderId } from '../utils/emailProviderConfig';
import {
  ConnectedGoogleUser,
  getAccessToken,
  googleSignIn,
  initAuth,
  isGoogleOAuthConfigured,
  signOutGoogleUser,
} from './googleAuth';
import { sendGmailMessage } from './gmailApi';

export type ConnectionMode = 'smtp' | 'oauth' | 'webmail';

export interface SmtpSessionConnection {
  verified: boolean;
  provider: EmailProviderId;
  userEmail: string;
  appPassword: string;
  customHost: string;
  customPort: number;
  customSecure: boolean;
  resolvedHost: string;
  resolvedPort: number;
  rememberInBrowser: boolean;
  connectedAt: string;
}

export interface EmailConnectionState {
  mode: ConnectionMode;
  smtp: SmtpSessionConnection | null;
  oauthUser: ConnectedGoogleUser | null;
  oauthAccessToken: string | null;
  oauthConfigured: boolean;
}

const SESSION_STORAGE_KEY = 'synout_connected_email_session_v1';
const LOCAL_STORAGE_KEY = 'synout_connected_email_persistent_v1';

function encodeStoredPayload(conn: SmtpSessionConnection): string {
  const json = JSON.stringify(conn);
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
  return json;
}

function decodeStoredPayload(raw: string): SmtpSessionConnection | null {
  try {
    let json = raw;
    if (!raw.trim().startsWith('{') && typeof window !== 'undefined' && typeof window.atob === 'function') {
      const binary = window.atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      json = new TextDecoder().decode(bytes);
    }
    const parsed = JSON.parse(json) as SmtpSessionConnection;
    if (parsed && parsed.verified && parsed.userEmail && parsed.appPassword) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function loadInitialSmtpConnection(): SmtpSessionConnection | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (fromSession) {
      const decoded = decodeStoredPayload(fromSession);
      if (decoded) return decoded;
    }
    const fromLocal = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (fromLocal) {
      const decoded = decodeStoredPayload(fromLocal);
      if (decoded) {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, fromLocal);
        return decoded;
      }
    }
  } catch {
    // Ignore storage restriction errors in strict private contexts
  }
  return null;
}

function persistSmtpConnection(conn: SmtpSessionConnection | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!conn) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    const encoded = encodeStoredPayload(conn);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, encoded);
    if (conn.rememberInBrowser) {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, encoded);
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch {
    // Ignore quota/storage errors
  }
}

let state: EmailConnectionState = {
  mode: 'smtp',
  smtp: loadInitialSmtpConnection(),
  oauthUser: null,
  oauthAccessToken: null,
  oauthConfigured: false,
};

let authInitialized = false;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function ensureAuthBootstrapped() {
  if (authInitialized || typeof window === 'undefined') return;
  authInitialized = true;

  isGoogleOAuthConfigured().then((configured) => {
    if (state.oauthConfigured !== configured) {
      state = { ...state, oauthConfigured: configured };
      emitChange();
    }
  });

  initAuth(
    (user, token) => {
      state = {
        ...state,
        oauthUser: user,
        oauthAccessToken: token,
        mode: state.smtp?.verified ? state.mode : 'oauth',
      };
      emitChange();
    },
    () => {
      // Preserve existing SMTP connection if active
    }
  );
}

export function getEmailConnectionState(): EmailConnectionState {
  ensureAuthBootstrapped();
  return state;
}

export function subscribeEmailConnection(listener: () => void): () => void {
  ensureAuthBootstrapped();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEmailConnection() {
  const snapshot = useSyncExternalStore(
    subscribeEmailConnection,
    getEmailConnectionState,
    getEmailConnectionState
  );

  const isDirectSendConnected =
    Boolean(snapshot.smtp?.verified) ||
    Boolean(snapshot.oauthUser && snapshot.oauthAccessToken);

  const activeConnectedEmail = snapshot.smtp?.verified
    ? snapshot.smtp.userEmail
    : snapshot.oauthUser && snapshot.oauthAccessToken
    ? snapshot.oauthUser.email
    : null;

  return {
    ...snapshot,
    isDirectSendConnected,
    activeConnectedEmail,
  };
}

export function setEmailConnectionMode(mode: ConnectionMode): void {
  state = { ...state, mode };
  emitChange();
}

export interface ConnectSmtpParams {
  provider: EmailProviderId;
  userEmail: string;
  appPassword: string;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
  rememberInBrowser?: boolean;
}

export async function verifyAndConnectSmtpAccount(
  params: ConnectSmtpParams
): Promise<SmtpSessionConnection> {
  const cleanEmail = params.userEmail.trim();
  const remember = params.rememberInBrowser !== false;

  const res = await fetch('/api/email/verify-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: params.provider,
      userEmail: cleanEmail,
      appPassword: params.appPassword,
      customHost: params.provider === 'custom' ? (params.customHost || '').trim() : undefined,
      customPort: params.provider === 'custom' ? params.customPort : undefined,
      customSecure: params.provider === 'custom' ? params.customSecure : undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.verified) {
    throw new Error(data.error || 'Could not verify email account connection.');
  }

  const connection: SmtpSessionConnection = {
    verified: true,
    provider: params.provider,
    userEmail: cleanEmail,
    appPassword: params.appPassword,
    customHost: (params.customHost || '').trim(),
    customPort: params.customPort || 587,
    customSecure: Boolean(params.customSecure),
    resolvedHost: String(data.host || ''),
    resolvedPort: Number(data.port || 465),
    rememberInBrowser: remember,
    connectedAt: new Date().toISOString(),
  };

  persistSmtpConnection(connection);
  state = {
    ...state,
    mode: 'smtp',
    smtp: connection,
  };
  emitChange();

  return connection;
}

export async function disconnectSmtpAccount(): Promise<void> {
  persistSmtpConnection(null);
  state = {
    ...state,
    smtp: null,
  };
  emitChange();

  if (typeof window !== 'undefined') {
    await fetch('/api/email/disconnect', { method: 'POST' }).catch(() => null);
  }
}

export async function connectGoogleOAuthAccount(): Promise<{
  user: ConnectedGoogleUser;
  accessToken: string;
}> {
  const res = await googleSignIn();
  state = {
    ...state,
    mode: 'oauth',
    oauthUser: res.user,
    oauthAccessToken: res.accessToken,
  };
  emitChange();
  return res;
}

export async function disconnectGoogleOAuthAccount(): Promise<void> {
  await signOutGoogleUser();
  state = {
    ...state,
    oauthUser: null,
    oauthAccessToken: null,
    mode: state.smtp?.verified ? 'smtp' : state.mode,
  };
  emitChange();
}

export function findBrokerById(brokerId: string): DataBroker | undefined {
  const exhaustive = getExhaustiveBrokerRegistry();
  return (
    exhaustive.find((b) => b.id === brokerId) ||
    DATA_BROKERS.find((b) => b.id === brokerId)
  );
}

/**
 * Checks whether a ScanResult has already had a real outbound email transmitted
 * (real Nodemailer Message-IDs look like `<...>` and Gmail API IDs are hex strings,
 * whereas legacy local simulation codes started with `BAT-` or `SYN-`).
 */
export function hasVerifiedEmailReceipt(result: ScanResult): boolean {
  if (result.removalStatus !== 'submitted' && result.removalStatus !== 'removed') {
    return false;
  }
  const code = result.optOutConfirmationCode || '';
  if (!code) return false;
  if (
    code.startsWith('BAT-') ||
    code.startsWith('SYN-') ||
    code.startsWith('DIY-FORM-')
  ) {
    return false;
  }
  return true;
}

export function buildStatutoryNoticeForBroker(
  broker: DataBroker,
  profile: UserProfile,
  senderEmailOverride?: string
): { subject: string; body: string } {
  const subject = `LEGAL NOTICE: Statutory CCPA/CPRA/GDPR Data Expungement & Opt-Out Demand - ${profile.firstName} ${profile.lastName}`;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const primaryEmail =
    senderEmailOverride ||
    state.smtp?.userEmail ||
    state.oauthUser?.email ||
    profile.emails[0] ||
    'consumer@example.com';
  const primaryPhone = profile.phoneNumbers[0] || 'On file';
  const previousLocs =
    profile.previousLocations.length > 0 ? profile.previousLocations.join('; ') : 'None listed';

  const poaSection = profile.powerOfAttorney?.isSigned
    ? `\nAUTHORIZED AGENT & POWER OF ATTORNEY DESIGNATION:
- Authorization Code: ${profile.powerOfAttorney.authCode}
- Executed By: ${profile.powerOfAttorney.fullName} on ${profile.powerOfAttorney.signedDate}
- Statutory Authority: CCPA § 1798.130 & Cal. Code Regs. tit. 11 § 7063\n`
    : '';

  const body = `DATE: ${dateStr}
TO: Privacy Officer & Legal Compliance, ${broker.name} (${broker.privacyEmail || 'privacy@broker'})
FROM: ${profile.firstName} ${profile.lastName} <${primaryEmail}>
RE: MANDATORY PERSONAL IDENTIFIABLE INFORMATION (PII) EXPUNGEMENT DEMAND
LEGAL CITATION: California Consumer Privacy Act (Cal. Civ. Code § 1798.100 et seq.), CPRA, and Applicable US State Privacy Statutes

To Whom It May Concern,

I am writing to exercise my statutory privacy rights to DELETE all personal information, consumer profiles, tracking dossiers, and public records associated with my identity from ${broker.name} and all affiliated data networks, affiliates, and sub-processors.

IDENTIFYING INFORMATION FOR SEARCH & EXPUNGEMENT:
- Full Legal Name: ${profile.firstName} ${profile.lastName}
- Primary Email Address: ${primaryEmail}
- Primary Phone Number: ${primaryPhone}
- Current Residence: ${profile.currentCity}, ${profile.currentState}
- Previous Residences: ${previousLocs}
- Associated Record URL: ${getBrokerRecordSearchUrl(broker, profile)}
${poaSection}
STATUTORY DIRECTIVE:
1. Permanently delete and purge all records, dossiers, contact lists, and marketing segments containing my personal information.
2. Direct all data brokers, downstream buyers, and syndicates with whom you shared my data to delete it pursuant to statutory mandates.
3. Place my identifying attributes onto your permanent suppress / do-not-re-acquire list so my profile is never regenerated.
4. Provide written confirmation of compliance to ${primaryEmail} within the statutorily allotted timeframe (45 days maximum).

Failure to comply constitutes a willful violation of statutory data protection legislation and may be referred to the State Attorney General or California Privacy Protection Agency (CPPA) for civil enforcement.

Sincerely,
${profile.firstName} ${profile.lastName}
Authorized Consumer & Data Subject
Ref: synOUT-${broker.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  return { subject, body };
}

export interface SendEmailOnBehalfInput {
  recipientEmail: string;
  subject: string;
  body: string;
  senderName: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  bccSelf?: boolean;
}

export async function sendEmailViaConnectedAccount(
  input: SendEmailOnBehalfInput
): Promise<{ messageId: string; sentFrom: string }> {
  const preferSmtp =
    (state.mode === 'smtp' && state.smtp?.verified) ||
    (!state.oauthAccessToken && state.smtp?.verified);

  if (preferSmtp && state.smtp?.verified) {
    const smtp = state.smtp;
    const res = await fetch('/api/email/dispatch-on-behalf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: smtp.provider,
        userEmail: smtp.userEmail,
        senderName: input.senderName,
        appPassword: smtp.appPassword,
        customHost: smtp.provider === 'custom' ? smtp.customHost : undefined,
        customPort: smtp.provider === 'custom' ? smtp.customPort : undefined,
        customSecure: smtp.provider === 'custom' ? smtp.customSecure : undefined,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        body: input.body,
        brokerId: input.brokerId,
        brokerName: input.brokerName,
        brokerDomain: input.brokerDomain,
        bccSelf: Boolean(input.bccSelf),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed sending email to ${input.brokerName}.`);
    }

    return {
      messageId: String(data.messageId),
      sentFrom: smtp.userEmail,
    };
  }

  const token = state.oauthAccessToken || (await getAccessToken());
  if (token && state.oauthUser) {
    const response = await sendGmailMessage(
      token,
      input.recipientEmail,
      input.subject,
      input.body,
      input.bccSelf ? state.oauthUser.email : undefined
    );
    return {
      messageId: response.id,
      sentFrom: state.oauthUser.email,
    };
  }

  throw new Error('Connect your email account first so synOUT can send opt-out demands on your behalf.');
}
