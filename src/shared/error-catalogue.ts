import { TranslationKey } from './i18n';

export const QUOTA_DOCS_URL = 'https://support.google.com/youtube/answer/6301186';
export const VERIFY_ACCOUNT_URL = 'https://support.google.com/youtube/answer/71673';

export type ErrorActionKind = 'retry' | 'recheck' | 'signin' | 'link';

export interface ErrorActionSpec {
  kind: ErrorActionKind;
  labelKey: TranslationKey;
  href?: string;
}

export interface ErrorCodeSpec {
  key: TranslationKey;
  action?: ErrorActionSpec;
}

function defineErrorCode(spec: ErrorCodeSpec): ErrorCodeSpec {
  return spec;
}

export const ERROR_CATALOGUE = {
  FormatError: defineErrorCode({ key: 'error.code.FormatError' }),
  CorruptFile: defineErrorCode({ key: 'error.code.CorruptFile' }),
  PermissionError: defineErrorCode({ key: 'error.code.PermissionError' }),
  DiskFull: defineErrorCode({ key: 'error.code.DiskFull' }),
  EngineError: defineErrorCode({
    key: 'error.code.EngineError',
    action: { kind: 'recheck', labelKey: 'error.action.recheck' },
  }),
  RenderError: defineErrorCode({
    key: 'error.code.RenderError',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  NetworkError: defineErrorCode({
    key: 'error.code.NetworkError',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  QuotaExceeded: defineErrorCode({
    key: 'error.code.QuotaExceeded',
    action: { kind: 'link', labelKey: 'error.action.quotas', href: QUOTA_DOCS_URL },
  }),
  AuthRevoked: defineErrorCode({
    key: 'error.code.AuthRevoked',
    action: { kind: 'signin', labelKey: 'error.action.signin' },
  }),
  UploadExpired: defineErrorCode({
    key: 'error.code.UploadExpired',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  TooLong: defineErrorCode({
    key: 'error.code.TooLong',
    action: { kind: 'link', labelKey: 'error.action.verify', href: VERIFY_ACCOUNT_URL },
  }),
  UnverifiedProject: defineErrorCode({
    key: 'error.code.UnverifiedProject',
    action: { kind: 'link', labelKey: 'error.action.verify', href: VERIFY_ACCOUNT_URL },
  }),
  TokenStorageError: defineErrorCode({
    key: 'error.code.TokenStorageError',
    action: { kind: 'signin', labelKey: 'error.action.signin' },
  }),
  NoClip: defineErrorCode({ key: 'error.code.NoClip' }),
  PublishInProgress: defineErrorCode({ key: 'error.code.PublishInProgress' }),
  CoverUnavailable: defineErrorCode({ key: 'error.code.CoverUnavailable' }),
  EmailSendError: defineErrorCode({
    key: 'error.code.EmailSendError',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  InternalError: defineErrorCode({ key: 'error.code.InternalError' }),
  NoRecipients: defineErrorCode({ key: 'error.code.NoRecipients' }),
  InvalidRecipient: defineErrorCode({ key: 'error.code.InvalidRecipient' }),
};

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export const ERROR_CODES = Object.keys(ERROR_CATALOGUE) as ErrorCode[];

export function translationKeyFor(code: ErrorCode): TranslationKey {
  return ERROR_CATALOGUE[code].key;
}

export function actionSpecFor(code: ErrorCode): ErrorActionSpec | undefined {
  return ERROR_CATALOGUE[code].action;
}
