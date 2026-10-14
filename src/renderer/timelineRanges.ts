import { EditOperation } from '@shared/types';
import { Segment, toSegments } from '@shared/duration';

export { editedDuration } from '@shared/duration';

export interface Range {
  start: number;
  end: number;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

export function keptSourceRanges(sourceDuration: number, editList: readonly EditOperation[]): Range[] {
  if (!(sourceDuration > 0)) {
    return [];
  }
  const kept = toSegments(sourceDuration, editList)
    .filter((segment): segment is Segment & { srcStart: number } => segment.srcStart !== null)
    .map((segment) => ({ start: segment.srcStart, end: segment.srcStart + segment.length }));
  return mergeRanges(kept);
}

export function removedSourceRanges(sourceDuration: number, editList: readonly EditOperation[]): Range[] {
  if (!(sourceDuration > 0)) {
    return [];
  }
  const removed: Range[] = [];
  let cursor = 0;
  for (const kept of keptSourceRanges(sourceDuration, editList)) {
    if (kept.start > cursor) {
      removed.push({ start: cursor, end: kept.start });
    }
    cursor = Math.max(cursor, kept.end);
  }
  if (cursor < sourceDuration) {
    removed.push({ start: cursor, end: sourceDuration });
  }
  return removed;
}
