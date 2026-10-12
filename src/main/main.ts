import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { DocumentManager } from './document';
import { ffmpegResolver, EngineError } from './ffmpeg';
import { ClipInfo, ExportOptions, ProgressEvent, PublishRequest } from '@shared/types';

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
  const engineError = error as Partial<EngineError>;
  return {
    kind: 'error',
    error: {
      code: 'EngineError',
      message: engineError.message ?? 'FFmpeg not found',
      details: engineError.details,
    },
  };
}

const docManager = new DocumentManager();

app.whenReady().then(() => {
  const win = createWindow();

  win.webContents.once('did-finish-load', () => {
    ffmpegResolver
      .resolve()
      .catch((e) => win.webContents.send('progress', engineErrorEvent(e)));
  });

  ipcMain.handle('openFile', async (): Promise<ClipInfo> => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'WAV Files', extensions: ['wav', 'wave'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('Cancelled');
    }

    const filePath = result.filePaths[0];
    docManager.setSourceFile(filePath);

    return {
      duration: 0,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 1,
      filePath,
    };
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
