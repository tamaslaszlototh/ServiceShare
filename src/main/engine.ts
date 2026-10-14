import { ClipInfo, EditOperation } from '@shared/types';
import { editedDuration, hasUnknownDuration } from '@shared/duration';
import { EngineError } from './errors';

export const LOUDNESS_TARGET_I = -16;
export const LOUDNESS_TARGET_TP = -1.5;
export const LOUDNESS_TARGET_LRA = 11;
export const LOUDNESS_TARGET = `I=${LOUDNESS_TARGET_I}:TP=${LOUDNESS_TARGET_TP}:LRA=${LOUDNESS_TARGET_LRA}`;

const isNormalize = (op: EditOperation): boolean => op.kind === 'normalize';

export interface OutputSpec {
  path: string;
  args: string[];
}

export interface LoudnormMeasurement {
  measuredI: string;
  measuredTP: string;
  measuredLRA: string;
  measuredThresh: string;
  offset: string;
}

export interface CompileInput {
  source: ClipInfo;
  editList: EditOperation[];
  output: OutputSpec;
  logLevel?: string;
}

export type CompilePlan =
  | { kind: 'render'; args: string[] }
  | { kind: 'normalize'; measureArgs: string[]; applyArgs: (measurement: LoudnormMeasurement) => string[] };

export function needsNormalize(editList: EditOperation[]): boolean {
  return editList.some(isNormalize);
}

function loudnormPrefix(): string {
  return `loudnorm=${LOUDNESS_TARGET}`;
}

function loudnormMeasureFilter(): string {
  return `${loudnormPrefix()}:print_format=json`;
}

function loudnormApplyFilter(m: LoudnormMeasurement): string {
  return (
    `${loudnormPrefix()}:linear=true` +
    `:measured_I=${m.measuredI}:measured_TP=${m.measuredTP}` +
    `:measured_LRA=${m.measuredLRA}:measured_thresh=${m.measuredThresh}:offset=${m.offset}`
  );
}

function formatSeconds(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function sampleFormat(bitDepth: 16 | 24): string {
  return bitDepth === 24 ? 's32' : 's16';
}

function channelLayout(channels: number): string {
  if (channels === 1) return 'mono';
  if (channels === 2) return 'stereo';
  return `${channels}c`;
}

interface FilterGraph {
  inputs: string[];
  statements: string[];
  outputPad: string;
}

function buildFilterGraph(
  source: ClipInfo,
  ops: EditOperation[],
  normalizeFilter: string | null,
): FilterGraph {
  const statements: string[] = [];
  const inputs: string[] = [];
  let currentPad = '0:a';
  let filters: string[] = [];
  let padCounter = 0;
  let inputCounter = 1;

  const nextPad = () => `s${++padCounter}`;

  const labelCurrent = (): string => {
    if (filters.length === 0) {
      return currentPad;
    }
    const pad = nextPad();
    statements.push(`[${currentPad}]${filters.join(',')}[${pad}]`);
    filters = [];
    currentPad = pad;
    return pad;
  };

  const requireDuration = (index: number): number => {
    const prefix = ops.slice(0, index);
    if (hasUnknownDuration(prefix)) {
      throw new EngineError('Cannot place a fade-out after a concatenation with unknown duration');
    }
    return editedDuration(source.duration, prefix);
  };

  ops.forEach((op, index) => {
    const last = index === ops.length - 1;
    switch (op.kind) {
      case 'trim':
        filters.push(`atrim=start=${formatSeconds(op.start)}:end=${formatSeconds(op.end)}`, 'asetpts=PTS-STARTPTS');
        break;
      case 'cutRegion': {
        const base = labelCurrent();
        let headInput = base;
        let tailInput = base;
        if (base !== '0:a') {
          headInput = nextPad();
          tailInput = nextPad();
          statements.push(`[${base}]asplit=2[${headInput}][${tailInput}]`);
        }
        const head = nextPad();
        const tail = nextPad();
        statements.push(`[${headInput}]atrim=end=${formatSeconds(op.start)},asetpts=PTS-STARTPTS[${head}]`);
        statements.push(`[${tailInput}]atrim=start=${formatSeconds(op.end)},asetpts=PTS-STARTPTS[${tail}]`);
        const out = last ? 'out' : nextPad();
        statements.push(`[${head}][${tail}]concat=n=2:v=0:a=1[${out}]`);
        currentPad = out;
        break;
      }
      case 'fadeIn':
        filters.push(`afade=t=in:st=0:d=${formatSeconds(op.duration)}`);
        break;
      case 'fadeOut':
        filters.push(
          `afade=t=out:st=${formatSeconds(requireDuration(index) - op.duration)}:d=${formatSeconds(op.duration)}`,
        );
        break;
      case 'gain':
        filters.push(`volume=${formatSeconds(op.db)}dB`);
        break;
      case 'normalize':
        if (!normalizeFilter) {
          throw new EngineError('normalize filter required to compile a normalize operation');
        }
        filters.push(normalizeFilter);
        break;
      case 'concatenate': {
        const base = labelCurrent();
        const inputIndex = inputCounter++;
        inputs.push('-i', op.file);
        const second = nextPad();
        statements.push(
          `[${inputIndex}:a]aresample=${source.sampleRate}` +
            `,aformat=sample_fmts=${sampleFormat(source.bitDepth)}:channel_layouts=${channelLayout(source.channels)}[${second}]`,
        );
        const out = last ? 'out' : nextPad();
        statements.push(`[${base}][${second}]concat=n=2:v=0:a=1[${out}]`);
        currentPad = out;
        break;
      }
    }
  });

  if (filters.length > 0) {
    statements.push(`[${currentPad}]${filters.join(',')}[out]`);
    currentPad = 'out';
  }

  return { inputs, statements, outputPad: currentPad };
}

function assemble(
  source: ClipInfo,
  graph: FilterGraph,
  outputArgs: string[],
  outputPath: string,
  logLevel = 'error',
): string[] {
  const args = ['-v', logLevel, '-i', source.filePath, ...graph.inputs];
  if (graph.statements.length > 0) {
    args.push('-filter_complex', graph.statements.join(';'), '-map', `[${graph.outputPad}]`);
  } else {
    args.push('-map', '0:a');
  }
  args.push(...outputArgs, outputPath);
  return args;
}

export function compileEditList(input: CompileInput): CompilePlan {
  const { source, editList, output } = input;
  const normalizeIndex = editList.findIndex((op) => op.kind === 'normalize');

  if (normalizeIndex === -1) {
    const graph = buildFilterGraph(source, editList, null);
    return { kind: 'render', args: assemble(source, graph, output.args, output.path, input.logLevel) };
  }

  const measureGraph = buildFilterGraph(source, editList.slice(0, normalizeIndex + 1), loudnormMeasureFilter());
  const measureArgs = assemble(source, measureGraph, ['-f', 'null'], '-', 'info');

  const applyArgs = (measurement: LoudnormMeasurement) => {
    const graph = buildFilterGraph(source, editList, loudnormApplyFilter(measurement));
    return assemble(source, graph, output.args, output.path, input.logLevel);
  };

  return { kind: 'normalize', measureArgs, applyArgs };
}
