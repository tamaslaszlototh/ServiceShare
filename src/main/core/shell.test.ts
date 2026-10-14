import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '../../shared/i18n';
import {
  applicationMenu,
  exportDialogOptions,
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
});
