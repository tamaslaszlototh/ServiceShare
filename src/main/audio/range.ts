export interface ByteRange {
  start: number;
  end: number;
  partial: boolean;
}

export function parseByteRange(header: string | null, size: number): ByteRange {
  const full: ByteRange = { start: 0, end: Math.max(0, size - 1), partial: false };
  if (!header || size <= 0) {
    return full;
  }
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match || (match[1] === '' && match[2] === '')) {
    return full;
  }
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart) {
    const suffix = parseInt(match[2], 10);
    return { start: Math.max(0, size - suffix), end: size - 1, partial: true };
  }
  const start = parseInt(match[1], 10);
  const end = hasEnd ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
  if (start >= size || start > end) {
    return full;
  }
  return { start, end, partial: true };
}
