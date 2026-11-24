#!/usr/bin/env node
// Bundle the browser app into dist-browser/: static files you can upload anywhere.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadTheme, themePlugin } from './theme-bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pos, opts } = parseArgs(process.argv.slice(2));
const out = path.resolve(pos[0] || path.join(root, 'dist-browser'));
const theme = await loadTheme(opts);
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });
await build({ entryPoints: [path.join(root, 'browser/app.js')], bundle: true, format: 'esm', platform: 'browser', minify: true, target: 'es2022', outfile: path.join(out, 'assets/app.js'), plugins: [themePlugin(theme)] });
await fs.copyFile(path.join(root, 'browser/index.html'), path.join(out, 'index.html'));
await fs.copyFile(path.join(root, 'browser/index.html'), path.join(out, '404.html'));
await fs.writeFile(path.join(out, 'assets/styles.css'), theme.styles);
if (theme.assets.length) await fs.mkdir(path.join(out, 'assets/theme'), { recursive: true });
for (const a of theme.assets) await fs.copyFile(a.file, path.join(out, 'assets/theme', a.name));
await fs.copyFile(path.join(root, 'core/assets/theme.js'), path.join(out, 'assets/theme.js'));
await fs.copyFile(path.join(root, 'nostroid.config.example.js'), path.join(out, 'nostroid.config.example.js'));
const cfg = path.join(root, 'nostroid.config.js');
try { await fs.copyFile(cfg, path.join(out, 'nostroid.config.js')); } catch { await fs.copyFile(path.join(root, 'nostroid.config.example.js'), path.join(out, 'nostroid.config.js')); }
const size = (await fs.stat(path.join(out, 'assets/app.js'))).size;
console.log(`browser build -> ${out} (app.js ${(size / 1024).toFixed(0)} KB, theme ${opts.theme ? path.basename(opts.theme) : 'default'}${opts.css.length ? ` + ${opts.css.length} site css` : ''})`);
