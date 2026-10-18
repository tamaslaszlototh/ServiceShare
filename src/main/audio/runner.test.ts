import { describe, it, expect } from 'vitest';
import { createStderrCollector, runProcess, withProgressArgs } from './runner';

// child processes are plain Node scripts, so no FFmpeg is needed
const node = process.execPath;

describe('withProgressArgs', () => {
  it('asks FFmpeg for a progress line every second ahead of the caller args', () => {
    expect(withProgressArgs(['-i', 'in.wav', 'out.wav'])).toEqual([
      '-stats',
      '-stats_period',
      '1',
      '-i',
      'in.wav',
      'out.wav',
    ]);
  });
});

describe('createStderrCollector', () => {
  it('drops progress lines and keeps everything else verbatim', () => {
    const c = createStderrCollector();
    c.push('size=       0kB time=00:00:00.00 bitrate=N/A speed=N/A    \r');
    c.push('[Parsed_loudnorm_0 @ 0x1] \n{\n  "input_i" : "-20.1"\n}\n');
    c.push('frame=  30 fps=0.0 q=-0.0 size=N/A time=00:00:01.00 bitrate=N/A speed=2x    \r');
    c.push('Error while filtering\n');

    expect(c.text()).toBe('[Parsed_loudnorm_0 @ 0x1] \n{\n  "input_i" : "-20.1"\n}\nError while filtering\n');
  });

  it('handles lines split across chunks', () => {
    const c = createStderrCollector();
    c.push('size=N/A ti');
    c.push('me=00:00:02.99 bitrate=N/A\rreal err');
    c.push('or\n');
    c.push('trailing without newline');

    expect(c.text()).toBe('real error\ntrailing without newline');
  });

  it('keeps the error text of a long run that printed thousands of progress lines', () => {
    const c = createStderrCollector();
    for (let i = 0; i < 20000; i++) c.push(`size=N/A time=00:00:${String(i % 60).padStart(2, '0')}.00 bitrate=N/A\r`);
    c.push('No space left on device\n');

    expect(c.text()).toBe('No space left on device\n');
  });
});

describe('runProcess', () => {
  it('lets a process that keeps reporting run past the stall timeout', async () => {
    const script = 'let n=0;const t=setInterval(()=>{process.stderr.write("size=N/A time=00:00:0"+n+".00\\r");if(++n===6){clearInterval(t);process.stderr.write("done\\n")}},50)';
    const result = await runProcess(node, ['-e', script], { stallTimeoutMs: 150 });

    expect(result).toEqual({ exitCode: 0, stderr: 'done\n' });
  });

  it('kills a process that goes silent for the stall timeout', async () => {
    await expect(
      runProcess(node, ['-e', 'setTimeout(() => {}, 10000)'], { stallTimeoutMs: 150 }),
    ).rejects.toMatchObject({ code: 'EngineError', details: 'no output for 150 ms' });
  });
});
