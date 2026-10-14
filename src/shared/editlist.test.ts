import { describe, it, expect } from 'vitest';
import { EditList } from './editlist';
import { EditOperation } from './types';

const gain = (db: number): EditOperation => ({ kind: 'gain', db });
const fadeIn = (duration: number): EditOperation => ({ kind: 'fadeIn', duration });
const fadeOut = (duration: number): EditOperation => ({ kind: 'fadeOut', duration });
const normalize: EditOperation = { kind: 'normalize' };

describe('EditList effective list', () => {
  it('starts empty', () => {
    expect(new EditList().effective()).toEqual([]);
  });

  it('appends operations in order', () => {
    const list = new EditList();
    list.append(gain(1));
    list.append(gain(2));
    expect(list.effective()).toEqual([gain(1), gain(2)]);
  });

  it('returns the operations up to the cursor', () => {
    const list = new EditList();
    list.append(gain(1));
    list.append(gain(2));
    list.append(gain(3));
    list.undo();
    expect(list.effective()).toEqual([gain(1), gain(2)]);
  });

  it('drops the redo tail when a new edit is appended after undo', () => {
    const list = new EditList();
    list.append(gain(1));
    list.append(gain(2));
    list.undo();
    list.append(gain(3));
    expect(list.effective()).toEqual([gain(1), gain(3)]);
  });

  it('clears operations and the cursor', () => {
    const list = new EditList();
    list.append(gain(1));
    list.clear();
    expect(list.effective()).toEqual([]);
    expect(list.snapshot()).toEqual({
      effectiveEditList: [],
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
    });
  });
});

describe('EditList undo/redo', () => {
  it('exposes counts that mirror the cursor', () => {
    const list = new EditList();
    list.append(gain(1));
    list.append(gain(2));
    list.append(gain(3));
    expect(list.undoCount()).toBe(3);
    expect(list.redoCount()).toBe(0);
    list.undo();
    expect(list.undoCount()).toBe(2);
    expect(list.redoCount()).toBe(1);
  });

  it('reports undo/redo availability and clamps at the ends', () => {
    const list = new EditList();
    expect(list.canUndo()).toBe(false);
    expect(list.canRedo()).toBe(false);

    list.append(gain(3));
    list.append(gain(-3));
    list.undo();
    expect(list.canUndo()).toBe(true);
    expect(list.canRedo()).toBe(true);

    list.undo();
    expect(list.canUndo()).toBe(false);
    expect(list.canRedo()).toBe(true);

    list.redo();
    list.redo();
    expect(list.canUndo()).toBe(true);
    expect(list.canRedo()).toBe(false);
  });

  it('clamps undo and redo at the ends', () => {
    const list = new EditList();
    list.undo();
    expect(list.undoCount()).toBe(0);

    list.append(normalize);
    list.redo();
    expect(list.undoCount()).toBe(1);
    list.redo();
    expect(list.undoCount()).toBe(1);
  });
});

describe('EditList removeActive', () => {
  it('removes the last matching active operation and drops the redo tail', () => {
    const list = new EditList();
    list.append(gain(1));
    list.append(fadeIn(2));
    list.append(gain(3));

    expect(list.removeActive((op) => op.kind === 'fadeIn')).toEqual(fadeIn(2));
    expect(list.effective()).toEqual([gain(1), gain(3)]);
    expect(list.undoCount()).toBe(2);
    expect(list.redoCount()).toBe(0);
  });

  it('returns null and leaves the list untouched when nothing matches', () => {
    const list = new EditList();
    list.append(gain(1));

    expect(list.removeActive((op) => op.kind === 'fadeOut')).toBeNull();
    expect(list.effective()).toEqual([gain(1)]);
  });

  it('never removes an operation beyond the cursor', () => {
    const list = new EditList();
    list.append(fadeIn(2));
    list.undo();

    expect(list.removeActive((op) => op.kind === 'fadeIn')).toBeNull();
    expect(list.effective()).toEqual([]);
  });
});

describe('EditList toggle', () => {
  it('appends the operation when none of its kind is active', () => {
    const list = new EditList();
    list.toggle(fadeIn(2));
    expect(list.effective()).toEqual([fadeIn(2)]);
  });

  it('removes the active fade instead of appending a second one', () => {
    const list = new EditList();
    list.toggle(fadeIn(2));
    list.toggle(fadeIn(2));
    expect(list.effective()).toEqual([]);
  });

  it('toggles fades of different kinds independently', () => {
    const list = new EditList();
    list.toggle(fadeIn(2));
    list.toggle(fadeOut(1.5));
    expect(list.effective()).toEqual([fadeIn(2), fadeOut(1.5)]);
    list.toggle(fadeIn(2));
    expect(list.effective()).toEqual([fadeOut(1.5)]);
  });

  it('toggles normalize', () => {
    const list = new EditList();
    list.toggle(normalize);
    expect(list.effective()).toEqual([normalize]);
    list.toggle(normalize);
    expect(list.effective()).toEqual([]);
  });
});

describe('EditList snapshot', () => {
  it('projects the effective list and history summary', () => {
    const list = new EditList();
    list.append(gain(1));
    list.append(normalize);
    list.undo();

    expect(list.snapshot()).toEqual({
      effectiveEditList: [gain(1)],
      canUndo: true,
      canRedo: true,
      undoCount: 1,
      redoCount: 1,
    });
  });
});
