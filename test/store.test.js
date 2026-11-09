import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/store.js';
import { keypair, sign, tmpdir } from './helpers.js';

test('rejects bad signatures and other authors', async () => {
  const me = keypair(), them = keypair();
  const store = new EventStore(await tmpdir());
  const good = sign(me.sk, 1, 'hi');
  const forged = { ...sign(me.sk, 1, 'original'), content: 'tampered' };
  const foreign = sign(them.sk, 1, 'not mine');
  const s = await store.apply([good, forged, foreign], me.pk);
  assert.equal(s.added, 1);
  assert.equal(s.rejected, 2);
  assert.deepEqual((await store.all()).map(e => e.id), [good.id]);
});

test('replaceable and addressable events keep only the newest version', async () => {
  const me = keypair();
  const store = new EventStore(await tmpdir());
  const p1 = sign(me.sk, 0, '{"name":"old"}', [], 100);
  const p2 = sign(me.sk, 0, '{"name":"new"}', [], 200);
  const a1 = sign(me.sk, 30023, 'v1', [['d', 'hello']], 100);
  const a2 = sign(me.sk, 30023, 'v2', [['d', 'hello']], 200);
  const b1 = sign(me.sk, 30023, 'other', [['d', 'world']], 150);
  await store.apply([p2, a1, b1], me.pk);
  await store.apply([p1, a2], me.pk); // older profile arrives late, newer article arrives
  const all = await store.all();
  assert.equal(all.length, 3);
  assert.equal(all.find(e => e.kind === 0).content, '{"name":"new"}');
  assert.equal(all.find(e => e.kind === 30023 && e.tags[0][1] === 'hello').content, 'v2');
});

test('NIP-09 deletions remove events and stay deleted on re-sync', async () => {
  const me = keypair();
  const store = new EventStore(await tmpdir());
  const note = sign(me.sk, 1, 'oops');
  const post = sign(me.sk, 30023, 'gone', [['d', 'bye']], 100);
  const del = sign(me.sk, 5, '', [['e', note.id], ['a', `30023:${me.pk}:bye`]], 200);
  await store.apply([note, post], me.pk);
  const s = await store.apply([del], me.pk);
  assert.equal(s.deleted, 2);
  await store.apply([note, post], me.pk); // relays send them again
  const kinds = (await store.all()).map(e => e.kind);
  assert.deepEqual(kinds, [5]);
});
