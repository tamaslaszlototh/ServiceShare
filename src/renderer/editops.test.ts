import { describe, expect, it } from 'vitest';
import {
  FADE_DEFAULT_SECONDS,
  FADE_MAX_SECONDS,
  FADE_MIN_SECONDS,
  GAIN_MAX_DB,
  GAIN_MIN_DB,
  clampFadeSeconds,
  clampGainDb,
  cutOp,
  fadeInOp,
  fadeOutOp,
  gainOp,
  hasSelection,
  isStructural,
  normalizeOp,
  trimOp,
} from './editops';

describe('hasSelection', () => {
  it('is false for null and zero-length selections', () => {
    expect(hasSelection(null)).toBe(false);
    expect(hasSelection({ start: 1, end: 1 })).toBe(false);
  });

  it('is true for a non-empty selection', () => {
    expect(hasSelection({ start: 1, end: 2 })).toBe(true);
  });
});

describe('trimOp / cutOp', () => {
  it('return null without a usable selection', () => {
    expect(trimOp(null)).toBeNull();
    expect(cutOp({ start: 1, end: 1 })).toBeNull();
  });

  it('build the operation from the selection bounds', () => {
    expect(trimOp({ start: 1.25, end: 3.5 })).toEqual({ kind: 'trim', start: 1.25, end: 3.5 });
    expect(cutOp({ start: 1.25, end: 3.5 })).toEqual({ kind: 'cutRegion', start: 1.25, end: 3.5 });
  });
});

describe('clampFadeSeconds', () => {
  it('clamps to the 0.5-10 second window', () => {
    expect(clampFadeSeconds(0.1)).toBe(FADE_MIN_SECONDS);
    expect(clampFadeSeconds(99)).toBe(FADE_MAX_SECONDS);
    expect(clampFadeSeconds(3)).toBe(3);
  });

  it('falls back to the default for NaN', () => {
    expect(clampFadeSeconds(NaN)).toBe(FADE_DEFAULT_SECONDS);
  });
});

describe('clampGainDb', () => {
  it('clamps to -30..+30 dB', () => {
    expect(clampGainDb(-100)).toBe(GAIN_MIN_DB);
    expect(clampGainDb(100)).toBe(GAIN_MAX_DB);
    expect(clampGainDb(3)).toBe(3);
  });
});

describe('op builders', () => {
  it('build fades with a clamped duration', () => {
    expect(fadeInOp(2)).toEqual({ kind: 'fadeIn', duration: 2 });
    expect(fadeOutOp(99)).toEqual({ kind: 'fadeOut', duration: FADE_MAX_SECONDS });
  });

  it('build gain and normalize ops', () => {
    expect(gainOp(6)).toEqual({ kind: 'gain', db: 6 });
    expect(gainOp(50)).toEqual({ kind: 'gain', db: GAIN_MAX_DB });
    expect(normalizeOp()).toEqual({ kind: 'normalize' });
  });
});

describe('isStructural', () => {
  it('flags structural ops only', () => {
    expect(isStructural({ kind: 'trim', start: 0, end: 1 })).toBe(true);
    expect(isStructural({ kind: 'cutRegion', start: 0, end: 1 })).toBe(true);
    expect(isStructural({ kind: 'concatenate', file: '/b.wav', duration: 5 })).toBe(true);
    expect(isStructural({ kind: 'gain', db: 3 })).toBe(false);
    expect(isStructural({ kind: 'normalize' })).toBe(false);
    expect(isStructural({ kind: 'fadeIn', duration: 2 })).toBe(false);
  });
});
