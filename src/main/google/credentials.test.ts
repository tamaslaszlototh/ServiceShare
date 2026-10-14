import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseCredentials, credentialCandidates, loadCredentials } from './credentials';

const INSTALLED = JSON.stringify({
  installed: {
    client_id: '123-abc.apps.googleusercontent.com',
    client_secret: 'top-secret',
    project_id: 'serviceshare-511421',
  },
});

describe('parseCredentials', () => {
  it('reads the installed client id and secret', () => {
    expect(parseCredentials(INSTALLED)).toEqual({
      clientId: '123-abc.apps.googleusercontent.com',
      clientSecret: 'top-secret',
    });
  });

  it('reads the web client shape', () => {
    const raw = JSON.stringify({ web: { client_id: 'web-id', client_secret: 's' } });
    expect(parseCredentials(raw)).toEqual({ clientId: 'web-id', clientSecret: 's' });
  });

  it('treats a missing secret as empty rather than failing', () => {
    const raw = JSON.stringify({ installed: { client_id: 'id-only' } });
    expect(parseCredentials(raw)).toEqual({ clientId: 'id-only', clientSecret: '' });
  });

  it('rejects malformed or id-less payloads', () => {
    expect(parseCredentials('not-json')).toBeNull();
    expect(parseCredentials('{}')).toBeNull();
    expect(parseCredentials(JSON.stringify({ installed: { client_secret: 's' } }))).toBeNull();
  });
});

describe('credentialCandidates', () => {
  it('prefers the env override, then ~/.config, then userData', () => {
    const paths = credentialCandidates({ SERVICESHARE_CREDENTIALS: '/custom.json' }, '/home/u', '/data');
    expect(paths).toEqual([
      '/custom.json',
      '/home/u/.config/serviceshare/credentials.json',
      '/data/credentials.json',
    ]);
  });

  it('omits the env override when unset', () => {
    expect(credentialCandidates({}, '/home/u')).toEqual([
      '/home/u/.config/serviceshare/credentials.json',
    ]);
  });

  it('falls back last to the credentials bundled with the installer', () => {
    const paths = credentialCandidates({}, '/home/u', '/data', '/app/resources');
    expect(paths).toEqual([
      '/home/u/.config/serviceshare/credentials.json',
      '/data/credentials.json',
      '/app/resources/credentials.json',
    ]);
  });
});

describe('loadCredentials', () => {
  it('loads from the first candidate that exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-creds-'));
    const file = join(dir, 'credentials.json');
    writeFileSync(file, INSTALLED);

    expect(loadCredentials({ SERVICESHARE_CREDENTIALS: file }, '/nonexistent')).toEqual({
      clientId: '123-abc.apps.googleusercontent.com',
      clientSecret: 'top-secret',
    });
    expect(loadCredentials({}, '/nonexistent')).toBeNull();
  });

  it('uses the bundled credentials when no local file exists', () => {
    const resources = mkdtempSync(join(tmpdir(), 'ss-resources-'));
    writeFileSync(join(resources, 'credentials.json'), INSTALLED);

    expect(loadCredentials({}, '/nonexistent', undefined, resources)?.clientId).toBe(
      '123-abc.apps.googleusercontent.com',
    );
  });
});
