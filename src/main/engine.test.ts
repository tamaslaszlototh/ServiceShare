import { describe, it, expect } from 'vitest';
import { CompileInput, LoudnormMeasurement, compileEditList, needsNormalize } from './engine';
import { ClipInfo, EditOperation } from '@shared/types';

const source: ClipInfo = {
  filePath: '/tmp/in.wav',
  duration: 60,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
};

const input = (editList: EditOperation[], extra: Partial<CompileInput> = {}): CompileInput => ({
  source,
  editList,
  output: { path: 'out.wav', args: ['-c:a', 'pcm_s16le'] },
  ...extra,
});

const render = (editList: EditOperation[], extra: Partial<CompileInput> = {}) => {
  const plan = compileEditList(input(editList, extra));
  if (plan.kind !== 'render') throw new Error('expected a render plan');
  return plan.args;
};

const HEAD = ['-v', 'error', '-i', '/tmp/in.wav'];
const HEAD_MEASURE = ['-v', 'info', '-i', '/tmp/in.wav'];
const TAIL = ['-map', '[out]', '-c:a', 'pcm_s16le', 'out.wav'];

describe('compileEditList — structural ops', () => {
  it('renders the source unchanged for an empty edit list', () => {
    expect(render([])).toEqual([
      '-v', 'error', '-i', '/tmp/in.wav',
      '-map', '0:a',
      '-c:a', 'pcm_s16le', 'out.wav',
    ]);
  });

  it('trims a sub-region and re-zeroes timestamps', () => {
    expect(render([{ kind: 'trim', start: 10, end: 20 }])).toEqual([
      ...HEAD,
      '-filter_complex', '[0:a]atrim=start=10:end=20,asetpts=PTS-STARTPTS[out]',
      ...TAIL,
    ]);
  });

  it('cuts a region with a two-leg concat', () => {
    expect(render([{ kind: 'cutRegion', start: 30, end: 45 }])).toEqual([
      ...HEAD,
      '-filter_complex',
      '[0:a]atrim=end=30,asetpts=PTS-STARTPTS[s1];' +
        '[0:a]atrim=start=45,asetpts=PTS-STARTPTS[s2];' +
        '[s1][s2]concat=n=2:v=0:a=1[out]',
      ...TAIL,
    ]);
  });
});

describe('compileEditList — linear ops', () => {
  it('applies a fade in from the start', () => {
    expect(render([{ kind: 'fadeIn', duration: 2 }])).toEqual([
      ...HEAD,
      '-filter_complex', '[0:a]afade=t=in:st=0:d=2[out]',
      ...TAIL,
    ]);
  });

  it('applies a fade out anchored to the chain length', () => {
    expect(render([{ kind: 'fadeOut', duration: 3 }])).toEqual([
      ...HEAD,
      '-filter_complex', '[0:a]afade=t=out:st=57:d=3[out]',
      ...TAIL,
    ]);
  });

  it('applies gain in dB', () => {
    expect(render([{ kind: 'gain', db: 3 }])).toEqual([
      ...HEAD,
      '-filter_complex', '[0:a]volume=3dB[out]',
      ...TAIL,
    ]);
  });
});

describe('compileEditList — chained timelines', () => {
  it('re-bases duration after a structural op for a following fade out', () => {
    expect(render([{ kind: 'trim', start: 10, end: 20 }, { kind: 'gain', db: 3 }, { kind: 'fadeOut', duration: 2 }])).toEqual([
      ...HEAD,
      '-filter_complex', '[0:a]atrim=start=10:end=20,asetpts=PTS-STARTPTS,volume=3dB,afade=t=out:st=8:d=2[out]',
      ...TAIL,
    ]);
  });

  it('chains a linear op after a cut', () => {
    expect(render([{ kind: 'cutRegion', start: 10, end: 20 }, { kind: 'fadeIn', duration: 1 }])).toEqual([
      ...HEAD,
      '-filter_complex',
      '[0:a]atrim=end=10,asetpts=PTS-STARTPTS[s1];' +
        '[0:a]atrim=start=20,asetpts=PTS-STARTPTS[s2];' +
        '[s1][s2]concat=n=2:v=0:a=1[s3];' +
        '[s3]afade=t=in:st=0:d=1[out]',
      ...TAIL,
    ]);
  });
});

