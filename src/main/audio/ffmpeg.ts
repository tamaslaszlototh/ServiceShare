import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { EngineError } from '../core/errors';

export const FFMPEG_NOT_FOUND = 'FFmpeg not found';

export type FfmpegToolName = 'ffmpeg' | 'ffprobe';

export interface ResolvedBinaries {
  ffmpeg: string;
  ffprobe: string;
}

export interface FFmpegResolverDeps {
  resourcesPath: string;
  pathEnv: string;
  platform: NodeJS.Platform;
  fileExists: (p: string) => boolean;
  probeVersion: (p: string) => Promise<boolean>;
  devPackagePath: (name: FfmpegToolName) => string | null;
}

function probeVersion(binPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(binPath, ['-version'], { timeout: 15000 }, (err) => {
      resolve(err ? false : true);
    });
  });
}

const nodeRequire = createRequire(__filename);

function devPackagePath(name: FfmpegToolName): string | null {
  try {
    if (name === 'ffmpeg') {
      const p = nodeRequire('ffmpeg-static');
      return typeof p === 'string' && p.length > 0 ? p : null;
    }
    const pkg = nodeRequire('ffprobe-static') as { path?: string };
    return pkg && typeof pkg.path === 'string' && pkg.path.length > 0 ? pkg.path : null;
  } catch {
    return null;
  }
}

function defaultDeps(): FFmpegResolverDeps {
  return {
    resourcesPath: (process as { resourcesPath?: string }).resourcesPath ?? '',
    pathEnv: process.env.PATH ?? '',
    platform: process.platform,
    fileExists: existsSync,
    probeVersion,
    devPackagePath,
  };
}

export class FFmpegResolver {
  private readonly deps: FFmpegResolverDeps;
  private cache: Partial<ResolvedBinaries> = {};

  constructor(deps?: Partial<FFmpegResolverDeps>) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  private binaryExt(): string {
    return this.deps.platform === 'win32' ? '.exe' : '';
  }

  private separator(): string {
    return this.deps.platform === 'win32' ? '\\' : '/';
  }

  private delimiter(): string {
    return this.deps.platform === 'win32' ? ';' : ':';
  }

  private joinPath(base: string, tail: string): string {
    const sep = this.separator();
    return base.endsWith(sep) ? base + tail : base + sep + tail;
  }

  private searchPaths(name: FfmpegToolName): string[] {
    const ext = this.binaryExt();
    const paths: string[] = [];
    if (this.deps.resourcesPath) {
      paths.push(this.joinPath(this.deps.resourcesPath, name + ext));
    }
    const devPath = this.deps.devPackagePath(name);
    if (devPath) {
      paths.push(devPath);
    }
    for (const dir of this.deps.pathEnv.split(this.delimiter())) {
      if (dir) {
        paths.push(this.joinPath(dir, name + ext));
      }
    }
    return paths;
  }

  private async resolveTool(name: FfmpegToolName): Promise<string> {
    const candidates = this.searchPaths(name);
    for (const candidate of candidates) {
      if (!this.deps.fileExists(candidate)) {
        continue;
      }
      if (await this.deps.probeVersion(candidate)) {
        return candidate;
      }
    }
    throw new EngineError(
      FFMPEG_NOT_FOUND,
      `Searched for ${name}: ${candidates.join(', ') || '(none)'}`,
    );
  }

  async resolveFfprobe(): Promise<string> {
    if (!this.cache.ffprobe) {
      this.cache.ffprobe = await this.resolveTool('ffprobe');
    }
    return this.cache.ffprobe;
  }

  async resolve(): Promise<ResolvedBinaries> {
    if (!this.cache.ffmpeg) {
      this.cache.ffmpeg = await this.resolveTool('ffmpeg');
    }
    return { ffmpeg: this.cache.ffmpeg, ffprobe: await this.resolveFfprobe() };
  }

  recheck(): Promise<ResolvedBinaries> {
    this.reset();
    return this.resolve();
  }

  reset(): void {
    this.cache = {};
  }
}

export const ffmpegResolver = new FFmpegResolver();