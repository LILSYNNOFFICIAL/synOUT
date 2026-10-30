import {
  connectGoogleOAuthAccount,
  getEmailConnectionState,
} from './emailConnectionStore';
import { sendGmailMessage } from './gmailApi';
import { getAccessToken } from './googleAuth';
import { sessionFetch } from './sessionClient';
import { isJsonApiResponse, isStaticServerlessRuntime } from '../utils/serverlessRuntime';

export const OPERATOR_CONTACT_EMAIL = 'synovamedia@gmail.com';
export const OPERATOR_CONTACT_SUBJECT = 'synOUT MESSAGE';

export interface ContactFieldErrors {
  name?: string;
  email?: string;
  message?: string;
  form?: string;
}

export interface ClientContactSubmissionResult {
  success: boolean;
  accepted: boolean;
  messageId?: string;
  errorCode?: string;
  userMessage: string;
  errors?: ContactFieldErrors;
}

export interface ContactServiceStatusResponse {
  operatorProviderConfigured: boolean;
  providerKind: string;
}

const CLIENT_EMAIL_REGEX = /^[^\s@<>"'\\,;:\r\n]+@[^\s@<>"'\\,;:\r\n]+\.[a-zA-Z]{2,24}$/;

export function validateContactFieldsClient(input: {
  name: string;
  email: string;
  message: string;
}): { valid: boolean; errors: ContactFieldErrors } {
  const errors: ContactFieldErrors = {};
  const trimmedName = input.name.trim();
  const trimmedEmail = input.email.trim();
  const trimmedMessage = input.message.trim();

  if (!trimmedName) {
    errors.name = 'Please enter your name.';
  } else if (trimmedName.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (trimmedName.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }

  if (!trimmedEmail) {
    errors.email = 'Please enter your email address.';
  } else if (trimmedEmail.length > 160 || !CLIENT_EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = 'Please enter a valid email address (for example, yourname@email.com).';
  }

  if (!trimmedMessage) {
    errors.message = 'Please enter your message.';
  } else if (trimmedMessage.length < 10) {
    errors.message = 'Message must be at least 10 characters.';
  } else if (trimmedMessage.length > 4000) {
    errors.message = 'Message must be 4,000 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatOperatorContactBody(input: {
  name: string;
  email: string;
  message: string;
}): string {
  const submittedAt = new Date().toISOString();
  return [
    'synOUT Contact Submission',
    '------------------------------------------------------------',
    `Sender Name: ${input.name.trim()}`,
    `Reply-To Email: ${input.email.trim()}`,
    `Submitted At (UTC): ${submittedAt}`,
    '------------------------------------------------------------',
    '',
    input.message.trim(),
  ].join('\n');
}

function sanitizeContactErrorForUser(rawMessage: unknown, errorCode?: string): string {
  if (errorCode === 'EMAIL_PROVIDER_NOT_CONFIGURED' || errorCode === 'DIRECT_RELAY_REQUIRED') {
    return 'Select Sign in with Google & Send below or open your preferred email app to deliver your message directly to synovamedia@gmail.com.';
  }
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
    return 'Your message could not be sent automatically right now. Use one of the instant send options below.';
  }
  if (/CONTACT_SMTP_|CONTACT_RESEND_API_KEY|deployment secrets/i.test(rawMessage)) {
    return 'Select Sign in with Google & Send below or open your preferred email app to deliver your message directly to synovamedia@gmail.com.';
  }
  return rawMessage;
}

export async function fetchContactServiceStatusClient(): Promise<ContactServiceStatusResponse> {
  if (isStaticServerlessRuntime()) {
    return { operatorProviderConfigured: false, providerKind: 'static-serverless' };
  }
  try {
    const res = await sessionFetch('/api/contact/status', { method: 'GET' });
    if (!res.ok || !isJsonApiResponse(res)) {
      return { operatorProviderConfigured: false, providerKind: 'none' };
    }
    const data = await res.json().catch(() => null);
    return {
      operatorProviderConfigured: Boolean(data?.operatorProviderConfigured),
      providerKind: typeof data?.providerKind === 'string' ? data.providerKind : 'none',
    };
  } catch {
    return { operatorProviderConfigured: false, providerKind: 'none' };
  }
}

async function sendContactDirectlyViaBrowserGmail(
  oauthToken: string,
  params: { name: string; email: string; message: string }
): Promise<ClientContactSubmissionResult> {
  const body = formatOperatorContactBody(params);
  const sent = await sendGmailMessage(
    oauthToken,
    OPERATOR_CONTACT_EMAIL,
    OPERATOR_CONTACT_SUBJECT,
    body,
    undefined,
    undefined,
    params.email.trim()
  );
  return {
    success: true,
    accepted: true,
    messageId: sent.id,
    userMessage: 'Message sent successfully!',
  };
}

/**
 * Authenticates via Google OAuth popup and immediately transmits the validated contact
 * inquiry to `synovamedia@gmail.com` with subject `synOUT MESSAGE` and `Reply-To` set.
 * Works 100% serverlessly on GitHub Pages as well as full-stack deployments.
 */
export async function sendContactViaGooglePopupClient(params: {
  name: string;
  email: string;
  message: string;
}): Promise<ClientContactSubmissionResult> {
  const check = validateContactFieldsClient(params);
  if (!check.valid) {
    return {
      success: false,
      accepted: false,
      errorCode: 'VALIDATION_FAILED',
      userMessage: 'Please review the highlighted fields before sending.',
      errors: check.errors,
    };
  }

  const auth = await connectGoogleOAuthAccount({
    loginHint: params.email.trim() || undefined,
  });
  return sendContactDirectlyViaBrowserGmail(auth.accessToken, params);
}

export async function submitContactMessageClient(params: {
  name: string;
  email: string;
  message: string;
  honeypot?: string;
}): Promise<ClientContactSubmissionResult> {
  // Quietly accept honeypot bot submissions without transmitting
  if (params.honeypot && params.honeypot.trim().length > 0) {
    return {
      success: true,
      accepted: true,
      userMessage: 'Message sent successfully!',
    };
  }

  const connState = getEmailConnectionState();
  const credentialId =
    connState.smtp?.verified && connState.smtp.credentialId
      ? connState.smtp.credentialId
      : undefined;
  const cachedToken = await getAccessToken();
  const oauthToken = connState.oauthAccessToken || cachedToken || null;

  // 1. On full-stack hosts, try POST /api/contact first
  if (!isStaticServerlessRuntime()) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (oauthToken) {
      headers.Authorization = `Bearer ${oauthToken}`;
    }

    try {
      const res = await sessionFetch('/api/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: params.name,
          email: params.email,
          message: params.message,
          honeypot: params.honeypot || '',
          credentialId,
        }),
      });

      if (isJsonApiResponse(res)) {
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data?.accepted) {
          return {
            success: true,
            accepted: true,
            messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
            userMessage: 'Message sent successfully!',
          };
        }

        const errCode = typeof data?.errorCode === 'string' ? data.errorCode : 'DELIVERY_FAILED';
        if (errCode === 'VALIDATION_FAILED') {
          return {
            success: false,
            accepted: false,
            errorCode: errCode,
            userMessage:
              typeof data?.userMessage === 'string'
                ? data.userMessage
                : 'Please check the highlighted form fields.',
            errors: data?.errors && typeof data.errors === 'object' ? data.errors : undefined,
          };
        }

        // If backend provider isn't configured or blocked by proxy, fall back to direct browser Gmail API if token exists
        if (
          oauthToken &&
          (errCode === 'EMAIL_PROVIDER_NOT_CONFIGURED' || res.status === 403 || res.status === 503)
        ) {
          try {
            return await sendContactDirectlyViaBrowserGmail(oauthToken, params);
          } catch {
            // Fall through to sanitized relay guidance
          }
        }

        return {
          success: false,
          accepted: false,
          errorCode:
            errCode === 'EMAIL_PROVIDER_NOT_CONFIGURED' ? 'DIRECT_RELAY_REQUIRED' : errCode,
          userMessage: sanitizeContactErrorForUser(data?.userMessage, errCode),
          errors: data?.errors && typeof data.errors === 'object' ? data.errors : undefined,
        };
      }
    } catch {
      // Network / static-host unreachable — fall through to client-side Gmail API or direct send options
    }
  }

  // 2. Serverless / GitHub Pages path: transmit directly via browser Gmail API when signed in
  if (oauthToken) {
    try {
      return await sendContactDirectlyViaBrowserGmail(oauthToken, params);
    } catch (err) {
      return {
        success: false,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage:
          err instanceof Error
            ? `Google Gmail relay error: ${err.message}`
            : 'Could not send through your connected Google account. Try signing in again below.',
      };
    }
  }

  return {
    success: false,
    accepted: false,
    errorCode: 'DIRECT_RELAY_REQUIRED',
    userMessage:
      'Choose Sign in with Google & Send below or open your preferred email client to send your message directly to synovamedia@gmail.com.',
  };
}
