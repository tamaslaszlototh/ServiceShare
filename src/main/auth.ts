import { randomBytes, createHash } from 'crypto';
import { createServer, Server } from 'http';
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

export function startLoopbackServer(
  expectedPath = '/',
): Promise<{ server: Server; redirectUri: string; code: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url!, 'http://127.0.0.1');
        if (url.pathname !== expectedPath && expectedPath !== '*') {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body>Invalid request</body></html>');
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body>Missing code parameter</body></html>');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Authorization successful. You may close this window.</body></html>');
        server.close();
        resolve({ server, redirectUri: `http://127.0.0.1:${(server.address() as any)?.port}`, code });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body>Error</body></html>');
        server.close();
        reject(e);
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1');
  });
}

export async function performOAuthFlow(config: OAuthConfig): Promise<TokenResponse> {
  const pkce = generatePkce();
  const { server, redirectUri, code } = await new Promise<{
    server: Server;
    redirectUri: string;
    code: string;
  }>((resolve, reject) => {
    const srv = createServer((req, res) => {
      try {
        const url = new URL(req.url!, redirectUri);
        const authCode = url.searchParams.get('code');
        if (!authCode) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body>Missing code</body></html>');
          srv.close();
          reject(new Error('Missing authorization code'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Success! You can close this window.</body></html>');
        srv.close();
        resolve({ server: srv, redirectUri, code: authCode });
      } catch (e) {
        srv.close();
        reject(e);
      }
    });

    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', async () => {
      const port = (srv.address() as any).port;
      const authRedirectUri = `http://127.0.0.1:${port}`;
      const authUrl = createAuthUrl(config, pkce, authRedirectUri);
      await shell.openExternal(authUrl);
    });
  });

  const tokens = await exchangeCodeForTokens(config, code, pkce, redirectUri);
  return tokens;
}
