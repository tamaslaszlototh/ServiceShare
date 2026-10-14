export function peak(samples: Float32Array): number {
  let max = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude > max) {
      max = magnitude;
    }
  }
  return max;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export function toDb(amplitude: number): number {
  return amplitude <= 0 ? -Infinity : 20 * Math.log10(amplitude);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function slice(samples: Float32Array, startSample: number, endSample: number): Float32Array {
  const start = Math.max(0, Math.min(samples.length, Math.floor(startSample)));
  const end = Math.max(start, Math.min(samples.length, Math.floor(endSample)));
  return samples.subarray(start, end);
}

export function sliceSeconds(
  samples: Float32Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): Float32Array {
  return slice(samples, startSeconds * sampleRate, endSeconds * sampleRate);
}

export function windowedRms(samples: Float32Array, sampleRate: number, windowSeconds: number): number[] {
  const windowSamples = Math.max(1, Math.round(windowSeconds * sampleRate));
  const windows: number[] = [];
  for (let start = 0; start < samples.length; start += windowSamples) {
    windows.push(rms(samples.subarray(start, Math.min(start + windowSamples, samples.length))));
  }
  return windows;
}

export function maxAdjacentDelta(samples: Float32Array, startSample = 0, endSample = samples.length): number {
  const start = Math.max(0, Math.min(samples.length, Math.floor(startSample)));
  const end = Math.max(start, Math.min(samples.length, Math.floor(endSample)));
  let max = 0;
  for (let i = start + 1; i < end; i++) {
    const delta = Math.abs(samples[i] - samples[i - 1]);
    if (delta > max) {
      max = delta;
    }
  }
  return max;
}

export function interSampleDeltaRatio(
  samples: Float32Array,
  seamSample: number,
  seamRadius: number,
  referenceStart: number,
  referenceEnd: number,
): number {
  const seamMax = maxAdjacentDelta(samples, seamSample - seamRadius, seamSample + seamRadius);
  const referenceMax = maxAdjacentDelta(samples, referenceStart, referenceEnd);
  if (referenceMax === 0) {
    return seamMax === 0 ? 1 : Infinity;
  }
  return seamMax / referenceMax;
}
