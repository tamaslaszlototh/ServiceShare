import { AppError, ErrorCode } from '@shared/types';

export class IpcError extends Error implements AppError {
  readonly code: ErrorCode;
  readonly details?: string;

  constructor(code: ErrorCode, message: string, details?: string) {
    super(message);
    this.name = code;
    this.code = code;
    this.details = details;
  }

  toAppError(): AppError {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class EngineError extends IpcError {
  constructor(message: string, details?: string) {
    super('EngineError', message, details);
  }
}

export class RenderError extends IpcError {
  constructor(message = 'Export failed', details?: string) {
    super('RenderError', message, details);
  }
}

export class DiskFullError extends IpcError {
  constructor(details?: string) {
    super('DiskFull', 'Not enough disk space to write the export', details);
  }
}

export const FORMAT_ERROR_MESSAGE = 'FormatError: only PCM WAV is editable';

export class FormatError extends IpcError {
  constructor(details?: string) {
    super('FormatError', FORMAT_ERROR_MESSAGE, details);
  }
}

export class CorruptFileError extends IpcError {
  constructor(message = 'The file appears to be corrupt or truncated', details?: string) {
    super('CorruptFile', message, details);
  }
}

export class PermissionError extends IpcError {
  constructor(filePath: string, details?: string) {
    super('PermissionError', `Cannot read file: ${filePath}`, details);
  }
}

export class AuthRevokedError extends IpcError {
  constructor(details?: string) {
    super('AuthRevoked', 'Authentication was revoked or is invalid', details);
  }
}

export class TokenStorageError extends IpcError {
  constructor(details?: string) {
    super('TokenStorageError', 'Failed to access secure token storage', details);
  }
}

export class NetworkError extends IpcError {
  constructor(message = 'The upload lost its network connection', details?: string) {
    super('NetworkError', message, details);
  }
}

export class QuotaExceededError extends IpcError {
  constructor(details?: string) {
    super('QuotaExceeded', 'YouTube upload quota exhausted for today', details);
  }
}

export class UploadExpiredError extends IpcError {
  constructor(message = 'The upload session expired', details?: string) {
    super('UploadExpired', message, details);
  }
}

export function toAppError(error: unknown, fallbackCode: ErrorCode = 'CorruptFile'): AppError {
  if (error instanceof IpcError) {
    return error.toAppError();
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : String(error),
  };
}
