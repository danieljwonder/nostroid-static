import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceEvents, outboxRelays } from '../core/events.js';
import { buildModel, slugify, looksRandom, monthOf } from '../core/model.js';
import { matchRoute } from '../core/render/routes.js';
import { respond } from '../core/site.js';
import { makeRelayClient, fetchAuthor } from '../core/relay.js';
import { keypair, sign, config } from './helpers.js';

test('reduceEvents: verifies, replaces, deletes, rejects foreign', () => {
  const me = keypair(), them = keypair();
  const p1 = sign(me.sk, 0, '{"name":"old"}', [], 100);
  const p2 = sign(me.sk, 0, '{"name":"new"}', [], 200);
  const a1 = sign(me.sk, 30023, 'v1', [['d', 'x']], 100);
  const a2 = sign(me.sk, 30023, 'v2', [['d', 'x']], 300);
  const note = sign(me.sk, 1, 'oops', [], 150);
  const del = sign(me.sk, 5, '', [['e', note.id]], 400);
  const forged = { ...sign(me.sk, 1, 'orig'), content: 'tampered' };
  const foreign = sign(them.sk, 1, 'not mine');
  const r = reduceEvents([p1, p2, a1, a2, note, del, forged, foreign, p2], me.pk);
  assert.equal(r.rejected, 2);
  const kinds = r.events.map(e => e.kind).sort((a, b) => a - b);
  assert.deepEqual(kinds, [0, 5, 30023]);
  assert.equal(r.events.find(e => e.kind === 0).content, '{"name":"new"}');
  assert.equal(r.events.find(e => e.kind === 30023).content, 'v2');
});

test('outbox relays from NIP-65', () => {
  const me = keypair();
  const list = sign(me.sk, 10002, '', [['r', 'wss://a.example/'], ['r', 'wss://w.example', 'write'], ['r', 'wss://r.example', 'read']]);
  assert.deepEqual(outboxRelays([list], me.pk), ['wss://a.example', 'wss://w.example']);
});

test('slugs: deterministic, title for random d-tags, newer post gets the suffix', () => {
  const me = keypair();
  const cfg = config(me.pk);
  assert.equal(slugify('Héllo, Wörld!'), 'hello-world');
  assert.ok(looksRandom('4ZMPUV3oTxdEin3EU8DJ5'));
  assert.ok(!looksRandom('hello-world'));
  const older = sign(me.sk, 30023, 'a', [['d', 'Hello World'], ['published_at', '100']], 100);
  const newer = sign(me.sk, 30023, 'b', [['d', 'hello-world'], ['published_at', '200']], 200);
  const rnd = sign(me.sk, 30023, 'c', [['d', '4ZMPUV3oTxdEin3EU8DJ5'], ['title', 'How I Publish']], 300);
  const m = buildModel([older, newer, rnd], cfg);
  const byD = Object.fromEntries(m.posts.map(p => [p.d, p.path]));
  assert.equal(byD['Hello World'], '/blog/hello-world/');
  assert.equal(byD['hello-world'], `/blog/hello-world-${newer.id.slice(0, 6)}/`);
  assert.equal(byD['4ZMPUV3oTxdEin3EU8DJ5'], '/blog/how-i-publish/');
  // same input in a different order -> same slugs
  const m2 = buildModel([rnd, newer, older], cfg);
  assert.deepEqual(m2.posts.map(p => p.path), m.posts.map(p => p.path));
});

test('months: notes grouped by UTC month, newest first; a finished month is stable', () => {
  const me = keypair();
  const cfg = config(me.pk);
  const t = (y, mo, d) => Math.floor(Date.UTC(y, mo - 1, d) / 1000);
  const ev = [sign(me.sk, 1, 'a', [], t(2026, 10, 3)), sign(me.sk, 1, 'b', [], t(2026, 11, 1)), sign(me.sk, 1, 'c', [], t(2026, 10, 30))];
  const m = buildModel(ev, cfg);
  assert.deepEqual(m.months.map(x => x.path), ['/notes/2026/11/', '/notes/2026/10/']);
  assert.equal(m.months[1].notes.length, 2);
  assert.deepEqual(monthOf(t(2026, 1, 31)), { year: 2026, month: 1 });
  const m2 = buildModel([...ev, sign(me.sk, 1, 'd', [], t(2026, 12, 5))], cfg);
  assert.deepEqual(m2.months[2].notes.map(n => n.event.id), m.months[1].notes.map(n => n.event.id));
});

