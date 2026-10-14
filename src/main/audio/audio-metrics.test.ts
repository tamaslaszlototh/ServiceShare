import { describe, expect, it } from 'vitest';
import {
  dbToGain,
  interSampleDeltaRatio,
  maxAdjacentDelta,
  peak,
  rms,
  slice,
  sliceSeconds,
  toDb,
  windowedRms,
} from './audio-metrics';

function ramp(length: number, step = 0.1): Float32Array {
  return Float32Array.from({ length }, (_v, i) => i * step);
}

describe('peak / rms', () => {
  it('report zero for empty input', () => {
    expect(peak(new Float32Array())).toBe(0);
    expect(rms(new Float32Array())).toBe(0);
  });

  it('measure a constant signal', () => {
    const samples = new Float32Array(1000).fill(0.5);
    expect(peak(samples)).toBeCloseTo(0.5, 10);
    expect(rms(samples)).toBeCloseTo(0.5, 10);
  });

  it('measure a full-scale sine as 1/sqrt(2)', () => {
    const sr = 48000;
    const freq = 1000;
    const samples = Float32Array.from({ length: sr }, (_v, i) => Math.sin((2 * Math.PI * freq * i) / sr));
    expect(peak(samples)).toBeCloseTo(1, 3);
    expect(rms(samples)).toBeCloseTo(Math.SQRT1_2, 3);
  });
});

describe('toDb / dbToGain', () => {
  it('round-trip decibels and gain', () => {
    expect(toDb(dbToGain(6))).toBeCloseTo(6, 10);
    expect(toDb(dbToGain(-6))).toBeCloseTo(-6, 10);
  });

  it('treat non-positive amplitude as silence', () => {
    expect(toDb(0)).toBe(-Infinity);
  });

  it('doubles amplitude for +6 dB', () => {
    expect(dbToGain(6)).toBeCloseTo(1.9953, 3);
  });
});

describe('slice / sliceSeconds', () => {
  it('clamp to array bounds', () => {
    const samples = ramp(10);
    expect(Array.from(slice(samples, -5, 3))).toEqual([0, 0.1, 0.2].map((v) => Math.fround(v)));
    expect(Array.from(slice(samples, 7, 99))).toEqual([0.7, 0.8, 0.9].map((v) => Math.fround(v)));
    expect(slice(samples, 5, 5).length).toBe(0);
  });

  it('convert seconds to samples', () => {
    const samples = ramp(48000);
    expect(sliceSeconds(samples, 48000, 0.25, 0.5).length).toBe(12000);
  });
});

describe('windowedRms', () => {
  it('produces one value per window and handles the remainder', () => {
    const samples = new Float32Array(25).fill(0.5);
    const windows = windowedRms(samples, 10, 1);
    expect(windows).toHaveLength(3);
    expect(windows[0]).toBeCloseTo(0.5, 10);
    expect(windows[2]).toBeCloseTo(0.5, 10);
  });
});

describe('maxAdjacentDelta / interSampleDeltaRatio', () => {
  it('measure the largest step between neighbours', () => {
    expect(maxAdjacentDelta(ramp(10))).toBeCloseTo(0.1, 6);
  });

  it('flag a spike at the seam', () => {
    const samples = Float32Array.from({ length: 100 }, (_v, i) => (i === 50 ? 1 : 0));
    const ratio = interSampleDeltaRatio(samples, 50, 5, 0, 20);
    expect(ratio).toBe(Infinity);
  });

  it('report a flat ratio for a smooth signal', () => {
    const ratio = interSampleDeltaRatio(ramp(100), 50, 5, 0, 20);
    expect(ratio).toBeCloseTo(1, 5);
  });
});
