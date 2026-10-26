export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
  'profile',
];

export type OAuthClientSource = 'custom' | 'env' | 'server' | 'none';

export interface ConnectedGoogleUser {
  email: string;
  displayName?: string;
  picture?: string;
}

interface StoredGoogleSession {
  user: ConnectedGoogleUser;
  accessToken: string | null;
  expiresAtMs: number;
  rememberInBrowser: boolean;
}

interface GisTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: GisTokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => GisTokenClient;
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

const CUSTOM_CLIENT_ID_STORAGE_KEY = 'synout_google_oauth_client_id_v1';
const OAUTH_SESSION_STORAGE_KEY = 'synout_google_oauth_session_v1';
const OAUTH_PERSISTENT_STORAGE_KEY = 'synout_google_oauth_persistent_v1';
const DEFAULT_TOKEN_TTL_SECONDS = 3500;

let cachedAccessToken: string | null = null;
let cachedGoogleUser: ConnectedGoogleUser | null = null;
let cachedExpiresAtMs = 0;
let cachedRememberInBrowser = true;
let serverClientIdCache: string | null | undefined = undefined;
let serverClientIdPromise: Promise<string | null> | null = null;
let gisScriptPromise: Promise<void> | null = null;

/**
 * Validates that a Google OAuth 2.0 Web Client ID matches the public
 * `<project-number>-<hash>.apps.googleusercontent.com` format and is never
 * an API key or client secret.
 */
export function isValidGoogleOAuthClientId(rawClientId: string): boolean {
  const trimmed = (rawClientId || '').trim();
  if (!trimmed || trimmed.length > 220) return false;
  if (/^AIza/i.test(trimmed) || /^GOCSPX-/i.test(trimmed)) return false;
  return /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(trimmed);
}

export function getSavedGoogleClientId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = (window.localStorage.getItem(CUSTOM_CLIENT_ID_STORAGE_KEY) || '').trim();
    return isValidGoogleOAuthClientId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveCustomGoogleClientId(rawClientId: string): string {
  const cleaned = (rawClientId || '').trim();
  if (!isValidGoogleOAuthClientId(cleaned)) {
    throw new Error(
      'Enter a valid Google OAuth 2.0 Web Client ID ending in .apps.googleusercontent.com (never an API key or client secret).'
    );
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CUSTOM_CLIENT_ID_STORAGE_KEY, cleaned);
    } catch {
      // Ignore storage quota restrictions
    }
  }
  return cleaned;
}

