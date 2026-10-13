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
  | { kind: 'concatenate'; file: string };

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
  format: 'wav' | 'mp3' | 'aac';
  outputPath: string;
}

export interface PublishRequest {
  coverImagePath?: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: 'unlisted' | 'private' | 'public';
}

export type OpenResult =
  | { status: 'ok'; clip: ClipInfo }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export type PeaksResult =
  | { status: 'ok'; peaks: PeakData }
  | { status: 'none' }
  | { status: 'error'; error: AppError };

export type IpcApi = {
  openFile: (filePath?: string) => Promise<OpenResult>;
  getPeaks: () => Promise<PeaksResult>;
  getPathForFile: (file: File) => string;
  getDocument: () => Promise<Document>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  checkEngine: () => Promise<void>;
  exportAudio: (opts: ExportOptions) => void;
  publish: (req: PublishRequest) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  onProgress: (cb: (e: ProgressEvent) => void) => () => void;
};

declare global {
  interface Window {
    api: IpcApi;
  }
}
