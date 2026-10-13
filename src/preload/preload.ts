import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { EditOperation, ExportOptions, IpcApi, ProgressEvent, PublishRequest } from '@shared/types';

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
  exportAudio: (opts: ExportOptions) => ipcRenderer.send('exportAudio', opts),
  publish: (req: PublishRequest) => ipcRenderer.send('publish', req),
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
