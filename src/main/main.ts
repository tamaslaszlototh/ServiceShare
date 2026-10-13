import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { DocumentManager } from './document';
import { ffmpegResolver } from './ffmpeg';
import { probeClip, defaultWavProbeDeps } from './probe';
import { generatePeaks, defaultPeakDeps, killActiveDecodes } from './peaks';
import { IpcError, toAppError } from './errors';
import { ClipInfo, ExportOptions, OpenResult, PeaksResult, ProgressEvent, PublishRequest } from '@shared/types';

const isDev = process.env.NODE_ENV === 'development';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function engineErrorEvent(error: unknown): ProgressEvent {
  return { kind: 'error', error: toAppError(error, 'EngineError') };
}

const docManager = new DocumentManager();
let currentClip: ClipInfo | null = null;

async function pickClipPath(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'WAV Files', extensions: ['wav', 'wave'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

app.whenReady().then(() => {
  const win = createWindow();

  win.webContents.once('did-finish-load', () => {
    ffmpegResolver
      .resolve()
      .catch((e) => win.webContents.send('progress', engineErrorEvent(e)));
  });

  ipcMain.handle('openFile', async (_e, filePath?: string): Promise<OpenResult> => {
    const target = filePath ?? (await pickClipPath());
    if (!target) {
      return { status: 'cancelled' };
    }

    try {
      const clip = await probeClip(target, defaultWavProbeDeps);
      docManager.setSourceFile(clip.filePath);
      currentClip = clip;
      return { status: 'ok', clip };
    } catch (e) {
      if (e instanceof IpcError) {
        return { status: 'error', error: e.toAppError() };
      }
      throw e;
    }
  });

  ipcMain.handle('getPeaks', async (): Promise<PeaksResult> => {
    if (!currentClip) {
      return { status: 'none' };
    }
    try {
      const peaks = await generatePeaks(currentClip, defaultPeakDeps);
      return { status: 'ok', peaks };
    } catch (e) {
      if (e instanceof IpcError) {
        return { status: 'error', error: e.toAppError() };
      }
      throw e;
    }
  });

  ipcMain.handle('getDocument', async () => {
    return docManager.getDocument();
  });

  ipcMain.handle('undo', async () => {
    docManager.undo();
  });

  ipcMain.handle('redo', async () => {
    docManager.redo();
  });

  ipcMain.handle('checkEngine', async () => {
    await ffmpegResolver.recheck();
  });

  ipcMain.on('exportAudio', (_e, opts: ExportOptions) => {
    console.log('Export requested', opts);
  });

  ipcMain.on('publish', (_e, req: PublishRequest) => {
    console.log('Publish requested', req);
  });

  ipcMain.handle('signIn', async () => {
    console.log('Sign in requested');
  });

  ipcMain.handle('signOut', async () => {
    console.log('Sign out requested');
  });

  ipcMain.handle('checkForUpdates', async () => {
    console.log('Check for updates requested');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killActiveDecodes();
});
