import { Document, EditOperation } from '@shared/types';

export class DocumentManager {
  private doc: Document = {
    sourceFile: null,
    editList: [],
    historyIndex: 0,
  };

  getDocument(): Document {
    return this.doc;
  }

  setSourceFile(path: string | null): void {
    this.doc.sourceFile = path;
    this.clearEdits();
  }

  clearEdits(): void {
    this.doc.editList = [];
    this.doc.historyIndex = 0;
  }

  appendEdit(op: EditOperation): void {
    this.doc.editList = this.doc.editList.slice(0, this.doc.historyIndex);
    this.doc.editList.push(op);
    this.doc.historyIndex = this.doc.editList.length;
  }

  removeActiveEdit(predicate: (op: EditOperation) => boolean): EditOperation | null {
    const active = this.doc.editList.slice(0, this.doc.historyIndex);
    for (let i = active.length - 1; i >= 0; i--) {
      if (predicate(active[i])) {
        const [removed] = active.splice(i, 1);
        this.doc.editList = active;
        this.doc.historyIndex = active.length;
        return removed;
      }
    }
    return null;
  }

  undo(): void {
    this.doc.historyIndex = Math.max(0, this.doc.historyIndex - 1);
  }

  redo(): void {
    this.doc.historyIndex = Math.min(this.doc.editList.length, this.doc.historyIndex + 1);
  }

  getEffectiveEditList(): EditOperation[] {
    return this.doc.editList.slice(0, this.doc.historyIndex);
  }
}
