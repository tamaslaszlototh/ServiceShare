import { Selection } from '@shared/types';
import { Locale } from '@shared/i18n';
import { decimalSeparator } from '@shared/format';

export const EDGE_HIT_PX = 6;
export const KEYBOARD_STEP_SECONDS = 0.1;

export type EdgeHit = 'start' | 'end' | null;

export function snapToSample(seconds: number, sampleRate: number): number {
  if (!Number.isFinite(seconds) || sampleRate <= 0) {
    return 0;
  }
  return Math.round(seconds * sampleRate) / sampleRate;
}

export function clampTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return Math.min(Math.max(seconds, 0), duration);
}

export function cursorAt(time: number, duration: number, sampleRate: number): Selection {
  const snapped = snapToSample(clampTime(time, duration), sampleRate);
  return { start: snapped, end: snapped };
}

export function normalizeSelection(
  a: number,
  b: number,
  duration: number,
  sampleRate: number,
): Selection {
  const start = snapToSample(clampTime(Math.min(a, b), duration), sampleRate);
  const end = snapToSample(clampTime(Math.max(a, b), duration), sampleRate);
  return { start, end };
}

export function isCursor(selection: Selection): boolean {
  return selection.start === selection.end;
}

export function selectionLength(selection: Selection): number {
  return selection.end - selection.start;
}

export function moveSelection(
  selection: Selection,
  delta: number,
  duration: number,
  sampleRate: number,
): Selection {
  const length = selectionLength(selection);
  const maxStart = Math.max(0, duration - length);
  const start = Math.min(Math.max(selection.start + delta, 0), maxStart);
  return normalizeSelection(start, start + length, duration, sampleRate);
}

export function extendSelection(
  selection: Selection,
  delta: number,
  duration: number,
  sampleRate: number,
): Selection {
  return normalizeSelection(selection.start, selection.end + delta, duration, sampleRate);
}

export function timeToFraction(seconds: number, duration: number): number {
  return duration > 0 ? clampTime(seconds, duration) / duration : 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function totalMilliseconds(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

export function formatTime(seconds: number, locale: Locale): string {
  const totalMs = totalMilliseconds(seconds);
  const minutes = Math.floor(totalMs / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${pad(secs, 2)}${decimalSeparator(locale)}${pad(millis, 3)}`;
}

export function formatTimecode(seconds: number, locale: Locale): string {
  const totalMs = totalMilliseconds(seconds);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}${decimalSeparator(locale)}${pad(millis, 3)}`;
}

export function formatSelectionRange(selection: Selection, locale: Locale): string {
  return `${formatTimecode(selection.start, locale)} → ${formatTimecode(selection.end, locale)}`;
}

export function formatFadeSeconds(seconds: number | null, locale: Locale): string {
  const trimmed = (seconds ?? 0).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const [whole, fraction] = trimmed.split('.');
  return fraction ? `${whole}${decimalSeparator(locale)}${fraction}s` : `${whole}s`;
}

export function xToFraction(x: number, width: number): number {
  return width > 0 ? x / width : 0;
}

export function fractionToTime(fraction: number, duration: number): number {
  return clampTime(fraction * duration, duration);
}

export function hitEdge(
  x: number,
  width: number,
  selection: Selection | null,
  duration: number,
  tolerance: number = EDGE_HIT_PX,
): EdgeHit {
  if (!selection || width <= 0 || duration <= 0) {
    return null;
  }
  const startX = timeToFraction(selection.start, duration) * width;
  const endX = timeToFraction(selection.end, duration) * width;
  if (Math.abs(x - startX) <= tolerance) {
    return 'start';
  }
  if (Math.abs(x - endX) <= tolerance) {
    return 'end';
  }
  return null;
}
