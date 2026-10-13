import { describe, it, expect } from 'vitest';
import { resolveHistoryShortcut } from './shortcuts';

const event = (over: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ key: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over }) as KeyboardEvent;

describe('resolveHistoryShortcut', () => {
  it('maps Cmd/Ctrl+Z to undo', () => {
    expect(resolveHistoryShortcut(event({ key: 'z', metaKey: true }))).toBe('undo');
    expect(resolveHistoryShortcut(event({ key: 'Z', ctrlKey: true }))).toBe('undo');
  });

  it('maps Cmd/Ctrl+Shift+Z to redo', () => {
    expect(resolveHistoryShortcut(event({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('maps Cmd/Ctrl+Y to redo', () => {
    expect(resolveHistoryShortcut(event({ key: 'y', ctrlKey: true }))).toBe('redo');
    expect(resolveHistoryShortcut(event({ key: 'Y', metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('ignores plain keys and alt-modified keys', () => {
    expect(resolveHistoryShortcut(event({ key: 'z' }))).toBeNull();
    expect(resolveHistoryShortcut(event({ key: 'y' }))).toBeNull();
    expect(resolveHistoryShortcut(event({ key: 'z', ctrlKey: true, altKey: true }))).toBeNull();
    expect(resolveHistoryShortcut(event({ key: 'a', ctrlKey: true }))).toBeNull();
  });
});
