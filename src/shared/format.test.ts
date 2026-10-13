import { describe, it, expect } from 'vitest';
import { decimalSeparator, formatDecimal } from './format';

describe('decimalSeparator', () => {
  it('follows the locale', () => {
    expect(decimalSeparator('en')).toBe('.');
    expect(decimalSeparator('hu')).toBe(',');
  });
});

describe('formatDecimal', () => {
  it('uses the locale decimal separator with fixed fraction digits', () => {
    expect(formatDecimal(0.5, 'en', 3)).toBe('0.500');
    expect(formatDecimal(0.5, 'hu', 3)).toBe('0,500');
    expect(formatDecimal(12.3, 'hu', 1)).toBe('12,3');
  });

  it('omits the separator when there are no fraction digits', () => {
    expect(formatDecimal(42, 'hu', 0)).toBe('42');
  });
});
