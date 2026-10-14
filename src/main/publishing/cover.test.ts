import { describe, it, expect, vi } from 'vitest';
import {
  COVER_BAND_HEIGHT,
  COVER_FONT_SIZE,
  COVER_HEIGHT,
  COVER_LOGO_SIZE,
  COVER_LOGO_TOP_MARGIN,
  COVER_TITLE_MARGIN_X,
  COVER_WIDTH,
  CoverDeps,
  CoverService,
  compileCover,
  escapeDrawtext,
} from './cover';
import { CoverAssets } from './assets';

describe('escapeDrawtext', () => {
  it('leaves plain text untouched', () => {
    expect(escapeDrawtext('Hello world')).toBe('Hello world');
  });

  it('escapes every filter/drawtext special character', () => {
    expect(escapeDrawtext(String.raw`A: B, C [100%] 'x' ; end`)).toBe(
      String.raw`A\: B\, C \[100\%\] \'x\' \; end`,
    );
  });

  it('escapes backslashes', () => {
    expect(escapeDrawtext(String.raw`back\slash`)).toBe(String.raw`back\\slash`);
  });

  it('flattens newlines to spaces', () => {
    expect(escapeDrawtext('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });
});

describe('compileCover', () => {
  it('produces an exact, reviewed FFmpeg argument snapshot', () => {
    const args = compileCover({
      base: '/base.png',
      logo: '/logo.png',
      font: '/font.ttf',
      title: 'Hello: World',
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
      String.raw`[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,drawbox=x=0:y=ih-160:w=iw:h=160:color=black@0.45:t=fill,drawtext=fontfile='/font.ttf':text=Hello\: World:fontcolor=white:fontsize=48:x=48:y=h-160+(160-text_h)/2[bg];[1:v]scale=128:128[logo];[bg][logo]overlay=(W-w)/2:32[v]`,
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
      font: '/f.ttf',
      title: 'x',
      outputPath: '/o.png',
    });
    const filter = args[args.indexOf('-filter_complex') + 1];

    expect(COVER_WIDTH).toBe(1280);
    expect(COVER_HEIGHT).toBe(720);
    expect(filter).toContain(`scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase`);
    expect(filter).toContain(`crop=${COVER_WIDTH}:${COVER_HEIGHT}`);
    expect(filter).toContain(`drawbox=x=0:y=ih-${COVER_BAND_HEIGHT}:w=iw:h=${COVER_BAND_HEIGHT}`);
    expect(filter).toContain(`fontsize=${COVER_FONT_SIZE}:x=${COVER_TITLE_MARGIN_X}`);
    expect(filter).toContain(`scale=${COVER_LOGO_SIZE}:${COVER_LOGO_SIZE}`);
    expect(filter).toContain(`overlay=(W-w)/2:${COVER_LOGO_TOP_MARGIN}`);
  });
});

const ASSETS: CoverAssets = { defaultBase: '/default-base.png', logo: '/logo.png', font: '/font.ttf' };

function makeDeps(): CoverDeps & { runRender: ReturnType<typeof vi.fn> } {
  return {
    resolveFfmpegPath: async () => '/ffmpeg',
    runRender: vi.fn(async () => ({ exitCode: 0, stderr: '' })),
    resolveAssets: () => ASSETS,
  };
}

function argsOf(deps: CoverDeps): string[] {
  return (deps.runRender as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
}

describe('CoverService', () => {
  it('uses the bundled default base when no cover image is chosen', async () => {
    const deps = makeDeps();
    await new CoverService(deps).compose({ title: 'Title', outputPath: '/out/cover.png' });

    expect(deps.runRender).toHaveBeenCalledWith('/ffmpeg', expect.any(Array));
    expect(argsOf(deps)).toContain(ASSETS.defaultBase);
    expect(argsOf(deps).at(-1)).toBe('/out/cover.png');
  });

  it('composes from the chosen cover image when provided', async () => {
    const deps = makeDeps();
    await new CoverService(deps).compose({
      title: 'Title',
      coverImagePath: '/chosen.jpg',
      outputPath: '/out/cover.png',
    });

    expect(argsOf(deps)).toContain('/chosen.jpg');
    expect(argsOf(deps)).not.toContain(ASSETS.defaultBase);
  });

  it('throws a RenderError with sanitised stderr when FFmpeg fails', async () => {
    const deps = makeDeps();
    deps.runRender = vi.fn(async () => ({ exitCode: 1, stderr: 'boom\nline2' }));

    await expect(
      new CoverService(deps).compose({ title: 'Title', outputPath: '/out/cover.png' }),
    ).rejects.toMatchObject({ code: 'RenderError', details: 'boom\nline2' });
  });
});
