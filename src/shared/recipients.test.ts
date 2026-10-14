import { describe, it, expect } from 'vitest';
import {
  classifyRecipients,
  isRecipientValid,
  normalizeRecipients,
  parseRecipients,
  validateRecipients,
} from './recipients';

describe('isRecipientValid', () => {
  it('accepts plainly formatted addresses', () => {
    expect(isRecipientValid('a@b.co')).toBe(true);
    expect(isRecipientValid('first.last+tag@sub.example.co')).toBe(true);
    expect(isRecipientValid('  a@b.co  ')).toBe(true);
  });

  it('rejects malformed or empty addresses', () => {
    expect(isRecipientValid('')).toBe(false);
    expect(isRecipientValid('nope')).toBe(false);
    expect(isRecipientValid('a@b')).toBe(false);
    expect(isRecipientValid('a b@c.co')).toBe(false);
  });
});

describe('parseRecipients', () => {
  it('splits on commas, semicolons and newlines and trims each address', () => {
    expect(parseRecipients(' a@b.co , c@d.co; e@f.co\ng@h.co ')).toEqual([
      'a@b.co',
      'c@d.co',
      'e@f.co',
      'g@h.co',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseRecipients('   ')).toEqual([]);
  });
});

describe('normalizeRecipients', () => {
  it('trims, filters empty and collapses case-insensitively', () => {
    expect(normalizeRecipients([' a@b.co ', 'A@B.CO', ' ', 'c@d.co'])).toEqual(['a@b.co', 'c@d.co']);
  });

  it('is idempotent', () => {
    const once = normalizeRecipients([' a@b.co ', 'A@B.CO', 'c@d.co']);
    expect(normalizeRecipients(once)).toEqual(once);
  });
});

describe('classifyRecipients', () => {
  it('splits normalized addresses into valid and invalid', () => {
    expect(classifyRecipients([' a@b.co ', 'bad', 'A@B.CO', 'nope'])).toEqual({
      valid: ['a@b.co'],
      invalid: ['bad', 'nope'],
    });
  });

  it('reports an empty classification for blank input', () => {
    expect(classifyRecipients(['  ', ''])).toEqual({ valid: [], invalid: [] });
  });
});

describe('validateRecipients', () => {
  it('validates and normalizes recipients', () => {
    expect(validateRecipients([' a@b.co ', 'bad', 'A@B.CO'])).toEqual(['a@b.co']);
  });
});

describe('parse → normalize → validate agreement', () => {
  const typed = ' a@b.co , C@d.co; a@B.CO\nbad ';

  it('reaches the same normalized set whether the form splits a string or receives a list', () => {
    const listed = [' a@b.co ', 'C@d.co', 'a@B.CO', 'bad'];
    expect(normalizeRecipients(parseRecipients(typed))).toEqual(['a@b.co', 'C@d.co', 'bad']);
    expect(normalizeRecipients(listed)).toEqual(['a@b.co', 'C@d.co', 'bad']);
  });

  it('classifies the parsed input into the valid and invalid sets both sides act on', () => {
    expect(classifyRecipients(parseRecipients(typed))).toEqual({
      valid: ['a@b.co', 'C@d.co'],
      invalid: ['bad'],
    });
  });
});
