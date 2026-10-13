import { join } from 'path';
import { stat } from 'fs/promises';
import { AppError, ClipInfo, EditOperation, PublishEvent, PublishRequest, PublishResult } from '@shared/types';
import { CompileInput, compileEditList } from './engine';
import { parseLoudnormJson } from './preview';
import { CoverAssets } from './assets';
import { CoverRequest, CoverService, COVER_HEIGHT, COVER_WIDTH, coverDepsIn } from './cover';
import { ffmpegResolver } from './ffmpeg';
import { RenderError, toAppError } from './errors';
import { sanitizeText } from './sanitize';
import { RunOptions, runFfmpeg } from './runner';
import {
  UploadCancelled,
  UploadOptions,
  UploadResult,
  resumableUpload,
  uploadDepsIn,
} from './upload';
import { ThumbnailOptions, setThumbnail, thumbnailContentType, thumbnailDepsIn } from './thumbnail';

export const PUBLISH_SAMPLE_RATE = 48000;
export const PUBLISH_CHANNELS = 2;
export const PUBLISH_AUDIO_BITRATE = '192k';
export const PUBLISH_CONTENT_TYPE = 'video/mp4';

export function publishAudioArgs(): string[] {
  return ['-c:a', 'pcm_s16le', '-ar', String(PUBLISH_SAMPLE_RATE), '-ac', String(PUBLISH_CHANNELS)];
}

export interface Mp4Input {
  coverPath: string;
  audioPath: string;
  outputPath: string;
}

export function compileMp4(input: Mp4Input): string[] {
  const filter =
    `scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${COVER_WIDTH}:${COVER_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`;

  return [
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    input.coverPath,
    '-i',
    input.audioPath,
    '-c:v',
    'libx264',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-vf',
    filter,
    '-c:a',
    'aac',
    '-b:a',
    PUBLISH_AUDIO_BITRATE,
    '-ar',
    String(PUBLISH_SAMPLE_RATE),
    '-shortest',
    '-movflags',
    '+faststart',
    '-y',
    input.outputPath,
  ];
}

export interface PublishRenderInput {
  outputDir: string;
  clip: ClipInfo;
  editList: EditOperation[];
  title: string;
  coverImagePath?: string;
  onStage?: (stage: 'cover' | 'render') => void;
}

export interface PublishRenderResult {
  mp4Path: string;
  coverPath: string;
}

export interface PublishRenderDeps {
  resolveFfmpegPath: () => Promise<string>;
  runRender: (
    ffmpegPath: string,
    args: string[],
    options?: RunOptions,
  ) => Promise<{ exitCode: number; stderr: string }>;
  composeCover: (request: CoverRequest) => Promise<void>;
}

export class PublishRenderer {
  constructor(private readonly deps: PublishRenderDeps) {}

  async render(input: PublishRenderInput): Promise<PublishRenderResult> {
    const coverPath = join(input.outputDir, 'cover.png');
    const audioPath = join(input.outputDir, 'audio.wav');
    const mp4Path = join(input.outputDir, 'out.mp4');

    input.onStage?.('cover');
    await this.deps.composeCover({
      title: input.title,
      coverImagePath: input.coverImagePath,
      outputPath: coverPath,
    });

    input.onStage?.('render');
    await this.renderAudio(input.clip, input.editList, audioPath);

    const ffmpegPath = await this.deps.resolveFfmpegPath();
    const result = await this.deps.runRender(ffmpegPath, compileMp4({ coverPath, audioPath, outputPath: mp4Path }));
    if (result.exitCode !== 0) {
      throw new RenderError('Could not mux the publish video', sanitizeText(result.stderr));
    }

    return { mp4Path, coverPath };
  }

  private async renderAudio(
    clip: ClipInfo,
    editList: EditOperation[],
    outputPath: string,
  ): Promise<void> {
    const ffmpegPath = await this.deps.resolveFfmpegPath();
    const compileInput: CompileInput = {
      source: clip,
      editList,
      output: { path: outputPath, args: publishAudioArgs() },
    };
    const plan = compileEditList(compileInput);

    const run = async (args: string[]): Promise<{ exitCode: number; stderr: string }> => {
      const result = await this.deps.runRender(ffmpegPath, args);
      if (result.exitCode !== 0) {
        throw new RenderError('Could not render the publish track', sanitizeText(result.stderr));
      }
      return result;
    };

    if (plan.kind === 'render') {
      await run(plan.args);
      return;
    }

    const measured = await run(plan.measureArgs);
    await run(plan.applyArgs(parseLoudnormJson(measured.stderr)));
  }
}

