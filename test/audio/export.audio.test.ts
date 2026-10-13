import { describe, expect, it } from 'vitest';
import { ClipInfo, ExportFormat } from '@shared/types';
import { ExportService } from '../../src/main/export';
import { FFMPEG_PATH, ffprobeAudio, measureLoudness, probe, renderEdit, run } from './support/harness';
import { useTempDir } from './support/fixture';
import { writeToneWav, WavSpec } from './support/synth';
import { DURATION_TOLERANCE_S } from './support/tolerances';

const SPEC: WavSpec = { sampleRate: 96000, channels: 1, bitDepth: 24 };
const FREQ = 1000;
const SECONDS = 3;
const BITRATE_TOLERANCE = 2000;
const MP3_LOUDNESS_DELTA_LU = 1;

const dir = useTempDir();
let source: ClipInfo;

const service = new ExportService({
  resolveFfmpegPath: async () => FFMPEG_PATH,
  runRender: (_ffmpegPath, args) => run(args),
});

async function load(): Promise<void> {
  const input = `${dir()}/source.wav`;
  writeToneWav(input, SPEC, SECONDS, FREQ, 0.5);
  source = await probe(input);
}

async function exportAs(format: ExportFormat, name: string): Promise<string> {
  const output = `${dir()}/${name}`;
  await service.export(source, [], { format, outputPath: output });
  return output;
}

describe('export WAV', () => {
  it('preserves the source sample rate, bit depth and channels', async () => {
    await load();
    const output = await exportAs('wav', 'out.wav');
    const info = await ffprobeAudio(output);

    expect(info.codecName).toBe('pcm_s24le');
    expect(info.sampleRate).toBe(SPEC.sampleRate);
    expect(info.channels).toBe(SPEC.channels);
    expect(Math.abs((info.duration ?? 0) - SECONDS)).toBeLessThanOrEqual(DURATION_TOLERANCE_S);
  });
});

describe('export MP3', () => {
  it('encodes 192 kbps with loudness within 1 LU of the WAV render', async () => {
    await load();
    const output = await exportAs('mp3', 'out.mp3');
    const info = await ffprobeAudio(output);

    expect(info.formatName).toContain('mp3');
    expect(info.bitRate).not.toBeNull();
    expect(Math.abs((info.bitRate ?? 0) - 192000)).toBeLessThanOrEqual(BITRATE_TOLERANCE);
    expect(Math.abs((info.duration ?? 0) - SECONDS)).toBeLessThanOrEqual(0.05);

    const reference = `${dir()}/reference.wav`;
    await renderEdit(source, [], reference);
    const [referenceLoudness, mp3Loudness] = await Promise.all([measureLoudness(reference), measureLoudness(output)]);
    expect(Math.abs(mp3Loudness.integratedLufs - referenceLoudness.integratedLufs)).toBeLessThanOrEqual(
      MP3_LOUDNESS_DELTA_LU,
    );
  });
});

describe('export AAC', () => {
  it('encodes the source sample rate at 192 kbps in an M4A container', async () => {
    await load();
    const output = await exportAs('aac', 'out.m4a');
    const info = await ffprobeAudio(output);

    expect(info.codecName).toBe('aac');
    expect(info.sampleRate).toBe(SPEC.sampleRate);
    expect(info.bitRate).not.toBeNull();
    expect(Math.abs((info.bitRate ?? 0) - 192000)).toBeLessThanOrEqual(BITRATE_TOLERANCE);
    expect(Math.abs((info.duration ?? 0) - SECONDS)).toBeLessThanOrEqual(0.05);
  });
});
