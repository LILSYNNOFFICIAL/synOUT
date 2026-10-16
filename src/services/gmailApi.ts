export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  date?: string;
  verificationLinks: string[];
}

function base64UrlEncode(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<{ id: string; threadId: string }> {
  const rfc2822Email = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');

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

export async function searchBrokerVerificationEmails(
  accessToken: string,
  brokerDomain?: string
): Promise<GmailMessageSummary[]> {
  const query = brokerDomain 
    ? `from:${brokerDomain} OR "${brokerDomain}" (confirm OR verify OR opt-out OR removal)`
    : '(optout OR "opt out" OR removal OR "data deletion" OR verify) (confirm OR verified OR expunged)';

  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`;

  const res = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const messages: { id: string; threadId: string }[] = data.messages || [];

  const summaries: GmailMessageSummary[] = [];

  for (const msg of messages.slice(0, 5)) {
    try {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!msgRes.ok) continue;

      const full = await msgRes.json();
      const headers = full.payload?.headers || [];
      const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
      const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

      const snippet = full.snippet || '';
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
      const matches: string[] = snippet.match(urlRegex) || [];
      const links: string[] = Array.from(new Set(matches)).filter((u: string) => 
        !u.includes('google.com') && 
        (u.includes('opt') || u.includes('confirm') || u.includes('verify') || u.includes('token') || u.includes('remove'))
      );

      summaries.push({
        id: msg.id,
        threadId: msg.threadId,
        snippet,
        subject: subjectHeader,
        from: fromHeader,
        date: dateHeader,
        verificationLinks: links,
      });
    } catch {
      // Ignore
    }
  }

  return summaries;
}
