import { describe, it, expect } from 'vitest';
import { canRedo, canUndo, redoCount, undoCount } from './history';
import { Document } from './types';

const doc = (historyIndex: number, length: number): Document => ({
  sourceFile: '/tmp/a.wav',
  editList: Array.from({ length }, (_, i) => ({ kind: 'gain' as const, db: i })),
  historyIndex,
});

describe('history counts', () => {
  it('undo count is the history cursor', () => {
    expect(undoCount(doc(0, 3))).toBe(0);
    expect(undoCount(doc(3, 3))).toBe(3);
  });

  it('redo count is the remaining tail', () => {
    expect(redoCount(doc(3, 3))).toBe(0);
    expect(redoCount(doc(1, 3))).toBe(2);
  });

  it('undo/redo availability clamps at the ends', () => {
    expect(canUndo(doc(0, 3))).toBe(false);
    expect(canUndo(doc(1, 3))).toBe(true);
    expect(canRedo(doc(3, 3))).toBe(false);
    expect(canRedo(doc(2, 3))).toBe(true);
    expect(canUndo(doc(0, 0))).toBe(false);
    expect(canRedo(doc(0, 0))).toBe(false);
  });
});
