import { describe, expect, it } from 'vitest';
import { EditOperation } from './types';
import { editedDuration, hasUnknownDuration } from './duration';

const trim = (start: number, end: number): EditOperation => ({ kind: 'trim', start, end });
const cut = (start: number, end: number): EditOperation => ({ kind: 'cutRegion', start, end });
const concat = (duration: number): EditOperation => ({ kind: 'concatenate', file: '/b.wav', duration });

describe('editedDuration', () => {
  it('returns the source duration for no structural edits', () => {
    expect(editedDuration(10, [])).toBe(10);
    expect(editedDuration(10, [{ kind: 'gain', db: 3 }, { kind: 'normalize' }])).toBe(10);
  });

  it('composes trims, cuts and concatenations down the chain', () => {
    expect(editedDuration(10, [trim(2, 8)])).toBe(6);
    expect(editedDuration(10, [cut(2, 4)])).toBe(8);
    expect(editedDuration(10, [concat(5)])).toBe(15);
    expect(editedDuration(10, [trim(2, 8), concat(5)])).toBe(11);
    expect(editedDuration(10, [trim(2, 8), concat(5), cut(3, 4)])).toBe(10);
  });

  it('clamps to zero when cuts remove everything', () => {
    expect(editedDuration(10, [cut(0, 10)])).toBe(0);
    expect(editedDuration(10, [cut(0, 999)])).toBe(0);
    expect(editedDuration(10, [trim(4, 4)])).toBe(0);
  });

  it('never runs negative when an edit reaches past the clip end', () => {
    expect(editedDuration(10, [cut(2, 999)])).toBe(2);
  });

  it('stops at the known prefix when a concatenation has unknown duration', () => {
    expect(editedDuration(10, [concat(Number.NaN)])).toBe(10);
    expect(editedDuration(10, [concat(5), concat(Number.NaN)])).toBe(15);
    expect(editedDuration(10, [concat(Number.NaN), concat(5)])).toBe(10);
  });
});

describe('hasUnknownDuration', () => {
  it('flags a concatenation whose duration is not finite', () => {
    expect(hasUnknownDuration([])).toBe(false);
    expect(hasUnknownDuration([concat(5), trim(1, 2)])).toBe(false);
    expect(hasUnknownDuration([concat(Number.NaN)])).toBe(true);
    expect(hasUnknownDuration([concat(5), concat(Number.NaN)])).toBe(true);
  });
});
