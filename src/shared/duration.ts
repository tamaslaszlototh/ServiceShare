import { EditOperation } from './types';

export interface Segment {
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

export function toSegments(sourceDuration: number, editList: readonly EditOperation[]): Segment[] {
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

export function hasUnknownDuration(editList: readonly EditOperation[]): boolean {
  return editList.some((op) => op.kind === 'concatenate' && !Number.isFinite(op.duration));
}

export function editedDuration(sourceDuration: number, editList: readonly EditOperation[]): number {
  return toSegments(sourceDuration, editList).reduce((total, segment) => total + segment.length, 0);
}
