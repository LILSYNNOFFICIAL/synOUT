import { useSyncExternalStore } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import {
  EmailProviderId,
  WebmailLauncherId,
  detectWebmailLauncherFromEmail,
  normalizeAppPassword,
} from '../utils/emailProviderConfig';
import {
  ConnectedGoogleUser,
  OAuthClientSource,
  clearAllGoogleAuthStorage,
  clearCustomGoogleClientId,
  connectWithGmailAccessToken,
  getAccessToken,
  getSavedGoogleClientId,
  googleSignIn,
  initAuth,
  resolveGoogleClientInfo,
  saveCustomGoogleClientId,
  signOutGoogleUser,
} from './googleAuth';
import { sendGmailMessage } from './gmailApi';
import {
  isValidEmailSyntax,
  resolveBrokerContactProfile,
  verifyRecipientDeliverabilityClient,
} from '../utils/brokerContactResolver';
import { sessionFetch } from './sessionClient';

export type ConnectionMode = 'smtp' | 'oauth' | 'webmail';

export interface SmtpSessionConnection {
  verified: boolean;
  provider: EmailProviderId;
  userEmail: string;
  /**
   * Server-side AES-256-GCM encrypted session vault token.
   * Raw or Base64 passwords are NEVER persisted in localStorage or sessionStorage.
   */
  credentialId?: string;
  customHost: string;
  customPort: number;
  customSecure: boolean;
  resolvedHost: string;
  resolvedPort: number;
  resolvedSecure?: boolean;
  rememberInBrowser: boolean;
  connectedAt: string;
  expiresAtIso?: string;
}

export interface WebmailSenderConnection {
  userEmail: string;
  senderName?: string;
  preferredLauncher: WebmailLauncherId;
  rememberInBrowser: boolean;
  connectedAt: string;
}

export interface EmailConnectionState {
  mode: ConnectionMode;
  smtp: SmtpSessionConnection | null;
  oauthUser: ConnectedGoogleUser | null;
  oauthAccessToken: string | null;
  oauthTokenExpired: boolean;
  oauthConfigured: boolean;
  oauthClientSource: OAuthClientSource;
  customOAuthClientId: string | null;
  webmailSender: WebmailSenderConnection | null;
  backendAvailable: boolean | null;
}

const SESSION_STORAGE_KEY = 'synout_connected_email_session_v1';
const LOCAL_STORAGE_KEY = 'synout_connected_email_persistent_v1';
const WEBMAIL_SESSION_KEY = 'synout_webmail_sender_session_v1';
const WEBMAIL_PERSISTENT_KEY = 'synout_webmail_sender_persistent_v1';

function encodeBase64Json<T>(obj: T): string {
  const json = JSON.stringify(obj);
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

function decodeBase64Json<T>(raw: string): T | null {
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
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function loadInitialSmtpConnection(): SmtpSessionConnection | null {
  if (typeof window === 'undefined') return null;
  try {
    // Always purge any legacy persistent localStorage entry that may have held Base64 passwords
    const legacyLocal = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (legacyLocal) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }

    const fromSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (fromSession) {
      const parsed = decodeBase64Json<SmtpSessionConnection & { appPassword?: string }>(fromSession);
      if (parsed && 'appPassword' in parsed) {
        // Scrub legacy plaintext/Base64 password immediately
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      if (parsed && parsed.verified && parsed.userEmail && parsed.credentialId) {
        if (parsed.expiresAtIso && Date.parse(parsed.expiresAtIso) <= Date.now()) {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
          return null;
        }
        return parsed;
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
    // Never write SMTP credentials or tokens to localStorage
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    if (!conn) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    const safeMetadataOnly: SmtpSessionConnection = {
      verified: conn.verified,
      provider: conn.provider,
      userEmail: conn.userEmail,
      credentialId: conn.credentialId,
      customHost: conn.customHost,
      customPort: conn.customPort,
      customSecure: conn.customSecure,
      resolvedHost: conn.resolvedHost,
      resolvedPort: conn.resolvedPort,
      resolvedSecure: conn.resolvedSecure,
      rememberInBrowser: false,
      connectedAt: conn.connectedAt,
      expiresAtIso: conn.expiresAtIso,
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, encodeBase64Json(safeMetadataOnly));
  } catch {
    // Ignore quota/storage errors
  }
}

function loadInitialWebmailSender(): WebmailSenderConnection | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromSession = window.sessionStorage.getItem(WEBMAIL_SESSION_KEY);
    if (fromSession) {
      const parsed = decodeBase64Json<WebmailSenderConnection>(fromSession);
      if (parsed && parsed.userEmail && isValidEmailSyntax(parsed.userEmail)) {
        return parsed;
      }
    }
    const fromLocal = window.localStorage.getItem(WEBMAIL_PERSISTENT_KEY);
    if (fromLocal) {
      const parsed = decodeBase64Json<WebmailSenderConnection>(fromLocal);
      if (parsed && parsed.userEmail && isValidEmailSyntax(parsed.userEmail)) {
        window.sessionStorage.setItem(WEBMAIL_SESSION_KEY, fromLocal);
        return parsed;
      }
    }
  } catch {
    // Ignore storage restriction errors
  }
  return null;
}

function persistWebmailSender(conn: WebmailSenderConnection | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!conn) {
      window.sessionStorage.removeItem(WEBMAIL_SESSION_KEY);
      window.localStorage.removeItem(WEBMAIL_PERSISTENT_KEY);
      return;
    }
    const encoded = encodeBase64Json(conn);
    window.sessionStorage.setItem(WEBMAIL_SESSION_KEY, encoded);
    if (conn.rememberInBrowser) {
      window.localStorage.setItem(WEBMAIL_PERSISTENT_KEY, encoded);
    } else {
      window.localStorage.removeItem(WEBMAIL_PERSISTENT_KEY);
    }
  } catch {
    // Ignore quota/storage errors
  }
}

