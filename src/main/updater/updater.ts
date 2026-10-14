import type { UpdateStatus } from '@shared/types';
import { IpcError } from '../core/errors';

/**
 * The slice of electron-updater's `autoUpdater` the service drives. Kept narrow so
 * the update flow is testable without Electron or the network.
 */
export interface UpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  /** Resolves `null` when the updater is inactive (an unpackaged build). */
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateServiceDeps {
  currentVersion: string;
  onStatus: (status: UpdateStatus) => void;
  log: (code: string, detail?: unknown) => void;
}

/**
 * Auto-update against GitHub Releases: checks (on launch or on request), downloads
 * with progress and stages the update, which installs on quit (Windows NSIS) or
 * relaunch (macOS Squirrel.Mac), or right away via `install()`.
 */
export class UpdateService {
  private current: UpdateStatus = { state: 'idle' };
  private manual = false;

  constructor(
    private readonly updater: UpdaterPort,
    private readonly deps: UpdateServiceDeps,
  ) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    // Channels need no setup: electron-updater accepts pre-releases only when the
    // running version has a suffix, and the GitHub provider follows that suffix
    // (`-alpha.N` → alpha, `-beta.N` → beta, none → stable).

    updater.on('update-available', ({ version }) => {
      this.set({ state: 'downloading', version, percent: 0 });
    });
    updater.on('update-not-available', () => {
      this.set({ state: 'upToDate', manual: this.manual, version: deps.currentVersion });
    });
    updater.on('download-progress', ({ percent }) => {
      if (this.current.state === 'downloading') {
        this.set({ ...this.current, percent: Math.round(percent) });
      }
    });
    updater.on('update-downloaded', ({ version }) => {
      this.set({ state: 'ready', version });
    });
    updater.on('error', (error) => this.fail(error));
  }

  get status(): UpdateStatus {
    return this.current;
  }

  async check(manual: boolean): Promise<void> {
    if (this.current.state === 'checking') {
      // Join the running cycle; asking makes its outcome worth reporting.
      this.manual ||= manual;
      this.set({ state: 'checking', manual: this.manual });
      return;
    }
    if (this.current.state === 'downloading' || this.current.state === 'ready') {
      this.deps.onStatus(this.current);
      return;
    }
    this.manual = manual;
    this.deps.log('CHECK', manual ? 'manual' : 'launch');
    this.set({ state: 'checking', manual });
    try {
      const result = await this.updater.checkForUpdates();
      if (result === null) {
        this.set({ state: 'unsupported', manual });
      }
    } catch (e) {
      this.fail(e);
    }
  }

  install(): void {
    if (this.current.state === 'ready') {
      this.deps.log('INSTALL', this.current.version);
      this.updater.quitAndInstall();
    }
  }

  private fail(error: unknown): void {
    if (this.current.state === 'error') {
      return;
    }
    this.deps.log('ERROR', error);
    // A failed download is always reported: the user already saw its progress.
    const manual = this.manual || this.current.state === 'downloading';
    const appError = new IpcError('UpdateError', 'The app could not be updated').toAppError();
    this.set({ state: 'error', manual, error: appError });
  }

  private set(status: UpdateStatus): void {
    this.current = status;
    this.deps.onStatus(status);
  }
}
