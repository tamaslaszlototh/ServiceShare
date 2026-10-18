import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '../../shared/i18n';
import {
  aboutPanelOptions,
  applicationMenu,
  exportDialogOptions,
  baseDialogOptions,
  logoDialogOptions,
  openDialogOptions,
  type MenuEntry,
} from './shell';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

function collect(entries: MenuEntry[]): MenuEntry[] {
  const all: MenuEntry[] = [];
  for (const entry of entries) {
    all.push(entry);
    if (entry.submenu) {
      all.push(...collect(entry.submenu));
    }
  }
  return all;
}

function labels(entries: MenuEntry[]): string[] {
  return collect(entries)
    .map((entry) => entry.label)
    .filter((label): label is string => Boolean(label));
}

describe('applicationMenu', () => {
  it('labels the file and edit menus in the active language', () => {
    const en = labels(applicationMenu(tFor('en'), 'darwin'));
    const hu = labels(applicationMenu(tFor('hu'), 'darwin'));

    expect(en).toContain('File');
    expect(en).toContain('Edit');
    expect(hu).toContain('Fájl');
    expect(hu).toContain('Szerkesztés');
    expect(hu).not.toContain('File');
    expect(hu).not.toContain('Open…');
    expect(hu).not.toContain('Quit');
  });

  it('keeps the brand name on the macOS app menu', () => {
    const [appMenu] = applicationMenu(tFor('hu'), 'darwin');
    expect(appMenu.label).toBe('ServiceShare');
    expect(appMenu.submenu?.some((entry) => entry.role === 'about')).toBe(true);
  });

  it('gives the standard edit roles localized labels', () => {
    const entries = collect(applicationMenu(tFor('hu'), 'darwin'));
    const edit = entries.find((entry) => entry.label === 'Szerkesztés');
    const roles = (edit?.submenu ?? []).map((entry) => entry.role);
    expect(roles).toEqual(expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']));
    const roleItems = (edit?.submenu ?? []).filter((entry) => entry.role);
    expect(roleItems.every((entry) => entry.label)).toBe(true);
  });

  it('routes the open and export items through menu commands', () => {
    const commands = collect(applicationMenu(tFor('en'), 'darwin'))
      .map((entry) => entry.command)
      .filter(Boolean);
    expect(commands).toEqual(expect.arrayContaining(['open', 'export']));
  });

  it('offers "Check for updates…" exactly once on every platform', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const items = collect(applicationMenu(tFor('en'), platform)).filter(
        (entry) => entry.command === 'checkForUpdates',
      );
      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('Check for Updates…');
    }
    expect(labels(applicationMenu(tFor('hu'), 'darwin'))).toContain('Frissítések keresése…');
  });

  it('installs a quit role on every platform exactly once', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const quits = collect(applicationMenu(tFor('en'), platform)).filter((entry) => entry.role === 'quit');
      expect(quits).toHaveLength(1);
    }
  });
});

describe('native dialog options', () => {
  it('names the open dialog and filter in the active language', () => {
    const hu = openDialogOptions(tFor('hu'));
    expect(hu.title).toBe('WAV megnyitása');
    expect(hu.filters[0].name).toBe('WAV fájlok');
    expect(hu.filters[0].extensions).toContain('wav');
  });

  it('names the export save dialog and filter per format', () => {
    const en = exportDialogOptions(tFor('en'), 'mp3');
    expect(en.title).toBe('Export edited audio');
    expect(en.filters[0].name).toBe('MP3 audio');
    expect(en.filters[0].extensions).toEqual(['mp3']);
    expect(exportDialogOptions(tFor('hu'), 'wav').filters[0].name).toBe('WAV hang');
  });

  it('names the default-logo picker and image filter in the active language', () => {
    const hu = logoDialogOptions(tFor('hu'));
    expect(hu.title).toBe('Alapértelmezett logó kiválasztása');
    expect(hu.filters[0].extensions).toContain('png');
    expect(logoDialogOptions(tFor('en')).filters[0].extensions).toContain('jpeg');
  });

  it('builds the localized default cover picker for images', () => {
    const hu = baseDialogOptions(tFor('hu'));
    expect(hu.title).toBe('Alapértelmezett borító kiválasztása');
    expect(hu.filters[0].extensions).toEqual(['png', 'jpg', 'jpeg']);
    expect(baseDialogOptions(tFor('en')).title).toBe('Choose default cover image');
  });
});

describe('aboutPanelOptions', () => {
  it('names the app, its version, and its copyright', () => {
    const about = aboutPanelOptions(tFor('en'), '1.2.3');
    expect(about.applicationName).toBe('ServiceShare');
    expect(about.applicationVersion).toBe('1.2.3');
    expect(about.copyright).toContain('Tóth Tamás László');
  });

  it('states the GPL-3.0 license and where the corresponding source lives', () => {
    for (const locale of ['hu', 'en'] as const) {
      const { credits } = aboutPanelOptions(tFor(locale), '1.2.3');
      expect(credits).toContain('GPL-3.0');
      expect(credits).toContain('FFmpeg');
      expect(credits).toContain('https://github.com/tamaslaszlototh/ServiceShare');
    }
    expect(aboutPanelOptions(tFor('hu'), '1.2.3').credits).not.toBe(aboutPanelOptions(tFor('en'), '1.2.3').credits);
  });
});
