import { existsSync } from 'fs';
import * as path from 'path';
import { EngineError } from '../core/errors';

export const DEFAULT_BASE_FILE = 'default-base.png';
export const LOGO_FILE = 'logo.png';
export const COVER_FONT_FILE = 'JetBrainsMono-Regular.ttf';

export interface CoverAssets {
  defaultBase: string;
  logo: string;
  font: string;
}

export interface AssetResolverDeps {
  roots: string[];
  fileExists: (p: string) => boolean;
}

function defaultDeps(): AssetResolverDeps {
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath ?? '';
  const devAssets = path.resolve(__dirname, '..', '..', '..', 'assets');
  const roots = [resourcesPath ? path.join(resourcesPath, 'assets') : '', devAssets].filter(
    (root) => root.length > 0,
  );
  return { roots, fileExists: existsSync };
}

export class AssetResolver {
  private cache: CoverAssets | null = null;
  private logoOverride: string | null = null;

  constructor(private readonly deps: AssetResolverDeps = defaultDeps()) {}

  setLogoOverride(logoPath: string | null): void {
    this.logoOverride = logoPath;
    this.cache = null;
  }

  resolve(): CoverAssets {
    if (!this.cache) {
      this.cache = {
        defaultBase: this.find('images', DEFAULT_BASE_FILE),
        logo: this.logoOverride ?? this.find('images', LOGO_FILE),
        font: this.find('fonts', COVER_FONT_FILE),
      };
    }
    return this.cache;
  }

  private find(kind: 'images' | 'fonts', file: string): string {
    const candidates = this.deps.roots.map((root) => path.join(root, kind, file));
    const found = candidates.find((candidate) => this.deps.fileExists(candidate));
    if (!found) {
      throw new EngineError(
        'Bundled cover asset is missing',
        `Looked for ${file}: ${candidates.join(', ') || '(none)'}`,
      );
    }
    return found;
  }
}

export const assetResolver = new AssetResolver();
