import type { ErrorCode } from './error-catalogue';

export type { ErrorCode } from './error-catalogue';

export type ErrorParams = Record<string, string | number>;

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: string;
  params?: ErrorParams;
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

export type ExportFormat = 'wav' | 'mp3';

export type MenuCommand = 'open' | 'export';

export interface ExportProgress {
  percent: number;
}

export type ExportResult =
  | { status: 'ok'; outputPath: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export type PrivacyStatus = 'unlisted' | 'private' | 'public';

export interface PublishRequest {
  coverImagePath?: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: PrivacyStatus;
  thumbnailPath?: string;
}

export interface CoverPreviewRequest {
  title: string;
  coverImagePath?: string;
}

export type CoverPreviewResult =
  | { status: 'ok'; url: string }
  | { status: 'error'; error: AppError };

export type PublishEvent =
  | { stage: 'cover' }
  | { stage: 'render' }
  | { stage: 'upload'; percent: number }
  | { stage: 'done'; videoId: string; url: string; warning?: AppError }
  | { stage: 'cancelled' }
  | { kind: 'error'; error: AppError };

export type PublishResult =
  | { status: 'ok'; videoId: string; url: string; warning?: AppError }
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

export type VoidResult = { status: 'ok' } | { status: 'error'; error: AppError };

export interface AccountInfo {
  channelId?: string;
  channelTitle?: string;
  email?: string;
}

export interface AccountState {
  signedIn: boolean;
  account?: AccountInfo | null;
  canSendEmail: boolean;
}

export interface DefaultLogo {
  url: string | null;
  custom: boolean;
}

export type LogoResult =
  | { status: 'ok'; url: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

export type AuthResult =
  | { status: 'ok'; account: AccountInfo | null }
  | { status: 'error'; error: AppError };

export interface EmailSendRequest {
  to: string[];
  subject: string;
  body: string;
}

export type EmailSendResult = { status: 'ok' } | { status: 'error'; error: AppError };

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
  toggleNormalize: () => Promise<EditResult>;
  concatenate: () => Promise<EditResult>;
  undo: () => Promise<Document>;
  redo: () => Promise<Document>;
  checkEngine: () => Promise<VoidResult>;
  exportAudio: (format: ExportFormat) => Promise<ExportResult>;
  onExportProgress: (cb: (e: ExportProgress) => void) => () => void;
  publish: (req: PublishRequest) => Promise<PublishResult>;
  cancelPublish: () => void;
  onPublishProgress: (cb: (e: PublishEvent) => void) => () => void;
  composeCoverPreview: (req: CoverPreviewRequest) => Promise<CoverPreviewResult>;
  getAccount: () => Promise<AccountState>;
  signIn: () => Promise<AuthResult>;
  signOut: () => Promise<VoidResult>;
  sendEmail: (req: EmailSendRequest) => Promise<EmailSendResult>;
  getDefaultLogo: () => Promise<DefaultLogo>;
  chooseDefaultLogo: () => Promise<LogoResult>;
  clearDefaultLogo: () => Promise<VoidResult>;
  copyText: (text: string) => Promise<VoidResult>;
  checkForUpdates: () => Promise<void>;
  setLocale: (locale: string) => Promise<void>;
  onMenuCommand: (cb: (command: MenuCommand) => void) => () => void;
  onProgress: (cb: (e: ProgressEvent) => void) => () => void;
};

declare global {
  interface Window {
    api: IpcApi;
  }
}
