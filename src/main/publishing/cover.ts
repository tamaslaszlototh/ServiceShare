import { CoverAssets } from './assets';
import { ffmpegResolver } from '../audio/ffmpeg';
import { runFfmpeg } from '../audio/runner';
import { RenderError } from '../core/errors';
import { sanitizeText } from '../core/sanitize';
import {
  COVER_BAND_HEIGHT,
  COVER_HEIGHT,
  COVER_WIDTH,
  LOGO_DEFAULT_SIZE,
  LOGO_MARGIN,
  LogoPlacement,
  logoOverlayPosition,
} from '../../shared/coverLayout';

export { COVER_BAND_HEIGHT, COVER_HEIGHT, COVER_WIDTH };
export const COVER_FONT_SIZE = 48;
export const COVER_TITLE_MARGIN_X = 48;
export const COVER_LOGO_SIZE = LOGO_DEFAULT_SIZE;
export const COVER_LOGO_TOP_MARGIN = LOGO_MARGIN;

const DRAWTEXT_SPECIAL = /[\\:;,'%\[\]]/g;

export function escapeDrawtext(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(DRAWTEXT_SPECIAL, (ch) => `\\${ch}`);
}

function quoteFontPath(font: string): string {
  return `'${font.replace(/\\/g, '/').replace(/'/g, "\\'")}'`;
}

export interface CoverInput {
  base: string;
  /** null composes the cover without a logo (the placement editor draws it live instead) */
  logo: string | null;
  logoPlacement: LogoPlacement | null;
  font: string;
  title: string;
  outputPath: string;
}

export function compileCover(input: CoverInput): string[] {
  const logoSize = input.logoPlacement?.size ?? COVER_LOGO_SIZE;
  const background =
    `[0:v]scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${COVER_WIDTH}:${COVER_HEIGHT},setsar=1,` +
      `drawbox=x=0:y=ih-${COVER_BAND_HEIGHT}:w=iw:h=${COVER_BAND_HEIGHT}:color=black@0.45:t=fill,` +
      `drawtext=fontfile=${quoteFontPath(input.font)}:text=${escapeDrawtext(input.title)}:` +
      `fontcolor=white:fontsize=${COVER_FONT_SIZE}:x=${COVER_TITLE_MARGIN_X}:` +
      `y=h-${COVER_BAND_HEIGHT}+(${COVER_BAND_HEIGHT}-text_h)/2`;
  const filter = input.logo
    ? [
        `${background}[bg]`,
        // the longer side becomes logoSize; the logo keeps its own aspect ratio
        `[1:v]scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease[logo]`,
        `[bg][logo]overlay=${logoOverlayPosition(input.logoPlacement)}[v]`,
      ].join(';')
    : `${background}[v]`;

  return [
    '-v',
    'error',
    '-y',
    '-i',
    input.base,
    ...(input.logo ? ['-i', input.logo] : []),
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
  /** false leaves the logo off (defaults to true) */
  withLogo?: boolean;
}

export interface CoverDeps {
  resolveFfmpegPath: () => Promise<string>;
  runRender: (ffmpegPath: string, args: string[]) => Promise<{ exitCode: number; stderr: string }>;
  resolveAssets: () => CoverAssets;
  resolveLogoPlacement: () => LogoPlacement | null;
}

export class CoverService {
  constructor(private readonly deps: CoverDeps) {}

  async compose(request: CoverRequest): Promise<void> {
    const assets = this.deps.resolveAssets();
    const ffmpegPath = await this.deps.resolveFfmpegPath();
    const args = compileCover({
      base: request.coverImagePath || assets.defaultBase,
      logo: request.withLogo === false ? null : assets.logo,
      logoPlacement: this.deps.resolveLogoPlacement(),
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

export function coverDepsIn(
  resolveAssets: () => CoverAssets,
  resolveLogoPlacement: () => LogoPlacement | null,
): CoverDeps {
  return {
    resolveFfmpegPath: async () => (await ffmpegResolver.resolve()).ffmpeg,
    runRender: (ffmpegPath, args) => runFfmpeg(ffmpegPath, args),
    resolveAssets,
    resolveLogoPlacement,
  };
}
