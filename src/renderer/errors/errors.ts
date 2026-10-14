import { AppError, ErrorCode } from '@shared/types';
import { dictionaries, TranslationKey, Translator, interpolate } from '@shared/i18n';
import { ERROR_CODES, ErrorActionKind, actionSpecFor, translationKeyFor } from '@shared/error-catalogue';

export type { ErrorActionKind } from '@shared/error-catalogue';

const ERROR_KEYS: Record<ErrorCode, TranslationKey> = Object.fromEntries(
  ERROR_CODES.map((code) => [code, translationKeyFor(code)]),
) as Record<ErrorCode, TranslationKey>;

export function errorMessage(error: AppError, t?: Translator): string {
  const key = ERROR_KEYS[error.code];
  if (t) {
    try {
      return fillMissingParams(t(key), error.params);
    } catch {
      // fall through to default
    }
  }
  return error.message;
}

const MISSING_PARAM = /\s*\{(\w+)\}/g;

function fillMissingParams(template: string, params: AppError['params']): string {
  const interpolated = interpolate(template, params);
  return interpolated.replace(MISSING_PARAM, '').replace(/:\s*$/, '').trim();
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

export interface ErrorAction {
  kind: ErrorActionKind;
  label: string;
  href?: string;
}

export function errorAction(code: ErrorCode, t?: Translator): ErrorAction | null {
  const spec = actionSpecFor(code);
  if (!spec) {
    return null;
  }
  return {
    kind: spec.kind,
    label: t ? t(spec.labelKey) : dictionaries.en[spec.labelKey],
    href: spec.href,
  };
}
