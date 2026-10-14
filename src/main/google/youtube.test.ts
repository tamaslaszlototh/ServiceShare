import { describe, it, expect } from 'vitest';
import {
  GMAIL_SEND_SCOPE,
  YouTubeService,
  hasGmailSendScope,
  oauthConfig,
  parseChannel,
  parseEmail,
} from './youtube';

describe('oauthConfig', () => {
  it('carries the client id and secret into the OAuth config', () => {
    const config = oauthConfig({ clientId: 'real-id', clientSecret: 'real-secret' });
    expect(config).toMatchObject({
      clientId: 'real-id',
      clientSecret: 'real-secret',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    });
  });

  it('requests the gmail.send scope so the email panel can send', () => {
    const config = oauthConfig({ clientId: 'real-id', clientSecret: '' });
    expect(config?.scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(config?.scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
  });

  it('returns null when no credentials are configured', () => {
    expect(oauthConfig(null)).toBeNull();
  });

  it('omits an empty secret so Google does not reject the request', () => {
    const config = oauthConfig({ clientId: 'id', clientSecret: '' });
    expect(config?.clientSecret).toBeUndefined();
  });
});

describe('hasGmailSendScope', () => {
  it('detects the gmail.send scope among the granted scopes', () => {
    const tokens = {
      accessToken: 't',
      scope: `https://www.googleapis.com/auth/youtube.upload ${GMAIL_SEND_SCOPE}`,
    };
    expect(hasGmailSendScope(tokens)).toBe(true);
  });

  it('reports false for tokens granted before the email permission', () => {
    expect(
      hasGmailSendScope({ accessToken: 't', scope: 'https://www.googleapis.com/auth/youtube.upload' }),
    ).toBe(false);
    expect(hasGmailSendScope({ accessToken: 't' })).toBe(false);
    expect(hasGmailSendScope(null)).toBe(false);
  });
});

describe('accountState', () => {
  it('reports canSendEmail as false while signed out', async () => {
    const service = new YouTubeService(null);
    await expect(service.accountState()).resolves.toEqual({
      signedIn: false,
      account: null,
      canSendEmail: false,
    });
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
