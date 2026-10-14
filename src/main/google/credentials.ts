import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export function parseCredentials(raw: string): OAuthCredentials | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) {
    return null;
  }
  const record = json as Record<string, unknown>;
  const node = (record.installed ?? record.web ?? json) as Record<string, unknown>;
  if (typeof node !== 'object' || node === null) {
    return null;
  }
  const clientId = node.client_id;
  if (typeof clientId !== 'string' || clientId.length === 0) {
    return null;
  }
  const clientSecret = node.client_secret;
  return { clientId, clientSecret: typeof clientSecret === 'string' ? clientSecret : '' };
}

export function credentialCandidates(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  userDataDir?: string,
): string[] {
  const paths: string[] = [];
  if (env.SERVICESHARE_CREDENTIALS) {
    paths.push(env.SERVICESHARE_CREDENTIALS);
  }
  paths.push(join(home, '.config', 'serviceshare', 'credentials.json'));
  if (userDataDir) {
    paths.push(join(userDataDir, 'credentials.json'));
  }
  return paths;
}

export function loadCredentials(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  userDataDir?: string,
): OAuthCredentials | null {
  for (const path of credentialCandidates(env, home, userDataDir)) {
    try {
      const parsed = parseCredentials(readFileSync(path, 'utf8'));
      if (parsed) {
        return parsed;
      }
    } catch {
      // try the next candidate location
    }
  }
  return null;
}
