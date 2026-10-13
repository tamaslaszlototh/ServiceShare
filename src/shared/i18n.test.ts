import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  TranslationKey,
  dictionaries,
  interpolate,
  isLocale,
  resolveLocale,
  t,
} from './i18n';

describe('dictionaries', () => {
  it('contains exactly the same key set in every locale', () => {
    const reference = Object.keys(dictionaries[DEFAULT_LOCALE]).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      expect(Object.keys(dictionaries[locale]).sort()).toEqual(reference);
    }
  });

  it('has no empty translations', () => {
    for (const locale of LOCALES) {
      for (const value of Object.values(dictionaries[locale])) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('t', () => {
  it('returns the string for the requested locale', () => {
    expect(t('en', 'header.open')).toBe('Open');
    expect(t('hu', 'header.open')).toBe('Megnyitás');
    expect(t('en', 'header.publish')).toBe('Publish to YouTube…');
    expect(t('hu', 'header.noFile')).toBe('Nincs fájl');
  });

  it('serves the editor shell in both languages', () => {
    expect(t('en', 'toolbar.undo')).toBe('Undo');
    expect(t('hu', 'toolbar.undo')).toBe('Visszavonás');
    expect(t('en', 'status.ready')).toBe('READY');
    expect(t('hu', 'status.noClip')).toBe('Nincs betöltött klip');
    expect(t('en', 'empty.noFile')).toBe('No file opened');
    expect(t('hu', 'empty.noFile')).toBe('Nincs megnyitott fájl');
    expect(t('en', 'meta.format', { rate: 44100, bits: 16 })).toBe('44100 Hz / 16-bit');
    expect(t('hu', 'meta.format', { rate: 44100, bits: 16 })).toBe('44100 Hz / 16 bit');
  });

  it('pluralises the channel count per language', () => {
    expect(t('en', 'meta.channel.other', { count: 6 })).toBe('6 channels');
    expect(t('hu', 'meta.channel.other', { count: 6 })).toBe('6 csatorna');
  });

  it('interpolates named string parameters', () => {
    expect(t('en', 'header.currentFile', { name: 'Song.wav' })).toBe('Current file: Song.wav');
    expect(t('hu', 'header.currentFile', { name: 'Song.wav' })).toBe('Aktuális fájl: Song.wav');
  });

  it('stringifies numeric parameters', () => {
    expect(interpolate('{count} items', { count: 3 })).toBe('3 items');
  });

  it('leaves unknown placeholders untouched and returns the template when params are missing', () => {
    expect(interpolate('hello {name}')).toBe('hello {name}');
    expect(interpolate('hello {name}', {})).toBe('hello {name}');
    expect(interpolate('hello {name}', { name: 'there' })).toBe('hello there');
  });

  it('falls back to the key for an unknown key', () => {
    expect(t('hu', 'unknown.key' as TranslationKey)).toBe('unknown.key');
  });
});

describe('locale resolution', () => {
  it('defaults to Hungarian on first run', () => {
    expect(DEFAULT_LOCALE).toBe('hu');
    expect(resolveLocale(null)).toBe('hu');
    expect(resolveLocale(undefined)).toBe('hu');
    expect(resolveLocale('')).toBe('hu');
  });

  it('accepts known locales and rejects others', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('hu')).toBe('hu');
    expect(resolveLocale('fr')).toBe('hu');
    expect(isLocale('hu')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});
