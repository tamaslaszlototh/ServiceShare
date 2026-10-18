import type {
  AccountState,
  AppError,
  AuthResult,
  CoverPreviewRequest,
  CoverPreviewResult,
  DefaultImage,
  Document,
  EditOperation,
  EditResult,
  EmailRecipientsResult,
  EmailSendRequest,
  EmailSendResult,
  ExportFormat,
  ExportProgress,
  ExportResult,
  FadeKind,
  ImageResult,
  MenuCommand,
  OpenResult,
  PeaksResult,
  PreviewResult,
  PublishEvent,
  PublishRequest,
  PublishResult,
  UpdateStatus,
  VoidResult,
} from './types';

/**
 * The single error envelope every IPC result carries on failure. Declared here,
 * in the contract, because it is part of the IPC surface (not a domain type).
 */
export interface AppErrorResult {
  status: 'error';
  error: AppError;
}

/**
 * The single declaration of every IPC channel name on the wire. Both the preload
 * adapter and the main-process handlers read their channel names from here, so a
 * channel is named once and the two ends cannot drift apart.
 */
export const IPC_CHANNELS = {
  invoke: {
    setLocale: 'setLocale',
    openFile: 'openFile',
    getPeaks: 'getPeaks',
    getPreview: 'getPreview',
    getDocument: 'getDocument',
    applyEdit: 'applyEdit',
    toggleFade: 'toggleFade',
    toggleNormalize: 'toggleNormalize',
    concatenate: 'concatenate',
    undo: 'undo',
    redo: 'redo',
    checkEngine: 'checkEngine',
    exportAudio: 'exportAudio',
    publish: 'publish',
    composeCoverPreview: 'composeCoverPreview',
    getDefaultLogo: 'getDefaultLogo',
    chooseDefaultLogo: 'chooseDefaultLogo',
    clearDefaultLogo: 'clearDefaultLogo',
    getDefaultBase: 'getDefaultBase',
    chooseDefaultBase: 'chooseDefaultBase',
    clearDefaultBase: 'clearDefaultBase',
    getAccount: 'getAccount',
    signIn: 'signIn',
    signOut: 'signOut',
    getEmailRecipients: 'getEmailRecipients',
    rememberEmailRecipient: 'rememberEmailRecipient',
    forgetEmailRecipient: 'forgetEmailRecipient',
    sendEmail: 'sendEmail',
    copyText: 'copyText',
    checkForUpdates: 'checkForUpdates',
    getUpdateStatus: 'getUpdateStatus',
    installUpdate: 'installUpdate',
  },
  send: {
    cancelPublish: 'cancelPublish',
  },
  events: {
    exportProgress: 'exportProgress',
    publishProgress: 'publishProgress',
    menuCommand: 'menuCommand',
    updateStatus: 'updateStatus',
  },
} as const;

/** Request arguments and result payload for each invoke (handle/invoke) channel. */
export interface IpcInvokeContract {
  setLocale: { args: [locale: string]; result: void };
  openFile: { args: [filePath?: string]; result: OpenResult };
  getPeaks: { args: []; result: PeaksResult };
  getPreview: { args: []; result: PreviewResult };
  getDocument: { args: []; result: Document };
  applyEdit: { args: [op: EditOperation]; result: EditResult };
  toggleFade: { args: [kind: FadeKind, seconds: number]; result: EditResult };
  toggleNormalize: { args: []; result: EditResult };
  concatenate: { args: []; result: EditResult };
  undo: { args: []; result: Document };
  redo: { args: []; result: Document };
  checkEngine: { args: []; result: VoidResult };
  exportAudio: { args: [format: ExportFormat]; result: ExportResult };
  publish: { args: [req: PublishRequest]; result: PublishResult };
  composeCoverPreview: { args: [req: CoverPreviewRequest]; result: CoverPreviewResult };
  getDefaultLogo: { args: []; result: DefaultImage };
  chooseDefaultLogo: { args: []; result: ImageResult };
  clearDefaultLogo: { args: []; result: VoidResult };
  getDefaultBase: { args: []; result: DefaultImage };
  chooseDefaultBase: { args: []; result: ImageResult };
  clearDefaultBase: { args: []; result: VoidResult };
  getAccount: { args: []; result: AccountState };
  signIn: { args: []; result: AuthResult };
  signOut: { args: []; result: VoidResult };
  getEmailRecipients: { args: []; result: EmailRecipientsResult };
  rememberEmailRecipient: { args: [address: string]; result: EmailRecipientsResult };
  forgetEmailRecipient: { args: [address: string]; result: EmailRecipientsResult };
  sendEmail: { args: [req: EmailSendRequest]; result: EmailSendResult };
  copyText: { args: [text: string]; result: VoidResult };
  checkForUpdates: { args: []; result: void };
  getUpdateStatus: { args: []; result: UpdateStatus };
  installUpdate: { args: []; result: void };
}

/** Fire-and-forget renderer → main channels. */
export interface IpcSendContract {
  cancelPublish: { args: [] };
}

/** Main → renderer pushed event channels and their payload. */
export interface IpcEventContract {
  exportProgress: ExportProgress;
  publishProgress: PublishEvent;
  menuCommand: MenuCommand;
  updateStatus: UpdateStatus;
}

export type InvokeChannel = keyof IpcInvokeContract;
export type SendChannel = keyof IpcSendContract;
export type EventChannel = keyof IpcEventContract;

export type IpcInvokeApi = {
  [K in InvokeChannel]: (
    ...args: IpcInvokeContract[K]['args']
  ) => Promise<IpcInvokeContract[K]['result']>;
};

export type IpcEventApi = {
  [K in EventChannel as `on${Capitalize<K>}`]: (
    cb: (event: IpcEventContract[K]) => void,
  ) => () => void;
};

export type IpcApi = IpcInvokeApi &
  IpcEventApi & {
    getPathForFile: (file: File) => string;
    cancelPublish: () => void;
  };

declare global {
  interface Window {
    api: IpcApi;
  }
}
