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
