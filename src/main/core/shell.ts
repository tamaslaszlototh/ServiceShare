import { TranslationKey, Translator } from '../../shared/i18n';
import { ExportFormat, MenuCommand } from '../../shared/types';

export type { MenuCommand };

export interface MenuEntry {
  type?: 'separator';
  role?: string;
  label?: string;
  command?: MenuCommand;
  submenu?: MenuEntry[];
}

const APP_NAME = 'ServiceShare';
const COPYRIGHT = 'Copyright © 2026 Tóth Tamás László';
// The public repo is the GPL corresponding source for every release.
const SOURCE_URL = 'https://github.com/tamaslaszlototh/ServiceShare';

export interface AboutPanelOptions {
  applicationName: string;
  applicationVersion: string;
  copyright: string;
  credits: string;
}

export function aboutPanelOptions(t: Translator, version: string): AboutPanelOptions {
  return {
    applicationName: APP_NAME,
    applicationVersion: version,
    copyright: COPYRIGHT,
    credits: t('about.credits', { url: SOURCE_URL }),
  };
}

export function applicationMenu(t: Translator, platform: NodeJS.Platform): MenuEntry[] {
  const isMac = platform === 'darwin';

  const file: MenuEntry = {
    label: t('menu.file'),
    submenu: [
      { label: t('menu.file.open'), command: 'open' },
      { label: t('menu.file.export'), command: 'export' },
      { type: 'separator' },
      isMac ? { role: 'close', label: t('menu.window.close') } : { role: 'quit', label: t('menu.file.quit') },
    ],
  };

  const edit: MenuEntry = {
    label: t('menu.edit'),
    submenu: [
      { role: 'undo', label: t('menu.edit.undo') },
      { role: 'redo', label: t('menu.edit.redo') },
      { type: 'separator' },
      { role: 'cut', label: t('menu.edit.cut') },
      { role: 'copy', label: t('menu.edit.copy') },
      { role: 'paste', label: t('menu.edit.paste') },
      { role: 'selectAll', label: t('menu.edit.selectAll') },
    ],
  };

  const view: MenuEntry = {
    label: t('menu.view'),
    submenu: [
      { role: 'reload', label: t('menu.view.reload') },
      { role: 'forceReload', label: t('menu.view.forceReload') },
      { role: 'toggleDevTools', label: t('menu.view.toggleDevTools') },
      { type: 'separator' },
      { role: 'resetZoom', label: t('menu.view.resetZoom') },
      { role: 'zoomIn', label: t('menu.view.zoomIn') },
      { role: 'zoomOut', label: t('menu.view.zoomOut') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t('menu.view.fullscreen') },
    ],
  };

  const window: MenuEntry = {
    label: t('menu.window'),
    role: 'windowMenu',
    submenu: [
      { role: 'minimize', label: t('menu.window.minimize') },
      ...(isMac
        ? [
            { role: 'zoom', label: t('menu.window.zoom') },
            { type: 'separator' as const },
            { role: 'front', label: t('menu.window.front') },
          ]
        : [{ role: 'close', label: t('menu.window.close') }]),
    ],
  };

  const template: MenuEntry[] = [];

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about', label: t('menu.app.about') },
        { label: t('menu.app.checkForUpdates'), command: 'checkForUpdates' },
        { type: 'separator' },
        { role: 'services', label: t('menu.app.services') },
        { type: 'separator' },
        { role: 'hide', label: t('menu.app.hide') },
        { role: 'hideOthers', label: t('menu.app.hideOthers') },
        { role: 'unhide', label: t('menu.app.unhide') },
        { type: 'separator' },
        { role: 'quit', label: t('menu.file.quit') },
      ],
    });
  }

  template.push(file, edit, view, window);

  if (!isMac) {
    template.push({
      label: t('menu.help'),
      submenu: [
        { label: t('menu.app.checkForUpdates'), command: 'checkForUpdates' },
        { type: 'separator' },
        { role: 'about', label: t('menu.app.about') },
      ],
    });
  }

  return template;
}

export interface DialogOptions {
  title: string;
  filters: { name: string; extensions: string[] }[];
}

export function openDialogOptions(t: Translator): DialogOptions {
  return {
    title: t('dialog.open.title'),
    filters: [{ name: t('dialog.open.wav'), extensions: ['wav', 'wave'] }],
  };
}

export function logoDialogOptions(t: Translator): DialogOptions {
  return {
    title: t('dialog.logo.title'),
    filters: [{ name: t('dialog.image.files'), extensions: ['png', 'jpg', 'jpeg'] }],
  };
}

export function baseDialogOptions(t: Translator): DialogOptions {
  return {
    title: t('dialog.base.title'),
    filters: [{ name: t('dialog.image.files'), extensions: ['png', 'jpg', 'jpeg'] }],
  };
}

const EXPORT_DIALOG: Record<ExportFormat, { nameKey: TranslationKey; extension: string }> = {
  wav: { nameKey: 'dialog.export.wav.audio', extension: 'wav' },
  mp3: { nameKey: 'dialog.export.mp3.audio', extension: 'mp3' },
};

export interface ExportDialogOptions extends DialogOptions {
  extension: string;
}

export function exportDialogOptions(t: Translator, format: ExportFormat): ExportDialogOptions {
  const { nameKey, extension } = EXPORT_DIALOG[format];
  return {
    title: t('dialog.export.title'),
    filters: [{ name: t(nameKey), extensions: [extension] }],
    extension,
  };
}
