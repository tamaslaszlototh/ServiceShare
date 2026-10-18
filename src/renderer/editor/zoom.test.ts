import { describe, it, expect } from 'vitest';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  anchoredScroll,
  bucketRange,
  clampZoom,
  visibleView,
  wheelZoom,
  zoomIn,
  zoomOut,
} from './zoom';

describe('zoom steps', () => {
  it('doubles and halves within the limits', () => {
    expect(zoomIn(1)).toBe(2);
    expect(zoomOut(4)).toBe(2);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
  });

  it('clamps invalid values to the minimum', () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
  });

  it('zooms in on wheel-up and out on wheel-down', () => {
    expect(wheelZoom(2, -100)).toBeGreaterThan(2);
    expect(wheelZoom(2, 100)).toBeLessThan(2);
    expect(wheelZoom(2, 0)).toBe(2);
  });
});

describe('anchoredScroll', () => {
  it('keeps the content under the anchor fixed', () => {
    // 1000px viewport at 2x, scrolled 500px; anchor at 250px => content x 750 (fraction 0.375)
    const next = anchoredScroll(500, 250, 2, 4, 1000);
    expect((next + 250) / 4000).toBeCloseTo(750 / 2000);
  });

  it('clamps to the scrollable range', () => {
    expect(anchoredScroll(0, 0, 2, 1, 1000)).toBe(0);
    expect(anchoredScroll(1000, 1000, 2, 4, 1000)).toBe(3000);
  });
});

describe('visibleView', () => {
  it('maps the scroll window to fractions of the clip', () => {
    expect(visibleView(0, 1000, 1)).toEqual({ start: 0, end: 1 });
    expect(visibleView(1000, 1000, 4)).toEqual({ start: 0.25, end: 0.5 });
  });

  it('falls back to the full clip without a measured viewport', () => {
    expect(visibleView(0, 0, 2)).toEqual({ start: 0, end: 1 });
  });
});

describe('bucketRange', () => {
  it('aggregates several buckets per pixel when zoomed out', () => {
    expect(bucketRange(0, 100, { start: 0, end: 1 }, 1000)).toEqual([0, 10]);
    expect(bucketRange(99, 100, { start: 0, end: 1 }, 1000)).toEqual([990, 1000]);
  });

  it('covers at least one bucket per pixel when zoomed in', () => {
    const view = { start: 0.5, end: 0.6 };
    expect(bucketRange(0, 1000, view, 100)).toEqual([50, 51]);
    expect(bucketRange(999, 1000, view, 100)).toEqual([59, 60]);
  });
});
