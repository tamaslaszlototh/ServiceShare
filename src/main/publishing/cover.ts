import { CoverAssets } from './assets';
import { ffmpegResolver } from '../audio/ffmpeg';
import { runFfmpeg } from '../audio/runner';
import { RenderError } from '../core/errors';
import { sanitizeText } from '../core/sanitize';
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  LOGO_DEFAULT_SIZE,
  LOGO_MARGIN,
  LogoPlacement,
  logoOverlayPosition,
} from '../../shared/coverLayout';

export { COVER_HEIGHT, COVER_WIDTH };
export const COVER_LOGO_SIZE = LOGO_DEFAULT_SIZE;
export const COVER_LOGO_TOP_MARGIN = LOGO_MARGIN;

export interface CoverInput {
  base: string;
  /** null composes the cover without a logo (the placement editor draws it live instead) */
  logo: string | null;
  logoPlacement: LogoPlacement | null;
  outputPath: string;
}

export function compileCover(input: CoverInput): string[] {
  const logoSize = input.logoPlacement?.size ?? COVER_LOGO_SIZE;
  const background =
    `[0:v]scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${COVER_WIDTH}:${COVER_HEIGHT},setsar=1`;
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
