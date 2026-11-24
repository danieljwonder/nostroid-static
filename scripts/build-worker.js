#!/usr/bin/env node
// Bundle a Cloudflare Worker (site or relay) into a single ESM file.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadTheme, themePlugin } from './theme-bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pos, opts } = parseArgs(process.argv.slice(2));
const which = pos[0];
const entries = { site: 'server/cloudflare/worker.js', relay: 'relay/cloudflare/worker.js' };
if (!entries[which]) { console.error('usage: build-worker.js site|relay [outfile] [--theme <dir>] [--css <file>]...'); process.exit(1); }
const outfile = path.resolve(pos[1] || path.join(root, `dist-worker/${which}.mjs`));
const theme = await loadTheme(opts);
await fs.mkdir(path.dirname(outfile), { recursive: true });
const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: `export default ${JSON.stringify(await fs.readFile(a.path, 'utf8'))};`, loader: 'js' }));
  }
};
await build({
  entryPoints: [path.join(root, entries[which])], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  outfile, external: ['cloudflare:workers'], loader: { '.css': 'text' }, plugins: [rawPlugin, themePlugin(theme, { embedAssets: true })], legalComments: 'none'
});
const size = (await fs.stat(outfile)).size;
console.log(`${which} worker -> ${outfile} (${(size / 1024).toFixed(0)} KB${which === 'site' ? `, theme ${opts.theme ? path.basename(opts.theme) : 'default'}${opts.css.length ? ` + ${opts.css.length} site css` : ''}` : ''})`);
