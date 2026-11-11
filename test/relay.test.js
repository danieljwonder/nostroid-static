import test from 'node:test';
import assert from 'node:assert/strict';
import { RelayStore, RelayHandler, matches } from '../relay/core.js';
import { memorySql } from './sqlite-adapter.js';
import { keypair, sign } from './helpers.js';

function conn() {
  const c = { out: [], subs: new Map(), send: s => c.out.push(JSON.parse(s)), attach() { c.attached = (c.attached || 0) + 1; } };
  return c;
}
function setup(allowedKeys) {
  const store = new RelayStore(memorySql());
  const handler = new RelayHandler(store, { allowed: new Set(allowedKeys), now: () => 2_000_000_000 });
  return { store, handler };
}

test('only allowlisted pubkeys can write; everyone can read', () => {
  const me = keypair(), them = keypair();
  const { handler, store } = setup([me.pk]);
  const c = conn(); handler.open(c);
  const mine = sign(me.sk, 1, 'hello');
  const theirs = sign(them.sk, 1, 'spam');
  handler.message(c, JSON.stringify(['EVENT', mine]));
  handler.message(c, JSON.stringify(['EVENT', theirs]));
  assert.deepEqual(c.out[0], ['OK', mine.id, true, '']);
  assert.equal(c.out[1][2], false);
  assert.match(c.out[1][3], /restricted/);
  assert.equal(store.count(), 1);
  const reader = conn(); handler.open(reader);
  handler.message(reader, JSON.stringify(['REQ', 'r1', { kinds: [1] }]));
  assert.equal(reader.out[0][0], 'EVENT'); assert.equal(reader.out[0][2].id, mine.id);
  assert.deepEqual(reader.out[1], ['EOSE', 'r1']);
});

test('rejects bad signatures, malformed, oversized and future events', () => {
  const me = keypair();
  const { handler } = setup([me.pk]);
  const c = conn(); handler.open(c);
  handler.message(c, JSON.stringify(['EVENT', { ...sign(me.sk, 1, 'x'), content: 'tampered' }]));
  assert.match(c.out.at(-1)[3], /bad signature/);
  handler.message(c, JSON.stringify(['EVENT', { id: 'nope' }]));
  assert.match(c.out.at(-1)[3], /malformed/);
  handler.message(c, JSON.stringify(['EVENT', sign(me.sk, 1, 'y'.repeat(70 * 1024))]));
  assert.match(c.out.at(-1)[3], /too large/);
  handler.message(c, JSON.stringify(['EVENT', sign(me.sk, 1, 'z', [], 2_000_000_000 + 3600)]));
  assert.match(c.out.at(-1)[3], /future/);
  handler.message(c, 'not json');
  assert.equal(c.out.at(-1)[0], 'NOTICE');
});

test('replaceable and addressable events keep only the newest; deletions stick', () => {
  const me = keypair();
  const { handler, store } = setup([me.pk]);
  const c = conn(); handler.open(c);
  const p1 = sign(me.sk, 0, '{"name":"old"}', [], 100);
  const p2 = sign(me.sk, 0, '{"name":"new"}', [], 200);
  handler.message(c, JSON.stringify(['EVENT', p2]));
  handler.message(c, JSON.stringify(['EVENT', p1]));
  assert.equal(c.out.at(-1)[2], false); assert.match(c.out.at(-1)[3], /newer version/);
  assert.equal(store.query({ kinds: [0] })[0].content, '{"name":"new"}');
  const a1 = sign(me.sk, 30023, 'v1', [['d', 'post']], 100);
  const a2 = sign(me.sk, 30023, 'v2', [['d', 'post']], 300);
  handler.message(c, JSON.stringify(['EVENT', a1]));
  handler.message(c, JSON.stringify(['EVENT', a2]));
  assert.equal(store.query({ kinds: [30023] }).length, 1);
  const note = sign(me.sk, 1, 'oops', [], 400);
  handler.message(c, JSON.stringify(['EVENT', note]));
  handler.message(c, JSON.stringify(['EVENT', sign(me.sk, 5, '', [['e', note.id]], 500)]));
  assert.equal(store.query({ ids: [note.id] }).length, 0);
  handler.message(c, JSON.stringify(['EVENT', note])); // re-broadcast after deletion
  assert.match(c.out.at(-1)[3], /deleted/);
  assert.equal(store.query({ ids: [note.id] }).length, 0);
});

test('live subscriptions receive matching new events; tag filters and limits work', () => {
  const me = keypair();
  const { handler } = setup([me.pk]);
  const sub = conn(); handler.open(sub);
  handler.message(sub, JSON.stringify(['REQ', 'live', { kinds: [1], '#t': ['nostr'] }]));
  assert.deepEqual(sub.out, [['EOSE', 'live']]);
  assert.equal(sub.attached, 1);
  const writer = conn(); handler.open(writer);
  handler.message(writer, JSON.stringify(['EVENT', sign(me.sk, 1, 'no tag')]));
  handler.message(writer, JSON.stringify(['EVENT', sign(me.sk, 1, 'tagged', [['t', 'nostr']])]));
  assert.equal(sub.out.length, 2);
  assert.equal(sub.out[1][2].content, 'tagged');
  handler.message(sub, JSON.stringify(['CLOSE', 'live']));
  handler.message(writer, JSON.stringify(['EVENT', sign(me.sk, 1, 'after close', [['t', 'nostr']])]));
  assert.equal(sub.out.length, 2);
  for (let i = 0; i < 5; i++) handler.message(writer, JSON.stringify(['EVENT', sign(me.sk, 1, 'n' + i)]));
  const r = conn(); handler.open(r);
  handler.message(r, JSON.stringify(['REQ', 'lim', { kinds: [1], limit: 2 }]));
  assert.equal(r.out.filter(m => m[0] === 'EVENT').length, 2);
  handler.message(r, JSON.stringify(['REQ', 'bad', { kinds: 'oops' }]));
  assert.equal(r.out.at(-1)[0], 'CLOSED');
});

test('matches() mirrors SQL filter semantics', () => {
  const me = keypair();
  const e = sign(me.sk, 1, 'x', [['t', 'a'], ['p', 'b'.repeat(64)]], 1000);
  assert.ok(matches({ kinds: [1], authors: [me.pk], '#t': ['a'], since: 999, until: 1001 }, e));
  assert.ok(!matches({ '#t': ['zzz'] }, e));
  assert.ok(!matches({ until: 999 }, e));
});
