import {
  AuthRevokedError,
  EmailSendError,
  IpcError,
  InvalidRecipientError,
  NetworkError,
  NoRecipientsError,
  QuotaExceededError,
} from '../core/errors';
import { MimeMessage, base64UrlEncode, buildMime } from './mime';
import { UploadHttp, apiErrorReason, isRetriableStatus, nodeUploadHttp } from '../publishing/upload';
import { classifyRecipients } from '../../shared/recipients';

export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface SendEmailOptions {
  accessToken: string;
  message: MimeMessage;
}

export interface EmailDeps {
  http: UploadHttp;
  sendUrl?: string;
}

export interface EmailSendPayload {
  to: string[];
  subject: string;
  body: string;
}

export type EmailParseResult =
  | { status: 'ok'; payload: EmailSendPayload }
  | { status: 'error'; error: IpcError };

function malformedRequest(): EmailParseResult {
  return {
    status: 'error',
    error: new IpcError('InternalError', 'sendEmail expects { to, subject, body }'),
  };
}

export function parseEmailSendRequest(request: unknown): EmailParseResult {
  if (typeof request !== 'object' || request === null) {
    return malformedRequest();
  }
  const { to, subject, body } = request as { to?: unknown; subject?: unknown; body?: unknown };
  if (!Array.isArray(to) || !to.every((entry) => typeof entry === 'string')) {
    return malformedRequest();
  }
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return malformedRequest();
  }
  if (typeof body !== 'string' || body.trim().length === 0) {
    return malformedRequest();
  }
  const { valid, invalid } = classifyRecipients(to as string[]);
  if (valid.length === 0 && invalid.length === 0) {
    return { status: 'error', error: new NoRecipientsError() };
  }
  if (invalid.length > 0) {
    return { status: 'error', error: new InvalidRecipientError(invalid.join(', ')) };
  }
  return { status: 'ok', payload: { to: valid, subject, body } };
}

export function classifyEmailStatus(status: number, body: string): IpcError {
  if (status === 401) {
    return new AuthRevokedError(body);
  }
  if (status === 429) {
    return new QuotaExceededError(body);
  }
  if (status === 403) {
    const reason = apiErrorReason(body) ?? '';
    if (/quota|rate|limit/i.test(`${reason} ${body}`)) {
      return new QuotaExceededError(body);
    }
    return new EmailSendError('Gmail refused to send the message', body);
  }
  if (isRetriableStatus(status)) {
    return new NetworkError(`Email send failed with status ${status}`, body);
  }
  return new EmailSendError(`Email send failed with status ${status}`, body);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function sendEmail(options: SendEmailOptions, deps: EmailDeps): Promise<void> {
  const raw = base64UrlEncode(buildMime(options.message));

  let response;
  try {
    response = await deps.http({
      url: deps.sendUrl ?? GMAIL_SEND_URL,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ raw }),
    });
  } catch (error) {
    if (error instanceof IpcError) {
      throw error;
    }
    throw new NetworkError('The email request failed', messageOf(error));
  }

  if (response.status >= 200 && response.status < 300) {
    return;
  }
  throw classifyEmailStatus(response.status, response.text);
}

export function emailDepsIn(): EmailDeps {
  return { http: nodeUploadHttp };
}
