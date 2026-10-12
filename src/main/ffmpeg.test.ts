import { describe, it, expect } from 'vitest';
import { FFmpegResolver, EngineError, FFmpegResolverDeps } from './ffmpeg';

function makeDeps(overrides: Partial<FFmpegResolverDeps> = {}) {
  const existing = new Set<string>();
  const probed: string[] = [];
  let probeResult: (p: string) => boolean = () => true;

  const deps: FFmpegResolverDeps = {
    resourcesPath: '/app/Resources',
    pathEnv: '',
    platform: 'darwin',
    devPackagePath: () => null,
    fileExists: (p) => existing.has(p),
    probeVersion: async (p) => {
      probed.push(p);
      return probeResult(p);
    },
    ...overrides,
  };

  const state = {
    existing,
    probed,
    setProbeResult(fn: (p: string) => boolean) {
      probeResult = fn;
    },
    addExisting(...paths: string[]) {
      paths.forEach((p) => existing.add(p));
    },
    resetProbed() {
      probed.length = 0;
    },
  };

  return [deps, state] as const;
}

describe('FFmpegResolver', () => {
  it('resolves bundled ffmpeg and ffprobe from extraResources', async () => {
    const [deps, state] = makeDeps();
    state.addExisting('/app/Resources/ffmpeg', '/app/Resources/ffprobe');

    const bins = await new FFmpegResolver(deps).resolve();

    expect(bins).toEqual({
      ffmpeg: '/app/Resources/ffmpeg',
      ffprobe: '/app/Resources/ffprobe',
    });
    expect(state.probed.sort()).toEqual([
      '/app/Resources/ffmpeg',
      '/app/Resources/ffprobe',
    ]);
  });

  it('uses ffmpeg-static / ffprobe-static package binaries as the dev fallback', async () => {
    const [deps, state] = makeDeps({
      resourcesPath: '',
      pathEnv: '',
      devPackagePath: (name) =>
        name === 'ffmpeg' ? '/pkg/ffmpeg-static/ffmpeg' : '/pkg/ffprobe-static/ffprobe',
    });
    state.addExisting('/pkg/ffmpeg-static/ffmpeg', '/pkg/ffprobe-static/ffprobe');

    const bins = await new FFmpegResolver(deps).resolve();

    expect(bins).toEqual({
      ffmpeg: '/pkg/ffmpeg-static/ffmpeg',
      ffprobe: '/pkg/ffprobe-static/ffprobe',
    });
  });

  it('scans PATH directories in order, skipping non-existent binaries', async () => {
    const [deps, state] = makeDeps({
      resourcesPath: '',
      pathEnv: '/usr/bin:/opt/homebrew/bin',
    });
    state.addExisting('/opt/homebrew/bin/ffmpeg', '/usr/bin/ffprobe');

    const bins = await new FFmpegResolver(deps).resolve();

    expect(bins).toEqual({
      ffmpeg: '/opt/homebrew/bin/ffmpeg',
      ffprobe: '/usr/bin/ffprobe',
    });
  });

  it('prefers bundled, then dev package, before falling back to PATH', async () => {
    const [deps, state] = makeDeps({
      pathEnv: '/usr/bin',
      devPackagePath: (name) => (name === 'ffmpeg' ? '/pkg/ffmpeg' : '/pkg/ffprobe'),
    });
    state.addExisting(
      '/app/Resources/ffmpeg',
      '/app/Resources/ffprobe',
      '/pkg/ffmpeg',
      '/pkg/ffprobe',
      '/usr/bin/ffmpeg',
      '/usr/bin/ffprobe',
    );
    state.setProbeResult((p) => !p.startsWith('/app/Resources'));

    const bins = await new FFmpegResolver(deps).resolve();

    expect(bins).toEqual({ ffmpeg: '/pkg/ffmpeg', ffprobe: '/pkg/ffprobe' });
    expect(state.probed).not.toContain('/usr/bin/ffmpeg');
    expect(state.probed).not.toContain('/usr/bin/ffprobe');
  });

  it('only accepts candidates whose version probe succeeds', async () => {
    const [deps, state] = makeDeps({ pathEnv: '/usr/bin' });
    state.addExisting(
      '/app/Resources/ffmpeg',
      '/app/Resources/ffprobe',
      '/usr/bin/ffmpeg',
    );
    state.setProbeResult((p) => p.startsWith('/usr/bin') || p.endsWith('/ffprobe'));

    const bins = await new FFmpegResolver(deps).resolve();

    expect(bins).toEqual({ ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/app/Resources/ffprobe' });
  });

  it('caches resolved paths and does not re-probe on later calls', async () => {
    const [deps, state] = makeDeps();
    state.addExisting('/app/Resources/ffmpeg', '/app/Resources/ffprobe');

    const resolver = new FFmpegResolver(deps);
    const first = await resolver.resolve();
    expect(state.probed.length).toBe(2);

    state.resetProbed();
    const second = await resolver.resolve();

    expect(second).toEqual(first);
    expect(state.probed).toEqual([]);
  });

  it('does not cache failures, so a later resolve can recover once FFmpeg appears', async () => {
    const [deps, state] = makeDeps({ pathEnv: '/usr/bin' });
    const resolver = new FFmpegResolver(deps);

    await expect(resolver.resolve()).rejects.toBeInstanceOf(EngineError);

    state.addExisting('/usr/bin/ffmpeg', '/usr/bin/ffprobe');

    await expect(resolver.resolve()).resolves.toEqual({
      ffmpeg: '/usr/bin/ffmpeg',
      ffprobe: '/usr/bin/ffprobe',
    });
  });

  it('throws EngineError with code, message and searched paths when missing', async () => {
    const [deps, state] = makeDeps({ pathEnv: '/usr/bin' });
    void state;

    const err = await new FFmpegResolver(deps).resolve().catch((e) => e);

    expect(err).toBeInstanceOf(EngineError);
    expect(err.code).toBe('EngineError');
    expect(err.message).toContain('FFmpeg not found');
    expect(err.details).toContain('/app/Resources/ffmpeg');
    expect(err.details).toContain('/usr/bin/ffmpeg');
  });

  it('recheck clears the cache and re-runs the probe', async () => {
    const [deps, state] = makeDeps();
    state.addExisting('/app/Resources/ffmpeg', '/app/Resources/ffprobe');

    const resolver = new FFmpegResolver(deps);
    await resolver.resolve();

    state.setProbeResult(() => false);
    state.resetProbed();

    await expect(resolver.recheck()).rejects.toBeInstanceOf(EngineError);
    expect(state.probed).toContain('/app/Resources/ffmpeg');
  });

  it('appends .exe on Windows', async () => {
    const [deps, state] = makeDeps({
      platform: 'win32',
      resourcesPath: 'C:\\app\\Resources',
      pathEnv: 'C:\\tools',
    });
    state.addExisting('C:\\app\\Resources\\ffmpeg.exe', 'C:\\app\\Resources\\ffprobe.exe');

    const bins = await new FFmpegResolver(deps).resolve();

    expect(bins).toEqual({
      ffmpeg: 'C:\\app\\Resources\\ffmpeg.exe',
      ffprobe: 'C:\\app\\Resources\\ffprobe.exe',
    });
  });
});