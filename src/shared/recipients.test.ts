import { describe, it, expect } from 'vitest';
import { isRecipientValid, normalizeRecipients, parseRecipients, validateRecipients } from './recipients';

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

describe('validateRecipients', () => {
  it('validates and normalizes recipients', () => {
    expect(validateRecipients([' a@b.co ', 'bad', 'A@B.CO'])).toEqual(['a@b.co']);
  });
});

describe('parse → normalize → validate agreement', () => {
  it('lets the form and the send request reach the same normalized set', () => {
    const typed = ' a@b.co , C@d.co; a@B.CO\nbad ';
    const fromForm = normalizeRecipients(parseRecipients(typed));
    const fromSendRequest = normalizeRecipients(fromForm);
    expect(fromForm).toEqual(['a@b.co', 'C@d.co', 'bad']);
    expect(fromSendRequest).toEqual(fromForm);
  });

  it('uses one validity rule for filtering and for the check', () => {
    const normalized = normalizeRecipients([' a@b.co ', 'bad', 'C@d.co']);
    expect(validateRecipients(normalized)).toEqual(normalized.filter(isRecipientValid));
  });
});
