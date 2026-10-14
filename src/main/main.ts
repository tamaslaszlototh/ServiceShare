import { app, BrowserWindow, Menu, dialog, protocol, shell, clipboard } from 'electron';
import { createReadStream, existsSync } from 'fs';
import { mkdir, mkdtemp, rm, stat, copyFile, readFile } from 'fs/promises';
import { Readable } from 'stream';
import * as path from 'path';
import { DocumentManager } from './document';
import { ffmpegResolver } from './ffmpeg';
import { probeClip, defaultWavProbeDeps } from './probe';
import { generatePeaks, defaultPeakDeps, killActiveDecodes } from './peaks';
import { PreviewService, previewDepsIn } from './preview';
import { ExportService, exportDepsIn } from './export';
import { PublishService, publishDepsIn } from './publish';
import { CoverService, coverDepsIn } from './cover';
import { CoverPreviewService } from './coverPreview';
import { YouTubeService } from './youtube';
import { emailDepsIn, parseEmailSendRequest, sendEmail } from './email';
import { assetResolver } from './assets';
import { parseByteRange } from './range';
import { IpcError, NoClipError, errorResult } from './errors';
import { emit, handle, onSend } from './ipc';
import { logError, logInfo } from './log';
import { CUSTOM_LOGO_FILE, LogoStore } from './logo';
import { DEFAULT_LOCALE, Locale, Translator, resolveLocale, t as translate } from '../shared/i18n';
import { MenuEntry, applicationMenu, exportDialogOptions, logoDialogOptions, openDialogOptions } from './shell';
import { ClipInfo, ExportFormat } from '@shared/types';
import { editedDuration } from '../shared/duration';

const isDev = process.env.NODE_ENV === 'development';

