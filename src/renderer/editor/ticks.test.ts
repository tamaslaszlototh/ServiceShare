import { describe, it, expect } from 'vitest';
import { rulerTicks, formatRulerLabel } from './ticks';

describe('formatRulerLabel', () => {
  it('formats whole seconds as m:ss', () => {
    expect(formatRulerLabel(0)).toBe('0:00');
    expect(formatRulerLabel(65)).toBe('1:05');
    expect(formatRulerLabel(600)).toBe('10:00');
  });
});

describe('rulerTicks', () => {
  it('spans the clip duration with a readable number of ticks', () => {
    const ticks = rulerTicks(10);

    expect(ticks[0]).toEqual({ position: 0, label: '0:00' });
    expect(ticks[ticks.length - 1]).toEqual({ position: 1, label: '0:10' });
    expect(ticks.length).toBeLessThanOrEqual(11);
  });

  it('uses larger steps for long clips', () => {
    const ticks = rulerTicks(600);

    expect(ticks[1].position).toBeCloseTo(0.1);
    expect(ticks[1].label).toBe('1:00');
  });

  it('always ends exactly at the clip duration', () => {
    const ticks = rulerTicks(63);
    const last = ticks[ticks.length - 1];

    expect(last.position).toBe(1);
    expect(last.label).toBe('1:03');
  });

  it('returns no ticks for a non-positive duration', () => {
    expect(rulerTicks(0)).toEqual([]);
    expect(rulerTicks(Number.NaN)).toEqual([]);
  });
});

describe('rulerTicks when zoomed', () => {
  it('spaces ticks for the visible window', () => {
    const ticks = rulerTicks(600, 10);

    expect(ticks[1].label).toBe('0:10');
    expect(ticks.length).toBeGreaterThan(50);
  });

  it('labels sub-second steps with tenths', () => {
    const ticks = rulerTicks(10, 16);

    expect(ticks[1].label).toBe('0:00.1');
    expect(ticks[ticks.length - 1].label).toBe('0:10.0');
  });
});
