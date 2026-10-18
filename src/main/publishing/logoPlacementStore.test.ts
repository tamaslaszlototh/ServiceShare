import { describe, it, expect, vi } from 'vitest';
import { LogoPlacementStore, LogoPlacementStoreDeps } from './logoPlacementStore';

const FILE = '/userData/logo-placement.json';

function store(initial?: string, over: Partial<LogoPlacementStoreDeps> = {}) {
  const files = new Map<string, string>();
  if (initial !== undefined) files.set(FILE, initial);
  const deps: LogoPlacementStoreDeps = {
    filePath: FILE,
    readFile: async (p) => {
      const content = files.get(p);
      if (content === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return content;
    },
    writeFile: vi.fn(async (p: string, data: string) => {
      files.set(p, data);
    }),
    removeFile: vi.fn(async (p: string) => {
      files.delete(p);
    }),
    ...over,
  };
  return { files, store: new LogoPlacementStore(deps) };
}

describe('LogoPlacementStore', () => {
  it('starts from the default placement when nothing is saved', async () => {
    const { store: s } = store();
    expect(await s.load()).toBeNull();
    expect(s.current()).toBeNull();
  });

  it('loads a saved placement', async () => {
    const { store: s } = store(JSON.stringify({ centerX: 100, centerY: 80, size: 90 }));
    expect(await s.load()).toEqual({ centerX: 100, centerY: 80, size: 90 });
  });

  it('falls back to the default for a corrupt or malformed file', async () => {
    expect(await store('{not json').store.load()).toBeNull();
    expect(await store(JSON.stringify({ centerX: 'x' })).store.load()).toBeNull();
  });

  it('rethrows read errors other than a missing file', async () => {
    const { store: s } = store(undefined, {
      readFile: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    });
    await expect(s.load()).rejects.toThrow('denied');
  });

  it('saves, then resets by removing the file, bumping the version each time', async () => {
    const { store: s, files } = store();
    await s.save({ centerX: 1, centerY: 2, size: 64 });
    expect(JSON.parse(files.get(FILE)!)).toEqual({ centerX: 1, centerY: 2, size: 64 });
    expect(s.current()).toEqual({ centerX: 1, centerY: 2, size: 64 });
    expect(s.versionKey).toBe(1);

    await s.save(null);
    expect(files.has(FILE)).toBe(false);
    expect(s.current()).toBeNull();
    expect(s.versionKey).toBe(2);
  });
});
