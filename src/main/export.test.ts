import { describe, it, expect, vi } from 'vitest';
import {
  ExportDeps,
  ExportService,
  classifyExportError,
  exportCodecArgs,
  parseProgressSeconds,
} from './export';
import { ClipInfo, EditOperation } from '@shared/types';
import { RunOptions } from './runner';

const base: ClipInfo = {
  filePath: '/tmp/in.wav',
  duration: 60,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
};

const LOUDNORM_STDERR = `
[Parsed_loudnorm_0 @ 0x7f] 
{
\t"input_i" : "-22.50",
\t"input_tp" : "-3.10",
\t"input_lra" : "14.20",
\t"input_thresh" : "-32.80",
\t"output_i" : "-16.00",
\t"target_offset" : "0.10"
}
`;

function makeDeps(over: Partial<ExportDeps> = {}): ExportDeps {
  return {
    resolveFfmpegPath: async () => '/usr/bin/ffmpeg',
    runRender: vi.fn(async () => ({ exitCode: 0, stderr: '' })),
    ...over,
  };
}

function argsOf(deps: ExportDeps, call: number): string[] {
  return (deps.runRender as ReturnType<typeof vi.fn>).mock.calls[call][1] as string[];
}

describe('exportCodecArgs', () => {
  it('preserves the source bit depth for WAV', () => {
    expect(exportCodecArgs('wav', base)).toEqual(['-c:a', 'pcm_s16le']);
    expect(exportCodecArgs('wav', { ...base, bitDepth: 24 })).toEqual(['-c:a', 'pcm_s24le']);
  });

  it('uses libmp3lame at 192 kbps', () => {
    expect(exportCodecArgs('mp3', base)).toEqual(['-c:a', 'libmp3lame', '-b:a', '192k']);
  });

  it('down-mixes more than two channels to stereo for MP3', () => {
    expect(exportCodecArgs('mp3', { ...base, channels: 6 })).toEqual([
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      '-ac',
      '2',
    ]);
  });
});

describe('parseProgressSeconds', () => {
  it('parses the last time= stamp in a chunk', () => {
    expect(parseProgressSeconds('time=00:00:12.34')).toBeCloseTo(12.34, 2);
    expect(parseProgressSeconds('time=00:00:01.00\r\nframe=1\ntime=01:02:03.50')).toBeCloseTo(3723.5, 2);
  });

  it('returns null when no stamp is present', () => {
    expect(parseProgressSeconds('frame= 12 fps=0 q=-1.0')).toBeNull();
  });
});

describe('classifyExportError', () => {
  it('maps disk-full stderr to DiskFull', () => {
    expect(classifyExportError('av_interleaved_write_frame: No space left on device').code).toBe('DiskFull');
  });

  it('maps permission stderr to PermissionError', () => {
    expect(classifyExportError('Error opening output file: Permission denied').code).toBe('PermissionError');
  });

  it('falls back to RenderError', () => {
    expect(classifyExportError('Invalid argument').code).toBe('RenderError');
  });
});

describe('ExportService', () => {
  it('compiles the edit list with the format output args and info logging', async () => {
    const deps = makeDeps();
    const service = new ExportService(deps);

    await service.export(base, [{ kind: 'gain', db: 3 }], { format: 'mp3', outputPath: '/tmp/out.mp3' });

    const args = argsOf(deps, 0);
    expect(args.join(' ')).toContain('-v info');
    expect(args.join(' ')).toContain('-c:a libmp3lame -b:a 192k');
    expect(args.at(-1)).toBe('/tmp/out.mp3');
  });

  it('streams progress derived from ffmpeg time output and finishes at 100', async () => {
    const runRender = vi.fn(async (_p: string, _a: string[], options?: RunOptions) => {
      options?.onStderr?.('time=00:00:30.00');
      return { exitCode: 0, stderr: '' };
    });
    const service = new ExportService(makeDeps({ runRender }));
    const percents: number[] = [];

    await service.export(base, [], { format: 'wav', outputPath: '/tmp/out.wav' }, (p) => percents.push(p));

    expect(percents[0]).toBeCloseTo(50, 5);
    expect(percents.at(-1)).toBe(100);
  });

  it('scales progress by the edited (post-trim) duration', async () => {
    const runRender = vi.fn(async (_p: string, _a: string[], options?: RunOptions) => {
      options?.onStderr?.('time=00:00:15.00');
      return { exitCode: 0, stderr: '' };
    });
    const service = new ExportService(makeDeps({ runRender }));
    const percents: number[] = [];
    const editList: EditOperation[] = [{ kind: 'trim', start: 0, end: 30 }];

    await service.export(base, editList, { format: 'wav', outputPath: '/tmp/out.wav' }, (p) => percents.push(p));

    expect(percents[0]).toBeCloseTo(50, 5);
  });

  it('runs a measure then an apply pass for a normalize edit list', async () => {
    const runRender = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stderr: LOUDNORM_STDERR })
      .mockResolvedValueOnce({ exitCode: 0, stderr: '' });
    const deps = makeDeps({ runRender });
    const service = new ExportService(deps);

    await service.export(base, [{ kind: 'normalize' }], { format: 'wav', outputPath: '/tmp/out.wav' });

    expect(runRender).toHaveBeenCalledTimes(2);
    expect(argsOf(deps, 0).join(' ')).toContain('print_format=json');
    expect(argsOf(deps, 1).join(' ')).toContain('measured_I=-22.50');
  });

  it('throws a RenderError when ffmpeg exits non-zero', async () => {
    const service = new ExportService(makeDeps({ runRender: async () => ({ exitCode: 1, stderr: 'boom' }) }));

    await expect(
      service.export(base, [], { format: 'wav', outputPath: '/tmp/out.wav' }),
    ).rejects.toMatchObject({ code: 'RenderError' });
  });
});
