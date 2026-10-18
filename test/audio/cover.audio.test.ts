import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as path from 'path';
import { CoverService } from '../../src/main/publishing/cover';
import { CoverAssets } from '../../src/main/publishing/assets';
import { FFMPEG_PATH, RgbFrame, decodeRgb, ffprobeImage, run } from './support/harness';
import { useTempDir } from './support/fixture';
import { COVER_HEIGHT, COVER_LOGO_SIZE, COVER_LOGO_TOP_MARGIN, COVER_WIDTH } from '../../src/main/publishing/cover';
import { LogoPlacement } from '../../src/shared/coverLayout';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ASSETS: CoverAssets = {
  defaultBase: path.join(REPO_ROOT, 'assets', 'images', 'default-base.png'),
  logo: path.join(REPO_ROOT, 'assets', 'images', 'logo.png'),
  font: path.join(REPO_ROOT, 'assets', 'fonts', 'JetBrainsMono-Regular.ttf'),
};

const LOGO_LEFT = (COVER_WIDTH - COVER_LOGO_SIZE) / 2;
const BAND_TOP = COVER_HEIGHT - 160;

const dir = useTempDir();

let assets: CoverAssets = ASSETS;
let placement: LogoPlacement | null = null;

const service = new CoverService({
  resolveFfmpegPath: async () => FFMPEG_PATH,
  runRender: (_ffmpegPath, args) => run(args),
  resolveAssets: () => assets,
  resolveLogoPlacement: () => placement,
});

function pixel(frame: RgbFrame, x: number, y: number): [number, number, number] {
  const offset = (y * frame.width + x) * 3;
  return [frame.data[offset], frame.data[offset + 1], frame.data[offset + 2]];
}

function isAccentColor([r, g, b]: [number, number, number]): boolean {
  return g > 150 && r < 120 && g > b && b < 210;
}

function isCropCenterGreen([r, g, b]: [number, number, number]): boolean {
  return g > 100 && r < 80 && b < 80;
}

function isRed([r, g, b]: [number, number, number]): boolean {
  return r > 200 && g < 60 && b < 60;
}

function brightestInBand(frame: RgbFrame): number {
  let best = 0;
  for (let y = BAND_TOP; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const [r, g, b] = pixel(frame, x, y);
      best = Math.max(best, r + g + b);
    }
  }
  return best;
}

async function composeTo(title: string, name: string, coverImagePath?: string): Promise<string> {
  const output = path.join(dir(), name);
  await service.compose({ title, coverImagePath, outputPath: output });
  return output;
}

// The first drawtext render on a fresh Windows runner pays a one-off cost
// (seconds normally, past the 60s test timeout on a slow runner), so it is
// absorbed here instead of failing whichever test happens to run first.
const WARM_UP_TIMEOUT_MS = 300_000;

