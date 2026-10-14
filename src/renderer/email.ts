import { Translator } from '@shared/i18n';
import { ErrorCode } from '@shared/types';
import { ErrorAction, errorAction } from './errors';

export const GMAIL_LIMITS_URL = 'https://support.google.com/mail/answer/14257';

const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export function defaultEmailSubject(title: string): string {
  return title.trim();
}

export function defaultEmailBody(url: string, t: Translator): string {
  return t('publish.emailDefaultBody', { url });
}

export function normalizeRecipient(input: string): string {
  return input.trim();
}

export function isRecipientValid(address: string): boolean {
  return EMAIL_PATTERN.test(address.trim());
}

export function canSendEmail(subject: string, body: string, recipients: string[]): boolean {
  const to = recipients.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (subject.trim().length === 0 || body.trim().length === 0 || to.length === 0) {
    return false;
  }
  return to.every(isRecipientValid);
}

export function emailErrorAction(code: ErrorCode, t: Translator): ErrorAction | null {
  if (code === 'QuotaExceeded') {
    return { kind: 'link', label: t('error.action.quotas'), href: GMAIL_LIMITS_URL };
  }
  return errorAction(code, t);
}
