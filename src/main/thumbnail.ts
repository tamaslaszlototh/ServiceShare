import { createReadStream } from 'fs';
import { IpcError } from './errors';
import {
  UploadBody,
  UploadHttp,
  classifyUploadStatus,
  nodeUploadHttp,
} from './upload';

export const THUMBNAIL_URL = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
export const MAX_THUMBNAIL_BYTES = 50 * 1024 * 1024;

export type ThumbnailContentType = 'image/png' | 'image/jpeg';

export function thumbnailContentType(filePath: string): ThumbnailContentType {
  const ext = filePath.toLowerCase().split('.').pop();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
}

export interface ThumbnailSource {
  path: string;
  size: number;
  contentType: ThumbnailContentType;
}

export interface ThumbnailOptions {
  accessToken: string;
  videoId: string;
  source: ThumbnailSource;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface ThumbnailDeps {
  http: UploadHttp;
  openBody: (path: string) => UploadBody;
  uploadUrl?: string;
}

export function thumbnailUrl(videoId: string, base = THUMBNAIL_URL): string {
  return `${base}?uploadType=media&videoId=${encodeURIComponent(videoId)}`;
}

export async function setThumbnail(
  options: ThumbnailOptions,
  deps: ThumbnailDeps,
): Promise<void> {
  if (options.source.size > MAX_THUMBNAIL_BYTES) {
    throw new IpcError('EngineError', 'The thumbnail exceeds the 50 MB limit');
  }

  const response = await deps.http({
    url: thumbnailUrl(options.videoId, deps.uploadUrl),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': options.source.contentType,
      'Content-Length': String(options.source.size),
    },
    body: deps.openBody(options.source.path),
    totalBytes: options.source.size,
    signal: options.signal,
    onProgress: options.onProgress,
  });

  if (response.status !== 200) {
    throw classifyUploadStatus(response.status, response.text);
  }
}

export function thumbnailDepsIn(): ThumbnailDeps {
  return {
    http: nodeUploadHttp,
    openBody: (path) => createReadStream(path),
  };
}
