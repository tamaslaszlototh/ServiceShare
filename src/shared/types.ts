export type ErrorCode =
  | 'FormatError'
  | 'CorruptFile'
  | 'PermissionError'
  | 'DiskFull'
  | 'EngineError'
  | 'RenderError'
  | 'NetworkError'
  | 'QuotaExceeded'
  | 'AuthRevoked'
  | 'UploadExpired'
  | 'TooLong'
  | 'UnverifiedProject'
  | 'TokenStorageError';

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: string;
}

export interface ClipInfo {
  duration: number;
  sampleRate: number;
  bitDepth: 16 | 24;
  channels: number;
  filePath: string;
}

export interface Selection {
  start: number;
  end: number;
}

export interface PeakBucket {
  min: number;
  max: number;
}

export interface PeakData {
  channels: number;
  buckets: PeakBucket[][];
}

export type EditOperation =
  | { kind: 'trim'; start: number; end: number }
  | { kind: 'cutRegion'; start: number; end: number }
  | { kind: 'fadeIn'; duration: number }
  | { kind: 'fadeOut'; duration: number }
  | { kind: 'gain'; db: number }
  | { kind: 'normalize' }
  | { kind: 'concatenate'; file: string; duration: number };

export interface Document {
  sourceFile: string | null;
  editList: EditOperation[];
  historyIndex: number;
}

export type ProgressEvent =
  | { stage: 'rendering' | 'cover' | 'upload'; percent?: number }
  | { stage: 'done' }
  | { kind: 'error'; error: AppError };

export interface ExportOptions {
  format: ExportFormat;
  outputPath: string;
}

export type ExportFormat = 'wav' | 'mp3' | 'aac';

export interface ExportProgress {
  percent: number;
}

export type ExportResult =
  | { status: 'ok'; outputPath: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export interface PublishRequest {
  coverImagePath?: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: 'unlisted' | 'private' | 'public';
}

export type PublishEvent =
  | { stage: 'cover' }
  | { stage: 'render' }
  | { stage: 'upload'; percent: number }
  | { stage: 'done'; videoId: string; url: string }
  | { stage: 'cancelled' }
  | { kind: 'error'; error: AppError };

export type PublishResult =
  | { status: 'ok'; videoId: string; url: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export type OpenResult =
  | { status: 'ok'; clip: ClipInfo }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export type PeaksResult =
  | { status: 'ok'; peaks: PeakData }
  | { status: 'none' }
  | { status: 'error'; error: AppError };

export type PreviewResult =
  | { status: 'ok'; url: string }
  | { status: 'none' }
  | { status: 'error'; error: AppError };

export type EditResult =
  | { status: 'ok'; document: Document }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export interface AccountInfo {
  channelId?: string;
  channelTitle?: string;
  email?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
}

export type IpcApi = {
  openFile: (filePath?: string) => Promise<OpenResult>;
  getPeaks: () => Promise<PeaksResult>;
  getPreview: () => Promise<PreviewResult>;
  getPathForFile: (file: File) => string;
  getDocument: () => Promise<Document>;
  applyEdit: (op: EditOperation) => Promise<EditResult>;
  toggleFade: (kind: 'fadeIn' | 'fadeOut', seconds: number) => Promise<EditResult>;
  concatenate: () => Promise<EditResult>;
  undo: () => Promise<Document>;
  redo: () => Promise<Document>;
  checkEngine: () => Promise<void>;
  exportAudio: (format: ExportFormat) => Promise<ExportResult>;
  onExportProgress: (cb: (e: ExportProgress) => void) => () => void;
  publish: (req: PublishRequest) => Promise<PublishResult>;
  cancelPublish: () => void;
  onPublishProgress: (cb: (e: PublishEvent) => void) => () => void;
  signIn: () => Promise<AccountInfo | null>;
  signOut: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  onProgress: (cb: (e: ProgressEvent) => void) => () => void;
};

declare global {
  interface Window {
    api: IpcApi;
  }
}
