export const CUSTOM_LOGO_FILE = 'cover-logo.png';
export const CUSTOM_BASE_FILE = 'cover-base.png';

export interface CustomImageStoreDeps {
  filePath: string;
  fileExists: (path: string) => boolean;
  copyFile: (source: string, destination: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
}

/** A user-chosen replacement for a bundled cover image (the logo or the default base). */
export class CustomImageStore {
  private version = 0;

  constructor(private readonly deps: CustomImageStoreDeps) {}

  customPath(): string | null {
    return this.deps.fileExists(this.deps.filePath) ? this.deps.filePath : null;
  }

  async setFrom(sourcePath: string): Promise<string> {
    await this.deps.copyFile(sourcePath, this.deps.filePath);
    this.version += 1;
    return this.deps.filePath;
  }

  async clear(): Promise<void> {
    await this.deps.removeFile(this.deps.filePath);
    this.version += 1;
  }

  get versionKey(): number {
    return this.version;
  }
}
