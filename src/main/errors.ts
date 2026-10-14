import { AppError, ErrorCode } from '@shared/types';
import { normalizeError } from '../shared/apperror';
import { redactAppError } from '../shared/redact';
import { TOO_LONG_MESSAGE } from '../shared/limits';

export class IpcError extends Error implements AppError {
  readonly code: ErrorCode;
  readonly details?: string;
  readonly params?: AppError['params'];

  constructor(code: ErrorCode, message: string, details?: string, params?: AppError['params']) {
    super(message);
    this.name = code;
    this.code = code;
    this.details = details;
    this.params = params;
  }

  toAppError(): AppError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
      ...(this.params === undefined ? {} : { params: this.params }),
    };
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
    super('DiskFull', 'Not enough disk space to write the file; free up space and try again', details);
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
    super('PermissionError', `Cannot read file: ${filePath}`, details, { path: filePath });
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

export class TooLongError extends IpcError {
  constructor(details?: string) {
    super('TooLong', TOO_LONG_MESSAGE, details);
  }
}

export class UnverifiedProjectError extends IpcError {
  constructor(details?: string) {
    super(
      'UnverifiedProject',
      'YouTube restricted this upload because the Google project is not verified',
      details,
    );
  }
}

export class EmailSendError extends IpcError {
  constructor(message = 'Sending the email failed', details?: string) {
    super('EmailSendError', message, details);
  }
}

export class NoRecipientsError extends IpcError {
  constructor(details?: string) {
    super('NoRecipients', 'No valid recipients provided', details);
  }
}

export class InvalidRecipientError extends IpcError {
  constructor(details?: string) {
    super('InvalidRecipient', 'Invalid email address', details);
  }
}

export function toAppError(error: unknown, fallbackCode: ErrorCode = 'EngineError'): AppError {
  if (error instanceof IpcError) {
    return redactAppError(error.toAppError());
  }
  return normalizeError(error, fallbackCode);
}
