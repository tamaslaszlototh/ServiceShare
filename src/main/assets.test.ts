import { describe, it, expect } from 'vitest';
import { AssetResolver } from './assets';

const BUNDLED = [
  '/assets/images/default-base.png',
  '/assets/images/logo.png',
  '/assets/fonts/JetBrainsMono-Regular.ttf',
];

function resolver(files: string[] = BUNDLED) {
  const set = new Set(files);
  return new AssetResolver({ roots: ['/assets'], fileExists: (p) => set.has(p) });
}

describe('AssetResolver', () => {
  it('resolves the bundled cover assets', () => {
    expect(resolver().resolve()).toEqual({
      defaultBase: '/assets/images/default-base.png',
      logo: '/assets/images/logo.png',
      font: '/assets/fonts/JetBrainsMono-Regular.ttf',
    });
  });

  it('prefers a custom logo override and re-resolves after it changes', () => {
    const r = resolver();
    expect(r.resolve().logo).toBe('/assets/images/logo.png');

    r.setLogoOverride('/userData/cover-logo.png');
    expect(r.resolve().logo).toBe('/userData/cover-logo.png');
    expect(r.resolve().defaultBase).toBe('/assets/images/default-base.png');

    r.setLogoOverride(null);
    expect(r.resolve().logo).toBe('/assets/images/logo.png');
  });
});
