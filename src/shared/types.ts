import type { ErrorCode } from './error-catalogue';
import type { AppErrorResult } from './ipc';

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

export type FadeKind = 'fadeIn' | 'fadeOut';

export type EditOperation =
  | { kind: 'trim'; start: number; end: number }
  | { kind: 'cutRegion'; start: number; end: number }
  | { kind: 'fadeIn'; duration: number }
  | { kind: 'fadeOut'; duration: number }
  | { kind: 'gain'; db: number }
  | { kind: 'normalize' }
  | { kind: 'concatenate'; file: string; duration: number };

export interface EditListSnapshot {
  readonly effectiveEditList: readonly EditOperation[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
}

export interface Document extends EditListSnapshot {
  sourceFile: string | null;
}

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
  | AppErrorResult;

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

export type CoverPreviewResult = { status: 'ok'; url: string } | AppErrorResult;

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
  | AppErrorResult;

export type OpenResult =
  | { status: 'ok'; clip: ClipInfo }
  | { status: 'cancelled' }
  | AppErrorResult;

export type PeaksResult =
  | { status: 'ok'; peaks: PeakData }
  | { status: 'none' }
  | AppErrorResult;

export type PreviewResult =
  | { status: 'ok'; url: string }
  | { status: 'none' }
  | AppErrorResult;

export type EditResult =
  | { status: 'ok'; document: Document }
  | { status: 'cancelled' }
  | AppErrorResult;

export type VoidResult = { status: 'ok' } | AppErrorResult;

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
  | AppErrorResult;

export type AuthResult = { status: 'ok'; account: AccountInfo | null } | AppErrorResult;

export interface EmailSendRequest {
  to: string[];
  subject: string;
  body: string;
}

export type EmailSendResult = { status: 'ok' } | AppErrorResult;

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
}
