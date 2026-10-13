import { describe, it, expect, vi } from 'vitest';
import {
  MAX_ATTEMPTS,
  UploadDeps,
  UploadHttpRequest,
  UploadHttpResponse,
  UploadOptions,
  UploadCancelled,
  backoffDelay,
  isRetriableStatus,
  resumableUpload,
} from './upload';

const SOURCE = { path: '/tmp/out.mp4', size: 1024, contentType: 'video/mp4' };

function options(over: Partial<UploadOptions> = {}): UploadOptions {
  return {
    accessToken: 'token-123',
    metadata: { title: 'My Clip', description: 'desc', tags: ['a', 'b'], privacyStatus: 'unlisted' },
    source: SOURCE,
    ...over,
  };
}

function response(over: Partial<UploadHttpResponse> = {}): UploadHttpResponse {
  return { status: 200, headers: {}, text: '{"id":"vid42"}', ...over };
}

function makeDeps(over: Partial<UploadDeps> = {}): UploadDeps & {
  http: ReturnType<typeof vi.fn>;
  sleep: ReturnType<typeof vi.fn>;
} {
  return {
    http: vi.fn(async (req: UploadHttpRequest) =>
      req.method === 'POST'
        ? { status: 200, headers: { location: 'https://up/1' }, text: '' }
        : response(),
    ),
    sleep: vi.fn(async () => {}),
    random: () => 0.5,
    openBody: () => new Uint8Array([1, 2, 3]),
    ...over,
  } as UploadDeps & { http: ReturnType<typeof vi.fn>; sleep: ReturnType<typeof vi.fn> };
}

function callsOf(deps: UploadDeps): UploadHttpRequest[] {
  return (deps.http as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as UploadHttpRequest);
}

describe('backoff', () => {
  it('grows exponentially and is capped', () => {
    expect(backoffDelay(0, () => 0.5)).toBe(1000);
    expect(backoffDelay(1, () => 0.5)).toBe(2000);
    expect(backoffDelay(10, () => 0.5)).toBe(32000);
  });

  it('stays non-negative under jitter', () => {
    expect(backoffDelay(0, () => 0)).toBeGreaterThanOrEqual(0);
    expect(backoffDelay(0, () => 1)).toBeGreaterThanOrEqual(0);
  });
});