const initialSmtp = loadInitialSmtpConnection();
const initialWebmail = loadInitialWebmailSender();

let state: EmailConnectionState = {
  mode: initialSmtp?.verified ? 'smtp' : 'webmail',
  smtp: initialSmtp,
  oauthUser: null,
  oauthAccessToken: null,
  oauthTokenExpired: false,
  oauthConfigured: Boolean(getSavedGoogleClientId()),
  oauthClientSource: getSavedGoogleClientId() ? 'custom' : 'none',
  customOAuthClientId: getSavedGoogleClientId(),
  webmailSender: initialWebmail,
  backendAvailable: null,
};

let authInitialized = false;
let backendProbePromise: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export async function probeEmailBackendAvailability(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  const host = (window.location.hostname || '').toLowerCase();
  const proto = (window.location.protocol || '').toLowerCase();
  const path = (window.location.pathname || '').toLowerCase();
  if (proto === 'file:' || host.endsWith('.github.io') || path.startsWith('/synout/')) {
    const nextMode: ConnectionMode =
      state.mode === 'smtp' && !state.smtp?.verified && (state.oauthConfigured || state.oauthUser)
        ? 'oauth'
        : state.mode === 'smtp' && !state.smtp?.verified
        ? 'webmail'
        : state.mode;
    if (state.backendAvailable !== false || state.mode !== nextMode) {
      state = { ...state, backendAvailable: false, mode: nextMode };
      emitChange();
    }
    return false;
  }
  if (!force && state.backendAvailable !== null) {
    return state.backendAvailable;
  }
  if (!force && backendProbePromise) {
    return backendProbePromise;
  }

  backendProbePromise = sessionFetch('/api/health', { method: 'GET' })
    .then(async (res) => {
      if (!res.ok) return false;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return false;
      const data = await res.json().catch(() => null);
      return Boolean(data && data.status === 'ok');
    })
    .catch(() => false)
    .then((available) => {
      backendProbePromise = null;
      const nextMode: ConnectionMode =
        !available &&
        state.mode === 'smtp' &&
        !state.smtp?.verified &&
        (state.oauthConfigured || state.oauthUser)
          ? 'oauth'
          : !available && state.mode === 'smtp' && !state.smtp?.verified
          ? 'webmail'
          : state.mode;

      if (state.backendAvailable !== available || state.mode !== nextMode) {
        state = {
          ...state,
          backendAvailable: available,
          mode: nextMode,
        };
        emitChange();
      }
      return available;
    });

  return backendProbePromise;
}

async function refreshOAuthConfigStatus() {
  const info = await resolveGoogleClientInfo();
  const configured = Boolean(info.clientId);
  if (
    state.oauthConfigured !== configured ||
    state.oauthClientSource !== info.source ||
    state.customOAuthClientId !== getSavedGoogleClientId()
  ) {
    state = {
      ...state,
      oauthConfigured: configured,
      oauthClientSource: info.source,
      customOAuthClientId: getSavedGoogleClientId(),
    };
    emitChange();
  }
}

