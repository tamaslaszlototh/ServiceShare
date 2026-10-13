import { DocumentManager } from './document';
import { EditOperation } from '@shared/types';

describe('DocumentManager', () => {
  it('initializes an empty document with the cursor at zero', () => {
    const dm = new DocumentManager();
    const doc = dm.getDocument();
    expect(doc.sourceFile).toBeNull();
    expect(doc.editList).toEqual([]);
    expect(doc.historyIndex).toBe(0);
    expect(dm.getEffectiveEditList()).toEqual([]);
  });

  it('sets source file and clears edits', () => {
    const dm = new DocumentManager();
    dm.setSourceFile('/tmp/first.wav');
    dm.appendEdit({ kind: 'gain', db: 3 });

    dm.setSourceFile('/tmp/second.wav');

    expect(dm.getDocument().sourceFile).toBe('/tmp/second.wav');
    expect(dm.getDocument().editList).toEqual([]);
    expect(dm.getDocument().historyIndex).toBe(0);
  });

  it('appends an edit and advances the cursor', () => {
    const dm = new DocumentManager();
    const op: EditOperation = { kind: 'gain', db: 6 };
    dm.appendEdit(op);
    expect(dm.getDocument().editList).toEqual([op]);
    expect(dm.getDocument().historyIndex).toBe(1);
    expect(dm.getEffectiveEditList()).toEqual([op]);
  });

  it('effective list is editList[0..historyIndex)', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 1 });
    dm.appendEdit({ kind: 'gain', db: 2 });
    dm.appendEdit({ kind: 'gain', db: 3 });
    dm.undo();
    expect(dm.getEffectiveEditList()).toEqual([{ kind: 'gain', db: 1 }, { kind: 'gain', db: 2 }]);
  });

  it('undo moves the cursor back and redo restores it', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 3 });
    dm.appendEdit({ kind: 'gain', db: -3 });

    dm.undo();
    expect(dm.getDocument().historyIndex).toBe(1);
    dm.undo();
    expect(dm.getDocument().historyIndex).toBe(0);
    expect(dm.getEffectiveEditList()).toEqual([]);

    dm.redo();
    expect(dm.getDocument().historyIndex).toBe(1);
    dm.redo();
    expect(dm.getDocument().historyIndex).toBe(2);
  });

  it('undo and redo clamp at the ends', () => {
    const dm = new DocumentManager();
    dm.undo();
    expect(dm.getDocument().historyIndex).toBe(0);

    dm.appendEdit({ kind: 'normalize' });
    dm.redo();
    expect(dm.getDocument().historyIndex).toBe(1);
    dm.redo();
    expect(dm.getDocument().historyIndex).toBe(1);
  });

  it('a new edit after undo truncates the redo tail', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 1 });
    dm.appendEdit({ kind: 'gain', db: 2 });
    dm.undo();

    dm.appendEdit({ kind: 'gain', db: 3 });

    expect(dm.getDocument().editList).toEqual([{ kind: 'gain', db: 1 }, { kind: 'gain', db: 3 }]);
    expect(dm.getDocument().historyIndex).toBe(2);
    expect(dm.getEffectiveEditList()).toEqual([{ kind: 'gain', db: 1 }, { kind: 'gain', db: 3 }]);
  });
});
