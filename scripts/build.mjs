import { build } from 'vite';
import { execSync } from 'child_process';
import { rmSync, mkdirSync, cpSync } from 'fs';

async function main() {
  rmSync('dist', { recursive: true, force: true });
  await build({ configFile: 'vite.renderer.config.ts' });
  execSync('npx tsc --project tsconfig.main.json', { stdio: 'inherit' });
  execSync('npx tsc --project tsconfig.preload.json --noEmit', { stdio: 'inherit' });
  // The sandboxed preload can only require Electron's built-ins, so its local
  // imports (src/shared/ipc) are bundled into the single file main loads.
  await build({
    configFile: false,
    build: {
      outDir: 'dist/preload',
      emptyOutDir: false,
      minify: false,
      lib: { entry: 'src/preload/preload.ts', formats: ['cjs'], fileName: () => 'preload.js' },
      rollupOptions: { external: ['electron'] },
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
