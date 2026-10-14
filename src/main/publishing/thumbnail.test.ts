import { describe, it, expect, vi } from 'vitest';
import {
  MAX_THUMBNAIL_BYTES,
  ThumbnailDeps,
  ThumbnailOptions,
  setThumbnail,
  thumbnailContentType,
  thumbnailUrl,
} from './thumbnail';
import { UploadHttpRequest, UploadHttpResponse } from './upload';

const SOURCE = { path: '/tmp/thumb.png', size: 2048, contentType: 'image/png' as const };

function options(over: Partial<ThumbnailOptions> = {}): ThumbnailOptions {
  return { accessToken: 'token-123', videoId: 'vid42', source: SOURCE, ...over };
}

function makeDeps(over: Partial<ThumbnailDeps> = {}): ThumbnailDeps & { http: ReturnType<typeof vi.fn> } {
  return {
    http: vi.fn(async () => ({ status: 200, headers: {}, text: '{}' }) as UploadHttpResponse),
    openBody: () => new Uint8Array([1, 2, 3]),
    ...over,
  } as ThumbnailDeps & { http: ReturnType<typeof vi.fn> };
}

describe('thumbnailContentType', () => {
  it('maps jpeg variants and defaults to png', () => {
    expect(thumbnailContentType('/a/b.jpg')).toBe('image/jpeg');
    expect(thumbnailContentType('/a/b.JPEG')).toBe('image/jpeg');
    expect(thumbnailContentType('/a/b.png')).toBe('image/png');
  });
});

describe('thumbnailUrl', () => {
  it('targets the thumbnails.set media endpoint for the video', () => {
    expect(thumbnailUrl('vid42', 'https://api/thumbnails')).toBe(
      'https://api/thumbnails?uploadType=media&videoId=vid42',
    );
  });
});

describe('setThumbnail', () => {
  it('POSTs the image bytes with the access token', async () => {
    const deps = makeDeps();
    await setThumbnail(options(), deps);

    const request = deps.http.mock.calls[0][0] as UploadHttpRequest;
    expect(request.method).toBe('POST');
    expect(request.url).toContain('uploadType=media');
    expect(request.url).toContain('videoId=vid42');
    expect(request.headers.Authorization).toBe('Bearer token-123');
    expect(request.headers['Content-Type']).toBe('image/png');
    expect(request.headers['Content-Length']).toBe('2048');
  });

  it('raises a structured error on a non-200 response', async () => {
    const deps = makeDeps({
      http: vi.fn(async () => ({ status: 403, headers: {}, text: '{"error":{"errors":[{"reason":"forbidden"}]}}' })),
    });

    await expect(setThumbnail(options(), deps)).rejects.toMatchObject({ code: 'PermissionError' });
  });

  it('rejects an oversized thumbnail before any request', async () => {
    const deps = makeDeps();
    const oversized = { ...options(), source: { ...SOURCE, size: MAX_THUMBNAIL_BYTES + 1 } };

    await expect(setThumbnail(oversized, deps)).rejects.toMatchObject({ code: 'EngineError' });
    expect(deps.http).not.toHaveBeenCalled();
  });
});