function ensureAuthBootstrapped() {
  if (authInitialized || typeof window === 'undefined') return;
  authInitialized = true;

  void refreshOAuthConfigStatus();
  void probeEmailBackendAvailability();

  initAuth(
    (user, token, expired) => {
      state = {
        ...state,
        oauthUser: user,
        oauthAccessToken: token,
        oauthTokenExpired: expired,
        mode: state.smtp?.verified ? state.mode : 'oauth',
      };
      emitChange();
    },
    () => {
      // Preserve existing SMTP or Webmail connection if active
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

export function resolveActiveConnectedEmailFromState(
  snapshot: EmailConnectionState
): string | null {
  if (snapshot.mode === 'oauth' && snapshot.oauthUser?.email) {
    return snapshot.oauthUser.email;
  }
  if (snapshot.mode === 'smtp' && snapshot.smtp?.verified) {
    return snapshot.smtp.userEmail;
  }
  if (snapshot.mode === 'webmail' && snapshot.webmailSender?.userEmail) {
    return snapshot.webmailSender.userEmail;
  }
  if (snapshot.smtp?.verified) {
    return snapshot.smtp.userEmail;
  }
  if (snapshot.oauthUser?.email && snapshot.oauthAccessToken && !snapshot.oauthTokenExpired) {
    return snapshot.oauthUser.email;
  }
  if (snapshot.webmailSender?.userEmail) {
    return snapshot.webmailSender.userEmail;
  }
  if (snapshot.oauthUser?.email) {
    return snapshot.oauthUser.email;
  }
  return null;
}

export function useEmailConnection() {
  const snapshot = useSyncExternalStore(
    subscribeEmailConnection,
    getEmailConnectionState,
    getEmailConnectionState
  );

  const isDirectSendConnected =
    Boolean(snapshot.smtp?.verified) ||
    Boolean(snapshot.oauthUser && snapshot.oauthAccessToken && !snapshot.oauthTokenExpired);

  const isWebmailConnected = Boolean(snapshot.webmailSender?.userEmail);
  const isAnyEmailConnected = isDirectSendConnected || isWebmailConnected;
  const activeConnectedEmail = resolveActiveConnectedEmailFromState(snapshot);

  return {
    ...snapshot,
    isDirectSendConnected,
    isWebmailConnected,
    isAnyEmailConnected,
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

export class SmtpVerificationError extends Error {
  public readonly errorCode?: string;
  public readonly suggestOAuth: boolean;
  public readonly suggestWebmail: boolean;
  public readonly staticHostUnavailable: boolean;

  constructor(
    message: string,
    opts?: {
      errorCode?: string;
      suggestOAuth?: boolean;
      suggestWebmail?: boolean;
      staticHostUnavailable?: boolean;
    }
  ) {
    super(message);
    this.name = 'SmtpVerificationError';
    this.errorCode = opts?.errorCode;
    this.suggestOAuth = Boolean(opts?.suggestOAuth);
    this.suggestWebmail = opts?.suggestWebmail !== false;
    this.staticHostUnavailable = Boolean(opts?.staticHostUnavailable);
  }
}

export async function verifyAndConnectSmtpAccount(
  params: ConnectSmtpParams
): Promise<SmtpSessionConnection> {
  const cleanEmail = params.userEmail.trim().toLowerCase();
  if (!isValidEmailSyntax(cleanEmail)) {
    throw new SmtpVerificationError('Enter a valid sender email address (e.g. yourname@email.com).');
  }
  const normalizedPass = normalizeAppPassword(params.provider, params.appPassword);
  if (!normalizedPass || normalizedPass.length < 4) {
    throw new SmtpVerificationError(
      'Enter a valid App Password or SMTP token (minimum 4 characters).'
    );
  }
  const remember = params.rememberInBrowser !== false;

  let res: Response;
  try {
    res = await sessionFetch('/api/email/verify-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: params.provider,
        userEmail: cleanEmail,
        appPassword: normalizedPass,
        customHost: params.provider === 'custom' ? (params.customHost || '').trim() : undefined,
        customPort: params.provider === 'custom' ? params.customPort : undefined,
        customSecure: params.provider === 'custom' ? params.customSecure : undefined,
      }),
    });
  } catch {
    state = { ...state, backendAvailable: false };
    emitChange();
    throw new SmtpVerificationError(
      'No backend SMTP relay server is reachable in this static environment. Sign in with Google OAuth (HTTPS) or Instant Webmail Sender Login instead.',
      {
        errorCode: 'STATIC_HOST_NO_SMTP_SERVER',
        suggestOAuth: params.provider === 'gmail',
        suggestWebmail: true,
        staticHostUnavailable: true,
      }
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (
    res.status === 404 ||
    res.status === 405 ||
    (!contentType.includes('application/json') && !res.ok)
  ) {
    state = { ...state, backendAvailable: false };
    emitChange();
    throw new SmtpVerificationError(
      'This deployment is hosted statically (e.g. GitHub Pages) without a server-side SMTP socket. Switch to "Google OAuth (HTTPS)" for direct Gmail API sending or "Instant Webmail Login" to connect your email immediately.',
      {
        errorCode: 'STATIC_HOST_NO_SMTP_SERVER',
        suggestOAuth: params.provider === 'gmail',
        suggestWebmail: true,
        staticHostUnavailable: true,
      }
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.verified) {
    throw new SmtpVerificationError(
      data.error || 'Could not verify email account connection.',
      {
        errorCode: data.errorCode,
        suggestOAuth: Boolean(data.suggestOAuth ?? params.provider === 'gmail'),
        suggestWebmail: data.suggestWebmail !== false,
      }
    );
  }

  const connection: SmtpSessionConnection = {
    verified: true,
    provider: params.provider,
    userEmail: cleanEmail,
    credentialId: typeof data.credentialId === 'string' ? data.credentialId : undefined,
    customHost: (params.customHost || '').trim(),
    customPort: params.customPort || 587,
    customSecure: Boolean(params.customSecure),
    resolvedHost: String(data.host || ''),
    resolvedPort: Number(data.port || 465),
    resolvedSecure: typeof data.secure === 'boolean' ? data.secure : Number(data.port) === 465,
    rememberInBrowser: false,
    connectedAt: new Date().toISOString(),
    expiresAtIso: typeof data.expiresAtIso === 'string' ? data.expiresAtIso : undefined,
  };

  persistSmtpConnection(connection);
  state = {
    ...state,
    backendAvailable: true,
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
    mode: state.oauthAccessToken ? 'oauth' : state.webmailSender ? 'webmail' : state.mode,
  };
  emitChange();

  if (typeof window !== 'undefined' && state.backendAvailable !== false) {
    await sessionFetch('/api/email/disconnect', { method: 'POST' }).catch(() => null);
  }
}

export async function saveGoogleOAuthClientConfig(rawClientId: string): Promise<string> {
  const saved = saveCustomGoogleClientId(rawClientId);
  await refreshOAuthConfigStatus();
  return saved;
}

export async function clearGoogleOAuthClientConfig(): Promise<void> {
  clearCustomGoogleClientId();
  await refreshOAuthConfigStatus();
}

export async function connectGoogleOAuthAccount(options?: {
  loginHint?: string;
  rememberInBrowser?: boolean;
  silentIfPossible?: boolean;
}): Promise<{
  user: ConnectedGoogleUser;
  accessToken: string;
}> {
  const res = await googleSignIn(options);
  state = {
    ...state,
    mode: 'oauth',
    oauthUser: res.user,
    oauthAccessToken: res.accessToken,
    oauthTokenExpired: false,
  };
  emitChange();
  return res;
}

export async function connectGoogleOAuthWithToken(
  rawAccessToken: string,
  rememberInBrowser = true
): Promise<{
  user: ConnectedGoogleUser;
  accessToken: string;
}> {
  const res = await connectWithGmailAccessToken(rawAccessToken, rememberInBrowser);
  state = {
    ...state,
    mode: 'oauth',
    oauthUser: res.user,
    oauthAccessToken: res.accessToken,
    oauthTokenExpired: false,
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
    oauthTokenExpired: false,
    mode: state.smtp?.verified ? 'smtp' : state.webmailSender ? 'webmail' : state.mode,
  };
  emitChange();
}

export interface ConnectWebmailSenderParams {
  userEmail: string;
  senderName?: string;
  preferredLauncher?: WebmailLauncherId;
  rememberInBrowser?: boolean;
}

export function connectWebmailSenderAccount(
  params: ConnectWebmailSenderParams
): WebmailSenderConnection {
  const cleanEmail = (params.userEmail || '').trim().toLowerCase();
  if (!isValidEmailSyntax(cleanEmail)) {
    throw new Error('Enter a valid sender email address (e.g. yourname@email.com).');
  }

  const preferredLauncher =
    params.preferredLauncher || detectWebmailLauncherFromEmail(cleanEmail);
  const remember = params.rememberInBrowser !== false;

  const conn: WebmailSenderConnection = {
    userEmail: cleanEmail,
    senderName: params.senderName?.trim() || undefined,
    preferredLauncher,
    rememberInBrowser: remember,
    connectedAt: new Date().toISOString(),
  };

  persistWebmailSender(conn);
  state = {
    ...state,
    mode: 'webmail',
    webmailSender: conn,
  };
  emitChange();

  return conn;
}

export function disconnectWebmailSenderAccount(): void {
  persistWebmailSender(null);
  state = {
    ...state,
    webmailSender: null,
    mode: state.smtp?.verified ? 'smtp' : state.oauthUser ? 'oauth' : 'webmail',
  };
  emitChange();
}

export async function purgeAllEmailConnections(): Promise<void> {
  persistSmtpConnection(null);
  persistWebmailSender(null);
  await signOutGoogleUser().catch(() => null);
  clearAllGoogleAuthStorage();
  state = {
    ...state,
    mode: 'webmail',
    smtp: null,
    oauthUser: null,
    oauthAccessToken: null,
    oauthTokenExpired: false,
    oauthConfigured: false,
    oauthClientSource: 'none',
    customOAuthClientId: null,
    webmailSender: null,
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
    code.startsWith('DIY-FORM-') ||
    code.startsWith('WEB-') ||
    code.startsWith('WEBFORM-') ||
    code.startsWith('SUBMIT-') ||
    code.startsWith('JOB-') ||
    code.startsWith('AUDIT-') ||
    code.startsWith('MAILTO-')
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
    resolveActiveConnectedEmailFromState(state) ||
    profile.emails.find((e) => Boolean(e && e.trim())) ||
    'yourname@email.com';
  const primaryPhone = profile.phoneNumbers[0] || 'On file';
  const previousLocs =
    profile.previousLocations.length > 0 ? profile.previousLocations.join('; ') : 'None listed';

  const poaSection = profile.powerOfAttorney?.isSigned
    ? `\nAUTHORIZED AGENT & POWER OF ATTORNEY DESIGNATION:
- Authorization Code: ${profile.powerOfAttorney.authCode}
- Executed By: ${profile.powerOfAttorney.fullName} on ${profile.powerOfAttorney.signedDate}
- Statutory Authority: CCPA § 1798.130 & Cal. Code Regs. tit. 11 § 7063\n`
    : '';

  const resolvedContact = resolveBrokerContactProfile(broker);
  const targetEmail =
    resolvedContact.effectivePrimaryEmail ||
    broker.privacyEmail ||
    `Web Opt-Out Portal (${broker.optOutUrl})`;

  const body = `DATE: ${dateStr}
TO: Privacy Officer & Legal Compliance, ${broker.name} (${targetEmail})
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
  fallbackRecipientEmails?: string[];
  ccEmails?: string[];
  subject: string;
  body: string;
  senderName: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  bccSelf?: boolean;
}

export interface SendEmailOnBehalfReceipt {
  messageId: string;
  sentFrom: string;
  deliveredTo: string;
  usedFallback: boolean;
  mxVerified?: boolean;
  ccDelivered?: string[];
}

export async function sendEmailViaConnectedAccount(
  input: SendEmailOnBehalfInput
): Promise<SendEmailOnBehalfReceipt> {
  // Automatically enrich fallback DPO addresses from broker registry if not explicitly provided
  let fallbackList = input.fallbackRecipientEmails ? [...input.fallbackRecipientEmails] : [];
  if (fallbackList.length === 0 && input.brokerId && input.brokerId !== 'synout-self-test') {
    const matchedBroker = findBrokerById(input.brokerId);
    if (matchedBroker) {
      const contactProfile = resolveBrokerContactProfile(matchedBroker);
      fallbackList = contactProfile.allValidCandidates.filter(
        (addr) => addr.toLowerCase() !== (input.recipientEmail || '').trim().toLowerCase()
      );
    }
  }

  const effectiveInitialRecipient =
    (input.recipientEmail || '').trim().toLowerCase() || fallbackList[0] || '';
  if (!effectiveInitialRecipient) {
    throw new Error(
      `${input.brokerName || 'This broker'} does not operate a public compliance email inbox (MX unavailable). Use Auto-Remove to fill criteria and check consent boxes on its online opt-out form.`
    );
  }

  const activeOAuthToken = state.oauthAccessToken || (await getAccessToken());
  const preferOAuth =
    state.mode === 'oauth' && Boolean(activeOAuthToken && state.oauthUser);
  const preferSmtp =
    !preferOAuth &&
    Boolean(state.smtp?.verified && state.backendAvailable !== false);

  if (preferSmtp && state.smtp?.verified) {
    const smtp = state.smtp;
    let res: Response;
    try {
      res = await sessionFetch('/api/email/dispatch-on-behalf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: smtp.provider,
          userEmail: smtp.userEmail,
          senderName: input.senderName,
          credentialId: smtp.credentialId,
          customHost: smtp.provider === 'custom' ? smtp.customHost : undefined,
          customPort: smtp.provider === 'custom' ? smtp.customPort : undefined,
          customSecure: smtp.provider === 'custom' ? smtp.customSecure : undefined,
          resolvedPort: smtp.resolvedPort,
          recipientEmail: input.recipientEmail,
          fallbackRecipientEmails: fallbackList,
          ccEmails: input.ccEmails,
          subject: input.subject,
          body: input.body,
          brokerId: input.brokerId,
          brokerName: input.brokerName,
          brokerDomain: input.brokerDomain,
          bccSelf: Boolean(input.bccSelf),
        }),
      });
    } catch {
      state = { ...state, backendAvailable: false };
      emitChange();
      throw new Error(
        'SMTP relay server is unreachable in this static environment. Connect via Google OAuth (HTTPS) or use 1-Click Webmail Compose.'
      );
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      state = { ...state, backendAvailable: false };
      emitChange();
      throw new Error(
        'Static hosting environment cannot open raw SMTP sockets. Connect via Google OAuth (HTTPS) or launch via 1-Click Webmail Compose.'
      );
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed sending email to ${input.brokerName}.`);
    }

    const deliveredTo = String(data.recipientEmail || input.recipientEmail);
    return {
      messageId: String(data.messageId),
      sentFrom: smtp.userEmail,
      deliveredTo,
      usedFallback: Boolean(data.usedFallback),
      mxVerified: Boolean(data.mxVerified),
      ccDelivered: Array.isArray(data.ccDelivered) ? data.ccDelivered.map(String) : [],
    };
  }

  if (activeOAuthToken && state.oauthUser) {
    let targetRecipient = input.recipientEmail.trim().toLowerCase();
    let usedFallback = false;
    let mxVerified = false;

    if (input.brokerId !== 'synout-self-test') {
      try {
        const mxCheck = await verifyRecipientDeliverabilityClient(targetRecipient, fallbackList);
        if (!mxCheck.valid || !mxCheck.recommendedEmail) {
          throw new Error(
            mxCheck.reason ||
              `Recipient domain for ${targetRecipient} has no active mail server (MX missing). Use the broker's direct opt-out portal instead to avoid a bounce.`
          );
        }
        targetRecipient = mxCheck.recommendedEmail;
        usedFallback = mxCheck.usedFallback;
        mxVerified = mxCheck.mxVerified;
      } catch (err) {
        if (err instanceof Error && /no active mail server|MX|Null MX|NXDOMAIN/i.test(err.message)) {
          throw err;
        }
      }
    }

    const cleanCc = (input.ccEmails || []).filter(
      (c) => c.trim().toLowerCase() !== targetRecipient
    );

    const response = await sendGmailMessage(
      activeOAuthToken,
      targetRecipient,
      input.subject,
      input.body,
      input.bccSelf ? state.oauthUser.email : undefined,
      cleanCc
    );
    return {
      messageId: response.id,
      sentFrom: state.oauthUser.email,
      deliveredTo: targetRecipient,
      usedFallback,
      mxVerified,
      ccDelivered: cleanCc,
    };
  }

  if (state.oauthUser && state.oauthTokenExpired) {
    throw new Error(
      `Your Google OAuth session for ${state.oauthUser.email} expired. Click "Reconnect Google" in the Email panel to refresh authorization.`
    );
  }

  throw new Error('Connect your email account first so synOUT can send opt-out demands on your behalf.');
}
