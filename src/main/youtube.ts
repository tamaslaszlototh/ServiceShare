import { AccountState, AuthTokens, AccountInfo } from '@shared/types';
import { loadTokens, storeTokens, deleteTokens } from './tokenStorage';
import {
  OAuthConfig,
  performOAuthFlow,
  refreshTokens,
  TokenResponse,
} from './auth';
import { AuthRevokedError, TokenStorageError } from './errors';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const OAUTH_CONFIG: OAuthConfig = {
  clientId: 'serviceshare-511421', // From spec 06
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: YOUTUBE_SCOPES,
};

export interface YouTubeAuthState {
  tokens: AuthTokens | null;
  account?: AccountInfo | null;
}

export function parseChannel(body: string): AccountInfo | null {
  try {
    const json = JSON.parse(body) as {
      items?: { id?: string; snippet?: { title?: string } }[];
    };
    const item = json.items?.[0];
    if (!item?.id && !item?.snippet?.title) {
      return null;
    }
    return {
      channelId: item?.id,
      channelTitle: item?.snippet?.title,
    };
  } catch {
    return null;
  }
}

export class YouTubeService {
  private tokens: AuthTokens | null = null;
  private account: AccountInfo | null = null;
  private accountFetched = false;

  async initialize(): Promise<void> {
    try {
      const loaded = await loadTokens();
      if (loaded) {
        this.tokens = loaded;
      }
    } catch (e) {
      if (e instanceof TokenStorageError) {
        // Don't crash on storage errors; surface as needed
      } else {
        throw e;
      }
    }
  }

  async signIn(): Promise<AccountInfo | null> {
    try {
      const tokenResponse = await performOAuthFlow(OAUTH_CONFIG);
      this.tokens = this.tokenResponseToTokens(tokenResponse);
      await storeTokens(this.tokens);
      this.account = await this.fetchAccountInfo(this.tokens);
      this.accountFetched = true;
      return this.account;
    } catch (e) {
      throw e;
    }
  }

  async signOut(): Promise<void> {
    this.tokens = null;
    this.account = null;
    this.accountFetched = false;
    await deleteTokens();
  }

  async ensureValidTokens(): Promise<AuthTokens> {
    if (!this.tokens) {
      throw new AuthRevokedError('No tokens stored');
    }

    if (this.isTokenExpired(this.tokens)) {
      try {
        if (!this.tokens.refreshToken) {
          throw new AuthRevokedError('No refresh token available');
        }
        const refreshed = await refreshTokens(OAUTH_CONFIG, this.tokens.refreshToken);
        const newTokens = this.tokenResponseToTokens(refreshed, this.tokens.refreshToken);
        this.tokens = newTokens;
        await storeTokens(this.tokens);
        return this.tokens;
      } catch (e) {
        await this.signOut();
        if (e instanceof Error && e.message.includes('invalid_grant')) {
          throw new AuthRevokedError(e.message);
        }
        throw e;
      }
    }

    return this.tokens;
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.ensureValidTokens();
    return tokens.accessToken;
  }

  getAccount(): AccountInfo | null {
    return this.account;
  }

  async accountState(): Promise<AccountState> {
    if (this.isSignedIn() && !this.accountFetched && this.tokens) {
      this.accountFetched = true;
      try {
        this.account = await this.fetchAccountInfo(this.tokens);
      } catch {
        this.account = null;
      }
    }
    return { signedIn: this.isSignedIn(), account: this.account };
  }

  isSignedIn(): boolean {
    return this.tokens !== null && !!this.tokens.accessToken;
  }

  private isTokenExpired(tokens: AuthTokens): boolean {
    if (!tokens.expiryDate) return false;
    const now = Date.now();
    // Consider token expired if less than 60 seconds remaining
    return now >= tokens.expiryDate - 60000;
  }

  private tokenResponseToTokens(
    response: TokenResponse,
    existingRefreshToken?: string,
  ): AuthTokens {
    const expiresIn = response.expires_in ?? 3600;
    const expiryDate = Date.now() + expiresIn * 1000;
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? existingRefreshToken,
      expiryDate,
      scope: response.scope,
      tokenType: response.token_type,
    };
  }

  private async fetchAccountInfo(tokens: AuthTokens): Promise<AccountInfo | null> {
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      return null;
    }
    return parseChannel(await response.text());
  }
}
