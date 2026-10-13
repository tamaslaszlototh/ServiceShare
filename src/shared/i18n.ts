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
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.trim': 'Trim',
  'toolbar.trimAria': 'Trim to selection',
  'toolbar.cutRegion': 'Cut region',
  'toolbar.fade': 'Fade',
  'toolbar.fadeDuration': 'Fade duration in seconds',
  'toolbar.fadeIn': 'Fade in',
  'toolbar.fadeInShort': 'In',
  'toolbar.fadeInOn': 'Turn fade in on',
  'toolbar.fadeInOff': 'Turn fade in off',
  'toolbar.fadeOut': 'Fade out',
  'toolbar.fadeOutShort': 'Out',
  'toolbar.fadeOutOn': 'Turn fade out on',
  'toolbar.fadeOutOff': 'Turn fade out off',
  'toolbar.gain': 'Gain',
  'toolbar.gainDb': 'Gain in decibels',
  'toolbar.apply': 'Apply',
  'toolbar.applyGainAria': 'Apply gain',
  'toolbar.normalize': 'Normalize',
  'toolbar.normalizeAria': 'Normalize loudness',
  'toolbar.normalizeOn': 'Normalize loudness to −16 LUFS',
  'toolbar.normalizeOff': 'Turn loudness normalization off',
  'toolbar.concatenate': 'Concatenate…',
  'toolbar.concatenateAria': 'Concatenate a second WAV',
  'toolbar.play': 'Play',
  'toolbar.pause': 'Pause',
  'toolbar.stop': 'Stop',
  'toolbar.rendering': 'Rendering…',
  'toolbar.zoomOut': 'Zoom out',
  'toolbar.zoomIn': 'Zoom in',
  'status.undoRedo': 'undo: {undo} · redo: {redo}',
  'status.ready': 'READY',
  'status.playing': 'PLAYING',
  'status.rendering': 'RENDERING',
  'status.noClip': 'No clip loaded',
  'notice.exported': 'Exported to {path}',
  'empty.noFile': 'No file opened',
  'empty.hint': 'Open a WAV file to start editing.',
  'empty.open': 'Open WAV…',
  'meta.format': '{rate} Hz / {bits}-bit',
  'meta.channel.mono': 'mono',
  'meta.channel.stereo': 'stereo',
  'meta.channel.other': '{count} channels',
  'meta.removed': 'removed {time}',
  'meta.selection': 'selection: {range} ({length}s)',
  'dialog.discardEdits': 'Opening a new file discards your edits. Continue?',
  'dialog.export.title': 'Export edited audio',
  'dialog.export.ariaLabel': 'Export edited audio',
  'dialog.export.wav': 'WAV',
  'dialog.export.wavHint': 'Preserves source sample rate, bit depth and channels',
  'dialog.export.mp3': 'MP3',
  'dialog.export.mp3Hint': '192 kbps · smaller file, stereo down-mix if needed',
  'dialog.export.progress': 'Exporting… {percent}%',
  'dialog.export.choose': 'Choose a format, then a destination.',
  'dialog.export.cancel': 'Cancel',
  'dialog.export.export': 'Export…',
  'timeline.ariaLabel': 'Timeline — drag to select, or click to place the cursor',
  'timeline.loading': 'Loading waveform…',
  'timeline.fadeIn': 'fade in {seconds}',
  'timeline.fadeOut': 'fade out {seconds}',
  'waveform.label': 'Waveform ({channels})',
} as const;

export type TranslationKey = keyof typeof en;

export type Translator = (key: TranslationKey, params?: TranslationParams) => string;

