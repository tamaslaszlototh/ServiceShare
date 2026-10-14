import { execFile } from 'child_process';
import { constants } from 'fs';
import { access } from 'fs/promises';
import { ClipInfo } from '@shared/types';
import { ffmpegResolver } from './ffmpeg';
import { CorruptFileError, FormatError, PermissionError } from '../core/errors';
import { sanitizeText } from '../core/sanitize';

export interface FfprobeOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WavProbeDeps {
  resolveFfprobePath: () => Promise<string>;
  runFfprobe: (ffprobePath: string, filePath: string) => Promise<FfprobeOutput>;
  isReadable: (filePath: string) => Promise<boolean>;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
}

interface FfprobeJson {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

const SUPPORTED_BIT_DEPTHS: Record<string, 16 | 24> = {
  pcm_s16le: 16,
  pcm_s24le: 24,
};

const FFPROBE_ARGS = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'];

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseFfprobeJson(stdout: string): FfprobeJson {
  try {
    return JSON.parse(stdout) as FfprobeJson;
  } catch {
    throw new CorruptFileError('The WAV header could not be parsed', sanitizeText(stdout));
  }
}

export async function probeClip(filePath: string, deps: WavProbeDeps): Promise<ClipInfo> {
  if (!(await deps.isReadable(filePath))) {
    throw new PermissionError(filePath);
  }

  const ffprobePath = await deps.resolveFfprobePath();
  const output = await deps.runFfprobe(ffprobePath, filePath);

  if (output.exitCode !== 0) {
    throw new CorruptFileError('The WAV header could not be read', sanitizeText(output.stderr));
  }

  const parsed = parseFfprobeJson(output.stdout);

  const formatName = parsed.format?.format_name ?? '';
  if (!formatName) {
    throw new CorruptFileError('ffprobe could not identify the container');
  }
  if (!formatName.split(',').includes('wav')) {
    throw new FormatError(`unsupported container: ${formatName}`);
  }

  const stream = (parsed.streams ?? []).find((s) => s.codec_type === 'audio');
  if (!stream) {
    throw new FormatError('no audio stream found');
  }

  const bitDepth = stream.codec_name ? SUPPORTED_BIT_DEPTHS[stream.codec_name] : undefined;
  if (!bitDepth) {
    throw new FormatError(`unsupported encoding: ${stream.codec_name ?? 'unknown'}`);
  }

  const duration = toNumber(parsed.format?.duration) ?? toNumber(stream.duration);
  const sampleRate = toNumber(stream.sample_rate);
  const channels = toNumber(stream.channels);
  if (duration === null || duration < 0 || sampleRate === null || sampleRate <= 0 || channels === null || channels <= 0) {
    throw new CorruptFileError('The WAV header is missing required fields');
  }

  return { duration, sampleRate, bitDepth, channels, filePath };
}

function runFfprobe(ffprobePath: string, filePath: string): Promise<FfprobeOutput> {
  return new Promise((resolve) => {
    execFile(
      ffprobePath,
      [...FFPROBE_ARGS, filePath],
      { timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = (err as { code?: unknown } | null)?.code;
        const exitCode = err ? (typeof code === 'number' ? code : 1) : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode });
      },
    );
  });
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export const defaultWavProbeDeps: WavProbeDeps = {
  resolveFfprobePath: () => ffmpegResolver.resolveFfprobe(),
  runFfprobe,
  isReadable,
};