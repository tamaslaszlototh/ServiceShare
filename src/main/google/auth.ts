import { randomBytes, createHash } from 'crypto';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { shell } from 'electron';
export interface Pkce {
  verifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generatePkce(): Pkce {
  const verifier = base64urlEncode(randomBytes(64));
  const codeChallenge = pkceChallengeFromVerifier(verifier);
  return {
    verifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

export function pkceChallengeFromVerifier(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return base64urlEncode(hash);
}

export interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  authEndpoint: string;
  scopes: string[];
}
export function createAuthUrl(config: OAuthConfig, pkce: Pkce, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    code_challenge: pkce.codeChallenge,
    code_challenge_method: pkce.codeChallengeMethod,
  });
  return `${config.authEndpoint}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  pkce: Pkce,
  redirectUri: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: pkce.verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshTokens(
  config: OAuthConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function performOAuthFlow(config: OAuthConfig): Promise<TokenResponse> {
  const pkce = generatePkce();
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      const server = createServer((req, res) => {
        try {
          const url = new URL(req.url!, 'http://127.0.0.1');
          const authCode = url.searchParams.get('code');
          if (!authCode) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body>Missing authorization code</body></html>');
            server.close();
            reject(new Error('Missing authorization code'));
            return;
          }

          const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body>Authorization successful. You may close this window.</body></html>');
          server.close();
          resolve({ code: authCode, redirectUri });
        } catch (e) {
          server.close();
          reject(e);
        }
      });

      server.on('error', reject);
      server.listen(0, '127.0.0.1', async () => {
        const port = (server.address() as AddressInfo).port;
        await shell.openExternal(createAuthUrl(config, pkce, `http://127.0.0.1:${port}`));
      });
    },
  );

  return exchangeCodeForTokens(config, code, pkce, redirectUri);
}