protocol.registerSchemesAsPrivileged([
  { scheme: 'preview', privileges: { standard: true, stream: true, supportFetchAPI: true } },
  { scheme: 'cover', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

const docManager = new DocumentManager();
let previewService: PreviewService | null = null;
let coverPreviewService: CoverPreviewService | null = null;
let publishService: PublishService | null = null;
let activePublish: AbortController | null = null;
let currentClip: ClipInfo | null = null;
const exportService = new ExportService(exportDepsIn());
const youtubeService = new YouTubeService();
let logoStore: LogoStore | null = null;

let activeLocale: Locale = DEFAULT_LOCALE;

const tr: Translator = (key, params) => translate(activeLocale, key, params);

function logoKey(): string {
  return `${assetResolver.resolve().logo}@${logoStore?.versionKey ?? 0}`;
}

async function fileDataUrl(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(toElectronTemplate(applicationMenu(tr, process.platform))));
}

function toElectronTemplate(entries: MenuEntry[]): Electron.MenuItemConstructorOptions[] {
  return entries.map((entry) => {
    const command = entry.command;
    const item: Electron.MenuItemConstructorOptions = {
      ...(entry.type === undefined ? {} : { type: entry.type }),
      ...(entry.role === undefined ? {} : { role: entry.role as Electron.MenuItemConstructorOptions['role'] }),
      ...(entry.label === undefined ? {} : { label: entry.label }),
      ...(command === undefined
        ? {}
        : {
            click: () => {
              const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
              if (target) {
                emit(target.webContents, 'menuCommand', command);
              }
            },
          }),
    };
    if (entry.submenu) {
      item.submenu = toElectronTemplate(entry.submenu);
    }
    return item;
  });
}

async function pickExportPath(format: ExportFormat, sourceFile: string): Promise<string | null> {
  const { title, filters, extension } = exportDialogOptions(tr, format);
  const defaultName = `${path.parse(sourceFile).name}.${extension}`;
  const result = await dialog.showSaveDialog({
    title,
    defaultPath: defaultName,
    filters,
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
}

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

async function coverResponse(request: Request): Promise<Response> {
  const key = new URL(request.url).pathname.replace(/^\//, '');
  const filePath = key ? coverPreviewService?.pathFor(key) : null;
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Content-Length': String(size) },
  });
}

async function pickClipPath(): Promise<string | null> {
  const { title, filters } = openDialogOptions(tr);
  const result = await dialog.showOpenDialog({
    title,
    filters,
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

app.whenReady().then(async () => {
  const tempRoot = path.join(app.getPath('userData'), 'temp');
  logoStore = new LogoStore({
    logoPath: path.join(app.getPath('userData'), CUSTOM_LOGO_FILE),
    fileExists: existsSync,
    copyFile,
    removeFile: (filePath) => rm(filePath, { force: true }),
  });
  assetResolver.setLogoOverride(logoStore.customPath());
  previewService = new PreviewService(previewDepsIn(tempRoot));
  const coverService = new CoverService(coverDepsIn(() => assetResolver.resolve()));
  coverPreviewService = new CoverPreviewService({
    compose: (request) => coverService.compose(request),
    makeTempDir: async () => {
      await mkdir(tempRoot, { recursive: true });
      return mkdtemp(path.join(tempRoot, 'cover-preview-'));
    },
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    removeFile: (filePath) => rm(filePath, { force: true }),
  });
  publishService = new PublishService(
    publishDepsIn({
      resolveAssets: () => assetResolver.resolve(),
      getAccessToken: () => youtubeService.getAccessToken(),
      makeTempDir: async () => {
        await mkdir(tempRoot, { recursive: true });
        return mkdtemp(path.join(tempRoot, 'publish-'));
      },
      removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    }),
  );
  await youtubeService.initialize().catch((e) => logError('youtube', 'INIT', e));
  const win = createWindow();
  installMenu();

  handle('setLocale', (_e, locale) => {
    activeLocale = resolveLocale(locale);
    installMenu();
  });

  win.webContents.once('did-finish-load', () => {
    ffmpegResolver.resolve().catch((e) => logError('ffmpeg', 'RESOLVE', e));
  });

  handle('openFile', async (_e, filePath) => {
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
      return errorResult(e, 'CorruptFile');
    }
  });

  handle('getPeaks', async () => {
    if (!currentClip) {
      return { status: 'none' };
    }
    try {
      const editList = docManager.getEffectiveEditList();
      let peakClip = currentClip;
      if (editList.length > 0 && previewService) {
        const render = await previewService.ensure(currentClip, editList);
        peakClip = {
          ...currentClip,
          filePath: render.path,
          duration: editedDuration(currentClip.duration, editList),
        };
      }
      const peaks = await generatePeaks(peakClip, defaultPeakDeps);
      return { status: 'ok', peaks };
    } catch (e) {
      return errorResult(e, 'RenderError');
    }
  });

  protocol.handle('preview', previewResponse);
  protocol.handle('cover', coverResponse);

  handle('getPreview', async () => {
    if (!currentClip || !previewService) {
      return { status: 'none' };
    }
    try {
      const result = await previewService.ensure(currentClip, docManager.getEffectiveEditList());
      return { status: 'ok', url: result.url };
    } catch (e) {
      return errorResult(e, 'RenderError');
    }
  });

  handle('getDocument', async () => {
    return docManager.getDocument();
  });

  handle('applyEdit', async (_e, op) => {
    try {
      docManager.appendEdit(op);
      return { status: 'ok', document: docManager.getDocument() };
    } catch (e) {
      return errorResult(e, 'EngineError');
    }
  });

  handle('toggleFade', async (_e, kind, seconds) => {
    try {
      docManager.toggleFade(kind, seconds);
      return { status: 'ok', document: docManager.getDocument() };
    } catch (e) {
      return errorResult(e, 'EngineError');
    }
  });

  handle('toggleNormalize', async () => {
    try {
      docManager.toggleNormalize();
      return { status: 'ok', document: docManager.getDocument() };
    } catch (e) {
      return errorResult(e, 'EngineError');
    }
  });

  handle('concatenate', async () => {
    const target = await pickClipPath();
    if (!target) {
      return { status: 'cancelled' };
    }
    try {
      const second = await probeClip(target, defaultWavProbeDeps);
      docManager.appendEdit({ kind: 'concatenate', file: target, duration: second.duration });
      return { status: 'ok', document: docManager.getDocument() };
    } catch (e) {
      return errorResult(e, 'CorruptFile');
    }
  });

  handle('undo', async () => {
    docManager.undo();
    return docManager.getDocument();
  });

  handle('redo', async () => {
    docManager.redo();
    return docManager.getDocument();
  });

  handle('checkEngine', async () => {
    try {
      await ffmpegResolver.recheck();
      return { status: 'ok' };
    } catch (e) {
      return errorResult(e, 'EngineError');
    }
  });

  handle('exportAudio', async (event, format) => {
    if (!currentClip) {
      return errorResult(new NoClipError());
    }
    const outputPath = await pickExportPath(format, currentClip.filePath);
    if (!outputPath) {
      return { status: 'cancelled' };
    }
    try {
      await exportService.export(
        currentClip,
        docManager.getEffectiveEditList(),
        { format, outputPath },
        (percent) => emit(event.sender, 'exportProgress', { percent }),
      );
      return { status: 'ok', outputPath };
    } catch (e) {
      return errorResult(e, 'RenderError');
    }
  });

  handle('publish', async (event, req) => {
    if (!currentClip || !publishService) {
      return errorResult(new NoClipError());
    }
    if (activePublish) {
      return errorResult(new IpcError('PublishInProgress', 'A publish is already in progress'));
    }
    const controller = new AbortController();
    activePublish = controller;
    try {
      return await publishService.publish(
        req,
        { clip: currentClip, editList: docManager.getEffectiveEditList() },
        {
          signal: controller.signal,
          onEvent: (e) => emit(event.sender, 'publishProgress', e),
        },
      );
    } finally {
      activePublish = null;
    }
  });

  onSend('cancelPublish', () => {
    activePublish?.abort();
  });

  handle('composeCoverPreview', async (_e, req) => {
    if (!coverPreviewService) {
      return errorResult(new IpcError('CoverUnavailable', 'Cover preview is not available'));
    }
    try {
      const preview = await coverPreviewService.ensure(req.title, req.coverImagePath, logoKey());
      return { status: 'ok', url: preview.url };
    } catch (e) {
      return errorResult(e, 'RenderError');
    }
  });

  handle('getDefaultLogo', async () => {
    const custom = logoStore?.customPath() ?? null;
    const target = custom ?? assetResolver.resolve().logo;
    return { url: await fileDataUrl(target), custom: custom !== null };
  });

  handle('chooseDefaultLogo', async () => {
    try {
      const { title, filters } = logoDialogOptions(tr);
      const result = await dialog.showOpenDialog({ title, filters, properties: ['openFile'] });
      if (result.canceled || result.filePaths.length === 0) {
        return { status: 'cancelled' };
      }
      if (!logoStore) {
        return errorResult(new Error('Logo storage is unavailable'), 'InternalError');
      }
      await logoStore.setFrom(result.filePaths[0]);
      const logoPath = logoStore.customPath();
      assetResolver.setLogoOverride(logoPath);
      const url = logoPath ? await fileDataUrl(logoPath) : null;
      if (!url) {
        return errorResult(new Error('Could not read the chosen logo'), 'RenderError');
      }
      return { status: 'ok', url };
    } catch (e) {
      return errorResult(e, 'RenderError');
    }
  });

  handle('clearDefaultLogo', async () => {
    try {
      await logoStore?.clear();
      assetResolver.setLogoOverride(null);
      return { status: 'ok' };
    } catch (e) {
      return errorResult(e, 'InternalError');
    }
  });

  handle('getAccount', async () => {
    return youtubeService.accountState();
  });

  handle('signIn', async () => {
    try {
      const account = await youtubeService.signIn();
      return { status: 'ok', account };
    } catch (e) {
      return errorResult(e, 'AuthRevoked');
    }
  });

  handle('signOut', async () => {
    try {
      await youtubeService.signOut();
      return { status: 'ok' };
    } catch (e) {
      return errorResult(e, 'AuthRevoked');
    }
  });

  handle('sendEmail', async (_e, req) => {
    const parsed = parseEmailSendRequest(req);
    if (parsed.status === 'error') {
      return errorResult(parsed.error);
    }
    try {
      const accessToken = await youtubeService.getAccessToken();
      const from = youtubeService.getAccount()?.email ?? undefined;
      await sendEmail({ accessToken, message: { ...parsed.payload, from } }, emailDepsIn());
      return { status: 'ok' };
    } catch (e) {
      return errorResult(e, 'EmailSendError');
    }
  });

  handle('copyText', async (_e, text) => {
    if (typeof text !== 'string') {
      return errorResult(new IpcError('InternalError', 'copyText expects a string'));
    }
    clipboard.writeText(text);
    return { status: 'ok' };
  });

  handle('checkForUpdates', async () => {
    logInfo('updater', 'CHECK');
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
  void coverPreviewService?.dispose();
});