const hu: Record<TranslationKey, string> = {
  'header.noFile': 'Nincs fájl',
  'header.currentFile': 'Aktuális fájl: {name}',
  'header.open': 'Megnyitás',
  'header.export': 'Exportálás',
  'header.publish': 'Közzététel a YouTube-ra…',
  'language.label': 'Nyelv',
  'language.hu': 'Magyar',
  'language.en': 'English',
  'toolbar.undo': 'Visszavonás',
  'toolbar.redo': 'Újra',
  'toolbar.trim': 'Vágás',
  'toolbar.trimAria': 'Vágás a kijelölésre',
  'toolbar.cutRegion': 'Kivágás',
  'toolbar.fade': 'Úsztatás',
  'toolbar.fadeDuration': 'Úsztatás hossza másodpercben',
  'toolbar.fadeIn': 'Beúsztatás',
  'toolbar.fadeInShort': 'Be',
  'toolbar.fadeInOn': 'Beúsztatás bekapcsolása',
  'toolbar.fadeInOff': 'Beúsztatás kikapcsolása',
  'toolbar.fadeOut': 'Kiúsztatás',
  'toolbar.fadeOutShort': 'Ki',
  'toolbar.fadeOutOn': 'Kiúsztatás bekapcsolása',
  'toolbar.fadeOutOff': 'Kiúsztatás kikapcsolása',
  'toolbar.gain': 'Erősítés',
  'toolbar.gainDb': 'Erősítés decibelben',
  'toolbar.apply': 'Alkalmaz',
  'toolbar.applyGainAria': 'Erősítés alkalmazása',
  'toolbar.normalize': 'Normalizálás',
  'toolbar.normalizeAria': 'Hangerő normalizálása',
  'toolbar.normalizeOn': 'Hangerő normalizálása −16 LUFS-re',
  'toolbar.normalizeOff': 'Hangerő-normalizálás kikapcsolása',
  'toolbar.concatenate': 'Összefűzés…',
  'toolbar.concatenateAria': 'Második WAV összefűzése',
  'toolbar.play': 'Lejátszás',
  'toolbar.pause': 'Szünet',
  'toolbar.stop': 'Leállítás',
  'toolbar.rendering': 'Renderelés…',
  'toolbar.zoomOut': 'Kicsinyítés',
  'toolbar.zoomIn': 'Nagyítás',
  'status.undoRedo': 'visszavonás: {undo} · újra: {redo}',
  'status.ready': 'KÉSZ',
  'status.playing': 'LEJÁTSZÁS',
  'status.rendering': 'RENDERELÉS',
  'status.noClip': 'Nincs betöltött klip',
  'notice.exported': 'Exportálva: {path}',
  'empty.noFile': 'Nincs megnyitott fájl',
  'empty.hint': 'Nyisson meg egy WAV-fájlt a szerkesztéshez.',
  'empty.open': 'WAV megnyitása…',
  'meta.format': '{rate} Hz / {bits} bit',
  'meta.channel.mono': 'mono',
  'meta.channel.stereo': 'stereo',
  'meta.channel.other': '{count} csatorna',
  'meta.removed': 'eltávolítva {time}',
  'meta.selection': 'kijelölés: {range} ({length} s)',
  'dialog.discardEdits': 'Új fájl megnyitása elveti a módosításokat. Folytatja?',
  'dialog.export.title': 'Szerkesztett hang exportálása',
  'dialog.export.ariaLabel': 'Szerkesztett hang exportálása',
  'dialog.export.wav': 'WAV',
  'dialog.export.wavHint': 'Megőrzi a forrás mintavételi sebességét, bitmélységét és csatornáit',
  'dialog.export.mp3': 'MP3',
  'dialog.export.mp3Hint': '192 kbps · kisebb fájl, szükség esetén sztereo lekeverés',
  'dialog.export.progress': 'Exportálás… {percent}%',
  'dialog.export.choose': 'Válasszon formátumot, majd címet a mentéshez.',
  'dialog.export.cancel': 'Mégse',
  'dialog.export.export': 'Exportálás…',
  'timeline.ariaLabel': 'Idővonal — húzzon a kijelöléshez, vagy kattintson a kurzor elhelyezéséhez',
  'timeline.loading': 'Hullámforma betöltése…',
  'timeline.fadeIn': 'beúsztatás {seconds}',
  'timeline.fadeOut': 'kiúsztatás {seconds}',
  'waveform.label': 'Hullámforma ({channels})',
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
