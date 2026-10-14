import { describe, it, expect, vi } from 'vitest';
import { RecipientStore, RecipientStoreDeps } from './recipientStore';

const FILE = '/userData/email-recipients.json';

function store(initial?: string, over: Partial<RecipientStoreDeps> = {}) {
  const files = new Map<string, string>();
  if (initial !== undefined) files.set(FILE, initial);
  const deps: RecipientStoreDeps = {
    filePath: FILE,
    readFile: vi.fn(async (p: string) => {
      const content = files.get(p);
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return content;
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      files.set(p, data);
    }),
    ...over,
  };
  return { files, deps, store: new RecipientStore(deps) };
}

const saved = (files: Map<string, string>) => JSON.parse(files.get(FILE)!).recipients;

describe('RecipientStore', () => {
  it('starts empty when no file exists', async () => {
    expect(await store().store.list()).toEqual([]);
  });

  it('reads back the persisted list', async () => {
    const { store: s } = store(JSON.stringify({ recipients: ['a@b.co', 'c@d.co'] }));
    expect(await s.list()).toEqual(['a@b.co', 'c@d.co']);
  });

  it('treats a corrupt or wrongly shaped file as an empty list', async () => {
    expect(await store('{not json').store.list()).toEqual([]);
    expect(await store(JSON.stringify({ recipients: 'a@b.co' })).store.list()).toEqual([]);
    expect(await store(JSON.stringify([1, 2])).store.list()).toEqual([]);
  });

  it('normalizes a hand-edited file: trims, de-duplicates and drops non-strings', async () => {
    const { store: s } = store(JSON.stringify({ recipients: [' a@b.co ', 'A@B.CO', 3, 'c@d.co'] }));
    expect(await s.list()).toEqual(['a@b.co', 'c@d.co']);
  });

  it('remembers a trimmed address, persists it and returns the updated list', async () => {
    const { store: s, files } = store();

    expect(await s.remember('  a@b.co ')).toEqual(['a@b.co']);
    expect(await s.remember('c@d.co')).toEqual(['a@b.co', 'c@d.co']);
    expect(saved(files)).toEqual(['a@b.co', 'c@d.co']);
  });

  it('ignores an address already saved under different casing', async () => {
    const { store: s, deps } = store(JSON.stringify({ recipients: ['a@b.co'] }));

    expect(await s.remember('A@B.co')).toEqual(['a@b.co']);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('ignores an invalid or empty address', async () => {
    const { store: s, deps } = store();

    expect(await s.remember('not-an-address')).toEqual([]);
    expect(await s.remember('   ')).toEqual([]);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('forgets an address case-insensitively and persists the removal', async () => {
    const { store: s, files } = store(JSON.stringify({ recipients: ['a@b.co', 'c@d.co', 'e@f.co'] }));

    expect(await s.forget(' C@D.CO ')).toEqual(['a@b.co', 'e@f.co']);
    expect(saved(files)).toEqual(['a@b.co', 'e@f.co']);
  });

  it('leaves the file alone when forgetting an unknown address', async () => {
    const { store: s, deps } = store(JSON.stringify({ recipients: ['a@b.co'] }));

    expect(await s.forget('x@y.co')).toEqual(['a@b.co']);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('survives a restart: a new store over the same file sees the saved list', async () => {
    const first = store();
    await first.store.remember('a@b.co');

    const second = new RecipientStore({ ...first.deps });
    expect(await second.list()).toEqual(['a@b.co']);
  });

  it('serializes concurrent changes so none is lost', async () => {
    const { store: s, files } = store();

    await Promise.all([s.remember('a@b.co'), s.remember('c@d.co'), s.remember('e@f.co')]);

    expect(saved(files)).toEqual(['a@b.co', 'c@d.co', 'e@f.co']);
  });

  it('refuses to change the list when the file exists but cannot be read', async () => {
    const { store: s, deps } = store(undefined, {
      readFile: vi.fn(async () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }),
    });

    await expect(s.list()).rejects.toThrow('EACCES');
    await expect(s.remember('a@b.co')).rejects.toThrow('EACCES');
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('keeps the previous list when a write fails', async () => {
    const { store: s } = store(JSON.stringify({ recipients: ['a@b.co'] }), {
      writeFile: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });

    await expect(s.remember('c@d.co')).rejects.toThrow('disk full');
    expect(await s.list()).toEqual(['a@b.co']);
  });
});
