import { describe, expect, it } from 'vitest';
import { EditOperation } from '@shared/types';
import {
  editedToSource,
  keptSourceRanges,
  removedSourceRanges,
  sourceSelectionToEdited,
  sourceToEdited,
} from './timelineRanges';

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

describe('editedToSource', () => {
  it('offsets edited time by the trimmed-away head', () => {
    expect(editedToSource(0, 10, [trim(2, 8)])).toBe(2);
    expect(editedToSource(3, 10, [trim(2, 8)])).toBe(5);
    expect(editedToSource(6, 10, [trim(2, 8)])).toBe(8);
  });

  it('jumps over a cut region', () => {
    expect(editedToSource(1.9, 10, [cut(2, 4)])).toBeCloseTo(1.9);
    expect(editedToSource(2, 10, [cut(2, 4)])).toBe(4);
    expect(editedToSource(7, 10, [cut(2, 4)])).toBe(9);
  });

  it('clamps to the edited range and ignores foreign segments', () => {
    expect(editedToSource(100, 10, [trim(2, 8)])).toBe(8);
    expect(editedToSource(7, 10, [trim(2, 8), concat(5)])).toBeNull();
  });
});

describe('sourceToEdited', () => {
  it('is the inverse of editedToSource on kept ranges', () => {
    expect(sourceToEdited(2, 10, [trim(2, 8)])).toBe(0);
    expect(sourceToEdited(5, 10, [trim(2, 8)])).toBe(3);
    expect(sourceToEdited(8, 10, [trim(2, 8)])).toBe(6);
  });

  it('returns null for source time inside a removed range', () => {
    expect(sourceToEdited(0, 10, [trim(2, 8)])).toBeNull();
    expect(sourceToEdited(3, 10, [cut(2, 4)])).toBeNull();
  });

  it('maps source after a cut to the collapsed edited time', () => {
    expect(sourceToEdited(4, 10, [cut(2, 4)])).toBe(2);
    expect(sourceToEdited(9, 10, [cut(2, 4)])).toBe(7);
  });
});

describe('sourceSelectionToEdited', () => {
  it('is the identity when there are no structural edits', () => {
    expect(sourceSelectionToEdited({ start: 3, end: 6 }, 10, [])).toEqual({ start: 3, end: 6 });
  });

  it('shifts a selection made on the source into trimmed-timeline coords', () => {
    expect(sourceSelectionToEdited({ start: 3, end: 6 }, 10, [trim(2, 8)])).toEqual({ start: 1, end: 4 });
  });

  it('returns null when an endpoint falls in a removed range', () => {
    expect(sourceSelectionToEdited({ start: 0, end: 5 }, 10, [trim(2, 8)])).toBeNull();
  });
});
