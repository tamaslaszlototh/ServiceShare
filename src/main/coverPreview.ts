import { createHash } from 'crypto';
import { join } from 'path';
import { CoverRequest } from './cover';

export function coverPreviewKey(title: string, coverImagePath?: string, logoKey = ''): string {
  return createHash('sha256').update(`${title}\n${coverImagePath ?? ''}\n${logoKey}`).digest('hex');
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

  async ensure(title: string, coverImagePath?: string, logoKey = ''): Promise<CoverPreviewRender> {
    const key = coverPreviewKey(title, coverImagePath, logoKey);
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
    await this.deps.compose({ title, coverImagePath, outputPath });

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
