#!/usr/bin/env node
// Bundle a Cloudflare Worker (site or relay) into a single ESM file.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2];
const entries = { site: 'server/cloudflare/worker.js', relay: 'relay/cloudflare/worker.js' };
if (!entries[which]) { console.error('usage: build-worker.js site|relay [outfile]'); process.exit(1); }
const outfile = path.resolve(process.argv[3] || path.join(root, `dist-worker/${which}.mjs`));
await fs.mkdir(path.dirname(outfile), { recursive: true });
const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: `export default ${JSON.stringify(await fs.readFile(a.path, 'utf8'))};`, loader: 'js' }));
  }
};
await build({
  entryPoints: [path.join(root, entries[which])], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: false,
  outfile, external: ['cloudflare:workers'], loader: { '.css': 'text' }, plugins: [rawPlugin], legalComments: 'none'
});
const size = (await fs.stat(outfile)).size;
console.log(`${which} worker -> ${outfile} (${(size / 1024).toFixed(0)} KB)`);
