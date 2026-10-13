import { describe, it, expect, vi, afterEach } from 'vitest';
import { request } from 'http';
import { shell } from 'electron';
import {
  generatePkce,
  pkceChallengeFromVerifier,
  exchangeCodeForTokens,
  refreshTokens,
  performOAuthFlow,
  OAuthConfig,
} from './auth';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

const CONFIG: OAuthConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: ['scope'],
};

function captureFetch() {
  const bodies: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      return { ok: true, json: async () => ({ access_token: 'at' }) };
    }),
  );
  return bodies;
}

afterEach(() => vi.unstubAllGlobals());

describe('token requests', () => {
  it('sends client_secret on the authorization code exchange', async () => {
    const bodies = captureFetch();
    await exchangeCodeForTokens(CONFIG, 'code', generatePkce(), 'http://127.0.0.1:1');
    expect(bodies[0]).toContain('client_secret=client-secret');
  });

  it('sends client_secret on refresh', async () => {
    const bodies = captureFetch();
    await refreshTokens(CONFIG, 'refresh');
    expect(bodies[0]).toContain('client_secret=client-secret');
  });

  it('omits client_secret when it is not configured', async () => {
    const bodies = captureFetch();
    await refreshTokens({ ...CONFIG, clientSecret: undefined }, 'refresh');
    expect(bodies[0]).not.toContain('client_secret');
  });
});

describe('performOAuthFlow', () => {
  it('exchanges the code with the same loopback redirect uri used to authorize', async () => {
    const bodies = captureFetch();
    const openExternal = vi.mocked(shell.openExternal);
    openExternal.mockReset();
    openExternal.mockImplementation(async (authUrl: string) => {
      const redirect = new URL(authUrl).searchParams.get('redirect_uri')!;
      await new Promise<void>((resolve, reject) => {
        const req = request(`${redirect}?code=abc`, (res) => {
          res.resume();
          res.on('end', () => resolve());
        });
        req.on('error', reject);
        req.end();
      });
    });

    await performOAuthFlow(CONFIG);

    const authorized = new URL(openExternal.mock.calls[0][0]).searchParams.get('redirect_uri');
    const exchanged = new URLSearchParams(bodies[0]).get('redirect_uri');
    expect(exchanged).toBe(authorized);
    expect(exchanged).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});

describe('PKCE', () => {
  it('generates verifier of appropriate length and challenge with S256', async () => {
    const pkce = generatePkce();
    expect(pkce.verifier.length).toBeGreaterThan(43);
    expect(pkce.verifier.length).toBeLessThanOrEqual(128);
    expect(pkce.codeChallengeMethod).toBe('S256');
    const expected = await pkceChallengeFromVerifier(pkce.verifier);
    expect(pkce.codeChallenge).toBe(expected);
  });

  it('generates different values each time', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});
