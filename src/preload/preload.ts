import { contextBridge, ipcRenderer } from 'electron';
import { ExportOptions, IpcApi, ProgressEvent, PublishRequest } from '@shared/types';

const api: IpcApi = {
  openFile: () => ipcRenderer.invoke('openFile'),
  getDocument: () => ipcRenderer.invoke('getDocument'),
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
