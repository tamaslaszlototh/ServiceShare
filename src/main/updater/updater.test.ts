import { EventEmitter } from 'events';
import { describe, it, expect, vi } from 'vitest';
import { UpdateStatus } from '@shared/types';
import { UpdateService, UpdaterPort } from './updater';

class FakeUpdater extends EventEmitter implements UpdaterPort {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(async (): Promise<unknown> => ({ updateInfo: { version: '1.0.0' } }));
  quitAndInstall = vi.fn();
}

function setup(currentVersion = '1.0.0') {
  const updater = new FakeUpdater();
  const statuses: UpdateStatus[] = [];
  const service = new UpdateService(updater, {
    currentVersion,
    onStatus: (status) => statuses.push(status),
    log: () => {},
  });
  return { updater, statuses, service };
}

describe('UpdateService', () => {
  it('downloads automatically and installs on quit', () => {
    const { updater } = setup();
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('starts idle', () => {
    expect(setup().service.status).toEqual({ state: 'idle' });
  });

  it('reports checking then up to date when no newer release exists', async () => {
    const { updater, statuses, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-not-available', { version: '1.0.0' });
      return { updateInfo: { version: '1.0.0' } };
    });

    await service.check(true);

    expect(statuses).toEqual([
      { state: 'checking', manual: true },
      { state: 'upToDate', manual: true, version: '1.0.0' },
    ]);
  });

  it('reports download progress as a whole percent, then ready', async () => {
    const { updater, statuses, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.1.0' });
      return { updateInfo: { version: '1.1.0' } };
    });

    await service.check(false);
    updater.emit('download-progress', { percent: 41.6 });
    updater.emit('update-downloaded', { version: '1.1.0' });

    expect(statuses).toEqual([
      { state: 'checking', manual: false },
      { state: 'downloading', version: '1.1.0', percent: 0 },
      { state: 'downloading', version: '1.1.0', percent: 42 },
      { state: 'ready', version: '1.1.0' },
    ]);
  });

  it('reports unsupported when the updater is inactive (unpackaged build)', async () => {
    const { updater, service } = setup();
    updater.checkForUpdates.mockResolvedValue(null);

    await service.check(true);

    expect(service.status).toEqual({ state: 'unsupported', manual: true });
  });

  it('turns a failed check into an UpdateError carrying the manual flag', async () => {
    const { updater, statuses, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      const failure = new Error('net::ERR_INTERNET_DISCONNECTED');
      updater.emit('error', failure);
      throw failure;
    });

    await service.check(false);

    const last = statuses[statuses.length - 1];
    expect(last).toMatchObject({ state: 'error', manual: false, error: { code: 'UpdateError' } });
    expect(statuses.filter((s) => s.state === 'error')).toHaveLength(1);
  });

  it('keeps the manual flag of the cycle for a later download error', async () => {
    const { updater, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.1.0' });
      return { updateInfo: { version: '1.1.0' } };
    });

    await service.check(true);
    updater.emit('error', new Error('checksum mismatch'));

    expect(service.status).toMatchObject({ state: 'error', manual: true });
  });

  it('promotes a running launch check to manual when the user also asks', async () => {
    const { updater, statuses, service } = setup();
    let finish: () => void = () => {};
    updater.checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => {
            updater.emit('update-not-available', { version: '1.0.0' });
            resolve({ updateInfo: { version: '1.0.0' } });
          };
        }),
    );

    const launch = service.check(false);
    await service.check(true);
    finish();
    await launch;

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toEqual({ state: 'upToDate', manual: true, version: '1.0.0' });
  });

  it('surfaces a download error even when the launch check found the update', async () => {
    const { updater, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.1.0' });
      return { updateInfo: { version: '1.1.0' } };
    });

    await service.check(false);
    updater.emit('error', new Error('checksum mismatch'));

    expect(service.status).toMatchObject({ state: 'error', manual: true });
  });

  it('does not re-check while a download is running or staged', async () => {
    const { updater, statuses, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.1.0' });
      return { updateInfo: { version: '1.1.0' } };
    });
    await service.check(false);
    updater.emit('update-downloaded', { version: '1.1.0' });
    statuses.length = 0;

    await service.check(true);

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([{ state: 'ready', version: '1.1.0' }]);
  });

  it('installs only once an update is staged', async () => {
    const { updater, service } = setup();
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.emit('update-downloaded', { version: '1.1.0' });
    service.install();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
