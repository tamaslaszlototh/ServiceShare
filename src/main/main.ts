import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import * as path from 'path';
import { DocumentManager } from './document';
import { ffmpegResolver } from './ffmpeg';
import { probeClip, defaultWavProbeDeps } from './probe';
import { generatePeaks, defaultPeakDeps, killActiveDecodes } from './peaks';
import { PreviewService, previewDepsIn } from './preview';
import { parseByteRange } from './range';
import { IpcError, toAppError } from './errors';
import {
  ClipInfo,
  ExportOptions,
  OpenResult,
  PeaksResult,
  PreviewResult,
  ProgressEvent,
  PublishRequest,
} from '@shared/types';

const isDev = process.env.NODE_ENV === 'development';

protocol.registerSchemesAsPrivileged([
  { scheme: 'preview', privileges: { standard: true, stream: true, supportFetchAPI: true } },
]);

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
let previewService: PreviewService | null = null;
let currentClip: ClipInfo | null = null;

async function previewResponse(request: Request): Promise<Response> {
  const key = new URL(request.url).hostname;
  const filePath = previewService?.pathFor(key);
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const { start, end, partial } = parseByteRange(request.headers.get('Range'), size);
  const body = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream;
  const base = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes' };
  if (partial) {
    return new Response(body, {
      status: 206,
      headers: {
        ...base,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
  return new Response(body, {
    status: 200,
    headers: { ...base, 'Content-Length': String(size) },
  });
}

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
  previewService = new PreviewService(previewDepsIn(path.join(app.getPath('userData'), 'temp')));
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

  protocol.handle('preview', previewResponse);

  ipcMain.handle('getPreview', async (): Promise<PreviewResult> => {
    if (!currentClip || !previewService) {
      return { status: 'none' };
    }
    try {
      const result = await previewService.ensure(currentClip, docManager.getEffectiveEditList());
      return { status: 'ok', url: result.url };
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
    return docManager.getDocument();
  });

  ipcMain.handle('redo', async () => {
    docManager.redo();
    return docManager.getDocument();
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

app.on('will-quit', () => {
  void previewService?.dispose();
});
