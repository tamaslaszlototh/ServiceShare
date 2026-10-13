import { EditOperation, Selection } from '@shared/types';

export const FADE_MIN_SECONDS = 0.5;
export const FADE_MAX_SECONDS = 10;
export const FADE_DEFAULT_SECONDS = 2;
export const GAIN_MIN_DB = -30;
export const GAIN_MAX_DB = 30;

export function hasSelection(selection: Selection | null): selection is Selection {
  return selection !== null && selection.end > selection.start;
}

export function clampFadeSeconds(value: number): number {
  if (Number.isNaN(value)) {
    return FADE_DEFAULT_SECONDS;
  }
  return Math.min(FADE_MAX_SECONDS, Math.max(FADE_MIN_SECONDS, value));
}

export function clampGainDb(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(GAIN_MAX_DB, Math.max(GAIN_MIN_DB, value));
}

export function trimOp(selection: Selection | null): EditOperation | null {
  if (!hasSelection(selection)) {
    return null;
  }
  return { kind: 'trim', start: selection.start, end: selection.end };
}

export function cutOp(selection: Selection | null): EditOperation | null {
  if (!hasSelection(selection)) {
    return null;
  }
  return { kind: 'cutRegion', start: selection.start, end: selection.end };
}

export function fadeInOp(seconds: number): EditOperation {
  return { kind: 'fadeIn', duration: clampFadeSeconds(seconds) };
}

export function fadeOutOp(seconds: number): EditOperation {
  return { kind: 'fadeOut', duration: clampFadeSeconds(seconds) };
}

export function gainOp(db: number): EditOperation {
  return { kind: 'gain', db: clampGainDb(db) };
}

export function normalizeOp(): EditOperation {
  return { kind: 'normalize' };
}

export function isStructural(op: EditOperation): boolean {
  return op.kind === 'trim' || op.kind === 'cutRegion' || op.kind === 'concatenate';
}

export function activeFadeSeconds(
  editList: EditOperation[],
  historyIndex: number,
  kind: 'fadeIn' | 'fadeOut',
): number | null {
  for (let i = Math.min(historyIndex, editList.length) - 1; i >= 0; i--) {
    const op = editList[i];
    if (op.kind === kind) {
      return op.duration;
    }
  }
  return null;
}
