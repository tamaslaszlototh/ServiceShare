import { afterAll, beforeAll } from 'vitest';
import { cleanup, makeTempDir } from './harness';

export function useTempDir(): () => string {
  let dir = '';
  beforeAll(async () => {
    dir = await makeTempDir();
  });
  afterAll(async () => {
    await cleanup(dir);
  });
  return () => dir;
}