describe('isRetriableStatus', () => {
  it('retries throttling, timeouts and server errors', () => {
    expect(isRetriableStatus(429)).toBe(true);
    expect(isRetriableStatus(408)).toBe(true);
    expect(isRetriableStatus(500)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
    expect(isRetriableStatus(404)).toBe(false);
    expect(isRetriableStatus(403)).toBe(false);
  });
});

describe('resumableUpload', () => {
  it('starts a session with the metadata body and upload headers', async () => {
    const deps = makeDeps();
    await resumableUpload(options(), deps);

    const init = callsOf(deps)[0];
    expect(init.url).toContain('uploadType=resumable');
    expect(init.url).toContain('part=snippet%2Cstatus');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(init.headers['X-Upload-Content-Type']).toBe('video/mp4');
    expect(init.headers['X-Upload-Content-Length']).toBe('1024');
    expect(JSON.parse(init.body as string)).toMatchObject({
      snippet: { title: 'My Clip', description: 'desc', tags: ['a', 'b'] },
      status: { privacyStatus: 'unlisted' },
    });
  });

  it('PUTs the whole body to the returned session URI and parses the video id', async () => {
    const deps = makeDeps({
      http: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/1' }, text: '' })
        .mockResolvedValueOnce(response({ status: 201 })),
    });

    const result = await resumableUpload(options(), deps);

    expect(result).toEqual({ videoId: 'vid42', url: 'https://youtu.be/vid42' });
    const put = callsOf(deps)[1];
    expect(put.url).toBe('https://up/1');
    expect(put.method).toBe('PUT');
    expect(put.headers['Content-Type']).toBe('video/mp4');
    expect(put.headers['Content-Length']).toBe('1024');
  });

  it('forwards byte progress updates', async () => {
    const deps = makeDeps({
      http: vi.fn(async (req: UploadHttpRequest) => {
        if (req.method === 'POST') return { status: 200, headers: { location: 'https://up/1' }, text: '' };
        req.onProgress?.(50);
        return response();
      }),
    });
    const percents: number[] = [];

    await resumableUpload(options({ onProgress: (p) => percents.push(p) }), deps);

    expect(percents).toContain(50);
  });

  it('spins with exponential backoff on 5xx and eventually succeeds', async () => {
    const deps = makeDeps({
      http: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/1' }, text: '' })
        .mockResolvedValueOnce({ status: 503, headers: {}, text: 'busy' })
        .mockResolvedValueOnce(response({ status: 200 })),
    });

    const result = await resumableUpload(options(), deps);

    expect(result.videoId).toBe('vid42');
    expect(deps.sleep).toHaveBeenCalledTimes(1);
    expect(deps.sleep).toHaveBeenCalledWith(backoffDelay(0, () => 0.5));
  });

  it('retries transport (network) failures', async () => {
    const deps = makeDeps({
      http: vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/1' }, text: '' })
        .mockResolvedValueOnce(response({ status: 200 })),
    });

    const result = await resumableUpload(options(), deps);

    expect(result.videoId).toBe('vid42');
    expect(deps.sleep).toHaveBeenCalledTimes(1);
  });

  it('restarts from a fresh session when the URI expires (404)', async () => {
    const deps = makeDeps({
      http: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/1' }, text: '' })
        .mockResolvedValueOnce({ status: 404, headers: {}, text: 'expired' })
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/2' }, text: '' })
        .mockResolvedValueOnce(response({ status: 200 })),
    });

    const result = await resumableUpload(options(), deps);

    expect(result.videoId).toBe('vid42');
    const putUrls = callsOf(deps).filter((c) => c.method === 'PUT').map((c) => c.url);
    expect(putUrls).toEqual(['https://up/1', 'https://up/2']);
  });

  it('raises NetworkError after exhausting attempts', async () => {
    const deps = makeDeps({ http: vi.fn(async () => ({ status: 503, headers: {}, text: 'busy' })) });

    await expect(resumableUpload(options(), deps)).rejects.toMatchObject({ code: 'NetworkError' });
    expect((deps.http as ReturnType<typeof vi.fn>).mock.calls.length).toBe(MAX_ATTEMPTS);
  });

  it('maps a quota 403 to QuotaExceeded with the API reason and does not retry', async () => {
    const body = JSON.stringify({
      error: { code: 403, errors: [{ reason: 'quotaExceeded' }], message: 'quota' },
    });
    const deps = makeDeps({
      http: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/1' }, text: '' })
        .mockResolvedValueOnce({ status: 403, headers: {}, text: body }),
    });

    await expect(resumableUpload(options(), deps)).rejects.toMatchObject({ code: 'QuotaExceeded' });
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('maps a non-quota 403 to PermissionError and does not retry', async () => {
    const body = JSON.stringify({ error: { code: 403, errors: [{ reason: 'forbidden' }] } });
    const deps = makeDeps({
      http: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, headers: { location: 'https://up/1' }, text: '' })
        .mockResolvedValueOnce({ status: 403, headers: {}, text: body }),
    });

    await expect(resumableUpload(options(), deps)).rejects.toMatchObject({ code: 'PermissionError' });
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('maps a 401 to AuthRevoked', async () => {
    const deps = makeDeps({
      http: vi
        .fn()
        .mockResolvedValueOnce({ status: 401, headers: {}, text: 'unauthorized' }),
    });

    await expect(resumableUpload(options(), deps)).rejects.toMatchObject({ code: 'AuthRevoked' });
  });

  it('aborts when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = makeDeps();

    await expect(
      resumableUpload(options({ signal: controller.signal }), deps),
    ).rejects.toBeInstanceOf(UploadCancelled);
    expect(deps.http).not.toHaveBeenCalled();
  });
});