export function clearCustomGoogleClientId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CUSTOM_CLIENT_ID_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function readBuildTimeGoogleClientId(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const id = (env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
  return isValidGoogleOAuthClientId(id) ? id : null;
}

async function fetchServerGoogleClientId(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (serverClientIdCache !== undefined) return serverClientIdCache;

  if (!serverClientIdPromise) {
    serverClientIdPromise = fetch('/api/config/oauth-public')
      .then(async (res) => {
        if (!res.ok) {
          serverClientIdCache = null;
          return null;
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          serverClientIdCache = null;
          return null;
        }
        const data = await res.json().catch(() => null);
        const candidate =
          data?.configured && typeof data?.googleClientId === 'string'
            ? data.googleClientId.trim()
            : '';
        serverClientIdCache = isValidGoogleOAuthClientId(candidate) ? candidate : null;
        return serverClientIdCache;
      })
      .catch(() => {
        serverClientIdCache = null;
        return null;
      });
  }

  return serverClientIdPromise;
}

export async function resolveGoogleClientInfo(): Promise<{
  clientId: string | null;
  source: OAuthClientSource;
}> {
  const customId = getSavedGoogleClientId();
  if (customId) {
    return { clientId: customId, source: 'custom' };
  }

  const buildId = readBuildTimeGoogleClientId();
  if (buildId) {
    return { clientId: buildId, source: 'env' };
  }

  const serverId = await fetchServerGoogleClientId();
  if (serverId) {
    return { clientId: serverId, source: 'server' };
  }

  return { clientId: null, source: 'none' };
}

export async function resolveGoogleClientId(): Promise<string | null> {
  const info = await resolveGoogleClientInfo();
  return info.clientId;
}

export async function isGoogleOAuthConfigured(): Promise<boolean> {
  const clientId = await resolveGoogleClientId();
  return Boolean(clientId);
}

function encodeSession(session: StoredGoogleSession): string {
  const json = JSON.stringify(session);
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

function decodeSession(raw: string): StoredGoogleSession | null {
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
    const parsed = JSON.parse(json) as StoredGoogleSession;
    if (parsed && parsed.user && typeof parsed.user.email === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function persistGoogleSession(session: StoredGoogleSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.sessionStorage.removeItem(OAUTH_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(OAUTH_PERSISTENT_STORAGE_KEY);
      return;
    }
    // Keep short-lived access token in ephemeral tab sessionStorage only; NEVER in persistent localStorage
    const encodedEphemeral = encodeSession(session);
    window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, encodedEphemeral);

    if (session.rememberInBrowser) {
      // Only persist non-secret profile hint (user email/name) for fast re-auth prompt
      const hintOnly: StoredGoogleSession = {
        user: session.user,
        accessToken: null,
        expiresAtMs: 0,
        rememberInBrowser: true,
      };
      window.localStorage.setItem(OAUTH_PERSISTENT_STORAGE_KEY, encodeSession(hintOnly));
    } else {
      window.localStorage.removeItem(OAUTH_PERSISTENT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota/sandbox errors
  }
}

export function loadStoredGoogleSession(): {
  user: ConnectedGoogleUser | null;
  accessToken: string | null;
  expired: boolean;
} {
  if (cachedGoogleUser) {
    const expired = !cachedAccessToken || (cachedExpiresAtMs > 0 && Date.now() >= cachedExpiresAtMs);
    return {
      user: cachedGoogleUser,
      accessToken: expired ? null : cachedAccessToken,
      expired,
    };
  }

  if (typeof window === 'undefined') {
    return { user: null, accessToken: null, expired: false };
  }

  try {
    const sessionRaw = window.sessionStorage.getItem(OAUTH_SESSION_STORAGE_KEY);
    const persistentRaw = window.localStorage.getItem(OAUTH_PERSISTENT_STORAGE_KEY);

    // Scrub any legacy persistent localStorage entry that contained a raw accessToken
    if (persistentRaw) {
      const legacyDecoded = decodeSession(persistentRaw);
      if (legacyDecoded && legacyDecoded.accessToken) {
        window.localStorage.setItem(
          OAUTH_PERSISTENT_STORAGE_KEY,
          encodeSession({
            user: legacyDecoded.user,
            accessToken: null,
            expiresAtMs: 0,
            rememberInBrowser: true,
          })
        );
      }
    }

    const raw = sessionRaw || persistentRaw;
    if (!raw) {
      return { user: null, accessToken: null, expired: false };
    }
    const decoded = decodeSession(raw);
    if (!decoded) {
      return { user: null, accessToken: null, expired: false };
    }

    cachedGoogleUser = decoded.user;
    cachedRememberInBrowser = decoded.rememberInBrowser !== false;
    cachedExpiresAtMs = Number(decoded.expiresAtMs || 0);

    // Never trust an accessToken read from persistentRaw
    const effectiveToken = sessionRaw ? decoded.accessToken : null;
    const isExpired =
      !effectiveToken || (cachedExpiresAtMs > 0 && Date.now() >= cachedExpiresAtMs);

    cachedAccessToken = isExpired ? null : effectiveToken;
    return {
      user: decoded.user,
      accessToken: cachedAccessToken,
      expired: isExpired,
    };
  } catch {
    return { user: null, accessToken: null, expired: false };
  }
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser window is required for Google OAuth popup.'));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (!gisScriptPromise) {
    gisScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]'
      );
      if (existing) {
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => {
            gisScriptPromise = null;
            reject(new Error('Failed to load Google Identity Services SDK.'));
          },
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisScriptPromise = null;
        reject(
          new Error(
            'Could not load Google Identity Services script (check ad-blocker or network firewall).'
          )
        );
      };
      document.head.appendChild(script);
    });
  }

  return gisScriptPromise;
}

export async function verifyGmailAccessTokenProfile(
  accessToken: string
): Promise<ConnectedGoogleUser> {
  const cleanToken = (accessToken || '').trim().replace(/^Bearer\s+/i, '');
  if (!cleanToken) {
    throw new Error('OAuth 2.0 access token cannot be empty.');
  }

  // Primary check: Gmail API users/me/profile verifies both identity AND Gmail scope authorization
  const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
    },
  });

  let emailAddress = '';
  if (gmailRes.ok) {
    const gmailData = await gmailRes.json().catch(() => ({}));
    if (typeof gmailData?.emailAddress === 'string') {
      emailAddress = gmailData.emailAddress.trim();
    }
  } else if (gmailRes.status === 401 || gmailRes.status === 403) {
    const errBody = await gmailRes.json().catch(() => ({}));
    const apiMsg = errBody?.error?.message || `HTTP ${gmailRes.status}`;
    throw new Error(
      `Gmail API authorization check failed (${apiMsg}). Ensure the Gmail API is enabled in your Google Cloud project and the gmail.send scope was granted.`
    );
  }

  // Enrich display name / avatar from OpenID userinfo if available
  let displayName: string | undefined;
  let picture: string | undefined;
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });
    if (infoRes.ok) {
      const info = await infoRes.json().catch(() => ({}));
      if (!emailAddress && typeof info?.email === 'string') {
        emailAddress = info.email.trim();
      }
      if (typeof info?.name === 'string' && info.name.trim()) {
        displayName = info.name.trim();
      }
      if (typeof info?.picture === 'string' && info.picture.trim()) {
        picture = info.picture.trim();
      }
    }
  } catch {
    // Optional enrichment only
  }

  if (!emailAddress) {
    throw new Error('Could not verify a Gmail address for this Google authorization token.');
  }

  return {
    email: emailAddress,
    displayName: displayName || emailAddress.split('@')[0],
    picture,
  };
}

