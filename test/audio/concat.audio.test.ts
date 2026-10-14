import { describe, expect, it } from 'vitest';
import { ClipInfo } from '@shared/types';
import { rms, sliceSeconds } from '../../src/main/audio/audio-metrics';
import { decodePcm, probe, renderEdit } from './support/harness';
import { useTempDir } from './support/fixture';
import { writeToneWav, WavSpec } from './support/synth';
import { DURATION_TOLERANCE_S, SEGMENT_RMS_FLOOR } from './support/tolerances';

const FIRST: WavSpec = { sampleRate: 48000, channels: 2, bitDepth: 16 };
const SECOND: WavSpec = { sampleRate: 44100, channels: 1, bitDepth: 16 };

const FIRST_SECONDS = 1.5;
const SECOND_SECONDS = 1;

const dir = useTempDir();
let first: ClipInfo;
let second: ClipInfo;

async function load(): Promise<void> {
  const firstPath = `${dir()}/first.wav`;
  const secondPath = `${dir()}/second.wav`;
  writeToneWav(firstPath, FIRST, FIRST_SECONDS, 1000, 0.5);
  writeToneWav(secondPath, SECOND, SECOND_SECONDS, 500, 0.5);
  first = await probe(firstPath);
  second = await probe(secondPath);
}

describe('concatenate', () => {
  it('sums durations within tolerance', async () => {
    await load();
    const output = `${dir()}/concat.wav`;
    await renderEdit(first, [{ kind: 'concatenate', file: second.filePath, duration: second.duration }], output);
    const clip = await probe(output);
    const expected = FIRST_SECONDS + SECOND_SECONDS;
    expect(Math.abs(clip.duration - expected)).toBeLessThanOrEqual(DURATION_TOLERANCE_S);
  });

  it('adopts the first segment sample rate and channel layout', async () => {
    await load();
    const output = `${dir()}/concat-format.wav`;
    await renderEdit(first, [{ kind: 'concatenate', file: second.filePath, duration: second.duration }], output);
    const clip = await probe(output);
    expect(clip.sampleRate).toBe(FIRST.sampleRate);
    expect(clip.channels).toBe(FIRST.channels);
  });

  it('carries the appended audio past the join', async () => {
    await load();
    const output = `${dir()}/concat-audio.wav`;
    await renderEdit(first, [{ kind: 'concatenate', file: second.filePath, duration: second.duration }], output);
    const samples = await decodePcm(output, { sampleRate: FIRST.sampleRate });
    const secondSegment = rms(sliceSeconds(samples, FIRST.sampleRate, FIRST_SECONDS + 0.2, FIRST_SECONDS + 0.8));
    expect(secondSegment).toBeGreaterThan(SEGMENT_RMS_FLOOR);
  });
});
