import { Translator } from '@shared/i18n';
import { AppError, ErrorCode } from '@shared/types';
import { classifyRecipients, validateRecipients } from '@shared/recipients';
import { ErrorAction, errorAction } from '../errors/errors';

export const GMAIL_LIMITS_URL = 'https://support.google.com/mail/answer/14257';

export function defaultEmailSubject(title: string): string {
  return title.trim();
}

export function defaultEmailBody(url: string, t: Translator): string {
  return t('publish.emailDefaultBody', { url });
}

export function canSendEmail(subject: string, body: string, recipients: string[]): boolean {
  if (subject.trim().length === 0 || body.trim().length === 0) {
    return false;
  }
  return validateRecipients(recipients).length > 0;
}

export function recipientValidationError(recipients: string[]): AppError | null {
  const { valid, invalid } = classifyRecipients(recipients);
  if (valid.length === 0 && invalid.length === 0) {
    return { code: 'NoRecipients', message: 'No valid recipients provided' };
  }
  if (invalid.length > 0) {
    return {
      code: 'InvalidRecipient',
      message: `Invalid email address: ${invalid.join(', ')}`,
      details: invalid.join(', '),
    };
  }
  return null;
}

export function emailErrorAction(code: ErrorCode, t: Translator): ErrorAction | null {
  if (code === 'QuotaExceeded') {
    return { kind: 'link', label: t('error.action.quotas'), href: GMAIL_LIMITS_URL };
  }
  return errorAction(code, t);
}
