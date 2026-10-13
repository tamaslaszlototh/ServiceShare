import { describe, it, expect } from 'vitest';
import { ERROR_CODES, isAppError, isErrorCode } from '@shared/apperror';
import type { ErrorCode } from '@shared/types';

const DOCUMENTED_CODES: Record<ErrorCode, true> = {
  FormatError: true,
  CorruptFile: true,
  PermissionError: true,
  DiskFull: true,
  EngineError: true,
  RenderError: true,
  NetworkError: true,
  QuotaExceeded: true,
  AuthRevoked: true,
  UploadExpired: true,
  TooLong: true,
  UnverifiedProject: true,
  TokenStorageError: true,
  NoClip: true,
  PublishInProgress: true,
  CoverUnavailable: true,
  InternalError: true,
};
import {
  AuthRevokedError,
  NetworkError,
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
  });

  it('exposes a structured AppError envelope', () => {
    expect(new TooLongError('12 min').toAppError()).toMatchObject({
      code: 'TooLong',
      details: '12 min',
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

  it('recognises every documented code', () => {
    const documented = Object.keys(DOCUMENTED_CODES) as ErrorCode[];
    for (const code of documented) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it('catalogues exactly the documented codes', () => {
    expect([...ERROR_CODES].sort()).toEqual(Object.keys(DOCUMENTED_CODES).sort());
  });

  it('recognises structured AppErrors', () => {
    expect(isAppError({ code: 'CorruptFile', message: 'x' })).toBe(true);
    expect(isAppError({ code: 'CorruptFile' })).toBe(false);
    expect(isAppError({ code: 'Nope', message: 'x' })).toBe(false);
  });
});
