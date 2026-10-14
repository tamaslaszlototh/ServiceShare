import { Document, EditOperation } from '@shared/types';
import { EditList } from '@shared/editlist';

export class DocumentManager {
  private sourceFile: string | null = null;
  private edits = new EditList();

  getDocument(): Document {
    return { sourceFile: this.sourceFile, ...this.edits.snapshot() };
  }

  setSourceFile(path: string | null): void {
    this.sourceFile = path;
    this.edits.clear();
  }

  appendEdit(op: EditOperation): void {
    this.edits.append(op);
  }

  toggleFade(kind: 'fadeIn' | 'fadeOut', seconds: number): void {
    this.edits.toggle({ kind, duration: seconds });
  }

  toggleNormalize(): void {
    this.edits.toggle({ kind: 'normalize' });
  }

  undo(): void {
    this.edits.undo();
  }

  redo(): void {
    this.edits.redo();
  }

  getEffectiveEditList(): EditOperation[] {
    return this.edits.effective();
  }
}
