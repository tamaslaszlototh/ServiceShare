export const CUSTOM_LOGO_FILE = 'cover-logo.png';

export interface LogoStoreDeps {
  logoPath: string;
  fileExists: (path: string) => boolean;
  copyFile: (source: string, destination: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
}

export class LogoStore {
  private version = 0;

  constructor(private readonly deps: LogoStoreDeps) {}

  customPath(): string | null {
    return this.deps.fileExists(this.deps.logoPath) ? this.deps.logoPath : null;
  }

  async setFrom(sourcePath: string): Promise<string> {
    await this.deps.copyFile(sourcePath, this.deps.logoPath);
    this.version += 1;
    return this.deps.logoPath;
  }

  async clear(): Promise<void> {
    await this.deps.removeFile(this.deps.logoPath);
    this.version += 1;
  }

  get versionKey(): number {
    return this.version;
  }
}
