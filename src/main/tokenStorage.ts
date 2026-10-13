import { safeStorage } from 'electron';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { AuthTokens } from '@shared/types';
import { TokenStorageError } from './errors';

const TOKENS_FILE = 'youtube-tokens.dat';

function getTokensPath(): string {
  return join(app.getPath('userData'), TOKENS_FILE);
}

export async function storeTokens(tokens: AuthTokens): Promise<void> {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new TokenStorageError('Encryption not available');
    }
    const data = Buffer.from(JSON.stringify(tokens));
    const encrypted = safeStorage.encryptString(data.toString());
    await writeFile(getTokensPath(), encrypted, { mode: 0o600 });
  } catch (e) {
    if (e instanceof TokenStorageError) throw e;
    throw new TokenStorageError(e instanceof Error ? e.message : String(e));
  }
}

export async function loadTokens(): Promise<AuthTokens | null> {
  try {
    const path = getTokensPath();
    const encrypted = await readFile(path);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new TokenStorageError('Encryption not available');
    }
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as AuthTokens;
  } catch (e) {
    if ((e as any)?.code === 'ENOENT') {
      return null;
    }
    if (e instanceof TokenStorageError) throw e;
    throw new TokenStorageError(e instanceof Error ? e.message : String(e));
  }
}

export async function deleteTokens(): Promise<void> {
  try {
    await unlink(getTokensPath());
  } catch (e) {
    if ((e as any)?.code !== 'ENOENT') {
      throw new TokenStorageError(e instanceof Error ? e.message : String(e));
    }
  }
}
