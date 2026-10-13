import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import { channelLabel } from './labels';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

describe('channelLabel', () => {
  it('names mono and stereo', () => {
    expect(channelLabel(1, tFor('en'))).toBe('mono');
    expect(channelLabel(2, tFor('hu'))).toBe('stereo');
  });

  it('uses the Hungarian singular-after-number form', () => {
    expect(channelLabel(6, tFor('hu'))).toBe('6 csatorna');
    expect(channelLabel(6, tFor('en'))).toBe('6 channels');
  });
});
