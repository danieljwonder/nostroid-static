import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { respond } from '../core/site.js';
import { resolveTheme, helpers, tokenCss } from '../core/render/theme.js';
import { resolveConfig } from '../core/config.js';
import { loadTheme } from '../scripts/theme-bundle.js';
import midnight from '../themes/midnight/theme.js';
import { keypair, sign, config, tmpdir } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = me => [
  sign(me.sk, 0, '{"name":"Ada"}', [], 100),
  sign(me.sk, 30023, 'body', [['d', 'p'], ['title', 'A <b>title</b>'], ['image', 'https://img.example/c.jpg']], 200),
  sign(me.sk, 1, 'hello world', [], 300)
];

test('html helper escapes interpolations, trusts raw() and nested html``', () => {
  const { html, raw, join } = helpers;
  assert.equal(String(html`<p title="${'"x"'}">${'<b>'}${raw('<i>ok</i>')}${html`<u>${'&'}</u>`}</p>`), '<p title="&quot;x&quot;">&lt;b&gt;<i>ok</i><u>&amp;</u></p>');
  assert.equal(String(html`${['<a>', raw('<b>')]}`), '&lt;a&gt;<b>');
  assert.equal(String(join(['a', 'b'], '\n')), 'a\nb');
  assert.equal(String(html`${null}${false}${0}`), '0');
});

test('resolveTheme rejects unknown partials, non-functions and bad schemes', () => {
  assert.throws(() => resolveTheme({ name: 't', partials: { postcard: () => '' } }), /unknown partial "postcard"/);
  assert.throws(() => resolveTheme({ name: 't', partials: { postCard: 'x' } }), /must be a function/);
  assert.throws(() => resolveTheme({ name: 't', scheme: 'sepia' }), /scheme/);
});

test('theme partial overrides are used, others fall back, title stays escaped', () => {
  const me = keypair();
  const theme = resolveTheme(midnight);
  const home = respond(fixture(me), config(me.pk), '/', { theme }).body;
  assert.match(home, /class="card card--image"/);
  assert.match(home, /A &lt;b&gt;title&lt;\/b&gt;/);
  assert.match(home, /class="note"/); // default noteCard still used
  assert.doesNotMatch(home, /theme-toggle/); // dark-only theme: no toggle
  const plain = respond(fixture(me), config(me.pk), '/').body;
  assert.match(plain, /theme-toggle/);
});

test('a theme cannot change the SEO head', () => {
  const me = keypair();
  const theme = resolveTheme({ name: 'x', partials: { layout: () => '<p>bare</p>' } });
  const r = respond(fixture(me), config(me.pk), '/', { theme }).body;
  assert.match(r, /<link rel="canonical" href="https:\/\/example.com\/">/);
  assert.match(r, /<body>\n<p>bare<\/p>/);
});

test('site tokens: validated, emitted into the site layer, absent when unset', () => {
  const me = keypair();
  assert.throws(() => config(me.pk, { theme: { tokens: { accent: 'red;}</style><script>' } } }), /plain CSS value/);
  assert.throws(() => config(me.pk, { theme: { tokens: { 'Bad Name': 'red' } } }), /bad token name/);
  assert.throws(() => config(me.pk, { theme: { tokens: { x: 'a /* b */' } } }), /plain CSS value/);
  const cfg = config(me.pk, { theme: { tokens: { '--accent': '#ff2bd6', 'font-body': '"Mona Sans", sans-serif' }, dark: { accent: '#b845f5' } } });
  const css = tokenCss(cfg);
  assert.match(css, /^@layer site \{\n:root \{ --accent: #ff2bd6; --font-body: "Mona Sans", sans-serif; \}/);
  assert.match(css, /:root\[data-theme="dark"\] \{ --accent: #b845f5; \}/);
  const body = respond(fixture(me), cfg, '/').body;
  assert.match(body, /<style id="nostroid-tokens">/);
  assert.doesNotMatch(respond(fixture(me), config(me.pk), '/').body, /nostroid-tokens/);
});

test('build: theme and site CSS are layered after core; @import rejected; assets listed', async () => {
  const dir = await tmpdir('nostroid-theme-');
  const css = path.join(dir, 'custom.css');
  await fs.writeFile(css, '.site-title { color: hotpink; }');
  const b = await loadTheme({ theme: path.join(root, 'themes/midnight'), css: [css] });
  assert.ok(b.styles.startsWith('/* Nostroid core styles'));
  const iTheme = b.styles.indexOf('@layer theme {'), iSite = b.styles.indexOf('@layer site {');
  assert.ok(iTheme > 0 && iSite > iTheme);
  assert.deepEqual(b.assets, []);
  await fs.writeFile(css, '@import url(x.css);');
  await assert.rejects(loadTheme({ theme: null, css: [css] }), /@import is not supported/);
  await fs.mkdir(path.join(dir, 't/assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 't/theme.js'), 'export default { name: "t" };');
  await fs.writeFile(path.join(dir, 't/assets/f.woff2'), 'x');
  const t = await loadTheme({ theme: path.join(dir, 't'), css: [] });
  assert.deepEqual(t.assets.map(a => [a.name, a.type]), [['f.woff2', 'font/woff2']]);
  await fs.rm(dir, { recursive: true, force: true });
});
