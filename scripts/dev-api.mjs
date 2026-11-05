// Sobe a API local (packages/server/src/dev.ts) empacotada com esbuild, igual à produção.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'node_modules', '.cache', 'truco-dev-api');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'dev.mjs');
await build({
  entryPoints: [join(root, 'packages', 'server', 'src', 'dev.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  logLevel: 'warning',
});
await import(pathToFileURL(outfile).href);
