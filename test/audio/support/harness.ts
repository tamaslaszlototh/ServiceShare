import { spawn } from 'child_process';
import { createRequire } from 'module';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { ClipInfo, EditOperation } from '@shared/types';
import { compileEditList, LOUDNESS_TARGET } from '../../../src/main/engine';
import { parseLoudnormJson } from '../../../src/main/preview';
import { defaultWavProbeDeps, probeClip } from '../../../src/main/probe';

const require = createRequire(import.meta.url);
export const FFMPEG_PATH = require('ffmpeg-static') as string;
export const FFPROBE_PATH = (require('ffprobe-static') as { path: string }).path;

export interface Chunk {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
}

export function run(args: string[]): Promise<Chunk> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout: Buffer.concat(stdout), stderr, exitCode: code ?? -1 }));
  });
}

async function runOrThrow(args: string[]): Promise<Chunk> {
  const result = await run(args);
  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg failed (${result.exitCode}): ${result.stderr}`);
  }
  return result;
}

export async function renderEdit(source: ClipInfo, editList: EditOperation[], outputPath: string): Promise<void> {
  const plan = compileEditList({
    source,
    editList,
    output: { path: outputPath, args: ['-c:a', 'pcm_s16le'] },
  });
  if (plan.kind === 'render') {
    await runOrThrow(plan.args);
    return;
  }
  const measured = await runOrThrow(plan.measureArgs);
  await runOrThrow(plan.applyArgs(parseLoudnormJson(measured.stderr)));
}

export function probe(filePath: string): Promise<ClipInfo> {
  return probeClip(filePath, defaultWavProbeDeps);
}

export async function decodePcm(
  filePath: string,
  options: { startSeconds?: number; seconds?: number; sampleRate?: number } = {},
): Promise<Float32Array> {
  const args = ['-v', 'error'];
  if (options.startSeconds !== undefined) {
    args.push('-ss', String(options.startSeconds));
  }
  args.push('-i', filePath);
  if (options.seconds !== undefined) {
    args.push('-t', String(options.seconds));
  }
  args.push('-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(options.sampleRate ?? 48000), '-');
  const { stdout } = await runOrThrow(args);
  const samples = new Float32Array(stdout.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = stdout.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

export interface Loudness {
  integratedLufs: number;
  truePeakDbtp: number;
  lra: number;
}

export async function measureLoudness(filePath: string): Promise<Loudness> {
  const { stderr } = await runOrThrow([
    '-v',
    'info',
    '-i',
    filePath,
    '-af',
    `loudnorm=${LOUDNESS_TARGET}:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const measurement = parseLoudnormJson(stderr);
  return {
    integratedLufs: parseFloat(measurement.measuredI),
    truePeakDbtp: parseFloat(measurement.measuredTP),
    lra: parseFloat(measurement.measuredLRA),
  };
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'serviceshare-audio-'));
}

export function cleanup(dir: string): Promise<void> {
  return rm(dir, { recursive: true, force: true });
}