export interface PublishContext {
  clip: ClipInfo;
  editList: EditOperation[];
}

export interface PublishHooks {
  signal?: AbortSignal;
  onEvent?: (event: PublishEvent) => void;
}

export interface PublishServiceDeps {
  getAccessToken: () => Promise<string>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
  statSize: (filePath: string) => Promise<number>;
  renderVideo: (input: PublishRenderInput) => Promise<PublishRenderResult>;
  upload: (options: UploadOptions) => Promise<UploadResult>;
  setThumbnail: (options: ThumbnailOptions) => Promise<void>;
}

export class PublishService {
  constructor(private readonly deps: PublishServiceDeps) {}

  async publish(
    request: PublishRequest,
    context: PublishContext,
    hooks: PublishHooks = {},
  ): Promise<PublishResult> {
    const emit = hooks.onEvent ?? (() => {});
    const title = request.title.trim();

    if (!title) {
      return this.fail({ code: 'EngineError', message: 'A title is required to publish' }, emit);
    }

    let dir: string | null = null;
    try {
      const accessToken = await this.deps.getAccessToken();
      dir = await this.deps.makeTempDir();

      const { mp4Path } = await this.deps.renderVideo({
        outputDir: dir,
        clip: context.clip,
        editList: context.editList,
        title,
        coverImagePath: request.coverImagePath,
        onStage: (stage) => emit({ stage }),
      });

      const size = await this.deps.statSize(mp4Path);
      emit({ stage: 'upload', percent: 0 });

      const uploaded = await this.deps.upload({
        accessToken,
        metadata: {
          title,
          description: request.description,
          tags: request.tags,
          privacyStatus: request.privacyStatus,
        },
        source: { path: mp4Path, size, contentType: PUBLISH_CONTENT_TYPE },
        signal: hooks.signal,
        onProgress: (percent) => emit({ stage: 'upload', percent }),
      });

      let warning: AppError | undefined;
      if (request.thumbnailPath) {
        try {
          const thumbnailSize = await this.deps.statSize(request.thumbnailPath);
          await this.deps.setThumbnail({
            accessToken,
            videoId: uploaded.videoId,
            source: {
              path: request.thumbnailPath,
              size: thumbnailSize,
              contentType: thumbnailContentType(request.thumbnailPath),
            },
            signal: hooks.signal,
          });
        } catch (e) {
          warning = toAppError(e, 'EngineError');
        }
      }

      emit({ stage: 'done', videoId: uploaded.videoId, url: uploaded.url, warning });
      return { status: 'ok', videoId: uploaded.videoId, url: uploaded.url, warning };
    } catch (e) {
      if (e instanceof UploadCancelled) {
        emit({ stage: 'cancelled' });
        return { status: 'cancelled' };
      }
      return this.fail(toAppError(e, 'EngineError'), emit);
    } finally {
      if (dir) {
        await this.deps.removeDir(dir);
      }
    }
  }

  private fail(error: AppError, emit: (event: PublishEvent) => void): PublishResult {
    emit({ kind: 'error', error });
    return { status: 'error', error };
  }
}

export interface PublishDepsInOptions {
  resolveAssets: () => CoverAssets;
  getAccessToken: () => Promise<string>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
}

export function publishDepsIn(options: PublishDepsInOptions): PublishServiceDeps {
  const coverService = new CoverService(coverDepsIn(options.resolveAssets));
  const uploadDeps = uploadDepsIn();
  const renderer = new PublishRenderer({
    resolveFfmpegPath: async () => (await ffmpegResolver.resolve()).ffmpeg,
    runRender: (ffmpegPath, args, runOptions) => runFfmpeg(ffmpegPath, args, runOptions),
    composeCover: (request) => coverService.compose(request),
  });

  return {
    getAccessToken: options.getAccessToken,
    makeTempDir: options.makeTempDir,
    removeDir: options.removeDir,
    statSize: async (filePath) => (await stat(filePath)).size,
    renderVideo: (input) => renderer.render(input),
    upload: (uploadOptions) => resumableUpload(uploadOptions, uploadDeps),
    setThumbnail: (thumbnailOptions) => setThumbnail(thumbnailOptions, thumbnailDepsIn()),
  };
}
