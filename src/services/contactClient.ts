import { getEmailConnectionState } from './emailConnectionStore';
import { getAccessToken } from './googleAuth';
import { sessionFetch } from './sessionClient';

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
    errors.email = 'Please enter a valid email address (for example, name@example.com).';
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

export async function fetchContactServiceStatusClient(): Promise<ContactServiceStatusResponse> {
  try {
    const res = await sessionFetch('/api/contact/status', { method: 'GET' });
    if (!res.ok) {
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

export async function submitContactMessageClient(params: {
  name: string;
  email: string;
  message: string;
  honeypot?: string;
}): Promise<ClientContactSubmissionResult> {
  const connState = getEmailConnectionState();
  const credentialId =
    connState.smtp?.verified && connState.smtp.credentialId
      ? connState.smtp.credentialId
      : undefined;
  const oauthToken = connState.mode === 'oauth' ? getAccessToken() : null;

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

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data?.accepted) {
      return {
        success: false,
        accepted: false,
        errorCode: typeof data?.errorCode === 'string' ? data.errorCode : 'DELIVERY_FAILED',
        userMessage:
          typeof data?.userMessage === 'string'
            ? data.userMessage
            : 'Your message could not be sent right now. Please try again.',
        errors: data?.errors && typeof data.errors === 'object' ? data.errors : undefined,
      };
    }

    return {
      success: true,
      accepted: true,
      messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
      userMessage: 'Message sent successfully!',
    };
  } catch {
    return {
      success: false,
      accepted: false,
      errorCode: 'NETWORK_ERROR',
      userMessage:
        'Unable to reach the synOUT contact service. Your message has been preserved—please check your connection and retry.',
    };
  }
}
