import { writeFileSync } from 'fs';

export interface WavSpec {
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 24;
}

export function cyclesToSeconds(freq: number, cycles: number): number {
  return cycles / freq;
}

export function tone(spec: WavSpec, seconds: number, freq: number, amplitude = 0.5): Float32Array {
  return toneChannels(spec, seconds, Array.from({ length: spec.channels }, () => freq), amplitude);
}

export function toneChannels(spec: WavSpec, seconds: number, freqs: number[], amplitude = 0.5): Float32Array {
  const frames = Math.round(seconds * spec.sampleRate);
  const samples = new Float32Array(frames * spec.channels);
  for (let frame = 0; frame < frames; frame++) {
    const t = frame / spec.sampleRate;
    for (let channel = 0; channel < spec.channels; channel++) {
      const freq = freqs[channel] ?? freqs[0];
      samples[frame * spec.channels + channel] = amplitude * Math.sin(2 * Math.PI * freq * t);
    }
  }
  return samples;
}

export function toneWithGap(
  spec: WavSpec,
  seconds: number,
  freq: number,
  gapStartSeconds: number,
  gapSeconds: number,
  amplitude = 0.5,
): Float32Array {
  const samples = tone(spec, seconds, freq, amplitude);
  const start = Math.round(gapStartSeconds * spec.sampleRate) * spec.channels;
  const end = Math.min(samples.length, Math.round((gapStartSeconds + gapSeconds) * spec.sampleRate) * spec.channels);
  samples.fill(0, start, end);
  return samples;
}

export function writeWav(filePath: string, spec: WavSpec, interleaved: Float32Array): void {
  const bytesPerSample = spec.bitDepth / 8;
  const dataBytes = interleaved.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(spec.channels, 22);
  buffer.writeUInt32LE(spec.sampleRate, 24);
  buffer.writeUInt32LE(spec.sampleRate * spec.channels * bytesPerSample, 28);
  buffer.writeUInt16LE(spec.channels * bytesPerSample, 32);
  buffer.writeUInt16LE(spec.bitDepth, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  const fullScale = spec.bitDepth === 16 ? 32767 : 8388607;
  for (const sample of interleaved) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const value = Math.round(clamped * fullScale);
    if (spec.bitDepth === 16) {
      buffer.writeInt16LE(value, offset);
      offset += 2;
    } else {
      buffer.writeIntLE(value, offset, 3);
      offset += 3;
    }
  }

  writeFileSync(filePath, buffer);
}

export function writeToneWav(filePath: string, spec: WavSpec, seconds: number, freq: number, amplitude = 0.5): void {
  writeWav(filePath, spec, tone(spec, seconds, freq, amplitude));
}
