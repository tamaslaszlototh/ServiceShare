import { createReadStream } from 'fs';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { Readable } from 'stream';
import {
  AuthRevokedError,
  IpcError,
  NetworkError,
  QuotaExceededError,
  UploadExpiredError,
} from './errors';

export const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
export const UPLOAD_PARTS = 'snippet,status';
export const MAX_ATTEMPTS = 5;
export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 32000;

export interface UploadMetadata {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: 'unlisted' | 'private' | 'public';
}

export interface UploadSource {
  path: string;
  size: number;
  contentType: string;
}

export interface UploadOptions {
  accessToken: string;
  metadata: UploadMetadata;
  source: UploadSource;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface UploadResult {
  videoId: string;
  url: string;
}

export type UploadBody = Readable | string | Uint8Array;

export interface UploadHttpRequest {
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  body: UploadBody;
  totalBytes?: number;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface UploadHttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export type UploadHttp = (request: UploadHttpRequest) => Promise<UploadHttpResponse>;

export interface UploadDeps {
  http: UploadHttp;
  openBody: (path: string) => UploadBody;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  uploadUrl?: string;
}

export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelled';
  }
}

export function videoUrl(videoId: string): string {
  return `https://youtu.be/${videoId}`;
}

export function backoffDelay(attempt: number, random: () => number): number {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  const jitter = exponential * 0.25 * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

export function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function apiErrorReason(text: string): string | null {
  try {
    const json = JSON.parse(text) as {
      error?: { errors?: { reason?: string }[]; status?: string };
    };
    return json.error?.errors?.[0]?.reason ?? json.error?.status ?? null;
  } catch {
    return null;
  }
}

export function classifyUploadStatus(status: number, body: string): IpcError {
  if (status === 401) {
    return new AuthRevokedError(body);
  }
  if (status === 404) {
    return new UploadExpiredError('The upload session expired', body);
  }
  if (status === 403) {
    const reason = apiErrorReason(body) ?? '';
    if (/quota|limit|rate/i.test(`${reason} ${body}`)) {
      return new QuotaExceededError(body);
    }
    return new IpcError('PermissionError', 'YouTube refused the upload', body);
  }
  if (isRetriableStatus(status)) {
    return new NetworkError(`Upload failed with status ${status}`, body);
  }
  return new IpcError('EngineError', `Upload failed with status ${status}`, body);
}

function assertUploadable(options: UploadOptions): void {
  if (options.source.size <= 0) {
    throw new IpcError('RenderError', 'The publish track is empty');
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbort(error: unknown): boolean {
  return error instanceof UploadCancelled || (error as { name?: string })?.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new UploadCancelled();
  }
}

async function initSession(options: UploadOptions, deps: UploadDeps): Promise<string> {
  const { metadata, source, accessToken } = options;
  const snippet: Record<string, unknown> = { title: metadata.title };
  if (metadata.description) snippet.description = metadata.description;
  if (metadata.tags && metadata.tags.length > 0) snippet.tags = metadata.tags;

  const body = JSON.stringify({ snippet, status: { privacyStatus: metadata.privacyStatus } });
  const base = deps.uploadUrl ?? UPLOAD_URL;
  const response = await deps.http({
    url: `${base}?uploadType=resumable&part=${encodeURIComponent(UPLOAD_PARTS)}`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(source.size),
      'X-Upload-Content-Type': source.contentType,
    },
    body,
  });

  if (response.status !== 200) {
    throw classifyUploadStatus(response.status, response.text);
  }

  const location = response.headers.location ?? response.headers.Location;
  if (!location) {
    throw new IpcError('EngineError', 'Upload did not return a session URI', response.text);
  }
  return location;
}

async function putBytes(
  sessionUri: string,
  options: UploadOptions,
  deps: UploadDeps,
): Promise<UploadHttpResponse> {
  const { source, accessToken, onProgress, signal } = options;
  return deps.http({
    url: sessionUri,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': source.contentType,
      'Content-Length': String(source.size),
    },
    body: deps.openBody(source.path),
    totalBytes: source.size,
    signal,
    onProgress,
  });
}

function parseVideoId(text: string): string | null {
  try {
    const json = JSON.parse(text) as { id?: string };
    return typeof json.id === 'string' && json.id.length > 0 ? json.id : null;
  } catch {
    return null;
  }
}

export async function resumableUpload(
  options: UploadOptions,
  deps: UploadDeps,
): Promise<UploadResult> {
  assertUploadable(options);

  let sessionUri: string | null = null;
  let lastDetail = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await deps.sleep(backoffDelay(attempt - 1, deps.random));
    }
    throwIfAborted(options.signal);

    let response: UploadHttpResponse;
    try {
      if (sessionUri === null) {
        sessionUri = await initSession(options, deps);
      }
      response = await putBytes(sessionUri, options, deps);
    } catch (e) {
      if (isAbort(e)) {
        throw new UploadCancelled();
      }
      if (e instanceof UploadExpiredError) {
        sessionUri = null;
      } else if (e instanceof IpcError && !(e instanceof NetworkError)) {
        throw e;
      }
      lastDetail = messageOf(e);
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      const videoId = parseVideoId(response.text);
      if (!videoId) {
        throw new IpcError('EngineError', 'Upload completed without a video id', response.text);
      }
      return { videoId, url: videoUrl(videoId) };
    }

    lastDetail = response.text;

    if (response.status === 404) {
      sessionUri = null;
      continue;
    }
    if (isRetriableStatus(response.status)) {
      continue;
    }
    throw classifyUploadStatus(response.status, response.text);
  }

  throw new NetworkError(`Upload failed after ${MAX_ATTEMPTS} attempts`, lastDetail);
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return normalized;
}

export const nodeUploadHttp: UploadHttp = (request) =>
  new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    let responded = false;
    const req = send(url, { method: request.method, headers: request.headers }, (res) => {
      responded = true;
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: normalizeHeaders(res.headers as Record<string, string | string[] | undefined>),
          text,
        }),
      );
    });

    req.on('error', (error) => {
      // A server may close the socket (e.g. an expired session) before the whole body
      // is written; once the response has arrived, its status is authoritative.
      if (!responded) {
        reject(error);
      }
    });

    const { signal } = request;
    const onAbort = () => req.destroy(new UploadCancelled());
    if (signal) {
      if (signal.aborted) {
        req.destroy(new UploadCancelled());
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => signal.removeEventListener('abort', onAbort));
      }
    }

    if (typeof request.body === 'string' || request.body instanceof Uint8Array) {
      req.end(request.body);
      return;
    }

    let sent = 0;
    const total = request.totalBytes ?? 0;
    const body = request.body;
    body.on('data', (chunk: Buffer) => {
      sent += chunk.length;
      if (total > 0) {
        request.onProgress?.(Math.min(100, Math.round((sent / total) * 100)));
      }
    });
    body.on('error', (error) => req.destroy(error));
    body.pipe(req);
  });

export function uploadDepsIn(): UploadDeps {
  return {
    http: nodeUploadHttp,
    openBody: (path) => createReadStream(path),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
  };
}