describe('cover compositing', () => {
  beforeAll(async () => {
    const started = Date.now();
    await composeTo('Warm up', 'warm-up.png');
    console.log(`cover warm-up render took ${Date.now() - started}ms`);
  }, WARM_UP_TIMEOUT_MS);

  afterEach(() => {
    assets = ASSETS;
    placement = null;
  });

  it('composes a 1280x720 cover from the bundled default base', async () => {
    const output = await composeTo('Hello world', 'default.png');
    const info = await ffprobeImage(output);

    expect(info.width).toBe(COVER_WIDTH);
    expect(info.height).toBe(COVER_HEIGHT);
    expect(info.formatName).toContain('png');
  });

  it('guarantees even dimensions (yuv420p compatible)', async () => {
    const output = await composeTo('Even', 'even.png');
    const info = await ffprobeImage(output);

    expect(info.width! % 2).toBe(0);
    expect(info.height! % 2).toBe(0);

    const converted = await run(['-v', 'error', '-y', '-i', output, '-pix_fmt', 'yuv420p', '-f', 'null', '-']);
    expect(converted.exitCode).toBe(0);
  });

  it('overlays the bundled logo at top-centre and draws the title in the bottom band', async () => {
    const output = await composeTo('Hello world', 'marks.png');
    const frame = await decodeRgb(output);

    const logoX = Math.round(LOGO_LEFT + COVER_LOGO_SIZE / 2);
    const logoY = COVER_LOGO_TOP_MARGIN + Math.round(COVER_LOGO_SIZE / 2);
    expect(isAccentColor(pixel(frame, logoX, logoY))).toBe(true);
    expect(isAccentColor(pixel(frame, 8, logoY))).toBe(false);

    expect(brightestInBand(frame)).toBeGreaterThan(600);
  });

  it('center-crops a wide image to 1280x720', async () => {
    const wide = path.join(dir(), 'wide.png');
    await run([
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=green:s=2560x720',
      '-vf', 'drawbox=x=0:y=0:w=640:h=720:color=red:t=fill,drawbox=x=1920:y=0:w=640:h=720:color=blue:t=fill',
      '-frames:v', '1',
      wide,
    ]);

    const output = await composeTo('Crop', 'crop.png', wide);
    const info = await ffprobeImage(output);
    const frame = await decodeRgb(output);

    expect(info.width).toBe(COVER_WIDTH);
    expect(info.height).toBe(COVER_HEIGHT);
    expect(isCropCenterGreen(pixel(frame, 5, 300))).toBe(true);
    expect(isCropCenterGreen(pixel(frame, COVER_WIDTH - 5, 300))).toBe(true);
  });

  it('renders a title containing drawtext special characters', async () => {
    const output = await composeTo(String.raw`A: B, C [100%] 'x' ; end`, 'escaped.png');
    const info = await ffprobeImage(output);
    const frame = await decodeRgb(output);

    expect(info.width).toBe(COVER_WIDTH);
    expect(info.height).toBe(COVER_HEIGHT);
    expect(brightestInBand(frame)).toBeGreaterThan(600);
  });

  it('moves and resizes the logo per the saved placement', async () => {
    placement = { centerX: 200, centerY: 200, size: 100 };
    const output = await composeTo('Placed', 'placed.png');
    const frame = await decodeRgb(output);

    expect(isAccentColor(pixel(frame, 200, 200))).toBe(true);
    expect(isAccentColor(pixel(frame, COVER_WIDTH / 2, COVER_LOGO_TOP_MARGIN + COVER_LOGO_SIZE / 2))).toBe(false);
  });

  it('keeps a wide logo undistorted and pushes it back inside the area', async () => {
    const wideLogo = path.join(dir(), 'wide-logo.png');
    await run(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=300x100', '-frames:v', '1', wideLogo]);
    assets = { ...ASSETS, logo: wideLogo };
    // saved near the top-right corner; a 200 px wide logo cannot be centred there
    placement = { centerX: 1250, centerY: 20, size: 200 };

    const frame = await decodeRgb(await composeTo('Wide', 'wide-logo-cover.png'));

    // 300x100 at a 200 px longer side is about 200x67, flush with the top-right corner
    expect(isRed(pixel(frame, COVER_WIDTH - 2, 2))).toBe(true);
    expect(isRed(pixel(frame, COVER_WIDTH - 198, 60))).toBe(true);
    expect(isRed(pixel(frame, COVER_WIDTH - 204, 30))).toBe(false);
    expect(isRed(pixel(frame, COVER_WIDTH - 100, 72))).toBe(false);
  });

  it('can leave the logo off', async () => {
    const output = path.join(dir(), 'no-logo.png');
    await service.compose({ title: 'No logo', outputPath: output, withLogo: false });
    const frame = await decodeRgb(output);

    const logoY = COVER_LOGO_TOP_MARGIN + Math.round(COVER_LOGO_SIZE / 2);
    expect(isAccentColor(pixel(frame, COVER_WIDTH / 2, logoY))).toBe(false);
  });
});
