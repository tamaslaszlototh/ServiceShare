import { spawn, ChildProcess } from 'child_process';
import { EngineError } from '../core/errors';

export const DEFAULT_RENDER_TIMEOUT_MS = 120000;

const active = new Set<ChildProcess>();

export function killActiveProcesses(): void {
  for (const child of active) {
    child.kill('SIGKILL');
  }
  active.clear();
}

export interface RunOptions {
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: string) => void;
  timeoutMs?: number;
}

export function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  options: RunOptions = {},
): Promise<{ exitCode: number; stderr: string }> {
  const { onStdout, onStderr, timeoutMs = DEFAULT_RENDER_TIMEOUT_MS } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    active.add(child);

    let stderr = '';
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active.delete(child);
      settle();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new EngineError('FFmpeg timed out', `after ${timeoutMs} ms`)));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => onStdout?.(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      onStderr?.(text);
      if (stderr.length < 100000) stderr += text;
    });
    child.on('error', (e) => finish(() => reject(new EngineError('Failed to start FFmpeg', String(e)))));
    child.on('close', (code) => finish(() => resolve({ exitCode: code ?? 1, stderr })));
  });
}
