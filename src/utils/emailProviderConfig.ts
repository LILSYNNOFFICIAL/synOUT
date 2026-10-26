export type EmailProviderId = 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'proton' | 'custom';
export type WebmailLauncherId = 'gmail' | 'outlook' | 'yahoo' | 'mailto';

export interface EmailProviderPreset {
  id: EmailProviderId;
  label: string;
  shortLabel: string;
  host: string;
  port: number;
  secure: boolean;
  credentialLabel: string;
  helpText: string;
  appPasswordUrl?: string;
}

export const EMAIL_PROVIDER_PRESETS: Record<EmailProviderId, EmailProviderPreset> = {
  gmail: {
    id: 'gmail',
    label: 'Gmail / Google Workspace',
    shortLabel: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    credentialLabel: 'Google 16-Letter App Code (Not Regular Password)',
    helpText:
      'Easy 2-step setup: Click "Get App Password" to create a one-time 16-letter mail code in Google (your main password stays private). Or choose "1-Click Webmail" above to send with zero password at all.',
    appPasswordUrl: 'https://myaccount.google.com/apppasswords',
  },
  outlook: {
    id: 'outlook',
    label: 'Outlook / Hotmail / Microsoft 365',
    shortLabel: 'Outlook',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    credentialLabel: 'Microsoft App Code (Not Regular Password)',
    helpText:
      'Click "Get App Password" to create a dedicated mail code in Microsoft Security, or choose "1-Click Webmail" above to open pre-written emails in Outlook.com with zero password setup.',
    appPasswordUrl: 'https://account.live.com/proofs/manage/additional',
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo / AOL Mail',
    shortLabel: 'Yahoo',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    secure: true,
    credentialLabel: 'Yahoo 16-Letter App Code',
    helpText:
      'Click "Get App Password" -> Yahoo Account Security -> "Generate app password" to get a one-time code, or choose "1-Click Webmail" above with no password needed.',
    appPasswordUrl: 'https://login.yahoo.com/account/security',
  },
  icloud: {
    id: 'icloud',
    label: 'Apple iCloud Mail',
    shortLabel: 'iCloud',
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    credentialLabel: 'Apple App-Specific Password',
    helpText:
      'Click "Get App Password" -> Sign-In and Security -> "App-Specific Passwords" to create a mail code (xxxx-xxxx-xxxx-xxxx), or use "1-Click Webmail" with your default Mail app.',
    appPasswordUrl: 'https://account.apple.com/account/manage',
  },
  proton: {
    id: 'proton',
    label: 'Proton Mail',
    shortLabel: 'Proton',
    host: 'smtp.protonmail.ch',
    port: 587,
    secure: false,
    credentialLabel: 'Proton Mail Submission Token',
    helpText:
      'Paste a Proton Mail token from Proton Settings -> IMAP/SMTP, or choose "1-Click Webmail" above to open pre-written removal notices in your mail app.',
    appPasswordUrl: 'https://account.proton.me/u/0/mail/imap-smtp',
  },
  custom: {
    id: 'custom',
    label: 'Other Email Provider (Zoho, Fastmail, Custom Domain)',
    shortLabel: 'Other Email',
    host: '',
    port: 587,
    secure: false,
    credentialLabel: 'Mail App Password',
    helpText:
      'We auto-fill server settings for Zoho, Fastmail, AOL, GMX, AT&T, and Comcast when you type your email — or choose "1-Click Webmail" above with no server settings needed.',
  },
};

const KNOWN_CUSTOM_DOMAIN_SMTP: Record<
  string,
  { host: string; port: number; secure: boolean; providerHint: string }
> = {
  'zoho.com': { host: 'smtp.zoho.com', port: 465, secure: true, providerHint: 'Zoho Mail' },
  'zohomail.com': { host: 'smtp.zoho.com', port: 465, secure: true, providerHint: 'Zoho Mail' },
  'fastmail.com': { host: 'smtp.fastmail.com', port: 465, secure: true, providerHint: 'Fastmail' },
  'fastmail.fm': { host: 'smtp.fastmail.com', port: 465, secure: true, providerHint: 'Fastmail' },
  'aol.com': { host: 'smtp.aol.com', port: 465, secure: true, providerHint: 'AOL Mail (use App Password)' },
  'gmx.com': { host: 'mail.gmx.com', port: 587, secure: false, providerHint: 'GMX Mail' },
  'gmx.us': { host: 'mail.gmx.com', port: 587, secure: false, providerHint: 'GMX Mail' },
  'mail.com': { host: 'smtp.mail.com', port: 587, secure: false, providerHint: 'Mail.com' },
  'att.net': { host: 'smtp.mail.att.net', port: 465, secure: true, providerHint: 'AT&T / Yahoo Secure Mail Key' },
  'sbcglobal.net': { host: 'smtp.mail.att.net', port: 465, secure: true, providerHint: 'AT&T / Yahoo Secure Mail Key' },
  'comcast.net': { host: 'smtp.comcast.net', port: 587, secure: false, providerHint: 'Xfinity / Comcast Mail' },
};

