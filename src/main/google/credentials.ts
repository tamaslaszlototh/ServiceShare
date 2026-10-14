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

const bundledResourcesPath = (process as { resourcesPath?: string }).resourcesPath ?? '';

export function credentialCandidates(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  userDataDir?: string,
  resourcesPath: string = bundledResourcesPath,
): string[] {
  const paths: string[] = [];
  if (env.SERVICESHARE_CREDENTIALS) {
    paths.push(env.SERVICESHARE_CREDENTIALS);
  }
  paths.push(join(home, '.config', 'serviceshare', 'credentials.json'));
  if (userDataDir) {
    paths.push(join(userDataDir, 'credentials.json'));
  }
  // Release builds bundle the app's own OAuth client (written from a CI secret);
  // any local file above overrides it.
  if (resourcesPath) {
    paths.push(join(resourcesPath, 'credentials.json'));
  }
  return paths;
}

export function loadCredentials(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  userDataDir?: string,
  resourcesPath: string = bundledResourcesPath,
): OAuthCredentials | null {
  for (const path of credentialCandidates(env, home, userDataDir, resourcesPath)) {
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
