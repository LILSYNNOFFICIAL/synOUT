export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export interface ConnectedGoogleUser {
  email: string;
  displayName?: string;
}

interface GisTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GisTokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => GisTokenClient;
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let cachedAccessToken: string | null = null;
let cachedGoogleUser: ConnectedGoogleUser | null = null;
let clientIdPromise: Promise<string | null> | null = null;
let gisScriptPromise: Promise<void> | null = null;

function readBuildTimeGoogleClientId(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const id = (env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
  return id || null;
}

export async function resolveGoogleClientId(): Promise<string | null> {
  const buildId = readBuildTimeGoogleClientId();
  if (buildId) return buildId;

  if (typeof window === 'undefined') return null;

  if (!clientIdPromise) {
    clientIdPromise = fetch('/api/config/oauth-public')
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        return data?.configured && data?.googleClientId ? String(data.googleClientId) : null;
      })
      .catch(() => null);
  }

  return clientIdPromise;
}

export async function isGoogleOAuthConfigured(): Promise<boolean> {
  const clientId = await resolveGoogleClientId();
  return Boolean(clientId);
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
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed to load Google Identity Services SDK.')),
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
        reject(new Error('Could not load Google Identity Services script.'));
      };
      document.head.appendChild(script);
    });
  }

  return gisScriptPromise;
}

async function fetchGmailProfile(accessToken: string): Promise<ConnectedGoogleUser> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    return { email: 'Connected Gmail Account' };
  }

  const data = await res.json();
  const email = typeof data?.emailAddress === 'string' ? data.emailAddress : 'Connected Gmail Account';
  return {
    email,
    displayName: email.split('@')[0],
  };
}

export const initAuth = (
  onAuthSuccess?: (user: ConnectedGoogleUser, token: string) => void,
  onAuthFailure?: () => void
): (() => void) => {
  if (cachedGoogleUser && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(cachedGoogleUser, cachedAccessToken);
  } else if (onAuthFailure) {
    onAuthFailure();
  }

  return () => {
    // Stateless in-memory cleanup hook
  };
};

export const googleSignIn = async (): Promise<{
  user: ConnectedGoogleUser;
  accessToken: string;
}> => {
  const clientId = await resolveGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Optional Google OAuth Client ID is not configured. Use the "Connect Any Email" tab right beside this to connect your Gmail with a 16-character App Password immediately (zero cloud keys needed), or add VITE_GOOGLE_OAUTH_CLIENT_ID to your environment.'
    );
  }

  await loadGoogleIdentityScript();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google OAuth client failed to initialize in this browser.');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPES.join(' '),
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
          cachedAccessToken = response.access_token;
          const user = await fetchGmailProfile(cachedAccessToken);
          cachedGoogleUser = user;
          resolve({ user, accessToken: cachedAccessToken });
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to verify Gmail profile.'));
        }
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'Google OAuth popup was closed or blocked by browser.'));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const signOutGoogleUser = async (): Promise<void> => {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  cachedGoogleUser = null;

  if (tokenToRevoke && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
    await new Promise<void>((resolve) => {
      window.google?.accounts?.oauth2?.revoke?.(tokenToRevoke, () => resolve());
    });
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};