export function inferCustomSmtpDefaults(
  email: string
): { host: string; port: number; secure: boolean; providerHint: string } | null {
  const normalized = (email || '').trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex === -1) return null;
  const domain = normalized.slice(atIndex + 1);
  return KNOWN_CUSTOM_DOMAIN_SMTP[domain] || null;
}

export function detectProviderFromEmail(email: string): EmailProviderId {
  const normalized = (email || '').trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex === -1) return 'gmail';
  const domain = normalized.slice(atIndex + 1);

  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'gmail';
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com'
  ) {
    return 'outlook';
  }
  if (domain === 'yahoo.com' || domain === 'ymail.com' || domain === 'rocketmail.com') {
    return 'yahoo';
  }
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return 'icloud';
  }
  if (domain === 'proton.me' || domain === 'protonmail.com' || domain === 'pm.me') {
    return 'proton';
  }
  return 'custom';
}

export function detectWebmailLauncherFromEmail(email: string): WebmailLauncherId {
  const provider = detectProviderFromEmail(email);
  if (provider === 'gmail') return 'gmail';
  if (provider === 'outlook') return 'outlook';
  if (provider === 'yahoo') return 'yahoo';
  return 'mailto';
}

/**
 * Normalizes pasted App Passwords across providers:
 * - Strips spaces from 4x4 grouped App Passwords (e.g. Google "abcd efgh ijkl mnop")
 * - Preserves hyphens for Apple iCloud App-Specific Passwords ("abcd-efgh-ijkl-mnop") while stripping spaces
 * - Trims leading/trailing whitespace on custom SMTP tokens
 */
export function normalizeAppPassword(provider: EmailProviderId, rawPassword: string): string {
  const trimmed = (rawPassword || '').trim();
  if (!trimmed) return '';

  if (provider === 'gmail' || provider === 'yahoo') {
    return trimmed.replace(/[\s-]+/g, '');
  }
  if (provider === 'icloud' || provider === 'proton') {
    return trimmed.replace(/\s+/g, '');
  }
  if (provider === 'outlook') {
    // Strip spaces only if pasted as 4-char blocks (e.g. "abcd efgh ijkl mnop")
    if (/^[a-z0-9]{4}(\s+[a-z0-9]{4}){3}$/i.test(trimmed)) {
      return trimmed.replace(/\s+/g, '');
    }
    return trimmed;
  }
  return trimmed;
}

export type SmtpErrorCategory =
  | 'APP_PASSWORD_REQUIRED'
  | 'MICROSOFT_BASIC_AUTH_DISABLED'
  | 'SMTP_PORT_BLOCKED'
  | 'HOST_UNREACHABLE'
  | 'AUTH_FAILED';

export interface ClassifiedSmtpError {
  code: SmtpErrorCategory;
  message: string;
  suggestOAuth: boolean;
  suggestWebmail: boolean;
}

export function classifySmtpAuthError(
  err: unknown,
  provider?: EmailProviderId
): ClassifiedSmtpError {
  const raw = err instanceof Error ? err.message : String(err || 'SMTP connection failed.');

  if (/535\s+5\.7\.139|basic authentication is disabled/i.test(raw)) {
    return {
      code: 'MICROSOFT_BASIC_AUTH_DISABLED',
      message:
        'Microsoft blocks regular passwords for safety. Click "1-Click Webmail" below to send from Outlook.com right away with no password needed, or create a Microsoft App Password.',
      suggestOAuth: false,
      suggestWebmail: true,
    };
  }

  if (
    /534[- ]5\.7\.9|535[- ]5\.7\.8|Application-specific password|Username and Password not accepted|InvalidSecondFactor/i.test(
      raw
    )
  ) {
    return {
      code: 'APP_PASSWORD_REQUIRED',
      message:
        provider === 'gmail'
          ? 'Google protects your main password and requires a 16-letter Google App Password instead — OR click "1-Click Webmail" / "Sign in with Google" below to connect without an App Password.'
          : 'Your email provider requires a one-time App Password instead of your regular login password — OR click "1-Click Webmail" below to send without any password.',
      suggestOAuth: provider === 'gmail',
      suggestWebmail: true,
    };
  }

  if (/ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNRESET|Greeting never received/i.test(raw)) {
    return {
      code: 'SMTP_PORT_BLOCKED',
      message:
        provider === 'gmail'
          ? 'This network blocks background mail ports. Click "Sign in with Google" or "1-Click Webmail" below — both work immediately on any network.'
          : 'This network blocks background mail ports. Click "1-Click Webmail" below to send right away with no port setup.',
      suggestOAuth: provider === 'gmail',
      suggestWebmail: true,
    };
  }

  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return {
      code: 'HOST_UNREACHABLE',
      message: `Could not reach that mail server address. Double-check the server name, or click "1-Click Webmail" below to send without server setup.`,
      suggestOAuth: false,
      suggestWebmail: true,
    };
  }

  if (/535|EAUTH|Authentication/i.test(raw)) {
    return {
      code: 'AUTH_FAILED',
      message:
        'Could not sign in with that code. Make sure you used a 16-letter App Password (not your regular login password), or click "1-Click Webmail" below to send with no password.',
      suggestOAuth: provider === 'gmail',
      suggestWebmail: true,
    };
  }

  return {
    code: 'AUTH_FAILED',
    message: raw.slice(0, 220),
    suggestOAuth: provider === 'gmail',
    suggestWebmail: true,
  };
}

