import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { aboutPanelOptions } from '../../src/main/core/shell';

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = pkg.build;

type FileSet = { from: string; to: string };

function targets(platform: { target: { target: string; arch?: string[] }[] }) {
  return Object.fromEntries(platform.target.map((t) => [t.target, t.arch]));
}

describe('electron-builder packaging config', () => {
  it('distributes a single x64 NSIS installer for Windows', () => {
    expect(targets(build.win)).toEqual({ nsis: ['x64'] });
  });

  it('names the installer without spaces so GitHub keeps the name latest.yml points at', () => {
    expect(build.nsis.artifactName).toBe('${productName}-Setup-${version}.${ext}');
  });

  it('packages macOS only as an unsigned local app for development', () => {
    expect(build.mac.target).toEqual([{ target: 'dir' }]);
    expect(build.mac.identity).toBeNull();
  });

  it('ships the bundled cover assets where the asset resolver looks for them', () => {
    expect(build.extraResources).toContainEqual(expect.objectContaining({ from: 'assets', to: 'assets' }));
  });

  it('ships FFmpeg and ffprobe at the resources root where the resolver looks for them', () => {
    const shipped = (sets: FileSet[]) => sets.map((set) => set.to);
    expect(shipped(build.mac.extraResources)).toEqual(expect.arrayContaining(['ffmpeg', 'ffprobe']));
    expect(shipped(build.win.extraResources)).toEqual(expect.arrayContaining(['ffmpeg.exe', 'ffprobe.exe']));
  });

  it('keeps the npm FFmpeg packages out of app.asar', () => {
    expect(build.files).toEqual(
      expect.arrayContaining(['!node_modules/ffmpeg-static/**', '!node_modules/ffprobe-static/**']),
    );
  });

  it('ships the GPL-3.0 license with the app, FFmpeg, and the Windows installer', () => {
    const license = readFileSync(path.join(root, 'LICENSE'), 'utf8');
    expect(license).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(license).toContain('Version 3, 29 June 2007');
    expect(pkg.license).toMatch(/^GPL-3\.0/);
    expect(build.extraResources).toContainEqual({ from: 'LICENSE', to: 'LICENSE' });
    expect(build.extraResources).toContainEqual(expect.objectContaining({ to: 'licenses/ffmpeg.LICENSE.md' }));
    expect(build.nsis.license).toBe('LICENSE');
  });

  it('keeps the About panel identity in step with the package metadata', () => {
    const about = aboutPanelOptions((key, params) => `${key} ${params?.url}`, pkg.version);
    expect(about.applicationName).toBe(build.productName);
    expect(about.copyright).toBe(build.copyright);
    expect(pkg.repository.url).toContain(about.credits.split(' ')[1].replace('https://', ''));
  });

  it('has an app icon electron-builder can turn into a full Windows .ico', () => {
    const png = readFileSync(path.join(root, build.directories.buildResources, 'icon.png'));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(256);
  });

  it('bundles the OAuth credentials CI writes, but never commits them', () => {
    expect(build.extraResources).toContainEqual({ from: 'build', to: '.', filter: ['credentials.json'] });
    const ignored = readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
    expect(ignored).toContain('build/credentials.json');
  });

  it('checks the FFmpeg binaries match the packaged architecture', () => {
    expect(build.afterPack).toBe('scripts/packaging/after-pack.cjs');
  });
});
