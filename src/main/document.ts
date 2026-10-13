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
    this.doc.editList = this.doc.editList.slice(0, this.doc.historyIndex + 1);
    this.doc.editList.push(op);
    this.doc.historyIndex = this.doc.editList.length - 1;
  }

  undo(): void {
    if (this.doc.historyIndex >= 0) {
      this.doc.historyIndex = Math.max(-1, this.doc.historyIndex - 1);
    }
  }

  redo(): void {
    if (this.doc.historyIndex < this.doc.editList.length - 1) {
      this.doc.historyIndex++;
    }
  }

  getEffectiveEditList(): EditOperation[] {
    return this.doc.editList.slice(0, this.doc.historyIndex + 1);
  }
}
