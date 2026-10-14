import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import { normalizeError } from '@shared/apperror';
import { errorAction, errorLabel, errorMessage, localizedErrorLabel } from './errors';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

describe('errorMessage', () => {
  it('renders the catalogue message in the active language', () => {
    expect(errorMessage({ code: 'DiskFull', message: 'no space' }, tFor('en'))).toBe(
      'Not enough disk space to write the file',
    );
    expect(errorMessage({ code: 'DiskFull', message: 'no space' }, tFor('hu'))).toBe(
      'Nincs elég lemezterület a fájl írásához',
    );
  });

  it('interpolates the file path into permission errors', () => {
    const error = { code: 'PermissionError' as const, message: 'Cannot read file: /a.wav', params: { path: '/a.wav' } };
    expect(errorMessage(error, tFor('en'))).toBe('Cannot access the file: /a.wav');
    expect(errorMessage(error, tFor('hu'))).toBe('Nem sikerült hozzáférni a fájlhoz: /a.wav');
  });

  it('drops the path segment when the error carries no path', () => {
    const error = { code: 'PermissionError' as const, message: 'Cannot access the file' };
    expect(errorMessage(error, tFor('en'))).toBe('Cannot access the file');
    expect(errorMessage(error, tFor('hu'))).toBe('Nem sikerült hozzáférni a fájlhoz');
  });

  it('falls back to the English message without a translator', () => {
    expect(errorMessage({ code: 'NoClip', message: 'No clip loaded' })).toBe('No clip loaded');
  });
});

describe('localizedErrorLabel', () => {
  it('keeps the stable code tag next to the localized message', () => {
    expect(localizedErrorLabel({ code: 'NoClip', message: 'No clip loaded' }, tFor('hu'))).toBe(
      'NoClip: Nincs betöltött klip',
    );
  });
});

describe('errorLabel', () => {
  it('prefixes the code when the message does not already include it', () => {
    expect(errorLabel({ code: 'DiskFull', message: 'No space' })).toBe('DiskFull: No space');
  });

  it('does not double-prefix a message that already starts with the code', () => {
    expect(errorLabel({ code: 'FormatError', message: 'FormatError: only PCM WAV' })).toBe(
      'FormatError: only PCM WAV',
    );
  });
});

describe('normalizeError', () => {
  it('passes structured AppErrors through and redacts secrets', () => {
    expect(normalizeError({ code: 'AuthRevoked', message: 'refresh_token=abc' })).toEqual({
      code: 'AuthRevoked',
      message: 'refresh_token=[REDACTED]',
    });
  });

  it('wraps Error instances with the fallback code', () => {
    expect(normalizeError(new Error('boom'), 'RenderError')).toEqual({
      code: 'RenderError',
      message: 'boom',
    });
  });

  it('stringifies non-error rejections', () => {
    expect(normalizeError('kaboom')).toEqual({ code: 'EngineError', message: 'kaboom' });
  });
});

describe('errorAction', () => {
  it('offers an FFmpeg re-check for engine errors', () => {
    expect(errorAction('EngineError')).toMatchObject({ kind: 'recheck' });
  });

  it('offers a retry for transient failures', () => {
    expect(errorAction('NetworkError')).toMatchObject({ kind: 'retry' });
    expect(errorAction('RenderError')).toMatchObject({ kind: 'retry' });
    expect(errorAction('UploadExpired')).toMatchObject({ kind: 'retry' });
  });

  it('routes revoked auth back to sign-in', () => {
    expect(errorAction('AuthRevoked')).toMatchObject({ kind: 'signin' });
    expect(errorAction('TokenStorageError')).toMatchObject({ kind: 'signin' });
  });

  it('links quota and verification errors to their docs', () => {
    expect(errorAction('QuotaExceeded')).toMatchObject({ kind: 'link' });
    expect(errorAction('QuotaExceeded')?.href).toContain('http');
    expect(errorAction('UnverifiedProject')).toMatchObject({ kind: 'link' });
    expect(errorAction('TooLong')).toMatchObject({ kind: 'link' });
  });

  it('labels actions in the active language', () => {
    expect(errorAction('EngineError', tFor('en'))?.label).toBe('Re-check FFmpeg');
    expect(errorAction('EngineError', tFor('hu'))?.label).toBe('FFmpeg újraellenőrzése');
    expect(errorAction('NetworkError', tFor('hu'))?.label).toBe('Újra');
    expect(errorAction('AuthRevoked', tFor('hu'))?.label).toBe('Újra bejelentkezés');
  });

  it('has no action for purely informational failures', () => {
    expect(errorAction('FormatError')).toBeNull();
    expect(errorAction('CorruptFile')).toBeNull();
    expect(errorAction('DiskFull')).toBeNull();
    expect(errorAction('PermissionError')).toBeNull();
  });
});
