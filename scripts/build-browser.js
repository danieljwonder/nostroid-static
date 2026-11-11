#!/usr/bin/env node
// Bundle the browser app into dist-browser/: static files you can upload anywhere.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist-browser'));
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'assets'), { recursive: true });
await build({ entryPoints: [path.join(root, 'browser/app.js')], bundle: true, format: 'esm', platform: 'browser', minify: true, target: 'es2022', outfile: path.join(out, 'assets/app.js') });
await fs.copyFile(path.join(root, 'browser/index.html'), path.join(out, 'index.html'));
await fs.copyFile(path.join(root, 'browser/index.html'), path.join(out, '404.html'));
await fs.copyFile(path.join(root, 'src/assets/styles.css'), path.join(out, 'assets/styles.css'));
await fs.copyFile(path.join(root, 'src/assets/theme.js'), path.join(out, 'assets/theme.js'));
await fs.copyFile(path.join(root, 'nostroid.config.example.js'), path.join(out, 'nostroid.config.example.js'));
const cfg = path.join(root, 'nostroid.config.js');
try { await fs.copyFile(cfg, path.join(out, 'nostroid.config.js')); } catch { await fs.copyFile(path.join(root, 'nostroid.config.example.js'), path.join(out, 'nostroid.config.js')); }
const size = (await fs.stat(path.join(out, 'assets/app.js'))).size;
console.log(`browser build -> ${out} (app.js ${(size / 1024).toFixed(0)} KB)`);
