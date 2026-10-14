import type { EditListSnapshot, EditOperation } from './types';

export class EditList {
  private operations: EditOperation[] = [];
  private cursor = 0;

  append(op: EditOperation): void {
    this.operations = this.operations.slice(0, this.cursor);
    this.operations.push(op);
    this.cursor = this.operations.length;
  }

  undo(): void {
    this.cursor = Math.max(0, this.cursor - 1);
  }

  redo(): void {
    this.cursor = Math.min(this.operations.length, this.cursor + 1);
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.operations.length;
  }

  undoCount(): number {
    return this.cursor;
  }

  redoCount(): number {
    return this.operations.length - this.cursor;
  }

  removeActive(predicate: (op: EditOperation) => boolean): EditOperation | null {
    const active = this.operations.slice(0, this.cursor);
    for (let i = active.length - 1; i >= 0; i--) {
      if (predicate(active[i])) {
        const [removed] = active.splice(i, 1);
        this.operations = active;
        this.cursor = active.length;
        return removed;
      }
    }
    return null;
  }

  toggle(op: EditOperation): void {
    if (this.removeActive((candidate) => candidate.kind === op.kind) === null) {
      this.append(op);
    }
  }

  effective(): EditOperation[] {
    return this.operations.slice(0, this.cursor);
  }

  clear(): void {
    this.operations = [];
    this.cursor = 0;
  }

  snapshot(): EditListSnapshot {
    return {
      effectiveEditList: this.effective(),
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoCount(),
      redoCount: this.redoCount(),
    };
  }
}
