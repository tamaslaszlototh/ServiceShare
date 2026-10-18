import { spawn, ChildProcess } from 'child_process';
import { EngineError } from '../core/errors';

/**
 * FFmpeg is stopped only when it goes silent this long. There is no limit on
 * the total run time: a two-hour clip legitimately takes many minutes to encode,
 * and FFmpeg reports its progress every STATS_PERIOD_SECONDS while it works.
 */
export const STALL_TIMEOUT_MS = 60000;
const STATS_PERIOD_SECONDS = 1;

const active = new Set<ChildProcess>();

export function killActiveProcesses(): void {
  for (const child of active) {
    child.kill('SIGKILL');
  }
  active.clear();
}

export interface RunOptions {
  onStdout?: (chunk: Buffer) => void;
  /** Receives stderr as it arrives, progress lines included. */
  onStderr?: (chunk: string) => void;
  /** How long the process may produce no output at all before it is killed. */
  stallTimeoutMs?: number;
}

export interface RunResult {
  exitCode: number;
  /** stderr without the periodic progress lines (errors, loudnorm JSON, …). */
  stderr: string;
}

/** Makes FFmpeg print a progress line every second, even at `-v error`. */
export function withProgressArgs(args: string[]): string[] {
  return ['-stats', '-stats_period', String(STATS_PERIOD_SECONDS), ...args];
}

const PROGRESS_LINE = /^\s*(?:frame|size)=.*\btime=/;
const MAX_STDERR_CHARS = 100000;

/**
 * Collects stderr minus FFmpeg's progress lines, which would otherwise crowd
 * out the error text and the loudnorm measurement on long runs. Lines may be
 * split across chunks; progress lines end in \r, other lines in \n.
 */
export function createStderrCollector(): { push: (chunk: string) => void; text: () => string } {
  let kept = '';
  let partial = '';
  const keep = (line: string) => {
    if (!PROGRESS_LINE.test(line) && kept.length < MAX_STDERR_CHARS) kept += line;
  };
  return {
    push(chunk) {
      partial += chunk;
      let end: number;
      while ((end = partial.search(/[\r\n]/)) !== -1) {
        keep(partial.slice(0, end + 1));
        partial = partial.slice(end + 1);
      }
    },
    text() {
      return partial ? kept + (PROGRESS_LINE.test(partial) ? '' : partial) : kept;
    },
  };
}

/** Runs FFmpeg, killing it only if it stalls (see STALL_TIMEOUT_MS). */
export function runFfmpeg(ffmpegPath: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return runProcess(ffmpegPath, withProgressArgs(args), options);
}

export function runProcess(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { onStdout, onStderr, stallTimeoutMs = STALL_TIMEOUT_MS } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    active.add(child);

    const stderr = createStderrCollector();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active.delete(child);
      settle();
    };
    const armStallTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(() => reject(new EngineError('FFmpeg stopped responding', `no output for ${stallTimeoutMs} ms`)));
      }, stallTimeoutMs);
    };
    armStallTimer();

    child.stdout.on('data', (chunk: Buffer) => {
      armStallTimer();
      onStdout?.(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      armStallTimer();
      const text = chunk.toString();
      onStderr?.(text);
      stderr.push(text);
    });
    child.on('error', (e) => finish(() => reject(new EngineError('Failed to start FFmpeg', String(e)))));
    child.on('close', (code) => finish(() => resolve({ exitCode: code ?? 1, stderr: stderr.text() })));
  });
}
