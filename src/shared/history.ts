import { Document } from './types';

export function undoCount(doc: Document): number {
  return doc.historyIndex;
}

export function redoCount(doc: Document): number {
  return doc.editList.length - doc.historyIndex;
}

export function canUndo(doc: Document): boolean {
  return doc.historyIndex > 0;
}

export function canRedo(doc: Document): boolean {
  return doc.historyIndex < doc.editList.length;
}
