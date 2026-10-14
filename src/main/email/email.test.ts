import { describe, it, expect, vi, Mock } from 'vitest';
import { UploadHttpRequest } from '../publishing/upload';
import { GMAIL_SEND_URL, emailDepsIn, parseEmailSendRequest, sendEmail } from './email';
import { base64UrlEncode } from './mime';
import { AuthRevokedError } from '../core/errors';

function makeHttp(status: number, text = '{"id":"m1"}') {
  return vi.fn(async () => ({ status, headers: {}, text }));
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function depsWith(http: ReturnType<typeof makeHttp>) {
  return { http };
}

function callOf(http: Mock): UploadHttpRequest {
  return http.mock.calls[0][0] as UploadHttpRequest;
}

const OPTIONS = {
  accessToken: 'tok-123',
  message: {
    from: 'me@example.com',
    to: ['you@example.com'],
    subject: 'Árvíztűrő',
    body: 'Hello!\n\nhttps://youtu.be/abc',
  },
};

describe('sendEmail', () => {
  it('posts the base64url raw message to the Gmail send endpoint', async () => {
    const http = makeHttp(200);
    await sendEmail(OPTIONS, depsWith(http));

    expect(http).toHaveBeenCalledTimes(1);
    const call = callOf(http);
    expect(call.url).toBe(GMAIL_SEND_URL);
    expect(call.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer tok-123');
    expect(call.headers['Content-Type']).toBe('application/json; charset=UTF-8');

    const payload = JSON.parse(String(call.body)) as { raw: string };
    expect(payload.raw).not.toMatch(/[+/=]/);
    const mime = decodeBase64Url(payload.raw);
    expect(mime).toContain('From: me@example.com\r\n');
    expect(mime).toContain('To: you@example.com\r\n');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8\r\n');
    expect(mime.endsWith('\r\n\r\nHello!\r\n\r\nhttps://youtu.be/abc')).toBe(true);
  });

  it('honours a custom send URL for tests', async () => {
    const http = makeHttp(200);
    await sendEmail(OPTIONS, { http, sendUrl: 'https://example.test/send' });
    expect(callOf(http).url).toBe('https://example.test/send');
  });

  it('resolves on any 2xx response', async () => {
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(201)))).resolves.toBeUndefined();
  });

  it('maps 401 to AuthRevoked', async () => {
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(401)))).rejects.toMatchObject({
      code: 'AuthRevoked',
    });
  });

  it('maps a quota 403 to QuotaExceeded', async () => {
    const body = JSON.stringify({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } });
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(403, body)))).rejects.toMatchObject({
      code: 'QuotaExceeded',
    });
  });

  it('maps 429 to QuotaExceeded', async () => {
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(429)))).rejects.toMatchObject({
      code: 'QuotaExceeded',
    });
  });

  it('maps server failures to NetworkError', async () => {
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(503)))).rejects.toMatchObject({
      code: 'NetworkError',
    });
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(408)))).rejects.toMatchObject({
      code: 'NetworkError',
    });
  });

  it('maps everything else to EmailSendError', async () => {
    await expect(sendEmail(OPTIONS, depsWith(makeHttp(400)))).rejects.toMatchObject({
      code: 'EmailSendError',
    });
  });

  it('wraps transport failures as NetworkError', async () => {
    const http = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(sendEmail(OPTIONS, { http })).rejects.toMatchObject({ code: 'NetworkError' });
  });

  it('lets typed IPC errors from the transport through unchanged', async () => {
    const http = vi.fn(async () => {
      throw new AuthRevokedError('nope');
    });
    await expect(sendEmail(OPTIONS, { http })).rejects.toMatchObject({ code: 'AuthRevoked' });
  });
});

describe('parseEmailSendRequest', () => {
  it('accepts a well-formed message', () => {
    expect(parseEmailSendRequest({ to: ['a@b.co'], subject: 's', body: 'b' })).toEqual({
      status: 'ok',
      payload: { to: ['a@b.co'], subject: 's', body: 'b' },
    });
  });

  it('trims and deduplicates recipients case-insensitively', () => {
    expect(parseEmailSendRequest({ to: [' a@b.co ', 'A@B.CO', 'c@d.co'], subject: 's', body: 'b' })).toEqual({
      status: 'ok',
      payload: { to: ['a@b.co', 'c@d.co'], subject: 's', body: 'b' },
    });
  });

  it('rejects structural problems as an internal error', () => {
    const malformed = [
      null,
      'send',
      { to: ['a@b.co'], subject: '', body: 'b' },
      { to: ['a@b.co'], subject: 's' },
      { to: ['a@b.co', 42], subject: 's', body: 'b' },
      { to: 'a@b.co', subject: 's', body: 'b' },
    ];
    for (const request of malformed) {
      expect(parseEmailSendRequest(request)).toMatchObject({ status: 'error', error: { code: 'InternalError' } });
    }
  });

  it('reports an empty recipient list as NoRecipients', () => {
    expect(parseEmailSendRequest({ to: [], subject: 's', body: 'b' })).toMatchObject({
      status: 'error',
      error: { code: 'NoRecipients' },
    });
    expect(parseEmailSendRequest({ to: ['  '], subject: 's', body: 'b' })).toMatchObject({
      status: 'error',
      error: { code: 'NoRecipients' },
    });
  });

  it('reports malformed addresses as InvalidRecipient and never sends them', () => {
    expect(parseEmailSendRequest({ to: ['bad', 'also-bad'], subject: 's', body: 'b' })).toMatchObject({
      status: 'error',
      error: { code: 'InvalidRecipient', details: 'bad, also-bad' },
    });
    expect(parseEmailSendRequest({ to: ['a@b.co', 'bad'], subject: 's', body: 'b' })).toMatchObject({
      status: 'error',
      error: { code: 'InvalidRecipient', details: 'bad' },
    });
  });
});

describe('emailDepsIn', () => {
  it('provides a real HTTP function', async () => {
    const deps = emailDepsIn();
    expect(typeof deps.http).toBe('function');
    expect(deps.sendUrl).toBeUndefined();
  });
});

describe('base64UrlEncode agreement', () => {
  it('produces the same encoding the request body uses', async () => {
    const http = makeHttp(200);
    await sendEmail(OPTIONS, depsWith(http));
    const payload = JSON.parse(String(callOf(http).body)) as { raw: string };
    const rebuilt = base64UrlEncode(decodeBase64Url(payload.raw));
    expect(rebuilt).toBe(payload.raw);
  });
});
