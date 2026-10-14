import { describe, it, expect } from 'vitest';
import { oauthConfig, parseChannel, parseEmail } from './youtube';

describe('oauthConfig', () => {
  it('carries the client id and secret into the OAuth config', () => {
    const config = oauthConfig({ clientId: 'real-id', clientSecret: 'real-secret' });
    expect(config).toMatchObject({
      clientId: 'real-id',
      clientSecret: 'real-secret',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    });
  });

  it('returns null when no credentials are configured', () => {
    expect(oauthConfig(null)).toBeNull();
  });

  it('omits an empty secret so Google does not reject the request', () => {
    const config = oauthConfig({ clientId: 'id', clientSecret: '' });
    expect(config?.clientSecret).toBeUndefined();
  });
});

describe('parseChannel', () => {
  it('reads the signed-in channel id and title', () => {
    const body = JSON.stringify({
      items: [{ id: 'UC123', snippet: { title: 'Studio' } }],
    });
    expect(parseChannel(body)).toEqual({ channelId: 'UC123', channelTitle: 'Studio' });
  });

  it('returns null when the payload has no channel', () => {
    expect(parseChannel('{"items":[]}')).toBeNull();
    expect(parseChannel('not-json')).toBeNull();
  });
});

describe('parseEmail', () => {
  it('reads the signed-in account email', () => {
    expect(parseEmail(JSON.stringify({ email: 'a@b.co' }))).toBe('a@b.co');
  });

  it('returns null when the payload has no usable email', () => {
    expect(parseEmail('{}')).toBeNull();
    expect(parseEmail(JSON.stringify({ email: '  ' }))).toBeNull();
    expect(parseEmail('not-json')).toBeNull();
  });
});
