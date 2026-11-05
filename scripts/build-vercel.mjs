// Gera a saída no formato "Build Output API v3" da Vercel:
//   .vercel/output/static/          → site (apps/client/dist)
//   .vercel/output/functions/api.func → API (packages/server/src/vercel.ts empacotada com esbuild)
//   .vercel/output/config.json      → rotas (/api/* → função; resto → arquivos estáticos)
// Uso: npm run build:vercel  (o vercel.json chama este comando)
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const dist = join(root, 'apps', 'client', 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('apps/client/dist não existe. Rode "npm run build" antes.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'static'), { recursive: true });
cpSync(dist, join(out, 'static'), { recursive: true });

const fn = join(out, 'functions', 'api.func');
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, 'packages', 'server', 'src', 'vercel.ts')],
  outfile: join(fn, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  // module.exports = handler (o esbuild coloca o export default em .default)
  footer: { js: 'module.exports = module.exports.default || module.exports;' },
});
// O pacote raiz é "type": "module"; a função é CommonJS. Marca explicitamente.
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/api/(.*)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
      ],
    },
    null,
    2,
  ),
);
console.log('Build Output pronto em .vercel/output (site + função /api).');