export const initAuth = (
  onAuthSuccess?: (user: ConnectedGoogleUser, token: string | null, expired: boolean) => void,
  onAuthFailure?: () => void
): (() => void) => {
  const restored = loadStoredGoogleSession();
  if (restored.user) {
    if (onAuthSuccess) {
      onAuthSuccess(restored.user, restored.accessToken, restored.expired);
    }
  } else if (onAuthFailure) {
    onAuthFailure();
  }

  return () => {
    // Cleanup hook
  };
};

export const googleSignIn = async (options?: {
  loginHint?: string;
  rememberInBrowser?: boolean;
  silentIfPossible?: boolean;
}): Promise<{
  user: ConnectedGoogleUser;
  accessToken: string;
  expiresAtMs: number;
}> => {
  const clientId = await resolveGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Enter your Google OAuth 2.0 Web Client ID (.apps.googleusercontent.com) in the setup box below to enable 1-click Google Popup Sign-In, or use the App Password / Instant Webmail tabs.'
    );
  }

  await loadGoogleIdentityScript();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services failed to initialize in this browser.');
  }

  const remember = options?.rememberInBrowser ?? cachedRememberInBrowser;
  const hint = options?.loginHint || cachedGoogleUser?.email || undefined;

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPES.join(' '),
      hint,
      callback: async (response: GisTokenResponse) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                'Google authorization was cancelled or denied.'
            )
          );
          return;
        }

        try {
          const cleanToken = response.access_token;
          const ttlSec = Number(response.expires_in || DEFAULT_TOKEN_TTL_SECONDS);
          const expiresAtMs = Date.now() + Math.max(60, ttlSec - 60) * 1000;
          const user = await verifyGmailAccessTokenProfile(cleanToken);

          cachedAccessToken = cleanToken;
          cachedGoogleUser = user;
          cachedExpiresAtMs = expiresAtMs;
          cachedRememberInBrowser = remember;

          persistGoogleSession({
            user,
            accessToken: cleanToken,
            expiresAtMs,
            rememberInBrowser: remember,
          });

          resolve({ user, accessToken: cleanToken, expiresAtMs });
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to verify Gmail profile.'));
        }
      },
      error_callback: (err) => {
        const type = err?.type || '';
        if (type === 'popup_failed_to_open') {
          reject(
            new Error(
              'Browser blocked the Google OAuth popup window. Allow popups for this site (or open synOUT in a standalone tab), or paste an OAuth Access Token below.'
            )
          );
          return;
        }
        if (type === 'popup_closed') {
          reject(new Error('Google sign-in popup was closed before completing authorization.'));
          return;
        }
        reject(new Error(err?.message || 'Google OAuth popup was closed or blocked by browser.'));
      },
    });

    tokenClient.requestAccessToken({
      prompt: options?.silentIfPossible && hint ? '' : 'consent',
      hint,
    });
  });
};

export async function connectWithGmailAccessToken(
  rawAccessToken: string,
  rememberInBrowser = true
): Promise<{
  user: ConnectedGoogleUser;
  accessToken: string;
  expiresAtMs: number;
}> {
  const cleanToken = (rawAccessToken || '').trim().replace(/^Bearer\s+/i, '');
  const user = await verifyGmailAccessTokenProfile(cleanToken);
  const expiresAtMs = Date.now() + DEFAULT_TOKEN_TTL_SECONDS * 1000;

  cachedAccessToken = cleanToken;
  cachedGoogleUser = user;
  cachedExpiresAtMs = expiresAtMs;
  cachedRememberInBrowser = rememberInBrowser;

  persistGoogleSession({
    user,
    accessToken: cleanToken,
    expiresAtMs,
    rememberInBrowser,
  });

  return { user, accessToken: cleanToken, expiresAtMs };
}

export const signOutGoogleUser = async (): Promise<void> => {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  cachedGoogleUser = null;
  cachedExpiresAtMs = 0;
  persistGoogleSession(null);

  if (tokenToRevoke && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
    await new Promise<void>((resolve) => {
      window.google?.accounts?.oauth2?.revoke?.(tokenToRevoke, () => resolve());
    });
  }
};

export function clearAllGoogleAuthStorage(): void {
  cachedAccessToken = null;
  cachedGoogleUser = null;
  cachedExpiresAtMs = 0;
  persistGoogleSession(null);
  clearCustomGoogleClientId();
}

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && (cachedExpiresAtMs === 0 || Date.now() < cachedExpiresAtMs)) {
    return cachedAccessToken;
  }
  const restored = loadStoredGoogleSession();
  return restored.expired ? null : restored.accessToken;
};
