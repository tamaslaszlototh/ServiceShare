import { describe, it, expect, vi } from 'vitest';
import { PreviewDeps, PreviewService, parseLoudnormJson, previewCacheKey } from './preview';
import { ClipInfo, EditOperation } from '@shared/types';

const clip: ClipInfo = {
  filePath: '/tmp/in.wav',
  duration: 60,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
};

const LOUDNORM_STDERR = `
[Parsed_loudnorm_0 @ 0x7f] 
{
\t"input_i" : "-22.50",
\t"input_tp" : "-3.10",
\t"input_lra" : "14.20",
\t"input_thresh" : "-32.80",
\t"output_i" : "-16.00",
\t"target_offset" : "0.10"
}
`;

const LOUDNORM_MEASUREMENT = {
  measuredI: '-22.50',
  measuredTP: '-3.10',
  measuredLRA: '14.20',
  measuredThresh: '-32.80',
  offset: '0.10',
};

function makeDeps(over: Partial<PreviewDeps> = {}) {
  const removed: string[] = [];
  const deps: PreviewDeps = {
    resolveFfmpegPath: async () => '/usr/bin/ffmpeg',
    runRender: vi.fn(async () => ({ exitCode: 0, stderr: '' })),
    getMtimeMs: async () => 1000,
    makeTempDir: async () => '/tmp/serviceshare-preview-abc',
    removeDir: async (dir) => {
      removed.push(dir);
    },
    ...over,
  };
  return { deps, removed };
}

describe('previewCacheKey', () => {
  it('is stable for the same mtime and edit list', () => {
    const list: EditOperation[] = [{ kind: 'gain', db: 3 }];
    expect(previewCacheKey(1000, list)).toBe(previewCacheKey(1000, [{ kind: 'gain', db: 3 }]));
  });

  it('changes when the source mtime changes', () => {
    expect(previewCacheKey(1000, [])).not.toBe(previewCacheKey(2000, []));
  });

  it('changes when the edit list changes', () => {
    expect(previewCacheKey(1000, [{ kind: 'gain', db: 3 }])).not.toBe(previewCacheKey(1000, [{ kind: 'gain', db: 6 }]));
  });
});

describe('parseLoudnormJson', () => {
  it('extracts the measured values from stderr', () => {
    expect(parseLoudnormJson(LOUDNORM_STDERR)).toEqual(LOUDNORM_MEASUREMENT);
  });

  it('throws when no JSON block is present', () => {
    expect(() => parseLoudnormJson('no measurement here')).toThrow();
  });
});

describe('PreviewService', () => {
  it('renders on the first ensure and reuses the cache afterwards', async () => {
    const { deps } = makeDeps();
    const service = new PreviewService(deps);
    const list: EditOperation[] = [{ kind: 'trim', start: 1, end: 5 }];

    const first = await service.ensure(clip, list);
    const second = await service.ensure(clip, list);

    expect(first.rendered).toBe(true);
    expect(second.rendered).toBe(false);
    expect(second.url).toBe(first.url);
    expect(deps.runRender).toHaveBeenCalledTimes(1);
  });

  it('re-renders when the edit list changes', async () => {
    const { deps } = makeDeps();
    const service = new PreviewService(deps);

    await service.ensure(clip, [{ kind: 'gain', db: 3 }]);
    const second = await service.ensure(clip, [{ kind: 'gain', db: 6 }]);

    expect(second.rendered).toBe(true);
    expect(deps.runRender).toHaveBeenCalledTimes(2);
  });

  it('reuses a cached render when the edit list returns to an earlier state', async () => {
    const { deps } = makeDeps();
    const service = new PreviewService(deps);
    const a: EditOperation[] = [{ kind: 'gain', db: 3 }];
    const b: EditOperation[] = [{ kind: 'gain', db: 6 }];

    const first = await service.ensure(clip, a);
    await service.ensure(clip, b);
    const third = await service.ensure(clip, a);

    expect(third.rendered).toBe(false);
    expect(third.url).toBe(first.url);
    expect(deps.runRender).toHaveBeenCalledTimes(2);
  });

  it('re-renders when the source mtime changes', async () => {
    let mtime = 1000;
    const { deps } = makeDeps({ getMtimeMs: async () => mtime });
    const service = new PreviewService(deps);
    const list: EditOperation[] = [{ kind: 'gain', db: 3 }];

    await service.ensure(clip, list);
    mtime = 2000;
    const second = await service.ensure(clip, list);

    expect(second.rendered).toBe(true);
    expect(deps.runRender).toHaveBeenCalledTimes(2);
  });

  it('runs measure then apply for a normalize edit list', async () => {
    const runRender = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stderr: LOUDNORM_STDERR })
      .mockResolvedValueOnce({ exitCode: 0, stderr: '' });
    const { deps } = makeDeps({ runRender });
    const service = new PreviewService(deps);

    await service.ensure(clip, [{ kind: 'normalize' }]);

    expect(runRender).toHaveBeenCalledTimes(2);
    const measureArgs = runRender.mock.calls[0][1] as string[];
    const applyArgs = runRender.mock.calls[1][1] as string[];
    expect(measureArgs.join(' ')).toContain('print_format=json');
    expect(applyArgs.join(' ')).toContain('measured_I=-22.50');
  });

  it('compiles a concat fade-out using the duration carried on the op', async () => {
    const { deps } = makeDeps();
    const service = new PreviewService(deps);
    const list: EditOperation[] = [
      { kind: 'concatenate', file: '/tmp/b.wav', duration: 10 },
      { kind: 'fadeOut', duration: 2 },
    ];

    await service.ensure(clip, list);

    const args = (deps.runRender as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    expect(args.join(' ')).toContain('-i /tmp/b.wav');
    expect(args.join(' ')).toContain('afade=t=out:st=68:d=2');
  });

  it('surfaces a render failure as an EngineError', async () => {
    const { deps } = makeDeps({ runRender: async () => ({ exitCode: 1, stderr: 'boom' }) });
    const service = new PreviewService(deps);
    await expect(service.ensure(clip, [])).rejects.toThrow(/Failed to render preview/);
  });

  it('creates one session temp dir and removes it on dispose', async () => {
    const { deps, removed } = makeDeps();
    const service = new PreviewService(deps);

    await service.ensure(clip, [{ kind: 'gain', db: 1 }]);
    await service.ensure(clip, [{ kind: 'gain', db: 2 }]);
    await service.dispose();

    expect(removed).toEqual(['/tmp/serviceshare-preview-abc']);
  });

  it('maps a key back to its rendered file for the protocol handler', async () => {
    const { deps } = makeDeps();
    const service = new PreviewService(deps);
    const result = await service.ensure(clip, []);
    expect(service.pathFor(result.key)).toBe(result.path);
    expect(service.pathFor('missing')).toBeNull();
  });
});
