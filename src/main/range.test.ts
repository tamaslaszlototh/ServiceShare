import { describe, expect, it } from 'vitest';
import { parseByteRange } from './range';

describe('parseByteRange', () => {
  it('returns the full range when no header is present', () => {
    expect(parseByteRange(null, 1000)).toEqual({ start: 0, end: 999, partial: false });
  });

  it('parses an explicit start-end range', () => {
    expect(parseByteRange('bytes=100-299', 1000)).toEqual({ start: 100, end: 299, partial: true });
  });

  it('parses an open-ended range to the end of the file', () => {
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999, partial: true });
  });

  it('parses a suffix range measured from the end', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999, partial: true });
  });

  it('clamps an end beyond the file size', () => {
    expect(parseByteRange('bytes=900-2000', 1000)).toEqual({ start: 900, end: 999, partial: true });
  });

  it('clamps a suffix larger than the file to the whole file', () => {
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999, partial: true });
  });

  it('falls back to the full range for a malformed header', () => {
    expect(parseByteRange('items=0-9', 1000)).toEqual({ start: 0, end: 999, partial: false });
  });

  it('falls back to the full range for an unsatisfiable range', () => {
    expect(parseByteRange('bytes=2000-3000', 1000)).toEqual({ start: 0, end: 999, partial: false });
  });

  it('treats a zero-size file as a full empty range', () => {
    expect(parseByteRange('bytes=0-10', 0)).toEqual({ start: 0, end: 0, partial: false });
  });
});
