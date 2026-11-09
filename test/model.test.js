import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, slugify } from '../src/model.js';
import { stablePages } from '../src/render/pages.js';
import { keypair, sign, config } from './helpers.js';

test('slugify', () => {
  assert.equal(slugify('Héllo, Wörld!  2026'), 'hello-world-2026');
  assert.equal(slugify('---'), '');
});

test('slugs are stable: existing assignments never move', () => {
  const me = keypair();
  const cfg = config(me.pk);
  const a = sign(me.sk, 30023, 'x', [['d', 'Hello World'], ['published_at', '100']], 100);
  const r1 = buildModel([a], cfg, {});
  assert.equal(r1.model.posts[0].path, '/hello-world/');
  // A new post whose d-tag slugifies the same way gets a suffix; the old one keeps its URL
  const b = sign(me.sk, 30023, 'y', [['d', 'hello-world'], ['published_at', '50']], 300);
  const r2 = buildModel([a, b], cfg, r1.slugs);
  const byD = Object.fromEntries(r2.model.posts.map(p => [p.d, p.path]));
  assert.equal(byD['Hello World'], '/hello-world/');
  assert.equal(byD['hello-world'], '/hello-world-2/');
  // Editing a post (new event, same d) keeps the URL
  const a2 = sign(me.sk, 30023, 'x edited', [['d', 'Hello World'], ['published_at', '100']], 400);
  const r3 = buildModel([a2, b], cfg, r2.slugs);
  assert.equal(r3.model.posts.find(p => p.d === 'Hello World').path, '/hello-world/');
});

test('reserved paths are never used as post slugs', () => {
  const me = keypair();
  const r = buildModel([sign(me.sk, 30023, 'x', [['d', 'notes']])], config(me.pk), {});
  assert.equal(r.model.posts[0].path, '/notes-post/');
});

test('replies are excluded by default; short notes are not indexable', () => {
  const me = keypair();
  const cfg = config(me.pk);
  const short = sign(me.sk, 1, 'gm');
  const long = sign(me.sk, 1, 'x'.repeat(300));
  const reply = sign(me.sk, 1, 'agreed', [['e', 'a'.repeat(64), '', 'reply']]);
  const quoteMention = sign(me.sk, 1, 'see this', [['e', 'b'.repeat(64), '', 'mention']]);
  const { model } = buildModel([short, long, reply, quoteMention], cfg, {});
  const ids = model.notes.map(n => n.event.id);
  assert.ok(!ids.includes(reply.id));
  assert.ok(ids.includes(quoteMention.id));
  assert.equal(model.notes.find(n => n.event.id === short.id).indexable, false);
  assert.equal(model.notes.find(n => n.event.id === long.id).indexable, true);
});

test('random client-generated d-tags fall back to the title for the URL', () => {
  const me = keypair();
  const r = buildModel([sign(me.sk, 30023, 'x', [['d', '4ZMPUV3oTxdEin3EU8DJ5'], ['title', 'How I Publish My Site']])], config(me.pk), {});
  assert.equal(r.model.posts[0].path, '/how-i-publish-my-site/');
  const r2 = buildModel([sign(me.sk, 30023, 'x', [['d', 'Hello-World-g7vqz9'], ['title', 'Hello']])], config(me.pk), {});
  assert.equal(r2.model.posts[0].path, '/hello-world-g7vqz9/');
});

test('stable pagination: full archive pages never change as items are added', () => {
  const size = 3;
  let prev = null;
  for (let total = 1; total <= 40; total++) {
    const items = Array.from({ length: total }, (_, i) => total - i); // newest first: total..1
    const pages = stablePages(items, size, '/n/');
    // every item reachable; archive pages are always full
    const seen = new Set(pages.flatMap(p => p.items));
    assert.equal(seen.size, total);
    for (const p of pages.slice(1)) assert.equal(p.items.length, size);
    // an archive page, once it exists, keeps exactly the same items
    if (prev) for (const p of prev.slice(1)) {
      const now = pages.find(q => q.path === p.path);
      assert.ok(now, `${p.path} disappeared at total=${total}`);
      assert.deepEqual(now.items, p.items);
    }
    prev = pages;
  }
});
