import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  CoverPreviewRequest,
  EditOperation,
  ExportFormat,
  ExportProgress,
  IpcApi,
  ProgressEvent,
  PublishEvent,
  PublishRequest,
} from '@shared/types';

const api: IpcApi = {
  openFile: (filePath?: string) => ipcRenderer.invoke('openFile', filePath),
  getPeaks: () => ipcRenderer.invoke('getPeaks'),
  getPreview: () => ipcRenderer.invoke('getPreview'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getDocument: () => ipcRenderer.invoke('getDocument'),
  applyEdit: (op: EditOperation) => ipcRenderer.invoke('applyEdit', op),
  toggleFade: (kind, seconds) => ipcRenderer.invoke('toggleFade', kind, seconds),
  concatenate: () => ipcRenderer.invoke('concatenate'),
  undo: () => ipcRenderer.invoke('undo'),
  redo: () => ipcRenderer.invoke('redo'),
  checkEngine: () => ipcRenderer.invoke('checkEngine'),
  exportAudio: (format: ExportFormat) => ipcRenderer.invoke('exportAudio', format),
  onExportProgress: (cb: (e: ExportProgress) => void) => {
    const listener = (_e: unknown, event: ExportProgress) => cb(event);
    ipcRenderer.on('exportProgress', listener);
    return () => {
      ipcRenderer.removeListener('exportProgress', listener);
    };
  },
  publish: (req: PublishRequest) => ipcRenderer.invoke('publish', req),
  cancelPublish: () => ipcRenderer.send('cancelPublish'),
  onPublishProgress: (cb: (e: PublishEvent) => void) => {
    const listener = (_e: unknown, event: PublishEvent) => cb(event);
    ipcRenderer.on('publishProgress', listener);
    return () => {
      ipcRenderer.removeListener('publishProgress', listener);
    };
  },
  composeCoverPreview: (req: CoverPreviewRequest) => ipcRenderer.invoke('composeCoverPreview', req),
  getAccount: () => ipcRenderer.invoke('getAccount'),
  signIn: () => ipcRenderer.invoke('signIn'),
  signOut: () => ipcRenderer.invoke('signOut'),
  checkForUpdates: () => ipcRenderer.invoke('checkForUpdates'),
  onProgress: (cb: (e: ProgressEvent) => void) => {
    const listener = (_e: any, event: ProgressEvent) => cb(event);
    ipcRenderer.on('progress', listener);
    return () => {
      ipcRenderer.removeListener('progress', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
