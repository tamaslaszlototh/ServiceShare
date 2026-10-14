import { DocumentManager } from './document';
import { EditOperation } from '@shared/types';

describe('DocumentManager', () => {
  it('initializes an empty document with no history', () => {
    const dm = new DocumentManager();
    expect(dm.getDocument()).toEqual({
      sourceFile: null,
      effectiveEditList: [],
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
    });
  });

  it('sets the source file and clears edits', () => {
    const dm = new DocumentManager();
    dm.setSourceFile('/tmp/first.wav');
    dm.appendEdit({ kind: 'gain', db: 3 });

    dm.setSourceFile('/tmp/second.wav');

    const doc = dm.getDocument();
    expect(doc.sourceFile).toBe('/tmp/second.wav');
    expect(doc.effectiveEditList).toEqual([]);
    expect(doc.undoCount).toBe(0);
    expect(doc.redoCount).toBe(0);
  });

  it('appends an edit and exposes it in the effective list', () => {
    const dm = new DocumentManager();
    const op: EditOperation = { kind: 'gain', db: 6 };
    dm.appendEdit(op);
    expect(dm.getDocument().effectiveEditList).toEqual([op]);
    expect(dm.getDocument().undoCount).toBe(1);
    expect(dm.getEffectiveEditList()).toEqual([op]);
  });

  it('moves the cursor back on undo and restores it on redo', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 3 });
    dm.appendEdit({ kind: 'gain', db: -3 });

    dm.undo();
    dm.undo();
    expect(dm.getEffectiveEditList()).toEqual([]);
    expect(dm.getDocument().canUndo).toBe(false);
    expect(dm.getDocument().canRedo).toBe(true);

    dm.redo();
    dm.redo();
    expect(dm.getDocument().undoCount).toBe(2);
    expect(dm.getDocument().canRedo).toBe(false);
  });

  it('a new edit after undo truncates the redo tail', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 1 });
    dm.appendEdit({ kind: 'gain', db: 2 });
    dm.undo();

    dm.appendEdit({ kind: 'gain', db: 3 });

    expect(dm.getDocument().effectiveEditList).toEqual([{ kind: 'gain', db: 1 }, { kind: 'gain', db: 3 }]);
    expect(dm.getDocument().redoCount).toBe(0);
  });

  it('toggles a fade on then off', () => {
    const dm = new DocumentManager();
    dm.toggleFade('fadeIn', 2);
    expect(dm.getEffectiveEditList()).toEqual([{ kind: 'fadeIn', duration: 2 }]);

    dm.toggleFade('fadeIn', 2);
    expect(dm.getEffectiveEditList()).toEqual([]);
  });

  it('toggles normalize on then off', () => {
    const dm = new DocumentManager();
    dm.toggleNormalize();
    expect(dm.getEffectiveEditList()).toEqual([{ kind: 'normalize' }]);

    dm.toggleNormalize();
    expect(dm.getEffectiveEditList()).toEqual([]);
  });
});
