import { build } from 'vite';
import { execSync } from 'child_process';
import { rmSync, mkdirSync, cpSync } from 'fs';

async function main() {
  rmSync('dist', { recursive: true, force: true });
  await build({ configFile: 'vite.renderer.config.ts' });
  execSync('npx tsc --project tsconfig.main.json', { stdio: 'inherit' });
  execSync('npx tsc --project tsconfig.preload.json', { stdio: 'inherit' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
