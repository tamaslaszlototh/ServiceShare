import { AppError, ErrorCode } from '@shared/types';

export const QUOTA_DOCS_URL = 'https://support.google.com/youtube/answer/6301186';
export const VERIFY_ACCOUNT_URL = 'https://support.google.com/youtube/answer/71673';

export function errorLabel(error: AppError): string {
  return error.message.startsWith(error.code) ? error.message : `${error.code}: ${error.message}`;
}

export type ErrorActionKind = 'retry' | 'recheck' | 'signin' | 'link';

export interface ErrorAction {
  kind: ErrorActionKind;
  label: string;
  href?: string;
}

export function errorAction(code: ErrorCode): ErrorAction | null {
  switch (code) {
    case 'EngineError':
      return { kind: 'recheck', label: 'Re-check FFmpeg' };
    case 'NetworkError':
    case 'RenderError':
    case 'UploadExpired':
      return { kind: 'retry', label: 'Retry' };
    case 'QuotaExceeded':
      return { kind: 'link', label: 'About quotas', href: QUOTA_DOCS_URL };
    case 'UnverifiedProject':
    case 'TooLong':
      return { kind: 'link', label: 'Verify your account', href: VERIFY_ACCOUNT_URL };
    case 'AuthRevoked':
    case 'TokenStorageError':
      return { kind: 'signin', label: 'Sign in again' };
    default:
      return null;
  }
}
