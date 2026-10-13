import { AppError, ErrorCode, ErrorParams } from '@shared/types';
import { TranslationKey, Translator, interpolate } from '@shared/i18n';

export const QUOTA_DOCS_URL = 'https://support.google.com/youtube/answer/6301186';
export const VERIFY_ACCOUNT_URL = 'https://support.google.com/youtube/answer/71673';

const ERROR_KEYS: Record<ErrorCode, TranslationKey> = {
  FormatError: 'error.code.FormatError',
  CorruptFile: 'error.code.CorruptFile',
  PermissionError: 'error.code.PermissionError',
  DiskFull: 'error.code.DiskFull',
  EngineError: 'error.code.EngineError',
  RenderError: 'error.code.RenderError',
  NetworkError: 'error.code.NetworkError',
  QuotaExceeded: 'error.code.QuotaExceeded',
  AuthRevoked: 'error.code.AuthRevoked',
  UploadExpired: 'error.code.UploadExpired',
  TooLong: 'error.code.TooLong',
  UnverifiedProject: 'error.code.UnverifiedProject',
  TokenStorageError: 'error.code.TokenStorageError',
  NoClip: 'error.code.NoClip',
  PublishInProgress: 'error.code.PublishInProgress',
  CoverUnavailable: 'error.code.CoverUnavailable',
  InternalError: 'error.code.InternalError',
};

export function errorMessage(error: AppError, t?: Translator): string {
  const key = ERROR_KEYS[error.code];
  if (t) {
    try {
      return interpolate(t(key), error.params);
    } catch {
      // fall through to default
    }
  }
  return error.message;
}

export function errorLabel(error: AppError): string {
  return error.message.startsWith(error.code) ? error.message : `${error.code}: ${error.message}`;
}

export function localizedErrorLabel(error: AppError, t?: Translator): string {
  const msg = errorMessage(error, t);
  if (msg.startsWith(error.code)) {
    return msg;
  }
  return `${error.code}: ${msg}`;
}

export type ErrorActionKind = 'retry' | 'recheck' | 'signin' | 'link';

export interface ErrorAction {
  kind: ErrorActionKind;
  label: string;
  href?: string;
}

export function errorAction(code: ErrorCode, t?: Translator): ErrorAction | null {
  switch (code) {
    case 'EngineError':
      return { kind: 'recheck', label: t ? t('error.action.recheck') : 'Re-check FFmpeg' };
    case 'NetworkError':
    case 'RenderError':
    case 'UploadExpired':
      return { kind: 'retry', label: t ? t('error.action.retry') : 'Retry' };
    case 'QuotaExceeded':
      return { kind: 'link', label: t ? t('error.action.quotas') : 'About quotas', href: QUOTA_DOCS_URL };
    case 'UnverifiedProject':
    case 'TooLong':
      return { kind: 'link', label: t ? t('error.action.verify') : 'Verify your account', href: VERIFY_ACCOUNT_URL };
    case 'AuthRevoked':
    case 'TokenStorageError':
      return { kind: 'signin', label: t ? t('error.action.signin') : 'Sign in again' };
    default:
      return null;
  }
}
