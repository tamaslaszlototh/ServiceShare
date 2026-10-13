import { describe, it, expect } from 'vitest';
import { REDACTED, redact, redactAppError } from './redact';

describe('redact', () => {
  it('masks bearer tokens in headers', () => {
    expect(redact('Authorization: Bearer ya29.a0AfH6SM')).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it('masks JSON token/refresh/secret values', () => {
    const json = '{"access_token":"ya29.abc","refresh_token":"1//0g","client_secret":"shh"}';
    const out = redact(json);
    expect(out).not.toContain('ya29.abc');
    expect(out).not.toContain('1//0g');
    expect(out).not.toContain('shh');
    expect(out).toBe(
      `{"access_token":"${REDACTED}","refresh_token":"${REDACTED}","client_secret":"${REDACTED}"}`,
    );
  });

  it('masks form/query style values without eating the delimiter', () => {
    expect(redact('refresh_token=1//0g&x=1')).toBe(`refresh_token=${REDACTED}&x=1`);
    expect(redact('client_secret: shh')).toBe(`client_secret: ${REDACTED}`);
  });

  it('leaves prose that merely mentions the words alone', () => {
    expect(redact('The refresh token is invalid')).toBe('The refresh token is invalid');
    expect(redact('No secret here')).toBe('No secret here');
  });

  it('is case-insensitive about keys', () => {
    expect(redact('AccessToken=abc')).toBe(`AccessToken=${REDACTED}`);
  });
});

describe('redactAppError', () => {
  it('redacts both message and details while preserving shape', () => {
    const out = redactAppError({ code: 'AuthRevoked', message: 'refresh_token=abc', details: 'Bearer xyz' });
    expect(out).toEqual({ code: 'AuthRevoked', message: `refresh_token=${REDACTED}`, details: `Bearer ${REDACTED}` });
  });

  it('does not invent a details field', () => {
    expect(redactAppError({ code: 'EngineError', message: 'boom' })).toEqual({
      code: 'EngineError',
      message: 'boom',
    });
  });

  it('redacts secret material from string params', () => {
    const out = redactAppError({
      code: 'PermissionError',
      message: 'Cannot read file',
      params: { filePath: '/tmp/clip.wav', token: 'refresh_token=abc' },
    });
    expect(out.params).toEqual({ filePath: '/tmp/clip.wav', token: `refresh_token=${REDACTED}` });
  });

  it('leaves numeric params untouched', () => {
    const out = redactAppError({
      code: 'TooLong',
      message: 'too long',
      params: { minutes: 12, clip: 2 },
    });
    expect(out.params).toEqual({ minutes: 12, clip: 2 });
  });

  it('does not invent a params field', () => {
    const out = redactAppError({ code: 'PermissionError', message: 'x' });
    expect(out).not.toHaveProperty('params');
  });
});
