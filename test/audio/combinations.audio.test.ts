import { describe, expect, it } from 'vitest';
import { ClipInfo } from '@shared/types';
import { rms, sliceSeconds } from '../../src/main/audio/audio-metrics';
import { decodePcm, measureLoudness, probe, renderEdit } from './support/harness';
import { useTempDir } from './support/fixture';
import { cyclesToSeconds, writeToneWav, WavSpec } from './support/synth';
import { DURATION_TOLERANCE_S, LEVEL_TOLERANCE_DB, SEGMENT_RMS_FLOOR } from './support/tolerances';

const SPEC: WavSpec = { sampleRate: 48000, channels: 1, bitDepth: 16 };
const SECOND: WavSpec = { sampleRate: 48000, channels: 1, bitDepth: 16 };
const FREQ = 1000;
const DURATION = 3;
const SECOND_SECONDS = 1;

const start = cyclesToSeconds(FREQ, 1000);
const cutEnd = cyclesToSeconds(FREQ, 2500);

const dir = useTempDir();
let source: ClipInfo;
let second: ClipInfo;

async function load(): Promise<void> {
  const input = `${dir()}/tone.wav`;
  writeToneWav(input, SPEC, DURATION, FREQ, 0.5);
  source = await probe(input);

  const secondPath = `${dir()}/second.wav`;
  writeToneWav(secondPath, SECOND, SECOND_SECONDS, 500, 0.5);
  second = await probe(secondPath);
}

function render(editList: Parameters<typeof renderEdit>[1], name: string): Promise<void> {
  return renderEdit(source, editList, `${dir()}/${name}.wav`);
}

describe('edit combinations', () => {
  it('applies gain on top of the normalized base (04 §4.2)', async () => {
    await load();
    await render([{ kind: 'normalize' }], 'norm');
    await render([{ kind: 'normalize' }, { kind: 'gain', db: 6 }], 'norm-gain');

    const base = await measureLoudness(`${dir()}/norm.wav`);
    const boosted = await measureLoudness(`${dir()}/norm-gain.wav`);
    expect(Math.abs(boosted.integratedLufs - base.integratedLufs - 6)).toBeLessThanOrEqual(LEVEL_TOLERANCE_DB);
  });

  it('cuts then fades in the surviving head', async () => {
    await load();
    const output = `${dir()}/cut-fade.wav`;
    await render([{ kind: 'cutRegion', start, end: cutEnd }, { kind: 'fadeIn', duration: 0.5 }], 'cut-fade');

    const clip = await probe(output);
    expect(Math.abs(clip.duration - (DURATION - (cutEnd - start)))).toBeLessThanOrEqual(DURATION_TOLERANCE_S);

    const samples = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    const head = rms(sliceSeconds(samples, SPEC.sampleRate, 0.05, 0.2));
    const mid = rms(sliceSeconds(samples, SPEC.sampleRate, 0.6, 1.1));
    expect(mid).toBeGreaterThan(SEGMENT_RMS_FLOOR);
    expect(head).toBeLessThan(mid);
  });

  it('trims then cuts within the trimmed region', async () => {
    await load();
    const output = `${dir()}/trim-cut.wav`;
    const innerStart = cyclesToSeconds(FREQ, 250);
    const innerEnd = cyclesToSeconds(FREQ, 750);
    await render(
      [{ kind: 'trim', start, end: cutEnd }, { kind: 'cutRegion', start: innerStart, end: innerEnd }],
      'trim-cut',
    );

    const clip = await probe(output);
    const expected = (cutEnd - start) - (innerEnd - innerStart);
    expect(Math.abs(clip.duration - expected)).toBeLessThanOrEqual(DURATION_TOLERANCE_S);
  });

  it('supports multiple fades as separate edit-list entries (FR-10)', async () => {
    await load();
    const output = `${dir()}/two-fades.wav`;
    await render([{ kind: 'fadeIn', duration: 0.5 }, { kind: 'fadeOut', duration: 0.5 }], 'two-fades');

    const clip = await probe(output);
    expect(Math.abs(clip.duration - DURATION)).toBeLessThanOrEqual(DURATION_TOLERANCE_S);

    const samples = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    const head = rms(sliceSeconds(samples, SPEC.sampleRate, 0.05, 0.2));
    const mid = rms(sliceSeconds(samples, SPEC.sampleRate, 1.4, 1.6));
    const tail = rms(sliceSeconds(samples, SPEC.sampleRate, 2.8, 2.95));
    expect(mid).toBeGreaterThan(SEGMENT_RMS_FLOOR);
    expect(head).toBeLessThan(mid);
    expect(tail).toBeLessThan(mid);
  });

  it('concatenates then fades out the appended tail', async () => {
    await load();
    const output = `${dir()}/concat-fade.wav`;
    await render(
      [
        { kind: 'concatenate', file: second.filePath, duration: second.duration },
        { kind: 'fadeOut', duration: 0.5 },
      ],
      'concat-fade',
    );

    const clip = await probe(output);
    expect(Math.abs(clip.duration - (DURATION + SECOND_SECONDS))).toBeLessThanOrEqual(DURATION_TOLERANCE_S);

    const samples = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    const beforeFade = rms(sliceSeconds(samples, SPEC.sampleRate, 2.5, 3.0));
    const tail = rms(sliceSeconds(samples, SPEC.sampleRate, 3.8, 3.95));
    expect(beforeFade).toBeGreaterThan(SEGMENT_RMS_FLOOR);
    expect(tail).toBeLessThan(beforeFade);
  });
});
