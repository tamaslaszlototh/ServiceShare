import { LogoPlacement, parseLogoPlacement } from '../../shared/coverLayout';

export const LOGO_PLACEMENT_FILE = 'logo-placement.json';

export interface LogoPlacementStoreDeps {
  filePath: string;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT';
}

/**
 * The saved logo placement, one setting for every cover. No file (or an
 * unparsable one) means the default placement; resetting removes the file.
 */
export class LogoPlacementStore {
  private placement: LogoPlacement | null = null;
  private version = 0;

  constructor(private readonly deps: LogoPlacementStoreDeps) {}

  async load(): Promise<LogoPlacement | null> {
    try {
      this.placement = parseLogoPlacement(JSON.parse(await this.deps.readFile(this.deps.filePath)));
    } catch (e) {
      if (!isMissingFile(e) && !(e instanceof SyntaxError)) throw e;
      this.placement = null;
    }
    return this.placement;
  }

  /** The placement in use, as last loaded or saved. */
  current(): LogoPlacement | null {
    return this.placement;
  }

  async save(placement: LogoPlacement | null): Promise<void> {
    if (placement) {
      await this.deps.writeFile(this.deps.filePath, JSON.stringify(placement, null, 2));
    } else {
      await this.deps.removeFile(this.deps.filePath);
    }
    this.placement = placement;
    this.version += 1;
  }

  get versionKey(): number {
    return this.version;
  }
}
