import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import {
  GMAIL_LIMITS_URL,
  canSendEmail,
  defaultEmailBody,
  defaultEmailSubject,
  emailErrorAction,
  isRecipientValid,
  normalizeRecipient,
} from './email';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

describe('defaultEmailSubject', () => {
  it('uses the video title trimmed', () => {
    expect(defaultEmailSubject('  My Song  ')).toBe('My Song');
  });
});

describe('defaultEmailBody', () => {
  it('pre-fills a greeting plus the video URL', () => {
    expect(defaultEmailBody('https://youtu.be/abc', tFor('en'))).toBe('Hello!\n\nhttps://youtu.be/abc');
    expect(defaultEmailBody('https://youtu.be/abc', tFor('hu'))).toBe('Helló!\n\nhttps://youtu.be/abc');
  });
});

describe('normalizeRecipient', () => {
  it('trims surrounding whitespace from pasted addresses', () => {
    expect(normalizeRecipient('  a@b.co ')).toBe('a@b.co');
  });
});

describe('isRecipientValid', () => {
  it('accepts plainly formatted addresses', () => {
    expect(isRecipientValid('a@b.co')).toBe(true);
    expect(isRecipientValid('first.last+tag@sub.example.co')).toBe(true);
  });

  it('rejects malformed or empty addresses', () => {
    expect(isRecipientValid('')).toBe(false);
    expect(isRecipientValid('nope')).toBe(false);
    expect(isRecipientValid('a@b')).toBe(false);
    expect(isRecipientValid('a b@c.co')).toBe(false);
  });
});

describe('canSendEmail', () => {
  it('allows sending when subject, body and a valid recipient are present', () => {
    expect(canSendEmail('My Song', 'Hello!\n\nhttps://youtu.be/abc', ['you@example.com'])).toBe(true);
    expect(canSendEmail(' My Song ', ' body ', [' you@example.com '])).toBe(true);
  });

  it('blocks an empty subject, body or recipient list', () => {
    expect(canSendEmail('', 'body', ['you@example.com'])).toBe(false);
    expect(canSendEmail('subject', '   ', ['you@example.com'])).toBe(false);
    expect(canSendEmail('subject', 'body', [])).toBe(false);
    expect(canSendEmail('subject', 'body', ['  '])).toBe(false);
  });

  it('blocks malformed recipients', () => {
    expect(canSendEmail('subject', 'body', ['not-an-address'])).toBe(false);
  });
});

describe('emailErrorAction', () => {
  it('links Gmail quota failures to the Gmail sending limits, not the YouTube quota docs', () => {
    const action = emailErrorAction('QuotaExceeded', tFor('en'));
    expect(action).toMatchObject({ kind: 'link', href: GMAIL_LIMITS_URL });
    expect(action?.href).toContain('support.google.com/mail');
    expect(action?.label).toBe('About quotas');
    expect(emailErrorAction('QuotaExceeded', tFor('hu'))?.label).toBe('Kvóták nézése');
  });

  it('delegates every other code to the shared error actions', () => {
    expect(emailErrorAction('EmailSendError', tFor('en'))).toMatchObject({ kind: 'retry' });
    expect(emailErrorAction('AuthRevoked', tFor('en'))).toMatchObject({ kind: 'signin' });
    expect(emailErrorAction('NetworkError', tFor('en'))).toMatchObject({ kind: 'retry' });
    expect(emailErrorAction('FormatError', tFor('en'))).toBeNull();
  });
});
