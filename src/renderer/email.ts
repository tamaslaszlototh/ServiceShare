import { Translator } from '@shared/i18n';
import { AppError, ErrorCode } from '@shared/types';
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

export function parseRecipients(input: string): string[] {
  if (input.trim().length === 0) {
    return [];
  }
  return input
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeRecipients(recipients: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of recipients) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export function validateRecipients(recipients: string[]): string[] {
  return normalizeRecipients(recipients).filter((entry) => isRecipientValid(entry));
}

export function canSendEmail(subject: string, body: string, recipients: string[]): boolean {
  if (subject.trim().length === 0 || body.trim().length === 0) {
    return false;
  }
  return validateRecipients(recipients).length > 0;
}

export function recipientValidationError(recipients: string[]): AppError | null {
  const normalized = normalizeRecipients(recipients);
  if (normalized.length === 0) {
    return { code: 'NoRecipients', message: 'No valid recipients provided' };
  }
  const invalid = normalized.filter((address) => !isRecipientValid(address));
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
