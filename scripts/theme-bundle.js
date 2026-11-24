// Theme packaging shared by the browser and worker builds.
//   --theme <dir>   theme package: theme.js (default export), optional styles.css, optional assets/
//   --css <file>    site stylesheet (repeatable), goes in the `site` layer after the theme
// Output: one stylesheet (core < theme < site), the theme module, and theme assets under /assets/theme/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TYPES = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon'
};

/** Split argv into positionals and --theme/--css options. */
export function parseArgs(argv) {
  const pos = [], opts = { theme: null, css: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--theme') opts.theme = path.resolve(argv[++i]);
    else if (a === '--css') opts.css.push(path.resolve(argv[++i]));
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  return { pos, opts };
}

const exists = p => fs.access(p).then(() => true, () => false);

function layer(name, css, file) {
  if (/@import\b/.test(css)) throw new Error(`${file}: @import is not supported; inline the CSS or use separate --css files`);
  return `\n/* ${name}: ${path.basename(file)} */\n@layer ${name} {\n${css.trim()}\n}\n`;
}

export async function loadTheme({ theme, css }) {
  let themeEntry = null, styles = await fs.readFile(path.join(root, 'core/assets/styles.css'), 'utf8');
  const assets = [];
  if (theme) {
    themeEntry = path.join(theme, 'theme.js');
    if (!(await exists(themeEntry))) throw new Error(`--theme ${theme}: missing theme.js`);
    const tcss = path.join(theme, 'styles.css');
    if (await exists(tcss)) styles += layer('theme', await fs.readFile(tcss, 'utf8'), tcss);
    const adir = path.join(theme, 'assets');
    if (await exists(adir)) {
      for (const f of (await fs.readdir(adir)).sort()) {
        const type = TYPES[path.extname(f).toLowerCase()];
        if (!type) throw new Error(`theme asset ${f}: unsupported type (allowed: ${Object.keys(TYPES).join(' ')})`);
        if (!/^[a-zA-Z0-9._-]+$/.test(f)) throw new Error(`theme asset ${f}: use letters, digits, dot, dash, underscore`);
        assets.push({ name: f, file: path.join(adir, f), type });
      }
    }
  }
  for (const f of css) styles += layer('site', await fs.readFile(f, 'utf8'), f);
  return { themeEntry, styles, assets };
}

/** esbuild plugin: virtual modules nostroid:theme, nostroid:styles, nostroid:assets (base64, worker only). */
export function themePlugin(bundle, { embedAssets = false } = {}) {
  return {
    name: 'nostroid-theme',
    setup(b) {
      b.onResolve({ filter: /^nostroid:(theme|styles|assets)$/ }, a => ({ path: a.path, namespace: 'nostroid' }));
      b.onLoad({ filter: /.*/, namespace: 'nostroid' }, async a => {
        if (a.path === 'nostroid:theme') {
          return bundle.themeEntry
            ? { contents: `export { default } from ${JSON.stringify(bundle.themeEntry)};`, loader: 'js', resolveDir: path.dirname(bundle.themeEntry) }
            : { contents: 'export default { name: "default" };', loader: 'js' };
        }
        if (a.path === 'nostroid:styles') return { contents: `export default ${JSON.stringify(bundle.styles)};`, loader: 'js' };
        const list = embedAssets
          ? await Promise.all(bundle.assets.map(async x => ({ path: `/assets/theme/${x.name}`, type: x.type, b64: (await fs.readFile(x.file)).toString('base64') })))
          : [];
        return { contents: `export default ${JSON.stringify(list)};`, loader: 'js' };
      });
    }
  };
}
