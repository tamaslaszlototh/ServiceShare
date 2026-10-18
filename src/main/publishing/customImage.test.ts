import { describe, it, expect, vi } from 'vitest';
import { CustomImageStore, CustomImageStoreDeps } from './customImage';

function store(over: Partial<CustomImageStoreDeps> = {}) {
  const files = new Set<string>();
  const deps: CustomImageStoreDeps = {
    filePath: '/userData/cover-logo.png',
    fileExists: (p) => files.has(p),
    copyFile: vi.fn(async (source: string, destination: string) => {
      if (!source) throw new Error('missing source');
      files.add(destination);
    }),
    removeFile: vi.fn(async (p: string) => {
      files.delete(p);
    }),
    ...over,
  };
  return { files, deps, store: new CustomImageStore(deps) };
}

describe('CustomImageStore', () => {
  it('reports no custom image when the file is absent', () => {
    expect(store().store.customPath()).toBeNull();
  });

  it('copies a chosen file into the userData path and reports it as custom', async () => {
    const { store: s, files } = store();
    const path = await s.setFrom('/pictures/logo.png');

    expect(path).toBe('/userData/cover-logo.png');
    expect(files.has('/userData/cover-logo.png')).toBe(true);
    expect(s.customPath()).toBe('/userData/cover-logo.png');
  });

  it('removes the custom image on clear', async () => {
    const { store: s } = store();
    await s.setFrom('/pictures/logo.png');
    await s.clear();

    expect(s.customPath()).toBeNull();
  });

  it('bumps the version on every change so previews can be invalidated', async () => {
    const { store: s } = store();
    const start = s.versionKey;

    await s.setFrom('/pictures/logo.png');
    expect(s.versionKey).toBe(start + 1);

    await s.clear();
    expect(s.versionKey).toBe(start + 2);
  });
});
