export type HistoryAction = 'undo' | 'redo';

export function resolveHistoryShortcut(event: KeyboardEvent): HistoryAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (key === 'y') {
    return 'redo';
  }
  return null;
}
