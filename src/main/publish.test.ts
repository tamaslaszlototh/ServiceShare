import { describe, it, expect, vi } from 'vitest';
import { ClipInfo, PublishEvent, PublishRequest } from '@shared/types';
import {
  PUBLISH_SAMPLE_RATE,
  PublishRenderDeps,
  PublishRenderer,
  PublishService,
  PublishServiceDeps,
  compileMp4,
  publishAudioArgs,
} from './publish';
import { UploadCancelled } from './upload';
import { QuotaExceededError } from './errors';

const clip: ClipInfo = {
  filePath: '/tmp/in.wav',
  duration: 30,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
};

const request: PublishRequest = {
  title: 'My Clip',
  description: 'desc',
  tags: ['a'],
  privacyStatus: 'unlisted',
};

describe('publishAudioArgs', () => {
  it('renders the publish track at 48 kHz stereo s16', () => {
    expect(publishAudioArgs()).toEqual(['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2']);
    expect(PUBLISH_SAMPLE_RATE).toBe(48000);
  });
});

describe('compileMp4', () => {
  it('matches the reviewed 04 §4.4 mux snapshot', () => {
    const args = compileMp4({ coverPath: '/c.png', audioPath: '/a.wav', outputPath: '/out.mp4' });

    expect(args).toEqual([
      '-loop',
      '1',
      '-framerate',
      '30',
      '-i',
      '/c.png',
      '-i',
      '/a.wav',
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-shortest',
      '-movflags',
      '+faststart',
      '-y',
      '/out.mp4',
    ]);
  });
});

function renderDeps(over: Partial<PublishRenderDeps> = {}): PublishRenderDeps {
  return {
    resolveFfmpegPath: async () => '/ffmpeg',
    runRender: vi.fn(async () => ({ exitCode: 0, stderr: '' })),
    composeCover: vi.fn(async () => {}),
    ...over,
  };
}

describe('PublishRenderer', () => {
  it('composes the cover, renders audio and muxes the MP4 in order', async () => {
    const deps = renderDeps();
    const stages: string[] = [];

    const result = await new PublishRenderer(deps).render({
      outputDir: '/tmp/pub',
      clip,
      editList: [{ kind: 'gain', db: 2 }],
      title: 'My Clip',
      onStage: (s) => stages.push(s),
    });

    expect(stages).toEqual(['cover', 'render']);
    expect(result).toEqual({ mp4Path: '/tmp/pub/out.mp4', coverPath: '/tmp/pub/cover.png' });
    expect(deps.composeCover).toHaveBeenCalledWith({
      title: 'My Clip',
      coverImagePath: undefined,
      outputPath: '/tmp/pub/cover.png',
    });

    const audioArgs = (deps.runRender as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    expect(audioArgs.join(' ')).toContain('-c:a pcm_s16le -ar 48000 -ac 2');
    expect(audioArgs.at(-1)).toBe('/tmp/pub/audio.wav');

    const muxArgs = (deps.runRender as ReturnType<typeof vi.fn>).mock.calls[1][1] as string[];
    expect(muxArgs).toEqual(compileMp4({ coverPath: '/tmp/pub/cover.png', audioPath: '/tmp/pub/audio.wav', outputPath: '/tmp/pub/out.mp4' }));
  });

  it('raises RenderError with sanitised stderr when muxing fails', async () => {
    const deps = renderDeps({
      runRender: vi
        .fn()
        .mockResolvedValueOnce({ exitCode: 0, stderr: '' })
        .mockResolvedValueOnce({ exitCode: 1, stderr: 'boom\nline2' }),
    });

    await expect(
      new PublishRenderer(deps).render({ outputDir: '/tmp/pub', clip, editList: [], title: 'x' }),
    ).rejects.toMatchObject({ code: 'RenderError', details: 'boom\nline2' });
  });
});

function serviceDeps(over: Partial<PublishServiceDeps> = {}): PublishServiceDeps {
  return {
    getAccessToken: async () => 'token',
    makeTempDir: vi.fn(async () => '/tmp/publish-xyz'),
    removeDir: vi.fn(async () => {}),
    statSize: async () => 2048,
    renderVideo: vi.fn(async () => ({ mp4Path: '/tmp/publish-xyz/out.mp4', coverPath: '/tmp/publish-xyz/cover.png' })),
    upload: vi.fn(async () => ({ videoId: 'vid1', url: 'https://youtu.be/vid1' })),
    ...over,
  };
}

describe('PublishService', () => {
  it('renders, uploads and reports stage progress, then cleans the temp dir', async () => {
    const deps = serviceDeps();
    const events: PublishEvent[] = [];

    const result = await new PublishService(deps).publish(request, { clip, editList: [] }, {
      onEvent: (e) => events.push(e),
    });

    expect(result).toEqual({ status: 'ok', videoId: 'vid1', url: 'https://youtu.be/vid1' });
    expect(events[0]).toEqual({ stage: 'upload', percent: 0 });
    expect(events.at(-1)).toEqual({ stage: 'done', videoId: 'vid1', url: 'https://youtu.be/vid1' });
    expect(deps.removeDir).toHaveBeenCalledWith('/tmp/publish-xyz');

    const uploadArgs = (deps.upload as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(uploadArgs).toMatchObject({
      accessToken: 'token',
      metadata: { title: 'My Clip', description: 'desc', tags: ['a'], privacyStatus: 'unlisted' },
      source: { path: '/tmp/publish-xyz/out.mp4', size: 2048, contentType: 'video/mp4' },
    });
  });

  it('maps an aborted upload to a cancelled result and still cleans up', async () => {
    const deps = serviceDeps({
      upload: vi.fn(async () => {
        throw new UploadCancelled();
      }),
    });
    const events: PublishEvent[] = [];

    const result = await new PublishService(deps).publish(request, { clip, editList: [] }, {
      onEvent: (e) => events.push(e),
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(events.at(-1)).toEqual({ stage: 'cancelled' });
    expect(deps.removeDir).toHaveBeenCalledWith('/tmp/publish-xyz');
  });

  it('surfaces a quota error as a structured result without retrying', async () => {
    const deps = serviceDeps({
      upload: vi.fn(async () => {
        throw new QuotaExceededError('quota');
      }),
    });

    const result = await new PublishService(deps).publish(request, { clip, editList: [] });

    expect(result).toEqual({ status: 'error', error: { code: 'QuotaExceeded', message: expect.any(String), details: 'quota' } });
    expect(deps.removeDir).toHaveBeenCalled();
  });

  it('rejects a publish with no title before touching the engine', async () => {
    const deps = serviceDeps();

    const result = await new PublishService(deps).publish(
      { ...request, title: '   ' },
      { clip, editList: [] },
    );

    expect(result.status).toBe('error');
    expect(deps.renderVideo).not.toHaveBeenCalled();
    expect(deps.makeTempDir).not.toHaveBeenCalled();
  });
});
