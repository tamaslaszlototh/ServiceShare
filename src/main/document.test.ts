import { DocumentManager } from './document';
import { EditOperation } from '@shared/types';

describe('DocumentManager', () => {
  it('initializes empty document', () => {
    const dm = new DocumentManager();
    const doc = dm.getDocument();
    expect(doc.sourceFile).toBeNull();
    expect(doc.editList).toEqual([]);
    expect(doc.historyIndex).toBe(0);
  });

  it('sets source file and clears edits when null', () => {
    const dm = new DocumentManager();
    dm.setSourceFile('/tmp/test.wav');
    expect(dm.getDocument().sourceFile).toBe('/tmp/test.wav');
    dm.setSourceFile(null);
    expect(dm.getDocument().sourceFile).toBeNull();
    expect(dm.getDocument().editList).toEqual([]);
  });

  it('appends edit and updates history', () => {
    const dm = new DocumentManager();
    const op: EditOperation = { kind: 'gain', db: 6 };
    dm.appendEdit(op);
    const doc = dm.getDocument();
    expect(doc.editList.length).toBe(1);
    expect(doc.historyIndex).toBe(0);
  });

  it('undo/redo moves history index', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 3 });
    dm.appendEdit({ kind: 'gain', db: -3 });
    expect(dm.getDocument().historyIndex).toBe(1);
    dm.undo();
    expect(dm.getDocument().historyIndex).toBe(0);
    dm.redo();
    expect(dm.getDocument().historyIndex).toBe(1);
  });

  it('new edit after undo truncates redo', () => {
    const dm = new DocumentManager();
    dm.appendEdit({ kind: 'gain', db: 1 });
    dm.appendEdit({ kind: 'gain', db: 2 });
    dm.undo();
    dm.appendEdit({ kind: 'gain', db: 3 });
    const doc = dm.getDocument();
    expect(doc.editList.length).toBe(2);
    expect(doc.historyIndex).toBe(1);
  });
});
