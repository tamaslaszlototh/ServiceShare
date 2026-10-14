import { createHash } from 'crypto';
import { mkdir, mkdtemp, rm, stat } from 'fs/promises';
import * as path from 'path';
import { ClipInfo, EditOperation } from '@shared/types';
import { CompileInput, LoudnormMeasurement, compileEditList } from './engine';
import { ffmpegResolver } from './ffmpeg';
import { runFfmpeg } from './runner';
import { EngineError } from '../core/errors';
import { sanitizeText } from '../core/sanitize';

export function previewCacheKey(sourceMtimeMs: number, editList: EditOperation[]): string {
  return createHash('sha256').update(`${sourceMtimeMs}\n${JSON.stringify(editList)}`).digest('hex');
}

export function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  const match = stderr.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new EngineError('Could not read loudnorm measurement from FFmpeg output');
  }
  const json = JSON.parse(match[0]) as Record<string, unknown>;
  return {
    measuredI: String(json.input_i),
    measuredTP: String(json.input_tp),
    measuredLRA: String(json.input_lra),
    measuredThresh: String(json.input_thresh),
    offset: String(json.target_offset),
  };
}

export interface PreviewDeps {
  resolveFfmpegPath: () => Promise<string>;
  runRender: (ffmpegPath: string, args: string[]) => Promise<{ exitCode: number; stderr: string }>;
  getMtimeMs: (filePath: string) => Promise<number>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
}

export interface PreviewRender {
  key: string;
  url: string;
  path: string;
  rendered: boolean;
}

export class PreviewService {
  private tempDir: string | null = null;
  private readonly pathsByKey = new Map<string, string>();

  constructor(private readonly deps: PreviewDeps) {}

  pathFor(key: string): string | null {
    return this.pathsByKey.get(key) ?? null;
  }

  async ensure(clip: ClipInfo, editList: EditOperation[]): Promise<PreviewRender> {
    const mtimeMs = await this.deps.getMtimeMs(clip.filePath);
    const key = previewCacheKey(mtimeMs, editList);

    const cachedPath = this.pathsByKey.get(key);
    if (cachedPath) {
      return { key, url: `preview://${key}`, path: cachedPath, rendered: false };
    }

    const dir = this.tempDir ?? (this.tempDir = await this.deps.makeTempDir());
    const outputPath = path.join(dir, `preview-${key.slice(0, 16)}.wav`);
    await this.render(clip, editList, outputPath);

    this.pathsByKey.set(key, outputPath);
    return { key, url: `preview://${key}`, path: outputPath, rendered: true };
  }

  async dispose(): Promise<void> {
    if (this.tempDir) {
      await this.deps.removeDir(this.tempDir);
    }
    this.tempDir = null;
    this.pathsByKey.clear();
  }

  private async render(clip: ClipInfo, editList: EditOperation[], outputPath: string): Promise<void> {
    const ffmpegPath = await this.deps.resolveFfmpegPath();
    const input: CompileInput = {
      source: clip,
      editList,
      output: { path: outputPath, args: ['-c:a', 'pcm_s16le'] },
    };
    const plan = compileEditList(input);

    if (plan.kind === 'render') {
      await this.run(ffmpegPath, plan.args);
      return;
    }

    const measured = await this.run(ffmpegPath, plan.measureArgs);
    await this.run(ffmpegPath, plan.applyArgs(parseLoudnormJson(measured.stderr)));
  }

  private async run(ffmpegPath: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    const result = await this.deps.runRender(ffmpegPath, args);
    if (result.exitCode !== 0) {
      throw new EngineError('Failed to render preview', sanitizeText(result.stderr));
    }
    return result;
  }
}

export function previewDepsIn(baseDir: string): PreviewDeps {
  return {
    resolveFfmpegPath: async () => (await ffmpegResolver.resolve()).ffmpeg,
    runRender: (ffmpegPath, args) => runFfmpeg(ffmpegPath, args),
    getMtimeMs: async (filePath) => (await stat(filePath)).mtimeMs,
    makeTempDir: async () => {
      await mkdir(baseDir, { recursive: true });
      return mkdtemp(path.join(baseDir, 'preview-'));
    },
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
  };
}
