export const QUOTA_DOCS_URL = 'https://support.google.com/youtube/answer/6301186';
export const VERIFY_ACCOUNT_URL = 'https://support.google.com/youtube/answer/71673';

export type ErrorActionKind = 'retry' | 'recheck' | 'signin' | 'link';

export type ErrorActionLabelKey =
  | 'error.action.retry'
  | 'error.action.recheck'
  | 'error.action.signin'
  | 'error.action.quotas'
  | 'error.action.verify';

export interface ErrorActionSpec {
  kind: ErrorActionKind;
  labelKey: ErrorActionLabelKey;
  href?: string;
}

export interface ErrorCodeSpec {
  en: string;
  hu: string;
  params?: readonly string[];
  action?: ErrorActionSpec;
}

function defineErrorCode(spec: ErrorCodeSpec): ErrorCodeSpec {
  return spec;
}

export const ERROR_CATALOGUE = {
  FormatError: defineErrorCode({
    en: 'Only PCM WAV files are supported',
    hu: 'Csak PCM WAV fájlok támogatottak',
  }),
  CorruptFile: defineErrorCode({
    en: 'The file appears to be corrupt or truncated',
    hu: 'A fájl sérültnek vagy csonkoltnak tűnik',
  }),
  PermissionError: defineErrorCode({
    en: 'Cannot access the file: {path}',
    hu: 'Nem sikerült hozzáférni a fájlhoz: {path}',
    params: ['path'],
  }),
  DiskFull: defineErrorCode({
    en: 'Not enough disk space to write the file',
    hu: 'Nincs elég lemezterület a fájl írásához',
  }),
  EngineError: defineErrorCode({
    en: 'The audio engine encountered an error',
    hu: 'Hiba történt a hangmotornál',
    action: { kind: 'recheck', labelKey: 'error.action.recheck' },
  }),
  RenderError: defineErrorCode({
    en: 'Rendering failed',
    hu: 'A renderelés nem sikerült',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  NetworkError: defineErrorCode({
    en: 'Network connection lost',
    hu: 'A hálózati kapcsolat megszakadt',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  QuotaExceeded: defineErrorCode({
    en: 'YouTube upload quota exhausted for today',
    hu: 'A YouTube feltöltési kvóta ma kimerült',
    action: { kind: 'link', labelKey: 'error.action.quotas', href: QUOTA_DOCS_URL },
  }),
  AuthRevoked: defineErrorCode({
    en: 'Authentication was revoked or is invalid',
    hu: 'A hitelesítés érvényét vesztette',
    action: { kind: 'signin', labelKey: 'error.action.signin' },
  }),
  UploadExpired: defineErrorCode({
    en: 'The upload session expired',
    hu: 'A feltöltési munkamenet lejárt',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  TooLong: defineErrorCode({
    en: 'Videos longer than 15 minutes may require a verified account',
    hu: '15 percnél hosszabb videókhoz hitelesített fiók szükséges',
    action: { kind: 'link', labelKey: 'error.action.verify', href: VERIFY_ACCOUNT_URL },
  }),
  UnverifiedProject: defineErrorCode({
    en: 'The Google project is not verified for YouTube uploads',
    hu: 'A Google-projekt nincs hitelesítve YouTube feltöltésekhez',
    action: { kind: 'link', labelKey: 'error.action.verify', href: VERIFY_ACCOUNT_URL },
  }),
  TokenStorageError: defineErrorCode({
    en: 'Failed to access secure token storage',
    hu: 'Nem sikerült elérni a biztonságos token-tárolót',
    action: { kind: 'signin', labelKey: 'error.action.signin' },
  }),
  NoClip: defineErrorCode({
    en: 'No clip loaded',
    hu: 'Nincs betöltött klip',
  }),
  PublishInProgress: defineErrorCode({
    en: 'A publish is already in progress',
    hu: 'Egy közzététel már folyamatban van',
  }),
  CoverUnavailable: defineErrorCode({
    en: 'Cover preview is not available',
    hu: 'A borító előnézete nem érhető el',
  }),
  EmailSendError: defineErrorCode({
    en: 'The email could not be sent',
    hu: 'Az e-mailt nem sikerült elküldeni',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  UpdateError: defineErrorCode({
    en: 'The app could not be updated',
    hu: 'Nem sikerült frissíteni az alkalmazást',
    action: { kind: 'retry', labelKey: 'error.action.retry' },
  }),
  InternalError: defineErrorCode({
    en: 'An internal error occurred',
    hu: 'Belső hiba történt',
  }),
  NoRecipients: defineErrorCode({
    en: 'No valid recipients provided',
    hu: 'Nincs érvényes címzett',
  }),
  InvalidRecipient: defineErrorCode({
    en: 'Invalid email address',
    hu: 'Érvénytelen e-mail cím',
  }),
};

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export const ERROR_CODES = Object.keys(ERROR_CATALOGUE) as ErrorCode[];

export type ErrorCodeTranslationKey = `error.code.${ErrorCode}`;

export function translationKeyFor(code: ErrorCode): ErrorCodeTranslationKey {
  return `error.code.${code}`;
}

export function actionSpecFor(code: ErrorCode): ErrorActionSpec | undefined {
  return ERROR_CATALOGUE[code].action;
}
