import { describe, it, expect } from 'vitest';
import {
  PeakAccumulator,
  buildDecodeArgs,
  generatePeaks,
  samplesPerBucketFor,
  PeakDeps,
} from './peaks';
import { EngineError } from './errors';
import { ClipInfo } from '@shared/types';

function f32(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}

describe('samplesPerBucketFor', () => {
  it('decimates a clip to roughly the target bucket count', () => {
    expect(samplesPerBucketFor(10, 44100)).toBe(108);
  });

  it('never decimates below one sample per bucket', () => {
    expect(samplesPerBucketFor(0.001, 44100)).toBe(1);
  });
});

describe('PeakAccumulator', () => {
  it('computes min and max for a single channel bucket', () => {
    const acc = new PeakAccumulator(1, 4);
    acc.push(f32(0.1, -0.5, 0.9, 0.2));

    const peaks = acc.finish();

    expect(peaks.channels).toBe(1);
    expect(peaks.buckets).toEqual([[{ min: expect.closeTo(-0.5), max: expect.closeTo(0.9) }]]);
  });

  it('splits into multiple buckets and flushes a trailing partial bucket', () => {
    const acc = new PeakAccumulator(1, 2);
    acc.push(f32(0.1, 0.2, 0.3, 0.4, -1));

    const peaks = acc.finish();

    expect(peaks.buckets).toEqual([
      [
        { min: expect.closeTo(0.1), max: expect.closeTo(0.2) },
        { min: expect.closeTo(0.3), max: expect.closeTo(0.4) },
        { min: expect.closeTo(-1), max: expect.closeTo(-1) },
      ],
    ]);
  });

  it('keeps channel data separate for interleaved stereo', () => {
    const acc = new PeakAccumulator(2, 2);
    acc.push(f32(0.0, 0.9, 0.5, -0.5));

    const peaks = acc.finish();

    expect(peaks.channels).toBe(2);
    expect(peaks.buckets[0]).toEqual([{ min: expect.closeTo(0), max: expect.closeTo(0.5) }]);
    expect(peaks.buckets[1]).toEqual([{ min: expect.closeTo(-0.5), max: expect.closeTo(0.9) }]);
  });

  it('reassembles frames split across chunk boundaries', () => {
    const acc = new PeakAccumulator(2, 2);
    const all = f32(0.1, 0.2, 0.3, 0.4, 0.5, 0.6);
    acc.push(all.subarray(0, 3));
    acc.push(all.subarray(3, 10));
    acc.push(all.subarray(10));

    const peaks = acc.finish();

    expect(peaks.buckets[0]).toEqual([
      { min: expect.closeTo(0.1), max: expect.closeTo(0.3) },
      { min: expect.closeTo(0.5), max: expect.closeTo(0.5) },
    ]);
    expect(peaks.buckets[1]).toEqual([
      { min: expect.closeTo(0.2), max: expect.closeTo(0.4) },
      { min: expect.closeTo(0.6), max: expect.closeTo(0.6) },
    ]);
  });
});

const CLIP: ClipInfo = {
  duration: 0.5,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 1,
  filePath: '/music/song.wav',
};

function makeDeps(exitCode = 0, stderr = '') {
  const calls: { ffmpegPath: string; args: string[] }[] = [];
  const deps: PeakDeps = {
    resolveFfmpegPath: async () => '/bin/ffmpeg',
    runDecode: async (ffmpegPath, args, onChunk) => {
      calls.push({ ffmpegPath, args });
      onChunk(f32(0.25, -0.75));
      return { exitCode, stderr };
    },
  };
  return { deps, calls };
}

describe('buildDecodeArgs', () => {
  it('requests raw float PCM at the source rate and channel count', () => {
    const args = buildDecodeArgs('/music/song.wav', 44100, 2);

    expect(args).toEqual([
      '-v', 'error',
      '-i', '/music/song.wav',
      '-map', '0:a:0',
      '-vn',
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ar', '44100',
      '-ac', '2',
      '-',
    ]);
  });
});

describe('generatePeaks', () => {
  it('decodes via ffmpeg and returns accumulated peaks', async () => {
    const { deps, calls } = makeDeps();

    const peaks = await generatePeaks(CLIP, deps);

    expect(calls[0].ffmpegPath).toBe('/bin/ffmpeg');
    expect(calls[0].args).toContain('f32le');
    expect(peaks.buckets).toEqual([[{ min: expect.closeTo(-0.75), max: expect.closeTo(0.25) }]]);
  });

  it('throws EngineError with sanitised stderr when ffmpeg fails', async () => {
    const { deps } = makeDeps(1, 'line1\nline2\nboom');

    const err = await generatePeaks(CLIP, deps).catch((e) => e);

    expect(err).toBeInstanceOf(EngineError);
    expect(err.code).toBe('EngineError');
    expect(err.details).toContain('boom');
  });
});
