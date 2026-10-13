import { describe, it, expect } from 'vitest';
import {
  snapToSample,
  clampTime,
  cursorAt,
  normalizeSelection,
  isCursor,
  selectionLength,
  moveSelection,
  extendSelection,
  formatTime,
  formatTimecode,
  formatSelectionRange,
  formatFadeSeconds,
  timeToFraction,
  xToFraction,
  fractionToTime,
  hitEdge,
} from './selection';

describe('snapToSample', () => {
  it('rounds a time to the nearest sample boundary', () => {
    expect(snapToSample(0.1234, 100)).toBeCloseTo(0.12, 6);
    expect(snapToSample(0.4567, 100)).toBeCloseTo(0.46, 6);
  });

  it('guards against invalid sample rates', () => {
    expect(snapToSample(1.5, 0)).toBe(0);
  });
});

describe('clampTime', () => {
  it('keeps times within the clip duration', () => {
    expect(clampTime(-1, 10)).toBe(0);
    expect(clampTime(4, 10)).toBe(4);
    expect(clampTime(12, 10)).toBe(10);
  });
});

describe('cursorAt', () => {
  it('returns a zero-length selection at the snapped time', () => {
    expect(cursorAt(0.1234, 10, 100)).toEqual({ start: 0.12, end: 0.12 });
  });

  it('clamps the cursor to the clip duration', () => {
    expect(cursorAt(99, 10, 100)).toEqual({ start: 10, end: 10 });
  });
});

describe('normalizeSelection', () => {
  it('orders the two ends', () => {
    expect(normalizeSelection(3, 1, 10, 1000)).toEqual({ start: 1, end: 3 });
  });

  it('clamps to the clip and snaps to samples', () => {
    expect(normalizeSelection(-5, 20, 10, 100)).toEqual({ start: 0, end: 10 });
    expect(normalizeSelection(0.123, 0.456, 10, 100)).toEqual({ start: 0.12, end: 0.46 });
  });
});

describe('isCursor / selectionLength', () => {
  it('detects a zero-length selection and measures length', () => {
    expect(isCursor({ start: 2, end: 2 })).toBe(true);
    expect(isCursor({ start: 2, end: 3 })).toBe(false);
    expect(selectionLength({ start: 2, end: 5 })).toBe(3);
  });
});

describe('Keyboard nudges', () => {
  it('moves a selection keeping its length and staying in bounds', () => {
    expect(moveSelection({ start: 1, end: 3 }, 1, 10, 1000)).toEqual({ start: 2, end: 4 });
    expect(moveSelection({ start: 1, end: 3 }, -5, 10, 1000)).toEqual({ start: 0, end: 2 });
    expect(moveSelection({ start: 8, end: 10 }, 5, 10, 1000)).toEqual({ start: 8, end: 10 });
  });

  it('moves a cursor', () => {
    expect(moveSelection({ start: 5, end: 5 }, 1, 10, 1000)).toEqual({ start: 6, end: 6 });
  });

  it('extends the end edge, flipping when dragged past the start', () => {
    expect(extendSelection({ start: 2, end: 3 }, 2, 10, 1000)).toEqual({ start: 2, end: 5 });
    expect(extendSelection({ start: 2, end: 5 }, -10, 10, 1000)).toEqual({ start: 0, end: 2 });
  });
});

describe('formatTime', () => {
  it('formats m:ss.mmm with a locale decimal separator', () => {
    expect(formatTime(0, 'en')).toBe('0:00.000');
    expect(formatTime(48.3, 'en')).toBe('0:48.300');
    expect(formatTime(62.5, 'hu')).toBe('1:02,500');
  });

  it('clamps invalid values', () => {
    expect(formatTime(-1, 'en')).toBe('0:00.000');
    expect(formatTime(Number.NaN, 'hu')).toBe('0:00,000');
  });
});

describe('formatTimecode', () => {
  it('formats HH:MM:SS.mmm with a locale decimal separator', () => {
    expect(formatTimecode(0, 'en')).toBe('00:00:00.000');
    expect(formatTimecode(48.3, 'en')).toBe('00:00:48.300');
    expect(formatTimecode(3723.456, 'hu')).toBe('01:02:03,456');
  });

  it('clamps invalid values', () => {
    expect(formatTimecode(Number.NaN, 'en')).toBe('00:00:00.000');
    expect(formatTimecode(-5, 'en')).toBe('00:00:00.000');
  });
});

describe('formatSelectionRange', () => {
  it('renders start → end in the locale', () => {
    expect(formatSelectionRange({ start: 12, end: 48.3 }, 'en')).toBe('00:00:12.000 → 00:00:48.300');
    expect(formatSelectionRange({ start: 12, end: 48.3 }, 'hu')).toBe('00:00:12,000 → 00:00:48,300');
  });
});

describe('formatFadeSeconds', () => {
  it('trims trailing zeros and localizes the separator', () => {
    expect(formatFadeSeconds(0.5, 'en')).toBe('0.5s');
    expect(formatFadeSeconds(0.5, 'hu')).toBe('0,5s');
    expect(formatFadeSeconds(1, 'en')).toBe('1s');
    expect(formatFadeSeconds(0.25, 'hu')).toBe('0,25s');
    expect(formatFadeSeconds(null, 'en')).toBe('0s');
  });
});

describe('pointer mapping', () => {
  it('maps pixels to a fraction of the width', () => {
    expect(xToFraction(250, 1000)).toBeCloseTo(0.25, 6);
    expect(xToFraction(250, 0)).toBe(0);
  });

  it('maps a fraction to a clamped time', () => {
    expect(fractionToTime(0.25, 4)).toBeCloseTo(1, 6);
    expect(fractionToTime(2, 4)).toBe(4);
  });

  it('maps a time to a clamped fraction of the duration', () => {
    expect(timeToFraction(2, 8)).toBeCloseTo(0.25, 6);
    expect(timeToFraction(99, 8)).toBe(1);
    expect(timeToFraction(1, 0)).toBe(0);
  });
});

describe('hitEdge', () => {
  const selection = { start: 0.2, end: 0.8 };

  it('detects grabs on either edge within tolerance', () => {
    expect(hitEdge(203, 1000, selection, 1)).toBe('start');
    expect(hitEdge(797, 1000, selection, 1)).toBe('end');
  });

  it('returns null away from the edges', () => {
    expect(hitEdge(500, 1000, selection, 1)).toBe(null);
  });

  it('returns null when there is no selection', () => {
    expect(hitEdge(500, 1000, null, 1)).toBe(null);
  });

  it('treats a cursor as its start edge', () => {
    expect(hitEdge(500, 1000, { start: 0.5, end: 0.5 }, 1)).toBe('start');
  });
});
