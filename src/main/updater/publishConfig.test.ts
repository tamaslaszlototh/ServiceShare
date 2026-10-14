import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));

describe('electron-builder update config', () => {
  it('publishes to GitHub Releases with an explicit owner and repo', () => {
    expect(pkg.build.publish).toEqual([
      expect.objectContaining({ provider: 'github', owner: 'tamaslaszlototh', repo: 'ServiceShare' }),
    ]);
  });

  it('skips update signature verification while Windows builds are unsigned', () => {
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(false);
  });
});
