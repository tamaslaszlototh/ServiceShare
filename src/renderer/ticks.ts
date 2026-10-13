const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const MAX_TICKS = 10;

export interface RulerTick {
  position: number;
  label: string;
}

export function formatRulerLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function rulerTicks(duration: number): RulerTick[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const step =
    TICK_STEPS.find((candidate) => duration / candidate <= MAX_TICKS) ??
    TICK_STEPS[TICK_STEPS.length - 1];

  const ticks: RulerTick[] = [];
  for (let t = 0; t < duration; t += step) {
    ticks.push({ position: t / duration, label: formatRulerLabel(t) });
  }
  ticks.push({ position: 1, label: formatRulerLabel(duration) });
  return ticks;
}
