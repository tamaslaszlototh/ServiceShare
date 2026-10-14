import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import { PublishEvent } from '@shared/types';
import { privacyOptions } from './publish';
import {
  LONG_VIDEO_SECONDS,
  PUBLISH_TAGS_MAX_CHARS,
  PublishForm,
  accountLabel,
  canPublish,
  clampTags,
  defaultTitle,
  durationWarning,
  editedDuration,
  parseTags,
  publishErrorAction,
  stageLabel,
  tagsCharCount,
  titleMissing,
  toPublishRequest,
  uploadPercent,
} from './publish';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

describe('defaultTitle', () => {
  it('uses the file stem as the title', () => {
    expect(defaultTitle('/Users/me/My Song.wav')).toBe('My Song');
    expect(defaultTitle('C:\\audio\\take 3.wave')).toBe('take 3');
  });

  it('falls back to the full name when there is no extension', () => {
    expect(defaultTitle('/tmp/clip')).toBe('clip');
  });
});

describe('title validation', () => {
  it('treats blank or whitespace titles as missing', () => {
    expect(titleMissing('')).toBe(true);
    expect(titleMissing('   ')).toBe(true);
    expect(titleMissing('Clip')).toBe(false);
  });

  it('requires a title and a signed-in account to publish', () => {
    expect(canPublish('Clip', true)).toBe(true);
    expect(canPublish('  ', true)).toBe(false);
    expect(canPublish('Clip', false)).toBe(false);
  });
});

describe('tags', () => {
  it('splits on commas, trims and drops empties', () => {
    expect(parseTags(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseTags('')).toEqual([]);
  });

  it('measures the joined length against the 500-char limit', () => {
    expect(tagsCharCount(['a', 'bb', 'ccc'])).toBe('a,bb,ccc'.length);
    expect(PUBLISH_TAGS_MAX_CHARS).toBe(500);
  });

  it('clamps tags to the character budget without splitting a tag', () => {
    const tags = ['x'.repeat(200), 'y'.repeat(200), 'z'.repeat(200)];
    const clamped = clampTags(tags);
    expect(tagsCharCount(clamped)).toBeLessThanOrEqual(PUBLISH_TAGS_MAX_CHARS);
    expect(clamped).toEqual(['x'.repeat(200), 'y'.repeat(200)]);
  });
});

describe('durationWarning', () => {
  it('warns only above the 15-minute threshold', () => {
    expect(LONG_VIDEO_SECONDS).toBe(900);
    expect(durationWarning(900)).toBeNull();
    expect(durationWarning(901)).toMatchObject({ code: 'TooLong' });
    expect(durationWarning(901)?.message).toMatch(/verified account/);
  });

  it('uses the edited duration, not the source length', () => {
    expect(editedDuration(1000, [{ kind: 'trim', start: 0, end: 30 }])).toBe(30);
    expect(editedDuration(100, [{ kind: 'cutRegion', start: 10, end: 40 }])).toBe(70);
    expect(editedDuration(800, [{ kind: 'concatenate', file: '/b.wav', duration: 200 }])).toBe(1000);
    expect(
      durationWarning(editedDuration(800, [{ kind: 'concatenate', file: '/b.wav', duration: 200 }])),
    ).toMatchObject({ code: 'TooLong' });
  });
});

describe('accountLabel', () => {
  it('shows the channel title next to the email when both are known', () => {
    expect(accountLabel({ channelTitle: 'Studio', email: 'a@b.co' }, tFor('en'))).toBe(
      'Studio · a@b.co',
    );
  });

  it('falls back to whichever identity is known, then a generic chip', () => {
    expect(accountLabel({ channelTitle: 'Studio' }, tFor('en'))).toBe('Studio');
    expect(accountLabel({ email: 'a@b.co' }, tFor('en'))).toBe('a@b.co');
    expect(accountLabel(null, tFor('en'))).toBe('Signed in');
    expect(accountLabel(null, tFor('hu'))).toBe('Bejelentkezve');
  });
});

describe('privacyOptions', () => {
  it('labels visibility in the active language', () => {
    expect(privacyOptions(tFor('en')).map((option) => option.label)).toEqual(['Unlisted', 'Private', 'Public']);
    expect(privacyOptions(tFor('hu')).map((option) => option.label)).toEqual([
      'Nem listázott',
      'Privát',
      'Nyilvános',
    ]);
  });
});

describe('toPublishRequest', () => {
  const form: PublishForm = {
    title: '  My Clip  ',
    description: '  ',
    tags: 'a, b',
    privacyStatus: 'unlisted',
    coverImagePath: '/img.png',
    thumbnailPath: null,
  };

  it('trims fields and omits empty optionals', () => {
    expect(toPublishRequest(form)).toEqual({
      title: 'My Clip',
      description: undefined,
      tags: ['a', 'b'],
      privacyStatus: 'unlisted',
      coverImagePath: '/img.png',
      thumbnailPath: undefined,
    });
  });
});

describe('stageLabel / uploadPercent', () => {
  it('renders a human label per stage in the active language', () => {
    expect(stageLabel({ stage: 'cover' }, tFor('en'))).toBe('Composing cover…');
    expect(stageLabel({ stage: 'cover' }, tFor('hu'))).toBe('Borító összeállítása…');
    expect(stageLabel({ stage: 'render' }, tFor('hu'))).toBe('Videó renderelése…');
    expect(stageLabel({ stage: 'upload', percent: 42.4 }, tFor('en'))).toBe('Uploading… 42%');
    expect(stageLabel({ stage: 'upload', percent: 42.4 }, tFor('hu'))).toBe('Feltöltés… 42%');
    expect(stageLabel({ stage: 'done', videoId: 'v', url: 'u' }, tFor('en'))).toBe('Published to YouTube');
    expect(stageLabel({ stage: 'cancelled' }, tFor('hu'))).toBe('A közzététel megszakadt');
    expect(stageLabel({ kind: 'error', error: { code: 'QuotaExceeded', message: 'x' } }, tFor('en'))).toBe(
      'Publish failed (QuotaExceeded)',
    );
  });

  it('exposes the upload percent for the progress bar', () => {
    expect(uploadPercent({ stage: 'upload', percent: 42 })).toBe(42);
    expect(uploadPercent({ stage: 'cover' })).toBeNull();
    expect(uploadPercent({ kind: 'error', error: { code: 'EngineError', message: 'x' } })).toBeNull();
  });
});

describe('publishErrorAction', () => {
  it('links quota errors to the quota docs', () => {
    const action = publishErrorAction('QuotaExceeded', tFor('en'));
    expect(action.kind).toBe('link');
    expect(action.href).toContain('http');
  });

  it('routes revoked auth back to sign-in', () => {
    expect(publishErrorAction('AuthRevoked', tFor('en')).kind).toBe('signin');
  });

  it('offers a retry for transient failures in the active language', () => {
    expect(publishErrorAction('NetworkError', tFor('en'))).toMatchObject({ kind: 'retry', label: 'Retry' });
    expect(publishErrorAction('FormatError', tFor('hu'))).toMatchObject({ kind: 'retry', label: 'Újra' });
  });
});
