import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventStore } from '../src/store.js';
import { build } from '../src/build.js';
import { crawlCheck } from '../src/crawl-check.js';
import { keypair, sign, tmpdir, config } from './helpers.js';

async function fixture() {
  const me = keypair();
  const dir = await tmpdir();
  const cfg = { ...config(me.pk, { pageSize: 2 }), root: dir };
  const store = new EventStore(path.join(dir, 'content'));
  const events = [
    sign(me.sk, 0, JSON.stringify({ name: 'Ada', about: 'Builder of things & stuff', website: 'https://ada.example' }), [], 100),
    sign(me.sk, 30023, '# Intro\n\nThis is **long-form** content with a [link](https://example.org).', [['d', 'first-post'], ['title', 'First Post'], ['summary', 'The very first post'], ['published_at', '1000'], ['t', 'nostr']], 1000),
    sign(me.sk, 30023, 'Second body text that is long enough.', [['d', 'second'], ['title', 'Second <Post>']], 2000),
    sign(me.sk, 30023, 'Third body text.', [['d', 'third'], ['title', 'Third']], 3000),
    sign(me.sk, 1, 'gm', [], 1500),
    sign(me.sk, 1, 'A longer note. '.repeat(30), [], 1600),
    sign(me.sk, 30003, '', [['d', 'reading'], ['title', 'Reading'], ['r', 'https://example.net', 'Example']], 1700)
  ];
  await store.apply(events, me.pk);
  return { me, dir, cfg, store, events, out: path.join(dir, 'dist') };
}

test('build writes complete static HTML with SEO metadata', async () => {
  const f = await fixture();
  const r = await build({ config: f.cfg, store: f.store, outDir: f.out });
  assert.equal(r.posts, 3);
  const post = await fs.readFile(path.join(f.out, 'first-post/index.html'), 'utf8');
  assert.match(post, /<title>First Post · Test Site<\/title>/);
  assert.match(post, /<link rel="canonical" href="https:\/\/example.com\/first-post\/">/);
  assert.match(post, /<meta name="description" content="The very first post">/);
  assert.match(post, /<strong>long-form<\/strong>/);
  assert.match(post, /"@type":"BlogPosting"/);
  assert.match(post, /Powered by <a href="https:\/\/nostroid.com">Nostroid<\/a>/);
  const second = await fs.readFile(path.join(f.out, 'second/index.html'), 'utf8');
  assert.match(second, /Second &lt;Post&gt;/);
  assert.ok(!second.includes('Second <Post>'));
});

test('sitemap includes indexable pages only; short notes are noindex', async () => {
  const f = await fixture();
  await build({ config: f.cfg, store: f.store, outDir: f.out });
  const sm = await fs.readFile(path.join(f.out, 'sitemap.xml'), 'utf8');
  const shortNote = f.events.find(e => e.content === 'gm');
  const longNote = f.events.find(e => e.content.startsWith('A longer'));
  assert.ok(!sm.includes(shortNote.id.slice(0, 16)));
  assert.ok(sm.includes(longNote.id.slice(0, 16)));
  assert.ok(sm.includes('https://example.com/blog/page/2/'));
  const shortHtml = await fs.readFile(path.join(f.out, `notes/${shortNote.id.slice(0, 16)}/index.html`), 'utf8');
  assert.match(shortHtml, /<meta name="robots" content="noindex, follow">/);
  assert.match(await fs.readFile(path.join(f.out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example.com\/sitemap.xml/);
  assert.match(await fs.readFile(path.join(f.out, 'feed.xml'), 'utf8'), /<title>First Post<\/title>/);
});

test('builds are deterministic', async () => {
  const f = await fixture();
  await build({ config: f.cfg, store: f.store, outDir: f.out });
  const a = await fs.readFile(path.join(f.out, 'index.html'), 'utf8');
  const s1 = await fs.readFile(path.join(f.out, 'sitemap.xml'), 'utf8');
  await build({ config: f.cfg, store: f.store, outDir: f.out });
  assert.equal(await fs.readFile(path.join(f.out, 'index.html'), 'utf8'), a);
  assert.equal(await fs.readFile(path.join(f.out, 'sitemap.xml'), 'utf8'), s1);
});

test('public/ files are copied verbatim (e.g. NIP-05)', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.dir, 'public/.well-known'), { recursive: true });
  await fs.writeFile(path.join(f.dir, 'public/.well-known/nostr.json'), '{"names":{}}');
  await build({ config: f.cfg, store: f.store, outDir: f.out });
  assert.equal(await fs.readFile(path.join(f.out, '.well-known/nostr.json'), 'utf8'), '{"names":{}}');
});

test('refuses to wipe the project root', async () => {
  const f = await fixture();
  await assert.rejects(build({ config: f.cfg, store: f.store, outDir: f.dir }), /refusing to clean/);
});

test('crawl check passes with no JavaScript, on a server without rewrites', async () => {
  const f = await fixture();
  await build({ config: f.cfg, store: f.store, outDir: f.out });
  const r = await crawlCheck(f.out);
  assert.deepEqual(r.errors, []);
  assert.ok(r.urls >= 8);
});

test('works under a sub-path base URL', async () => {
  const f = await fixture();
  const cfg = { ...f.cfg, site: { ...f.cfg.site, url: 'https://example.com/site/' }, basePath: '/site/' };
  await build({ config: cfg, store: f.store, outDir: f.out });
  const html = await fs.readFile(path.join(f.out, 'first-post/index.html'), 'utf8');
  assert.match(html, /href="\/site\/assets\/styles.css"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.com\/site\/first-post\/">/);
  const r = await crawlCheck(f.out);
  assert.deepEqual(r.errors, []);
});

test('broken links inside the author content are warnings, not failures', async () => {
  const f = await fixture();
  await f.store.apply([sign(f.me.sk, 30023, 'See [my old page](/old-page/).', [['d', 'linky'], ['title', 'Linky']], 4000)], f.me.pk);
  await build({ config: f.cfg, store: f.store, outDir: f.out });
  const r = await crawlCheck(f.out);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /\/old-page\//);
});
