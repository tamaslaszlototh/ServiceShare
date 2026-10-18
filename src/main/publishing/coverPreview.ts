import { createHash } from 'crypto';
import { join } from 'path';
import { CoverRequest } from './cover';

/** What a preview shows: the cover request minus where it is written. */
export type CoverPreviewInput = Omit<CoverRequest, 'outputPath'>;

/** `assetsKey` identifies the logo, default base and logo placement in use. */
export function coverPreviewKey(input: CoverPreviewInput, assetsKey = ''): string {
  const logo = input.withLogo === false ? 'no-logo' : 'logo';
  return createHash('sha256')
    .update(`${input.title}\n${input.coverImagePath ?? ''}\n${logo}\n${assetsKey}`)
    .digest('hex');
}

export function coverPreviewUrl(key: string): string {
  return `cover://preview/${key}`;
}

export interface CoverPreviewRender {
  key: string;
  url: string;
  path: string;
  composed: boolean;
}

export const MAX_COVER_PREVIEWS = 12;

export interface CoverPreviewDeps {
  compose: (request: CoverRequest) => Promise<void>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
  removeFile: (filePath: string) => Promise<void>;
}

export class CoverPreviewService {
  private tempDir: string | null = null;
  private readonly pathsByKey = new Map<string, string>();

  constructor(private readonly deps: CoverPreviewDeps) {}

  pathFor(key: string): string | null {
    return this.pathsByKey.get(key) ?? null;
  }

  async ensure(input: CoverPreviewInput, assetsKey = ''): Promise<CoverPreviewRender> {
    const key = coverPreviewKey(input, assetsKey);
    const cached = this.pathsByKey.get(key);
    if (cached) {
      return { key, url: coverPreviewUrl(key), path: cached, composed: false };
    }

    const dir = this.tempDir ?? (this.tempDir = await this.deps.makeTempDir());
    if (this.pathsByKey.size >= MAX_COVER_PREVIEWS) {
      const oldest = this.pathsByKey.keys().next().value;
      if (oldest) {
        const oldPath = this.pathsByKey.get(oldest);
        this.pathsByKey.delete(oldest);
        if (oldPath) {
          await this.deps.removeFile(oldPath);
        }
      }
    }
    const outputPath = join(dir, `cover-${key.slice(0, 16)}.png`);
    await this.deps.compose({ ...input, outputPath });

    this.pathsByKey.set(key, outputPath);
    return { key, url: coverPreviewUrl(key), path: outputPath, composed: true };
  }

  async dispose(): Promise<void> {
    if (this.tempDir) {
      await this.deps.removeDir(this.tempDir);
    }
    this.tempDir = null;
    this.pathsByKey.clear();
  }
}
