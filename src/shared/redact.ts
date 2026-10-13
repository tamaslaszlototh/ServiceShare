const BEARER = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE =
  /("?[A-Za-z0-9_-]*(?:token|refresh|secret)[A-Za-z0-9_-]*"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;

export const REDACTED = '[REDACTED]';

function maskValue(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return `${quote}${REDACTED}${quote}`;
  }
  return REDACTED;
}

export function redact(text: string): string {
  return text
    .replace(BEARER, `$1${REDACTED}`)
    .replace(KEY_VALUE, (_match, key: string, value: string) => `${key}${maskValue(value)}`);
}

export function redactAppError<T extends { message: string; details?: string }>(error: T): T {
  return {
    ...error,
    message: redact(error.message),
    ...(error.details === undefined ? {} : { details: redact(error.details) }),
  };
}
