import { CoverAssets } from './assets';
import { ffmpegResolver } from '../audio/ffmpeg';
import { runFfmpeg } from '../audio/runner';
import { RenderError } from '../core/errors';
import { sanitizeText } from '../core/sanitize';

export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 720;
export const COVER_FONT_SIZE = 48;
export const COVER_BAND_HEIGHT = 160;
export const COVER_TITLE_MARGIN_X = 48;
export const COVER_LOGO_SIZE = 128;
export const COVER_LOGO_TOP_MARGIN = 32;

const DRAWTEXT_SPECIAL = /[\\:;,'%\[\]]/g;

export function escapeDrawtext(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(DRAWTEXT_SPECIAL, (ch) => `\\${ch}`);
}

function quoteFontPath(font: string): string {
  return `'${font.replace(/\\/g, '/').replace(/'/g, "\\'")}'`;
}

export interface CoverInput {
  base: string;
  logo: string;
  font: string;
  title: string;
  outputPath: string;
}

export function compileCover(input: CoverInput): string[] {
  const filter = [
    `[0:v]scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${COVER_WIDTH}:${COVER_HEIGHT},setsar=1,` +
      `drawbox=x=0:y=ih-${COVER_BAND_HEIGHT}:w=iw:h=${COVER_BAND_HEIGHT}:color=black@0.45:t=fill,` +
      `drawtext=fontfile=${quoteFontPath(input.font)}:text=${escapeDrawtext(input.title)}:` +
      `fontcolor=white:fontsize=${COVER_FONT_SIZE}:x=${COVER_TITLE_MARGIN_X}:` +
      `y=h-${COVER_BAND_HEIGHT}+(${COVER_BAND_HEIGHT}-text_h)/2[bg]`,
    `[1:v]scale=${COVER_LOGO_SIZE}:${COVER_LOGO_SIZE}[logo]`,
    `[bg][logo]overlay=(W-w)/2:${COVER_LOGO_TOP_MARGIN}[v]`,
  ].join(';');

  return [
    '-v',
    'error',
    '-y',
    '-i',
    input.base,
    '-i',
    input.logo,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-frames:v',
    '1',
    '-update',
    '1',
    input.outputPath,
  ];
}

export interface CoverRequest {
  title: string;
  coverImagePath?: string;
  outputPath: string;
}

export interface CoverDeps {
  resolveFfmpegPath: () => Promise<string>;
  runRender: (ffmpegPath: string, args: string[]) => Promise<{ exitCode: number; stderr: string }>;
  resolveAssets: () => CoverAssets;
}

export class CoverService {
  constructor(private readonly deps: CoverDeps) {}

  async compose(request: CoverRequest): Promise<void> {
    const assets = this.deps.resolveAssets();
    const ffmpegPath = await this.deps.resolveFfmpegPath();
    const args = compileCover({
      base: request.coverImagePath || assets.defaultBase,
      logo: assets.logo,
      font: assets.font,
      title: request.title,
      outputPath: request.outputPath,
    });
    const result = await this.deps.runRender(ffmpegPath, args);
    if (result.exitCode !== 0) {
      throw new RenderError('Could not compose the cover image', sanitizeText(result.stderr));
    }
  }
}

export function coverDepsIn(resolveAssets: () => CoverAssets): CoverDeps {
  return {
    resolveFfmpegPath: async () => (await ffmpegResolver.resolve()).ffmpeg,
    runRender: (ffmpegPath, args) => runFfmpeg(ffmpegPath, args),
    resolveAssets,
  };
}
