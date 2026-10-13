import { describe, it, expect } from 'vitest';
import { probeClip, WavProbeDeps, FfprobeOutput } from './probe';
import { FormatError, CorruptFileError, PermissionError } from './errors';

function ffprobeWav(opts: {
  codec?: string;
  sampleRate?: string | number;
  channels?: number;
  duration?: string | number;
  formatName?: string;
} = {}) {
  const {
    codec = 'pcm_s16le',
    sampleRate = '44100',
    channels = 2,
    duration = '12.500000',
    formatName = 'wav',
  } = opts;
  return {
    streams: [
      {
        codec_type: 'audio',
        codec_name: codec,
        sample_rate: sampleRate,
        channels,
        duration,
      },
    ],
    format: { format_name: formatName, duration },
  };
}

function makeDeps(overrides: Partial<WavProbeDeps> = {}) {
  const calls: { ffprobePath: string; filePath: string }[] = [];
  const deps: WavProbeDeps = {
    resolveFfprobePath: async () => '/bin/ffprobe',
    runFfprobe: async (ffprobePath, filePath) => {
      calls.push({ ffprobePath, filePath });
      return okOutput(ffprobeWav());
    },
    isReadable: async () => true,
    ...overrides,
  };
  return { deps, calls };
}

function okOutput(json: unknown): FfprobeOutput {
  return { stdout: JSON.stringify(json), stderr: '', exitCode: 0 };
}

describe('probeClip', () => {
  it('returns clip info for a 16-bit PCM WAV', async () => {
    const { deps, calls } = makeDeps();

    const clip = await probeClip('/music/song.wav', deps);

    expect(clip).toEqual({
      duration: 12.5,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/song.wav',
    });
    expect(calls).toEqual([{ ffprobePath: '/bin/ffprobe', filePath: '/music/song.wav' }]);
  });

  it('reports 24-bit for pcm_s24le', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => okOutput(ffprobeWav({ codec: 'pcm_s24le', sampleRate: '96000', channels: 1 })),
    });

    const clip = await probeClip('/music/hires.wav', deps);

    expect(clip.bitDepth).toBe(24);
    expect(clip.sampleRate).toBe(96000);
    expect(clip.channels).toBe(1);
  });

  it('rejects an MP3 with FormatError and the specified message', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () =>
        okOutput(ffprobeWav({ codec: 'mp3', formatName: 'mp3', duration: '3.0' })),
    });

    const err = await probeClip('/music/song.mp3', deps).catch((e) => e);

    expect(err).toBeInstanceOf(FormatError);
    expect(err.code).toBe('FormatError');
    expect(err.message).toBe('FormatError: only PCM WAV is editable');
  });

  it('rejects a PCM stream that is not in a WAV container with FormatError', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => okOutput(ffprobeWav({ formatName: 'aiff' })),
    });

    const err = await probeClip('/music/song.aiff', deps).catch((e) => e);

    expect(err).toBeInstanceOf(FormatError);
    expect(err.details).toContain('aiff');
  });

  it('rejects an unsupported PCM encoding (pcm_f32le) with FormatError', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => okOutput(ffprobeWav({ codec: 'pcm_f32le' })),
    });

    const err = await probeClip('/music/float.wav', deps).catch((e) => e);

    expect(err).toBeInstanceOf(FormatError);
    expect(err.details).toContain('pcm_f32le');
  });

  it('rejects a file with no audio stream with FormatError', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => okOutput({ streams: [], format: { format_name: 'wav' } }),
    });

    await expect(probeClip('/music/empty.wav', deps)).rejects.toBeInstanceOf(FormatError);
  });

  it('treats a non-zero ffprobe exit as CorruptFile with sanitised stderr details', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => ({
        stdout: '',
        stderr: '[wav @ 0x1] invalid RIFF header\nlast line detail',
        exitCode: 1,
      }),
    });

    const err = await probeClip('/music/broken.wav', deps).catch((e) => e);

    expect(err).toBeInstanceOf(CorruptFileError);
    expect(err.code).toBe('CorruptFile');
    expect(err.details).toContain('invalid RIFF header');
  });

  it('treats unparseable ffprobe output as CorruptFile', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => ({ stdout: 'not json', stderr: '', exitCode: 0 }),
    });

    await expect(probeClip('/music/broken.wav', deps)).rejects.toBeInstanceOf(CorruptFileError);
  });

  it('treats a header missing required numeric fields as CorruptFile', async () => {
    const { deps } = makeDeps({
      runFfprobe: async () => okOutput({ streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le' }], format: {} }),
    });

    await expect(probeClip('/music/broken.wav', deps)).rejects.toBeInstanceOf(CorruptFileError);
  });

  it('reports PermissionError and does not probe when the file is unreadable', async () => {
    const { deps, calls } = makeDeps({ isReadable: async () => false });

    const err = await probeClip('/locked/a.wav', deps).catch((e) => e);

    expect(err).toBeInstanceOf(PermissionError);
    expect(err.code).toBe('PermissionError');
    expect(err.message).toContain('/locked/a.wav');
    expect(calls).toEqual([]);
  });
});