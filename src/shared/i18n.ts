export type Locale = 'hu' | 'en';

export type TranslationParams = Record<string, string | number>;

export const LOCALES: readonly Locale[] = ['hu', 'en'];

export const DEFAULT_LOCALE: Locale = 'hu';

export const LOCALE_STORAGE_KEY = 'serviceshare.locale';

const en = {
  'header.noFile': 'No file',
  'header.currentFile': 'Current file: {name}',
  'header.open': 'Open',
  'header.export': 'Export',
  'header.publish': 'Publish to YouTube…',
  'language.label': 'Language',
  'language.hu': 'Magyar',
  'language.en': 'English',
} as const;

export type TranslationKey = keyof typeof en;

const hu: Record<TranslationKey, string> = {
  'header.noFile': 'Nincs fájl',
  'header.currentFile': 'Aktuális fájl: {name}',
  'header.open': 'Megnyitás',
  'header.export': 'Exportálás',
  'header.publish': 'Közzététel a YouTube-ra…',
  'language.label': 'Nyelv',
  'language.hu': 'Magyar',
  'language.en': 'English',
};

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, hu };

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(stored: unknown): Locale {
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

export function t(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const template = dictionary[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}
