export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  date?: string;
  bodyText?: string;
  verificationLinks: string[];
}

interface GmailMimePart {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMimePart[];
}

function utf8ToBase64(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

function base64UrlEncode(str: string): string {
  return utf8ToBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecodeUtf8(encoded: string): string {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function stripHtmlPreservingLinks(html: string): string {
  const hrefs: string[] = [];
  const hrefRegex = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let match: RegExpExecArray | null = null;
  while ((match = hrefRegex.exec(html)) !== null) {
    if (match[1]) hrefs.push(match[1]);
  }

  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return hrefs.length > 0 ? `${text}\n\n${hrefs.join('\n')}` : text;
}

export function extractDecodedBodyFromGmailPayload(payload?: GmailMimePart): string {
  if (!payload) return '';
  const chunks: string[] = [];

  function walk(part: GmailMimePart): void {
    const mime = (part.mimeType || '').toLowerCase();
    if (part.body?.data && (mime === 'text/plain' || mime === 'text/html' || !part.parts)) {
      const decoded = base64UrlDecodeUtf8(part.body.data);
      if (decoded) {
        chunks.push(mime === 'text/html' ? stripHtmlPreservingLinks(decoded) : decoded);
      }
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return chunks.join('\n').slice(0, 24000);
}

export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  bcc?: string,
  cc?: string[],
  replyTo?: string
): Promise<{ id: string; threadId: string }> {
  const validCc = (cc || []).map((c) => c.replace(/[\r\n]+/g, '').trim()).filter(Boolean);
  const safeReplyTo = replyTo ? replyTo.replace(/[\r\n]+/g, '').trim() : '';
  const headers = [
    `To: ${to.replace(/[\r\n]+/g, '').trim()}`,
    ...(safeReplyTo ? [`Reply-To: ${safeReplyTo}`] : []),
    ...(validCc.length > 0 ? [`Cc: ${validCc.join(', ')}`] : []),
    ...(bcc ? [`Bcc: ${bcc.replace(/[\r\n]+/g, '').trim()}`] : []),
    `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];

  const rfc2822Email = [...headers, '', body].join('\r\n');
  const raw = base64UrlEncode(rfc2822Email);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Gmail API error (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

export async function scanBrokerInboxForHarvester(
  accessToken: string,
  brokerDomains: string[],
  maxResults = 12
): Promise<GmailMessageSummary[]> {
  const cleanedDomains = Array.from(
    new Set(
      (brokerDomains || [])
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
        .filter(Boolean)
    )
  ).slice(0, 18);

  const domainClause =
    cleanedDomains.length > 0
      ? `(${cleanedDomains.map((d) => `from:${d}`).join(' OR ')} OR ${cleanedDomains
          .slice(0, 6)
          .map((d) => `"${d}"`)
          .join(' OR ')})`
      : '(opt-out OR optout OR "data deletion" OR "suppression" OR "remove my" OR "privacy request")';

  const query = `${domainClause} (confirm OR verify OR opt-out OR optout OR removal OR suppress OR delete OR ticket OR request OR "Address not found" OR "Delivery Status Notification")`;
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(
    maxResults,
    20
  )}&q=${encodeURIComponent(query)}`;

  const res = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Gmail read authorization expired or missing gmail.readonly scope. Re-authenticate in Connect Email.'
      );
    }
    return [];
  }

  const data = await res.json();
  const messages: { id: string; threadId: string }[] = data.messages || [];
  const summaries: GmailMessageSummary[] = [];

  for (const msg of messages.slice(0, maxResults)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!msgRes.ok) continue;

      const full = await msgRes.json();
      const headers: { name: string; value: string }[] = full.payload?.headers || [];
      const subjectHeader =
        headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
      const fromHeader =
        headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const dateHeader =
        headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';

      const snippet = full.snippet || '';
      const decodedBody = extractDecodedBodyFromGmailPayload(full.payload) || snippet;
      const combined = `${snippet}\n${decodedBody}`;

      const urlRegex = /(https?:\/\/[^\s"'<>)\]]+)/gi;
      const matches: string[] = combined.match(urlRegex) || [];
      const links: string[] = Array.from(new Set(matches)).filter(
        (u: string) =>
          !u.includes('google.com') &&
          (u.includes('opt') ||
            u.includes('confirm') ||
            u.includes('verify') ||
            u.includes('token') ||
            u.includes('suppress') ||
            u.includes('delete') ||
            u.includes('remove'))
      );

      summaries.push({
        id: msg.id,
        threadId: msg.threadId,
        snippet,
        subject: subjectHeader,
        from: fromHeader,
        date: dateHeader,
        bodyText: combined,
        verificationLinks: links,
      });
    } catch {
      // Ignore individual message parse failures
    }
  }

  return summaries;
}

export async function searchBrokerVerificationEmails(
  accessToken: string,
  brokerDomain?: string
): Promise<GmailMessageSummary[]> {
  return scanBrokerInboxForHarvester(
    accessToken,
    brokerDomain ? [brokerDomain] : [],
    6
  ).catch(() => []);
}