/**
 * SSRF Guard: Ensures custom SMTP hostnames only target public mail servers
 * and never loopback, link-local, cloud metadata, or RFC1918 private networks.
 */
export function isSafePublicSmtpHost(rawHost: string): { valid: boolean; reason?: string } {
  const host = (rawHost || '').trim().toLowerCase();
  if (!host) {
    return { valid: false, reason: 'SMTP hostname is required.' };
  }
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
    return { valid: false, reason: 'Invalid SMTP hostname format.' };
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0'
  ) {
    return { valid: false, reason: 'Local or internal hostnames are not permitted.' };
  }

  // Check if host is a raw IPv4 literal
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => parseInt(n, 10));
    if (octets.some((o) => o < 0 || o > 255)) {
      return { valid: false, reason: 'Invalid IPv4 address.' };
    }
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return { valid: false, reason: 'Private, loopback, or link-local IP ranges are blocked.' };
    }
  }

  if (!host.includes('.')) {
    return {
      valid: false,
      reason: 'SMTP host must be a fully qualified domain name (e.g., smtp.fastmail.com).',
    };
  }

  return { valid: true };
}

export interface SmtpResolutionInput {
  provider: EmailProviderId;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
}

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  provider: EmailProviderId;
}

export function resolveSmtpTransportSettings(input: SmtpResolutionInput): ResolvedSmtpConfig {
  const preset = EMAIL_PROVIDER_PRESETS[input.provider];
  if (!preset) {
    throw new Error('Unsupported email provider preset.');
  }

  if (input.provider !== 'custom') {
    return {
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      provider: preset.id,
    };
  }

  const hostCheck = isSafePublicSmtpHost(input.customHost || '');
  if (!hostCheck.valid) {
    throw new Error(hostCheck.reason || 'Invalid custom SMTP host.');
  }

  const allowedPorts = [25, 465, 587, 2525];
  const port = Number(input.customPort || 587);
  if (!allowedPorts.includes(port)) {
    throw new Error('Custom SMTP port must be a standard mail submission port (465, 587, 2525, or 25).');
  }

  const secure = typeof input.customSecure === 'boolean' ? input.customSecure : port === 465;

  return {
    host: (input.customHost || '').trim().toLowerCase(),
    port,
    secure,
    provider: 'custom',
  };
}

/**
 * Produces ordered SMTP transport candidates so server-side connection handshakes
 * automatically fail over between Port 465 (Implicit TLS) and Port 587 (STARTTLS)
 * if one submission port is filtered by network policy.
 */
export function resolveSmtpFailoverCandidates(input: SmtpResolutionInput): ResolvedSmtpConfig[] {
  const primary = resolveSmtpTransportSettings(input);
  const candidates: ResolvedSmtpConfig[] = [primary];

  if (primary.port === 465) {
    candidates.push({
      host: primary.host,
      port: 587,
      secure: false,
      provider: primary.provider,
    });
  } else if (primary.port === 587) {
    candidates.push({
      host: primary.host,
      port: 465,
      secure: true,
      provider: primary.provider,
    });
  }

  if (input.provider === 'outlook') {
    candidates.push({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      provider: 'outlook',
    });
  }

  return candidates;
}

export function buildWebmailComposeUrls(
  to: string,
  subject: string,
  body: string,
  options?: { cc?: string[]; bcc?: string[] }
) {
  const encTo = encodeURIComponent(to);
  const encSub = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);
  const ccStr = (options?.cc || []).filter(Boolean).join(',');
  const bccStr = (options?.bcc || []).filter(Boolean).join(',');
  const encCc = ccStr ? encodeURIComponent(ccStr) : '';
  const encBcc = bccStr ? encodeURIComponent(bccStr) : '';

  return {
    gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encTo}${encCc ? `&cc=${encCc}` : ''}${
      encBcc ? `&bcc=${encBcc}` : ''
    }&su=${encSub}&body=${encBody}`,
    outlookUrl: `https://outlook.live.com/mail/0/deeplink/compose?to=${encTo}${
      encCc ? `&cc=${encCc}` : ''
    }${encBcc ? `&bcc=${encBcc}` : ''}&subject=${encSub}&body=${encBody}`,
    yahooUrl: `https://compose.mail.yahoo.com/?to=${encTo}${encCc ? `&cc=${encCc}` : ''}${
      encBcc ? `&bcc=${encBcc}` : ''
    }&subject=${encSub}&body=${encBody}`,
    mailtoUrl: `mailto:${encTo}?subject=${encSub}${encCc ? `&cc=${encCc}` : ''}${
      encBcc ? `&bcc=${encBcc}` : ''
    }&body=${encBody}`,
  };
}
