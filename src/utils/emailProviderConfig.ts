export type EmailProviderId = 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'proton' | 'custom';

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
    credentialLabel: 'Google 16-Character App Password',
    helpText:
      'Generate a 16-character App Password in your Google Account (2-Step Verification must be enabled). Do not enter your main Google password.',
    appPasswordUrl: 'https://myaccount.google.com/apppasswords',
  },
  outlook: {
    id: 'outlook',
    label: 'Outlook / Hotmail / Microsoft 365',
    shortLabel: 'Outlook',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    credentialLabel: 'Microsoft App Password',
    helpText:
      'Create an App Password under Microsoft Account Security -> Advanced security options (with SMTP Authenticated Submission enabled).',
    appPasswordUrl: 'https://account.live.com/proofs/manage/additional',
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo Mail',
    shortLabel: 'Yahoo',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    secure: true,
    credentialLabel: 'Yahoo App Password',
    helpText:
      'Generate a one-time Yahoo Mail App Password under Account Info -> Account Security -> Generate app password.',
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
      'Sign in to account.apple.com -> Sign-In and Security -> App-Specific Passwords to generate a dedicated mail password.',
    appPasswordUrl: 'https://account.apple.com/account/manage',
  },
  proton: {
    id: 'proton',
    label: 'Proton Mail (SMTP Token)',
    shortLabel: 'Proton',
    host: 'smtp.protonmail.ch',
    port: 587,
    secure: false,
    credentialLabel: 'Proton SMTP Submission Token',
    helpText:
      'Use a Proton SMTP Submission Token generated in Proton Mail Settings -> IMAP/SMTP -> SMTP submission.',
    appPasswordUrl: 'https://account.proton.me/u/0/mail/imap-smtp',
  },
  custom: {
    id: 'custom',
    label: 'Custom Domain / Any SMTP Server',
    shortLabel: 'Custom SMTP',
    host: '',
    port: 587,
    secure: false,
    credentialLabel: 'SMTP Password or Token',
    helpText:
      'Enter your email provider’s public outbound SMTP hostname (e.g., smtp.fastmail.com, smtp.zoho.com, mail.yourdomain.com), port, and password.',
  },
};

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
    return { valid: false, reason: 'SMTP host must be a fully qualified domain name (e.g., smtp.fastmail.com).' };
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

export function buildWebmailComposeUrls(to: string, subject: string, body: string) {
  const encTo = encodeURIComponent(to);
  const encSub = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);

  return {
    gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encTo}&su=${encSub}&body=${encBody}`,
    outlookUrl: `https://outlook.live.com/mail/0/deeplink/compose?to=${encTo}&subject=${encSub}&body=${encBody}`,
    yahooUrl: `https://compose.mail.yahoo.com/?to=${encTo}&subject=${encSub}&body=${encBody}`,
    mailtoUrl: `mailto:${encTo}?subject=${encSub}&body=${encBody}`,
  };
}
