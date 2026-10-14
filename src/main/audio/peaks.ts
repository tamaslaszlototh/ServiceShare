import { ClipInfo, PeakBucket, PeakData } from '@shared/types';
import { ffmpegResolver } from './ffmpeg';
import { EngineError } from '../core/errors';
import { sanitizeText } from '../core/sanitize';
import { killActiveProcesses, runFfmpeg } from './runner';

export const TARGET_PEAK_BUCKETS = 4096;
export const DECODE_TIMEOUT_MS = 120000;

export function killActiveDecodes(): void {
  killActiveProcesses();
}

export interface PeakDeps {
  resolveFfmpegPath: () => Promise<string>;
  runDecode: (
    ffmpegPath: string,
    args: string[],
    onChunk: (chunk: Buffer) => void,
  ) => Promise<{ exitCode: number; stderr: string }>;
}

export function samplesPerBucketFor(durationSeconds: number, sampleRate: number): number {
  const totalFrames = Math.max(1, Math.round(durationSeconds * sampleRate));
  return Math.max(1, Math.ceil(totalFrames / TARGET_PEAK_BUCKETS));
}

export function buildDecodeArgs(filePath: string, sampleRate: number, channels: number): string[] {
  return [
    '-v', 'error',
    '-i', filePath,
    '-map', '0:a:0',
    '-vn',
    '-f', 'f32le',
    '-acodec', 'pcm_f32le',
    '-ar', String(sampleRate),
    '-ac', String(channels),
    '-',
  ];
}

export class PeakAccumulator {
  private readonly channels: number;
  private readonly samplesPerBucket: number;
  private leftover: Buffer = Buffer.alloc(0);
  private framesInBucket = 0;
  private curMin: number[];
  private curMax: number[];
  private readonly buckets: PeakBucket[][];

  constructor(channels: number, samplesPerBucket: number) {
    this.channels = channels;
    this.samplesPerBucket = samplesPerBucket;
    this.curMin = new Array(channels).fill(Infinity);
    this.curMax = new Array(channels).fill(-Infinity);
    this.buckets = Array.from({ length: channels }, () => []);
  }

  push(chunk: Buffer): void {
    const data = this.leftover.length ? Buffer.concat([this.leftover, chunk]) : chunk;
    const frameBytes = 4 * this.channels;
    const usable = data.length - (data.length % frameBytes);
    this.leftover = data.subarray(usable);

    for (let offset = 0; offset < usable; offset += frameBytes) {
      for (let channel = 0; channel < this.channels; channel++) {
        const value = data.readFloatLE(offset + channel * 4);
        if (value < this.curMin[channel]) this.curMin[channel] = value;
        if (value > this.curMax[channel]) this.curMax[channel] = value;
      }
      this.framesInBucket++;
      if (this.framesInBucket >= this.samplesPerBucket) {
        this.flushBucket();
      }
    }
  }

  finish(): PeakData {
    if (this.framesInBucket > 0) {
      this.flushBucket();
    }
    this.leftover = Buffer.alloc(0);
    return { channels: this.channels, buckets: this.buckets };
  }

  private flushBucket(): void {
    for (let channel = 0; channel < this.channels; channel++) {
      this.buckets[channel].push({ min: this.curMin[channel], max: this.curMax[channel] });
      this.curMin[channel] = Infinity;
      this.curMax[channel] = -Infinity;
    }
    this.framesInBucket = 0;
  }
}

export async function generatePeaks(clip: ClipInfo, deps: PeakDeps): Promise<PeakData> {
  const samplesPerBucket = samplesPerBucketFor(clip.duration, clip.sampleRate);
  const accumulator = new PeakAccumulator(clip.channels, samplesPerBucket);

  const ffmpegPath = await deps.resolveFfmpegPath();
  const args = buildDecodeArgs(clip.filePath, clip.sampleRate, clip.channels);
  const result = await deps.runDecode(ffmpegPath, args, (chunk) => accumulator.push(chunk));

  if (result.exitCode !== 0) {
    throw new EngineError(
      'Failed to decode audio for waveform',
      sanitizeText(result.stderr),
    );
  }

  return accumulator.finish();
}

function runDecode(
  ffmpegPath: string,
  args: string[],
  onChunk: (chunk: Buffer) => void,
): Promise<{ exitCode: number; stderr: string }> {
  return runFfmpeg(ffmpegPath, args, { onStdout: onChunk, timeoutMs: DECODE_TIMEOUT_MS });
}

export const defaultPeakDeps: PeakDeps = {
  resolveFfmpegPath: async () => (await ffmpegResolver.resolve()).ffmpeg,
  runDecode,
};
