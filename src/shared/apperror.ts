import { AppError, ErrorCode } from './types';
import { redactAppError } from './redact';

export const ERROR_CODES: ErrorCode[] = [
  'FormatError',
  'CorruptFile',
  'PermissionError',
  'DiskFull',
  'EngineError',
  'RenderError',
  'NetworkError',
  'QuotaExceeded',
  'AuthRevoked',
  'UploadExpired',
  'TooLong',
  'UnverifiedProject',
  'TokenStorageError',
  'NoClip',
  'PublishInProgress',
  'CoverUnavailable',
  'EmailSendError',
  'InternalError',
];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as string[]).includes(value);
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    isErrorCode((value as { code?: unknown }).code) &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

export function normalizeError(error: unknown, fallbackCode: ErrorCode = 'EngineError'): AppError {
  if (isAppError(error)) {
    return redactAppError(error);
  }
  return redactAppError({
    code: fallbackCode,
    message: error instanceof Error ? error.message : String(error),
  });
}
