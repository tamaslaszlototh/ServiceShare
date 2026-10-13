import { describe, expect, it } from 'vitest';
import { EditOperation } from '@shared/types';
import { editedDuration, keptSourceRanges, removedSourceRanges } from './timelineRanges';

const trim = (start: number, end: number): EditOperation => ({ kind: 'trim', start, end });
const cut = (start: number, end: number): EditOperation => ({ kind: 'cutRegion', start, end });
const concat = (duration: number): EditOperation => ({ kind: 'concatenate', file: '/b.wav', duration });

describe('keptSourceRanges', () => {
  it('keeps the whole source when there are no structural edits', () => {
    expect(keptSourceRanges(10, [])).toEqual([{ start: 0, end: 10 }]);
    expect(keptSourceRanges(10, [{ kind: 'gain', db: 3 }, { kind: 'normalize' }])).toEqual([
      { start: 0, end: 10 },
    ]);
  });

  it('reports the trimmed span as the only kept range', () => {
    expect(keptSourceRanges(10, [trim(2, 8)])).toEqual([{ start: 2, end: 8 }]);
  });

  it('splits the source around a cut region', () => {
    expect(keptSourceRanges(10, [cut(2, 4)])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 10 },
    ]);
  });

  it('maps a cut after a trim back to source coordinates', () => {
    expect(keptSourceRanges(10, [trim(2, 8), cut(1, 3)])).toEqual([
      { start: 2, end: 3 },
      { start: 5, end: 8 },
    ]);
  });

  it('tracks source spans across an inserted concatenation segment', () => {
    expect(keptSourceRanges(10, [trim(2, 8), concat(5), trim(4, 7)])).toEqual([{ start: 6, end: 8 }]);
  });

  it('stops mapping when a concatenation has unknown duration', () => {
    expect(keptSourceRanges(10, [trim(2, 8), concat(Number.NaN)])).toEqual([{ start: 2, end: 8 }]);
  });

  it('returns nothing for an empty source', () => {
    expect(keptSourceRanges(0, [])).toEqual([]);
  });
});

describe('removedSourceRanges', () => {
  it('reports nothing removed when there are no structural edits', () => {
    expect(removedSourceRanges(10, [])).toEqual([]);
  });

  it('reports the trimmed-away head and tail', () => {
    expect(removedSourceRanges(10, [trim(2, 8)])).toEqual([
      { start: 0, end: 2 },
      { start: 8, end: 10 },
    ]);
  });

  it('reports the cut-out middle', () => {
    expect(removedSourceRanges(10, [cut(2, 4)])).toEqual([{ start: 2, end: 4 }]);
  });

  it('reports every gap left by chained structural edits', () => {
    expect(removedSourceRanges(10, [trim(2, 8), cut(1, 3)])).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 8, end: 10 },
    ]);
  });
});

describe('editedDuration', () => {
  it('sums the kept source spans', () => {
    expect(editedDuration(10, [])).toBe(10);
    expect(editedDuration(10, [trim(2, 8)])).toBe(6);
    expect(editedDuration(10, [cut(2, 4)])).toBe(8);
  });

  it('adds concatenated segments', () => {
    expect(editedDuration(10, [concat(5)])).toBe(15);
    expect(editedDuration(10, [trim(2, 8), concat(5)])).toBe(11);
  });
});
