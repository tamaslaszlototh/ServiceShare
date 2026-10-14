import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { aboutPanelOptions } from '../../src/main/core/shell';

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = pkg.build;

type FileSet = { from: string; to: string };

function targets(platform: { target: { target: string; arch: string[] }[] }) {
  return Object.fromEntries(platform.target.map((t) => [t.target, t.arch]));
}

describe('electron-builder packaging config', () => {
  it('emits dmg and zip for macOS on x64 and arm64', () => {
    expect(targets(build.mac)).toEqual({ dmg: ['x64', 'arm64'], zip: ['x64', 'arm64'] });
  });

  it('emits an NSIS installer for Windows on x64 and arm64', () => {
    expect(targets(build.win)).toEqual({ nsis: ['x64', 'arm64'] });
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

  it('names one NSIS installer per arch so per-arch builds do not overwrite each other', () => {
    expect(build.nsis.artifactName).toContain('${arch}');
  });

  it('keeps the About panel identity in step with the package metadata', () => {
    const about = aboutPanelOptions((key, params) => `${key} ${params?.url}`, pkg.version);
    expect(about.applicationName).toBe(build.productName);
    expect(about.copyright).toBe(build.copyright);
    expect(pkg.repository.url).toContain(about.credits.split(' ')[1].replace('https://', ''));
  });

  it('is ready for hardened-runtime signing but does not force it by default', () => {
    expect(build.mac.hardenedRuntime).toBe(true);
    expect(build.mac.entitlements).toBeDefined();
    expect(readFileSync(path.join(root, build.mac.entitlements), 'utf8')).toContain('com.apple.security.cs.allow-jit');
    expect(build.mac.forceCodeSigning).toBe(false);
  });

  it('checks the FFmpeg binaries match the packaged architecture', () => {
    expect(build.afterPack).toBe('scripts/packaging/after-pack.cjs');
  });
});
