import { describe, expect, it } from 'vitest';
import { ClipInfo, EditOperation } from '@shared/types';
import { interSampleDeltaRatio, rms, sliceSeconds, toDb } from '../../src/main/audio-metrics';
import { decodePcm, probe, renderEdit } from './support/harness';
import { useTempDir } from './support/fixture';
import { cyclesToSeconds, toneWithGap, writeToneWav, writeWav, WavSpec } from './support/synth';
import {
  DURATION_TOLERANCE_S,
  FADE_MIDPOINT_DB,
  FADE_MIDPOINT_TOLERANCE_DB,
  JOIN_DELTA_RATIO_TOLERANCE,
  LEVEL_TOLERANCE_DB,
  SILENCE_RMS_CEILING,
  UNCHANGED_REGION_DB,
} from './support/tolerances';

const SPEC: WavSpec = { sampleRate: 48000, channels: 1, bitDepth: 16 };
const FREQ = 1000;
const DURATION = 3;

const start = cyclesToSeconds(FREQ, 1000);
const cutEnd = cyclesToSeconds(FREQ, 2500);

const dir = useTempDir();
let source: ClipInfo;
let gapSource: ClipInfo;

function sourceLevel(): Promise<number> {
  return decodePcm(source.filePath, { sampleRate: SPEC.sampleRate }).then((s) => rms(s));
}

async function render(editList: EditOperation[], name: string): Promise<string> {
  const output = `${dir()}/${name}.wav`;
  await renderEdit(source, editList, output);
  return output;
}

async function load(): Promise<void> {
  const input = `${dir()}/tone.wav`;
  writeToneWav(input, SPEC, DURATION, FREQ, 0.5);
  source = await probe(input);

  const gapInput = `${dir()}/gap.wav`;
  writeWav(gapInput, SPEC, toneWithGap(SPEC, DURATION, FREQ, 1, 0.5, 0.5));
  gapSource = await probe(gapInput);
}

describe('trim', () => {
  it('keeps only the selection and reports its duration', async () => {
    await load();
    const output = await render([{ kind: 'trim', start, end: cutEnd }], 'trim');
    const clip = await probe(output);
    expect(Math.abs(clip.duration - (cutEnd - start))).toBeLessThanOrEqual(DURATION_TOLERANCE_S);
  });

  it('keeps a silent region silent', async () => {
    await load();
    const output = `${dir()}/trim-silence.wav`;
    await renderEdit(gapSource, [{ kind: 'trim', start: 1.1, end: 1.4 }], output);
    const samples = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    expect(rms(samples)).toBeLessThan(SILENCE_RMS_CEILING);
  });
});

describe('cut region', () => {
  it('joins the two sides with the expected duration', async () => {
    await load();
    const output = await render([{ kind: 'cutRegion', start, end: cutEnd }], 'cut');
    const clip = await probe(output);
    const expected = DURATION - (cutEnd - start);
    expect(Math.abs(clip.duration - expected)).toBeLessThanOrEqual(DURATION_TOLERANCE_S);
  });

  it('introduces no click at the seam for a phase-aligned source', async () => {
    await load();
    const output = await render([{ kind: 'cutRegion', start, end: cutEnd }], 'cut-seam');
    const samples = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    const seamSample = start * SPEC.sampleRate;
    const referenceStart = 0.2 * SPEC.sampleRate;
    const referenceEnd = 0.8 * SPEC.sampleRate;

    const ratio = interSampleDeltaRatio(samples, seamSample, 8, referenceStart, referenceEnd);
    expect(ratio).toBeLessThanOrEqual(JOIN_DELTA_RATIO_TOLERANCE);
  });
});

describe('fade', () => {
  it('reaches -6 dB at the midpoint of a 2 s fade and leaves the rest unchanged', async () => {
    await load();
    const output = await render([{ kind: 'fadeIn', duration: 2 }], 'fade-in');
    const faded = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    const reference = await decodePcm(source.filePath, { sampleRate: SPEC.sampleRate });

    const midpoint = toDb(rms(sliceSeconds(faded, SPEC.sampleRate, 0.99, 1.01)));
    const referenceLevel = toDb(rms(sliceSeconds(reference, SPEC.sampleRate, 0.99, 1.01)));
    expect(Math.abs(midpoint - referenceLevel - FADE_MIDPOINT_DB)).toBeLessThanOrEqual(FADE_MIDPOINT_TOLERANCE_DB);

    const tailDeltaDb = Math.abs(
      toDb(rms(sliceSeconds(faded, SPEC.sampleRate, 2.5, 3))) -
        toDb(rms(sliceSeconds(reference, SPEC.sampleRate, 2.5, 3))),
    );
    expect(tailDeltaDb).toBeLessThan(UNCHANGED_REGION_DB);
  });

  it('ramps the tail out symmetrically', async () => {
    await load();
    const output = await render([{ kind: 'fadeOut', duration: 2 }], 'fade-out');
    const faded = await decodePcm(output, { sampleRate: SPEC.sampleRate });
    const reference = await decodePcm(source.filePath, { sampleRate: SPEC.sampleRate });

    const midpoint = toDb(rms(sliceSeconds(faded, SPEC.sampleRate, 1.99, 2.01)));
    const referenceLevel = toDb(rms(sliceSeconds(reference, SPEC.sampleRate, 1.99, 2.01)));
    expect(Math.abs(midpoint - referenceLevel - FADE_MIDPOINT_DB)).toBeLessThanOrEqual(FADE_MIDPOINT_TOLERANCE_DB);
  });
});

describe('gain', () => {
  it('applies +6 dB and -6 dB within tolerance', async () => {
    await load();
    const reference = toDb(await sourceLevel());

    const louder = toDb(rms(await decodePcm(await render([{ kind: 'gain', db: 6 }], 'gain-up'), { sampleRate: SPEC.sampleRate })));
    const quieter = toDb(rms(await decodePcm(await render([{ kind: 'gain', db: -6 }], 'gain-down'), { sampleRate: SPEC.sampleRate })));

    expect(Math.abs(louder - reference - 6)).toBeLessThanOrEqual(LEVEL_TOLERANCE_DB);
    expect(Math.abs(quieter - reference + 6)).toBeLessThanOrEqual(LEVEL_TOLERANCE_DB);
  });
});
