import { describe, it, expect, vi } from 'vitest';
import {
  COVER_HEIGHT,
  COVER_LOGO_SIZE,
  COVER_LOGO_TOP_MARGIN,
  COVER_WIDTH,
  CoverDeps,
  CoverService,
  compileCover,
} from './cover';
import { CoverAssets } from './assets';

describe('compileCover', () => {
  it('produces an exact, reviewed FFmpeg argument snapshot', () => {
    const args = compileCover({
      base: '/base.png',
      logo: '/logo.png',
      logoPlacement: null,
      outputPath: '/cover.png',
    });

    expect(args).toEqual([
      '-v',
      'error',
      '-y',
      '-i',
      '/base.png',
      '-i',
      '/logo.png',
      '-filter_complex',
      String.raw`[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[bg];[1:v]scale=128:128:force_original_aspect_ratio=decrease[logo];[bg][logo]overlay=(W-w)/2:32[v]`,
      '-map',
      '[v]',
      '-frames:v',
      '1',
      '-update',
      '1',
      '/cover.png',
    ]);
  });

  it('pins the composite dimensions and template constants', () => {
    const args = compileCover({
      base: '/b.png',
      logo: '/l.png',
      logoPlacement: null,
      outputPath: '/o.png',
    });
    const filter = args[args.indexOf('-filter_complex') + 1];

    expect(COVER_WIDTH).toBe(1280);
    expect(COVER_HEIGHT).toBe(720);
    expect(filter).toContain(`scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase`);
    expect(filter).toContain(`crop=${COVER_WIDTH}:${COVER_HEIGHT}`);
    expect(filter).not.toContain('drawbox');
    expect(filter).not.toContain('drawtext');
    expect(filter).toContain(`scale=${COVER_LOGO_SIZE}:${COVER_LOGO_SIZE}:force_original_aspect_ratio=decrease`);
    expect(filter).toContain(`overlay=(W-w)/2:${COVER_LOGO_TOP_MARGIN}`);
  });

  it('scales and places the logo per the saved placement', () => {
    const args = compileCover({
      base: '/b.png',
      logo: '/l.png',
      logoPlacement: { centerX: 1100, centerY: 120.4, size: 200 },
      outputPath: '/o.png',
    });
    const filter = args[args.indexOf('-filter_complex') + 1];

    expect(filter).toContain('[1:v]scale=200:200:force_original_aspect_ratio=decrease[logo]');
    expect(filter).toContain(String.raw`[bg][logo]overlay=x=clip(1100-w/2\,0\,W-w):y=clip(120-h/2\,0\,720-h)[v]`);
  });

  it('composes without the logo input when there is no logo', () => {
    const args = compileCover({
      base: '/b.png',
      logo: null,
      logoPlacement: null,
      outputPath: '/o.png',
    });
    const filter = args[args.indexOf('-filter_complex') + 1];

    expect(args.filter((arg) => arg === '-i')).toHaveLength(1);
    expect(filter).not.toContain('overlay');
    expect(filter.endsWith('[v]')).toBe(true);
  });
});

const ASSETS: CoverAssets = { defaultBase: '/default-base.png', logo: '/logo.png' };

function makeDeps(): CoverDeps & { runRender: ReturnType<typeof vi.fn> } {
  return {
    resolveFfmpegPath: async () => '/ffmpeg',
    runRender: vi.fn(async () => ({ exitCode: 0, stderr: '' })),
    resolveAssets: () => ASSETS,
    resolveLogoPlacement: () => null,
  };
}

function argsOf(deps: CoverDeps): string[] {
  return (deps.runRender as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
}

describe('CoverService', () => {
  it('uses the bundled default base when no cover image is chosen', async () => {
    const deps = makeDeps();
    await new CoverService(deps).compose({ outputPath: '/out/cover.png' });

    expect(deps.runRender).toHaveBeenCalledWith('/ffmpeg', expect.any(Array));
    expect(argsOf(deps)).toContain(ASSETS.defaultBase);
    expect(argsOf(deps).at(-1)).toBe('/out/cover.png');
  });

  it('composes from the chosen cover image when provided', async () => {
    const deps = makeDeps();
    await new CoverService(deps).compose({
      coverImagePath: '/chosen.jpg',
      outputPath: '/out/cover.png',
    });

    expect(argsOf(deps)).toContain('/chosen.jpg');
    expect(argsOf(deps)).not.toContain(ASSETS.defaultBase);
  });

  it('applies the saved logo placement', async () => {
    const deps = makeDeps();
    deps.resolveLogoPlacement = () => ({ centerX: 100, centerY: 100, size: 64 });
    await new CoverService(deps).compose({ outputPath: '/out/cover.png' });

    expect(argsOf(deps).join(' ')).toContain('scale=64:64');
  });

  it('leaves the logo off when asked to', async () => {
    const deps = makeDeps();
    await new CoverService(deps).compose({ outputPath: '/out/cover.png', withLogo: false });

    expect(argsOf(deps)).not.toContain(ASSETS.logo);
  });

  it('throws a RenderError with sanitised stderr when FFmpeg fails', async () => {
    const deps = makeDeps();
    deps.runRender = vi.fn(async () => ({ exitCode: 1, stderr: 'boom\nline2' }));

    await expect(
      new CoverService(deps).compose({ outputPath: '/out/cover.png' }),
    ).rejects.toMatchObject({ code: 'RenderError', details: 'boom\nline2' });
  });
});
