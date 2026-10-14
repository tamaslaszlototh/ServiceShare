import { describe, it, expect } from 'vitest';
import { ERROR_CODES, isAppError, isErrorCode } from '@shared/apperror';
import { translationKeyFor } from '@shared/error-catalogue';
import { LOCALES, dictionaries } from '@shared/i18n';
import {
  AuthRevokedError,
  EmailSendError,
  InvalidRecipientError,
  NetworkError,
  NoRecipientsError,
  PermissionError,
  TooLongError,
  UnverifiedProjectError,
  UploadExpiredError,
  toAppError,
} from './errors';

describe('catalogue error classes', () => {
  it('carry their catalogue code', () => {
    expect(new TooLongError().code).toBe('TooLong');
    expect(new UnverifiedProjectError().code).toBe('UnverifiedProject');
    expect(new UploadExpiredError().code).toBe('UploadExpired');
    expect(new NetworkError().code).toBe('NetworkError');
    expect(new AuthRevokedError().code).toBe('AuthRevoked');
    expect(new EmailSendError().code).toBe('EmailSendError');
    expect(new NoRecipientsError().code).toBe('NoRecipients');
    expect(new InvalidRecipientError().code).toBe('InvalidRecipient');
  });

  it('exposes a structured AppError envelope', () => {
    expect(new TooLongError('12 min').toAppError()).toMatchObject({
      code: 'TooLong',
      details: '12 min',
    });
  });

  it('carries the offending path as a parameter on permission errors', () => {
    expect(new PermissionError('/locked/a.wav').toAppError()).toMatchObject({
      code: 'PermissionError',
      params: { path: '/locked/a.wav' },
    });
  });
});

describe('toAppError', () => {
  it('passes through typed ipc errors', () => {
    expect(toAppError(new NetworkError('offline'))).toMatchObject({
      code: 'NetworkError',
      message: 'offline',
    });
  });

  it('accepts an already-structured AppError', () => {
    expect(toAppError({ code: 'DiskFull', message: 'no space' })).toMatchObject({
      code: 'DiskFull',
      message: 'no space',
    });
  });

  it('wraps unknown errors with the fallback code', () => {
    expect(toAppError(new Error('boom'), 'RenderError')).toMatchObject({
      code: 'RenderError',
      message: 'boom',
    });
  });

  it('redacts token/refresh/secret material from message and details', () => {
    const out = toAppError(new Error('refresh_token=1//0g'));
    expect(out.message).not.toContain('1//0g');
    expect(out.message).toContain('[REDACTED]');
    expect(toAppError(new AuthRevokedError('Bearer ya29.abc')).details).not.toContain('ya29.abc');
  });
});

describe('guards', () => {
  it('recognises catalogue codes', () => {
    expect(isErrorCode('TooLong')).toBe(true);
    expect(isErrorCode('Nope')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });

  it('recognises every catalogue code', () => {
    for (const code of ERROR_CODES) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it('exposes a translation for every catalogue code in every locale', () => {
    for (const code of ERROR_CODES) {
      const key = translationKeyFor(code);
      for (const locale of LOCALES) {
        expect(dictionaries[locale][key]).toBeTruthy();
      }
    }
  });

  it('recognises structured AppErrors', () => {
    expect(isAppError({ code: 'CorruptFile', message: 'x' })).toBe(true);
    expect(isAppError({ code: 'CorruptFile' })).toBe(false);
    expect(isAppError({ code: 'Nope', message: 'x' })).toBe(false);
  });
});
