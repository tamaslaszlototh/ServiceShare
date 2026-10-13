import { describe, it, expect } from 'vitest';
import { normalizeError } from '@shared/apperror';
import { errorAction, errorLabel } from './errors';

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

  it('has no action for purely informational failures', () => {
    expect(errorAction('FormatError')).toBeNull();
    expect(errorAction('CorruptFile')).toBeNull();
    expect(errorAction('DiskFull')).toBeNull();
    expect(errorAction('PermissionError')).toBeNull();
  });
});
