const CLIENT_SESSION_TOKEN_KEY = 'synout_ephemeral_session_token_v1';

let memorySessionToken: string | null = null;

function generateClientFallbackToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getClientSessionToken(): string {
  if (memorySessionToken) return memorySessionToken;

  if (typeof window !== 'undefined') {
    try {
      const existing = window.sessionStorage.getItem(CLIENT_SESSION_TOKEN_KEY);
      if (existing && /^[a-f0-9]{48,96}$/i.test(existing)) {
        memorySessionToken = existing;
        return existing;
      }
      const created = generateClientFallbackToken();
      window.sessionStorage.setItem(CLIENT_SESSION_TOKEN_KEY, created);
      memorySessionToken = created;
      return created;
    } catch {
      // Fallback to in-memory token in strict sandboxed frames
    }
  }

  memorySessionToken = generateClientFallbackToken();
  return memorySessionToken;
}

export function rotateClientSessionToken(): string {
  const next = generateClientFallbackToken();
  memorySessionToken = next;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(CLIENT_SESSION_TOKEN_KEY, next);
    } catch {
      // Ignore storage restriction errors
    }
  }
  return next;
}

export function buildSessionHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-Synout-Session': getClientSessionToken(),
    ...(extra || {}),
  };
}

export async function sessionFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const existingHeaders =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : Array.isArray(init?.headers)
      ? Object.fromEntries(init.headers)
      : (init?.headers as Record<string, string> | undefined) || {};

  const res = await fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: buildSessionHeaders(existingHeaders),
  });

  const echoed = res.headers.get('X-Synout-Session');
  if (echoed && /^[a-f0-9]{48,96}$/i.test(echoed)) {
    memorySessionToken = echoed;
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(CLIENT_SESSION_TOKEN_KEY, echoed);
      } catch {
        // Ignore
      }
    }
  }

  return res;
}