describe('compileEditList — concatenate', () => {
  it('adds a second input, resamples it, and concats', () => {
    expect(render([{ kind: 'concatenate', file: '/tmp/two.wav', duration: 5 }])).toEqual([
      '-v', 'error', '-i', '/tmp/in.wav', '-i', '/tmp/two.wav',
      '-filter_complex',
      '[1:a]aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[s1];' +
        '[0:a][s1]concat=n=2:v=0:a=1[out]',
      '-map', '[out]', '-c:a', 'pcm_s16le', 'out.wav',
    ]);
  });

  it('extends the chain duration by the appended file for a following fade out', () => {
    expect(
      render([{ kind: 'concatenate', file: '/tmp/two.wav', duration: 5 }, { kind: 'fadeOut', duration: 3 }]),
    ).toEqual([
      '-v', 'error', '-i', '/tmp/in.wav', '-i', '/tmp/two.wav',
      '-filter_complex',
      '[1:a]aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[s1];' +
        '[0:a][s1]concat=n=2:v=0:a=1[s2];' +
        '[s2]afade=t=out:st=62:d=3[out]',
      '-map', '[out]', '-c:a', 'pcm_s16le', 'out.wav',
    ]);
  });

  it('refuses a fade out after a concatenation with unknown duration', () => {
    expect(() =>
      render([{ kind: 'concatenate', file: '/tmp/two.wav', duration: NaN }, { kind: 'fadeOut', duration: 3 }]),
    ).toThrow();
  });
});

describe('compileEditList — normalize (two-pass)', () => {
  const measurement: LoudnormMeasurement = {
    measuredI: '-22.50',
    measuredTP: '-3.10',
    measuredLRA: '14.20',
    measuredThresh: '-32.80',
    offset: '0.10',
  };

  it('flags normalize in an edit list', () => {
    expect(needsNormalize([{ kind: 'gain', db: 1 }])).toBe(false);
    expect(needsNormalize([{ kind: 'normalize' }])).toBe(true);
  });

  it('produces a measure pass and an apply pass', () => {
    const plan = compileEditList(input([{ kind: 'normalize' }]));
    if (plan.kind !== 'normalize') throw new Error('expected a normalize plan');

    expect(plan.measureArgs).toEqual([
      ...HEAD_MEASURE,
      '-filter_complex', '[0:a]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[out]',
      '-map', '[out]', '-f', 'null', '-',
    ]);

    expect(plan.applyArgs(measurement)).toEqual([
      ...HEAD,
      '-filter_complex',
      '[0:a]loudnorm=I=-16:TP=-1.5:LRA=11:linear=true' +
        ':measured_I=-22.50:measured_TP=-3.10:measured_LRA=14.20:measured_thresh=-32.80:offset=0.10[out]',
      ...TAIL,
    ]);
  });

  it('measures only the post-gain chain', () => {
    const plan = compileEditList(input([{ kind: 'gain', db: 6 }, { kind: 'normalize' }]));
    if (plan.kind !== 'normalize') throw new Error('expected a normalize plan');
    expect(plan.measureArgs).toEqual([
      ...HEAD_MEASURE,
      '-filter_complex', '[0:a]volume=6dB,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[out]',
      '-map', '[out]', '-f', 'null', '-',
    ]);
  });

  it('keeps filters after normalize on the apply pass', () => {
    const plan = compileEditList(input([{ kind: 'normalize' }, { kind: 'gain', db: -3 }]));
    if (plan.kind !== 'normalize') throw new Error('expected a normalize plan');
    expect(plan.applyArgs(measurement)).toEqual([
      ...HEAD,
      '-filter_complex',
      '[0:a]loudnorm=I=-16:TP=-1.5:LRA=11:linear=true' +
        ':measured_I=-22.50:measured_TP=-3.10:measured_LRA=14.20:measured_thresh=-32.80:offset=0.10' +
        ',volume=-3dB[out]',
      ...TAIL,
    ]);
  });
});
