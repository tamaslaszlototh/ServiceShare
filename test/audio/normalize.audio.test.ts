import { describe, expect, it } from 'vitest';
import { ClipInfo } from '@shared/types';
import { LOUDNESS_TARGET_I } from '../../src/main/engine';
import { measureLoudness, probe, renderEdit } from './support/harness';
import { useTempDir } from './support/fixture';
import { writeToneWav, WavSpec } from './support/synth';
import {
  IDEMPOTENCE_TOLERANCE_LU,
  LOUDNESS_TOLERANCE_LU,
  TRUE_PEAK_CEILING_DBTP,
  TRUE_PEAK_TOLERANCE_DB,
} from './support/tolerances';

const SPEC: WavSpec = { sampleRate: 48000, channels: 1, bitDepth: 16 };

const dir = useTempDir();
let source: ClipInfo;

async function load(): Promise<void> {
  const input = `${dir()}/quiet.wav`;
  writeToneWav(input, SPEC, 3, 1000, 0.05);
  source = await probe(input);
}

describe('normalize (two-pass loudnorm)', () => {
  it('reaches the loudness target and true-peak ceiling', async () => {
    await load();
    const output = `${dir()}/normalized.wav`;
    await renderEdit(source, [{ kind: 'normalize' }], output);

    const loudness = await measureLoudness(output);
    expect(Math.abs(loudness.integratedLufs - LOUDNESS_TARGET_I)).toBeLessThanOrEqual(LOUDNESS_TOLERANCE_LU);
    expect(loudness.truePeakDbtp).toBeLessThanOrEqual(TRUE_PEAK_CEILING_DBTP + TRUE_PEAK_TOLERANCE_DB);
  });

  it('is idempotent within tolerance on a re-run', async () => {
    await load();
    const first = `${dir()}/normalize-1.wav`;
    await renderEdit(source, [{ kind: 'normalize' }], first);
    const firstLoudness = await measureLoudness(first);

    const normalized = await probe(first);
    const second = `${dir()}/normalize-2.wav`;
    await renderEdit(normalized, [{ kind: 'normalize' }], second);
    const secondLoudness = await measureLoudness(second);

    expect(Math.abs(secondLoudness.integratedLufs - firstLoudness.integratedLufs)).toBeLessThanOrEqual(
      IDEMPOTENCE_TOLERANCE_LU,
    );
  });
});