test('matchRoute', () => {
  assert.deepEqual(matchRoute('/'), { name: 'home' });
  assert.deepEqual(matchRoute('/blog/hello-world/'), { name: 'post', slug: 'hello-world' });
  assert.deepEqual(matchRoute('/notes/2026/11/'), { name: 'month', year: 2026, month: 11 });
  assert.deepEqual(matchRoute('/notes/0123456789abcdef/'), { name: 'note', id: '0123456789abcdef' });
  assert.equal(matchRoute('/evil/../'), null);
  assert.equal(matchRoute('/blog/<script>/'), null);
});

test('respond: full HTML with SEO head, 404 for unknown, sitemap excludes short notes', () => {
  const me = keypair();
  const cfg = config(me.pk);
  const ev = [
    sign(me.sk, 0, JSON.stringify({ name: 'Ada', about: 'Builder' }), [], 100),
    sign(me.sk, 30023, '# Hi\n\n**bold**', [['d', 'first'], ['title', 'First <Post>'], ['summary', 'The first']], 1000),
    sign(me.sk, 1, 'gm', [], 1500),
    sign(me.sk, 1, 'A longer note. '.repeat(30), [], 1600)
  ];
  const post = respond(ev, cfg, '/blog/first/');
  assert.equal(post.status, 200);
  assert.match(post.body, /<title>First &lt;Post&gt; · Test Site<\/title>/);
  assert.match(post.body, /<link rel="canonical" href="https:\/\/example.com\/blog\/first\/">/);
  assert.match(post.body, /"@type":"BlogPosting"/);
  assert.match(post.body, /<strong>bold<\/strong>/);
  assert.match(post.body, /Powered by <a href="https:\/\/nostroid.com">Nostroid<\/a>/);
  assert.equal(respond(ev, cfg, '/blog/nope/').status, 404);
  assert.equal(respond(ev, cfg, '/anything/').status, 404);
  const sm = respond(ev, cfg, '/sitemap.xml').body;
  const short = ev[2].id.slice(0, 16), long = ev[3].id.slice(0, 16);
  assert.ok(!sm.includes(short)); assert.ok(sm.includes(long));
  assert.ok(sm.includes('/notes/1970/01/'));
  assert.match(respond(ev, cfg, `/notes/${short}/`).body, /noindex/);
  assert.match(respond(ev, cfg, '/feed.xml').body, /<title>First &lt;Post&gt;<\/title>/);
  assert.match(respond(ev, cfg, '/robots.txt').body, /Sitemap: https:\/\/example.com\/sitemap.xml/);
});

test('relay client: parallel query, dedupe, timeout, pagination', async () => {
  const me = keypair();
  const evs = Array.from({ length: 7 }, (_, i) => sign(me.sk, 1, 'n' + i, [], 1000 + i));
  function fakeRelay(url, { events = [], silent = false } = {}) {
    const listeners = {};
    const ws = { addEventListener: (t, f) => (listeners[t] = f), close() {}, send(msg) {
      const [, sub, ...filters] = JSON.parse(msg);
      if (silent) return;
      const f = filters[0];
      let out = events.filter(e => (f.until === undefined || e.created_at <= f.until)).sort((a, b) => b.created_at - a.created_at).slice(0, f.limit);
      for (const e of out) listeners.message({ data: JSON.stringify(['EVENT', sub, e]) });
      listeners.message({ data: JSON.stringify(['EOSE', sub]) });
    } };
    queueMicrotask(() => listeners.open && listeners.open());
    return ws;
  }
  const client = makeRelayClient(url => url.includes('slow') ? fakeRelay(url, { silent: true }) : fakeRelay(url, { events: evs }), { timeoutMs: 50 });
  const got = await fetchAuthor(client, ['wss://a', 'wss://b', 'wss://slow'], me.pk, [1], { pageLimit: 3 });
  assert.equal(got.length, 7);
});
