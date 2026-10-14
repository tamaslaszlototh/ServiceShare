import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLogLine, log, logError, logInfo } from './log';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatLogLine', () => {
  it('includes level, module and code', () => {
    const line = formatLogLine('info', 'youtube', 'INIT', 'started');
    expect(line).toMatch(/INFO youtube INIT — started/);
  });

  it('redacts secrets in the detail', () => {
    const line = formatLogLine('error', 'auth', 'REFRESH', 'refresh_token=1//0g');
    expect(line).not.toContain('1//0g');
    expect(line).toContain('[REDACTED]');
  });
});

describe('log', () => {
  it('routes levels to the matching console method', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logInfo('m', 'A');
    log('warn', 'm', 'B');
    logError('m', 'C', new Error('boom'));

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/boom/);
  });
});
