import { afterEach, describe, expect, it } from 'vitest';
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
};

const LOGO_LEFT = (COVER_WIDTH - COVER_LOGO_SIZE) / 2;

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

async function composeTo(name: string, coverImagePath?: string): Promise<string> {
  const output = path.join(dir(), name);
  await service.compose({ coverImagePath, outputPath: output });
  return output;
}

describe('cover compositing', () => {
  afterEach(() => {
    assets = ASSETS;
    placement = null;
  });

  it('composes a 1280x720 cover from the bundled default base', async () => {
    const output = await composeTo('default.png');
    const info = await ffprobeImage(output);

    expect(info.width).toBe(COVER_WIDTH);
    expect(info.height).toBe(COVER_HEIGHT);
    expect(info.formatName).toContain('png');
  });

  it('guarantees even dimensions (yuv420p compatible)', async () => {
    const output = await composeTo('even.png');
    const info = await ffprobeImage(output);

    expect(info.width! % 2).toBe(0);
    expect(info.height! % 2).toBe(0);

    const converted = await run(['-v', 'error', '-y', '-i', output, '-pix_fmt', 'yuv420p', '-f', 'null', '-']);
    expect(converted.exitCode).toBe(0);
  });

  it('overlays the bundled logo at top-centre', async () => {
    const output = await composeTo('marks.png');
    const frame = await decodeRgb(output);

    const logoX = Math.round(LOGO_LEFT + COVER_LOGO_SIZE / 2);
    const logoY = COVER_LOGO_TOP_MARGIN + Math.round(COVER_LOGO_SIZE / 2);
    expect(isAccentColor(pixel(frame, logoX, logoY))).toBe(true);
    expect(isAccentColor(pixel(frame, 8, logoY))).toBe(false);
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

    const output = await composeTo('crop.png', wide);
    const info = await ffprobeImage(output);
    const frame = await decodeRgb(output);

    expect(info.width).toBe(COVER_WIDTH);
    expect(info.height).toBe(COVER_HEIGHT);
    expect(isCropCenterGreen(pixel(frame, 5, 300))).toBe(true);
    expect(isCropCenterGreen(pixel(frame, COVER_WIDTH - 5, 300))).toBe(true);
  });

  it('leaves the bottom of the base untouched (no title band)', async () => {
    const plain = path.join(dir(), 'plain.png');
    await run(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=1280x720', '-frames:v', '1', plain]);

    const frame = await decodeRgb(await composeTo('no-band.png', plain));

    expect(isCropCenterGreen(pixel(frame, 20, COVER_HEIGHT - 20))).toBe(true);
    expect(isCropCenterGreen(pixel(frame, COVER_WIDTH / 2, COVER_HEIGHT - 80))).toBe(true);
  });

  it('lets the logo sit at the bottom edge of the cover', async () => {
    placement = { centerX: COVER_WIDTH / 2, centerY: COVER_HEIGHT - 50, size: 100 };
    const frame = await decodeRgb(await composeTo('bottom-logo.png'));

    expect(isAccentColor(pixel(frame, COVER_WIDTH / 2, COVER_HEIGHT - 50))).toBe(true);
  });

  it('moves and resizes the logo per the saved placement', async () => {
    placement = { centerX: 200, centerY: 200, size: 100 };
    const output = await composeTo('placed.png');
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

    const frame = await decodeRgb(await composeTo('wide-logo-cover.png'));

    // 300x100 at a 200 px longer side is about 200x67, flush with the top-right corner
    expect(isRed(pixel(frame, COVER_WIDTH - 2, 2))).toBe(true);
    expect(isRed(pixel(frame, COVER_WIDTH - 198, 60))).toBe(true);
    expect(isRed(pixel(frame, COVER_WIDTH - 204, 30))).toBe(false);
    expect(isRed(pixel(frame, COVER_WIDTH - 100, 72))).toBe(false);
  });

  it('can leave the logo off', async () => {
    const output = path.join(dir(), 'no-logo.png');
    await service.compose({ outputPath: output, withLogo: false });
    const frame = await decodeRgb(output);

    const logoY = COVER_LOGO_TOP_MARGIN + Math.round(COVER_LOGO_SIZE / 2);
    expect(isAccentColor(pixel(frame, COVER_WIDTH / 2, logoY))).toBe(false);
  });
});
