import { afterEach, describe, expect, it } from 'vitest';
import { AddressInfo } from 'net';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { Readable } from 'stream';
import { UploadDeps, UploadHttpRequest, nodeUploadHttp, resumableUpload } from './upload';

const BODY = Buffer.alloc(2048, 7);

function bodyStream(): Readable {
  return Readable.from([BODY]);
}

function baseDeps(uploadUrl: string): UploadDeps {
  return {
    http: nodeUploadHttp,
    openBody: () => bodyStream(),
    sleep: async () => {},
    random: () => 0.5,
    uploadUrl,
  };
}

function options() {
  return {
    accessToken: 'tok',
    metadata: { title: 'Integration', privacyStatus: 'unlisted' as const },
    source: { path: 'ignored', size: BODY.length, contentType: 'video/mp4' },
  };
}

interface Running {
  server: Server;
  url: string;
}

function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Running> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

let running: Running | null = null;

afterEach(async () => {
  if (running) {
    await new Promise((resolve) => running!.server.close(resolve));
    running = null;
  }
});

describe('nodeUploadHttp (local resumable server)', () => {
  it('streams the whole body with Content-Length and reports progress', async () => {
    const received: { length?: string; bytes: number } = { bytes: 0 };
    running = await start((req, res) => {
      if (req.method === 'POST') {
        res.writeHead(200, { Location: `${running!.url}/upload` });
        res.end();
        return;
      }
      received.length = req.headers['content-length'];
      req.on('data', (chunk: Buffer) => (received.bytes += chunk.length));
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'vidIntegration' }));
      });
    });

    const percents: number[] = [];
    const result = await resumableUpload(
      { ...options(), onProgress: (p) => percents.push(p) },
      baseDeps(running!.url),
    );

    expect(result).toEqual({ videoId: 'vidIntegration', url: 'https://youtu.be/vidIntegration' });
    expect(received.length).toBe(String(BODY.length));
    expect(received.bytes).toBe(BODY.length);
    expect(percents.at(-1)).toBe(100);
  });

  it('restarts from a new session when the server reports 404', async () => {
    let puts = 0;
    running = await start((req, res) => {
      if (req.method === 'POST') {
        puts += 1;
        res.writeHead(200, { Location: `${running!.url}/session-${puts}` });
        res.end();
        return;
      }
      req.resume();
      req.on('end', () => {
        if (puts === 1) {
          res.writeHead(404);
          res.end('expired');
          return;
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'restarted' }));
      });
    });

    const result = await resumableUpload(options(), baseDeps(running!.url));

    expect(result.videoId).toBe('restarted');
    expect(puts).toBe(2);
  });

  it('aborts an in-flight request when the signal fires', async () => {
    running = await start((req, res) => {
      if (req.method === 'POST') {
        res.writeHead(200, { Location: `${running!.url}/upload` });
        res.end();
        return;
      }
      req.resume();
    });

    const controller = new AbortController();
    const pending = nodeUploadHttp({
      url: `${running.url}/upload`,
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(BODY.length) },
      body: Readable.from([BODY]),
      totalBytes: BODY.length,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'UploadCancelled' });
  });
});
