import { describe, it, expect, vi } from 'vitest';
import { CoverPreviewDeps, CoverPreviewService, MAX_COVER_PREVIEWS, coverPreviewKey } from './coverPreview';
import { CoverRequest } from './cover';

function deps(over: Partial<CoverPreviewDeps> = {}): CoverPreviewDeps & {
  compose: ReturnType<typeof vi.fn>;
  makeTempDir: ReturnType<typeof vi.fn>;
  removeDir: ReturnType<typeof vi.fn>;
} {
  return {
    compose: vi.fn(async (_request: CoverRequest) => {}),
    makeTempDir: vi.fn(async () => '/tmp/cover-preview'),
    removeDir: vi.fn(async () => {}),
    removeFile: vi.fn(async () => {}),
    ...over,
  } as CoverPreviewDeps & {
    compose: ReturnType<typeof vi.fn>;
    makeTempDir: ReturnType<typeof vi.fn>;
    removeDir: ReturnType<typeof vi.fn>;
  };
}

describe('coverPreviewKey', () => {
  it('changes with the title and the chosen image', () => {
    expect(coverPreviewKey('A', '/img.png')).not.toBe(coverPreviewKey('B', '/img.png'));
    expect(coverPreviewKey('A', '/img.png')).not.toBe(coverPreviewKey('A', undefined));
    expect(coverPreviewKey('A', '/img.png')).toBe(coverPreviewKey('A', '/img.png'));
  });
});

describe('CoverPreviewService', () => {
  it('composes a preview and returns a cover:// url', async () => {
    const d = deps();
    const result = await new CoverPreviewService(d).ensure('My Clip');

    expect(result.composed).toBe(true);
    expect(result.url).toBe(`cover://preview/${result.key}`);
    expect(result.path).toMatch(/cover-preview/);
    expect(d.compose).toHaveBeenCalledWith({
      title: 'My Clip',
      coverImagePath: undefined,
      outputPath: result.path,
    });
  });

  it('reuses the cached composition for identical requests', async () => {
    const d = deps();
    const service = new CoverPreviewService(d);

    const first = await service.ensure('My Clip', '/img.png');
    const second = await service.ensure('My Clip', '/img.png');

    expect(second.composed).toBe(false);
    expect(second.url).toBe(first.url);
    expect(d.compose).toHaveBeenCalledTimes(1);
    expect(d.makeTempDir).toHaveBeenCalledTimes(1);
  });

  it('composes a new image when the title or base image changes', async () => {
    const d = deps();
    const service = new CoverPreviewService(d);

    await service.ensure('My Clip', '/img.png');
    await service.ensure('Renamed', '/img.png');
    await service.ensure('Renamed', '/other.png');

    expect(d.compose).toHaveBeenCalledTimes(3);
  });

  it('resolves a path by key for the protocol handler', async () => {
    const service = new CoverPreviewService(deps());
    const { key, path } = await service.ensure('My Clip');

    expect(service.pathFor(key)).toBe(path);
    expect(service.pathFor('missing')).toBe(null);
  });

  it('drops the oldest preview once the cache is full', async () => {
    const d = deps();
    const service = new CoverPreviewService(d);

    const first = await service.ensure('0');
    for (let i = 1; i <= MAX_COVER_PREVIEWS; i++) {
      await service.ensure(String(i));
    }

    expect(service.pathFor(first.key)).toBeNull();
    expect(d.removeFile).toHaveBeenCalledWith(first.path);
  });

  it('disposes the temp dir and forgets cached previews', async () => {
    const d = deps();
    const service = new CoverPreviewService(d);
    const { key } = await service.ensure('My Clip');

    await service.dispose();

    expect(d.removeDir).toHaveBeenCalledWith('/tmp/cover-preview');
    expect(service.pathFor(key)).toBe(null);
  });
});
