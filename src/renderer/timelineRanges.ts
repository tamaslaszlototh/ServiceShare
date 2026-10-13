import { EditOperation, Selection } from '@shared/types';

export interface Range {
  start: number;
  end: number;
}

interface Segment {
  srcStart: number | null;
  length: number;
}

function clipSegments(segments: Segment[], start: number, end: number): Segment[] {
  const kept: Segment[] = [];
  let pos = 0;
  for (const segment of segments) {
    const segEnd = pos + segment.length;
    const from = Math.max(start, pos);
    const to = Math.min(end, segEnd);
    if (to > from) {
      kept.push({
        srcStart: segment.srcStart === null ? null : segment.srcStart + (from - pos),
        length: to - from,
      });
    }
    pos = segEnd;
  }
  return kept;
}

function removeSegments(segments: Segment[], start: number, end: number): Segment[] {
  const kept: Segment[] = [];
  let pos = 0;
  for (const segment of segments) {
    const segEnd = pos + segment.length;
    const headEnd = Math.min(segEnd, start);
    if (headEnd > pos) {
      kept.push({ srcStart: segment.srcStart, length: headEnd - pos });
    }
    const tailStart = Math.max(pos, end);
    if (segEnd > tailStart) {
      kept.push({
        srcStart: segment.srcStart === null ? null : segment.srcStart + (tailStart - pos),
        length: segEnd - tailStart,
      });
    }
    pos = segEnd;
  }
  return kept;
}

function toSegments(sourceDuration: number, editList: EditOperation[]): Segment[] {
  let segments: Segment[] = [{ srcStart: 0, length: sourceDuration }];
  for (const op of editList) {
    switch (op.kind) {
      case 'trim':
        segments = clipSegments(segments, op.start, op.end);
        break;
      case 'cutRegion':
        segments = removeSegments(segments, op.start, op.end);
        break;
      case 'concatenate':
        if (!Number.isFinite(op.duration)) {
          return segments;
        }
        segments.push({ srcStart: null, length: op.duration });
        break;
      default:
        break;
    }
  }
  return segments;
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

export function keptSourceRanges(sourceDuration: number, editList: EditOperation[]): Range[] {
  if (!(sourceDuration > 0)) {
    return [];
  }
  const kept = toSegments(sourceDuration, editList)
    .filter((segment): segment is Segment & { srcStart: number } => segment.srcStart !== null)
    .map((segment) => ({ start: segment.srcStart, end: segment.srcStart + segment.length }));
  return mergeRanges(kept);
}

export function removedSourceRanges(sourceDuration: number, editList: EditOperation[]): Range[] {
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

export function editedDuration(sourceDuration: number, editList: EditOperation[]): number {
  return toSegments(sourceDuration, editList).reduce((total, segment) => total + segment.length, 0);
}

export function editedToSource(
  editedTime: number,
  sourceDuration: number,
  editList: EditOperation[],
): number | null {
  if (!(sourceDuration > 0)) {
    return null;
  }
  const segments = toSegments(sourceDuration, editList);
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (!(total > 0)) {
    return null;
  }
  const time = Math.max(0, Math.min(editedTime, total));
  let pos = 0;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const end = pos + segment.length;
    if (time < end || i === segments.length - 1) {
      return segment.srcStart === null ? null : segment.srcStart + (time - pos);
    }
    pos = end;
  }
  return null;
}

export function sourceToEdited(
  sourceTime: number,
  sourceDuration: number,
  editList: EditOperation[],
): number | null {
  if (!(sourceDuration > 0)) {
    return null;
  }
  let pos = 0;
  for (const segment of toSegments(sourceDuration, editList)) {
    if (segment.srcStart !== null) {
      const end = segment.srcStart + segment.length;
      if (sourceTime >= segment.srcStart && sourceTime <= end) {
        return pos + (sourceTime - segment.srcStart);
      }
    }
    pos += segment.length;
  }
  return null;
}

export function sourceSelectionToEdited(
  selection: Selection,
  sourceDuration: number,
  editList: EditOperation[],
): Selection | null {
  const start = sourceToEdited(selection.start, sourceDuration, editList);
  const end = sourceToEdited(selection.end, sourceDuration, editList);
  if (start === null || end === null) {
    return null;
  }
  return { start, end };
}
