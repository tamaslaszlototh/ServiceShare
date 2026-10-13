import { ClipInfo, EditOperation, ExportFormat, ExportOptions } from '@shared/types';
import { CompileInput, compileEditList, renderedDuration } from './engine';
import { parseLoudnormJson } from './preview';
import { RunOptions, runFfmpeg } from './runner';
import { ffmpegResolver } from './ffmpeg';
import { DiskFullError, IpcError, RenderError } from './errors';
import { sanitizeText } from './sanitize';

export const MP3_BITRATE = '192k';

export function exportCodecArgs(format: ExportFormat, clip: ClipInfo): string[] {
  switch (format) {
    case 'wav':
      return ['-c:a', clip.bitDepth === 24 ? 'pcm_s24le' : 'pcm_s16le'];
    case 'mp3': {
      const args = ['-c:a', 'libmp3lame', '-b:a', MP3_BITRATE];
      if (clip.channels > 2) {
        args.push('-ac', '2');
      }
      return args;
    }
  }
}

const TIME_PATTERN = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g;

export function parseProgressSeconds(text: string): number | null {
  let seconds: number | null = null;
  for (const match of text.matchAll(TIME_PATTERN)) {
    seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return seconds;
}

export function classifyExportError(stderr: string): IpcError {
  const details = sanitizeText(stderr);
  if (/no space left on device|disk full/i.test(stderr)) {
    return new DiskFullError(details);
  }
  if (/permission denied|operation not permitted|access is denied/i.test(stderr)) {
    return new IpcError('PermissionError', 'Cannot write the export file', details);
  }
  return new RenderError('Export failed', details);
}

export interface ExportDeps {
  resolveFfmpegPath: () => Promise<string>;
  runRender: (
    ffmpegPath: string,
    args: string[],
    options?: RunOptions,
  ) => Promise<{ exitCode: number; stderr: string }>;
}

export type ExportProgressHandler = (percent: number) => void;

export class ExportService {
  constructor(private readonly deps: ExportDeps) {}

  async export(
    clip: ClipInfo,
    editList: EditOperation[],
    options: ExportOptions,
    onProgress: ExportProgressHandler = () => {},
  ): Promise<void> {
    const ffmpegPath = await this.deps.resolveFfmpegPath();
    const expected = renderedDuration(clip, editList);
    const duration = Number.isFinite(expected) && expected > 0 ? expected : clip.duration;
    const input: CompileInput = {
      source: clip,
      editList,
      output: { path: options.outputPath, args: exportCodecArgs(options.format, clip) },
      logLevel: 'info',
    };
    const plan = compileEditList(input);

    if (plan.kind === 'render') {
      await this.run(ffmpegPath, plan.args, duration, onProgress);
      onProgress(100);
      return;
    }

    const measured = await this.run(ffmpegPath, plan.measureArgs, duration, (p) => onProgress(p / 2));
    await this.run(ffmpegPath, plan.applyArgs(parseLoudnormJson(measured.stderr)), duration, (p) =>
      onProgress(50 + p / 2),
    );
    onProgress(100);
  }

  private async run(
    ffmpegPath: string,
    args: string[],
    duration: number,
    onProgress: ExportProgressHandler,
  ): Promise<{ exitCode: number; stderr: string }> {
    const result = await this.deps.runRender(ffmpegPath, args, {
      onStderr: (chunk) => {
        const seconds = parseProgressSeconds(chunk);
        if (seconds !== null && duration > 0) {
          onProgress(Math.min(100, (seconds / duration) * 100));
        }
      },
    });
    if (result.exitCode !== 0) {
      throw classifyExportError(result.stderr);
    }
    return result;
  }
}

export function exportDepsIn(): ExportDeps {
  return {
    resolveFfmpegPath: async () => (await ffmpegResolver.resolve()).ffmpeg,
    runRender: (ffmpegPath, args, options) => runFfmpeg(ffmpegPath, args, options),
  };
}
