const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const MAX_TICKS = 10;

export interface RulerTick {
  position: number;
  label: string;
}

export function formatRulerLabel(seconds: number, decimals = 0): string {
  const scale = 10 ** decimals;
  const total = Math.max(0, Math.round(seconds * scale) / scale);
  const minutes = Math.floor(total / 60);
  const rest = (total - minutes * 60).toFixed(decimals);
  return `${minutes}:${rest.padStart(decimals > 0 ? 3 + decimals : 2, '0')}`;
}

/** Ticks across the whole clip, spaced for `zoom` (only ~1/zoom of the clip is visible at once). */
export function rulerTicks(duration: number, zoom = 1): RulerTick[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const visible = duration / Math.max(1, zoom);
  const step =
    TICK_STEPS.find((candidate) => visible / candidate <= MAX_TICKS) ??
    TICK_STEPS[TICK_STEPS.length - 1];
  const decimals = step < 1 ? 1 : 0;

  const ticks: RulerTick[] = [];
  for (let i = 0; i * step < duration; i++) {
    const t = i * step;
    ticks.push({ position: t / duration, label: formatRulerLabel(t, decimals) });
  }
  ticks.push({ position: 1, label: formatRulerLabel(duration, decimals) });
  return ticks;
}
