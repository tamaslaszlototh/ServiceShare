import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  EventChannel,
  IPC_CHANNELS,
  IpcApi,
  IpcEventContract,
  IpcInvokeContract,
  IpcSendContract,
  InvokeChannel,
  SendChannel,
} from '../shared/ipc';

function invoke<K extends InvokeChannel>(
  channel: K,
): (...args: IpcInvokeContract[K]['args']) => Promise<IpcInvokeContract[K]['result']> {
  return (...args) => ipcRenderer.invoke(IPC_CHANNELS.invoke[channel], ...args);
}

function send<K extends SendChannel>(
  channel: K,
): (...args: IpcSendContract[K]['args']) => void {
  return (...args) => ipcRenderer.send(IPC_CHANNELS.send[channel], ...args);
}

function subscribe<K extends EventChannel>(
  channel: K,
  cb: (event: IpcEventContract[K]) => void,
): () => void {
  const listener = (_event: unknown, payload: IpcEventContract[K]) => cb(payload);
  const wire = IPC_CHANNELS.events[channel];
  ipcRenderer.on(wire, listener);
  return () => {
    ipcRenderer.removeListener(wire, listener);
  };
}

const api: IpcApi = {
  setLocale: invoke('setLocale'),
  openFile: invoke('openFile'),
  getPeaks: invoke('getPeaks'),
  getPreview: invoke('getPreview'),
  getDocument: invoke('getDocument'),
  applyEdit: invoke('applyEdit'),
  toggleFade: invoke('toggleFade'),
  toggleNormalize: invoke('toggleNormalize'),
  concatenate: invoke('concatenate'),
  undo: invoke('undo'),
  redo: invoke('redo'),
  checkEngine: invoke('checkEngine'),
  exportAudio: invoke('exportAudio'),
  publish: invoke('publish'),
  composeCoverPreview: invoke('composeCoverPreview'),
  getDefaultLogo: invoke('getDefaultLogo'),
  chooseDefaultLogo: invoke('chooseDefaultLogo'),
  clearDefaultLogo: invoke('clearDefaultLogo'),
  getDefaultBase: invoke('getDefaultBase'),
  chooseDefaultBase: invoke('chooseDefaultBase'),
  clearDefaultBase: invoke('clearDefaultBase'),
  getAccount: invoke('getAccount'),
  signIn: invoke('signIn'),
  signOut: invoke('signOut'),
  getEmailRecipients: invoke('getEmailRecipients'),
  rememberEmailRecipient: invoke('rememberEmailRecipient'),
  forgetEmailRecipient: invoke('forgetEmailRecipient'),
  sendEmail: invoke('sendEmail'),
  copyText: invoke('copyText'),
  checkForUpdates: invoke('checkForUpdates'),
  getUpdateStatus: invoke('getUpdateStatus'),
  installUpdate: invoke('installUpdate'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  cancelPublish: send('cancelPublish'),
  onExportProgress: (cb) => subscribe('exportProgress', cb),
  onPublishProgress: (cb) => subscribe('publishProgress', cb),
  onMenuCommand: (cb) => subscribe('menuCommand', cb),
  onUpdateStatus: (cb) => subscribe('updateStatus', cb),
};

contextBridge.exposeInMainWorld('api', api);
