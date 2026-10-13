import { redact } from '@shared/redact';

export type LogLevel = 'info' | 'warn' | 'error';

function detailToString(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  if (detail instanceof Error) {
    return detail.message;
  }
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

export function formatLogLine(level: LogLevel, module: string, code: string, detail?: string): string {
  const suffix = detail ? ` — ${detail}` : '';
  return redact(`${new Date().toISOString()} ${level.toUpperCase()} ${module} ${code}${suffix}`);
}

export function log(level: LogLevel, module: string, code: string, detail?: unknown): void {
  const line = formatLogLine(level, module, code, detailToString(detail));
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(module: string, code: string, detail?: unknown): void {
  log('info', module, code, detail);
}

export function logError(module: string, code: string, detail?: unknown): void {
  log('error', module, code, detail);
}
