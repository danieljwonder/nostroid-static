import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/store.js';
import { sync } from '../src/source/sync.js';
import { keypair, sign, tmpdir, config, memoryFetcher } from './helpers.js';

test('first sync is full, later syncs are incremental with overlap', async () => {
  const me = keypair();
  const cfg = config(me.pk);
  const store = new EventStore(await tmpdir());
  const fetcher = memoryFetcher([sign(me.sk, 1, 'a', [], 1000), sign(me.sk, 30023, 'b', [['d', 'b']], 1001)]);
  const first = await sync({ config: cfg, store, fetcher, now: () => 5000 });
  assert.equal(first.incremental, false);
  assert.equal(first.added, 2);
  assert.equal(fetcher.calls[0].since, undefined);
  assert.deepEqual(fetcher.calls[0].authors, [me.pk]);
  const second = await sync({ config: cfg, store, fetcher, now: () => 6000, overlap: 600 });
  assert.equal(second.incremental, true);
  assert.equal(fetcher.calls[1].since, 4400);
  const full = await sync({ config: cfg, store, fetcher, full: true });
  assert.equal(full.incremental, false);
});

test('only requests kinds for enabled features', async () => {
  const me = keypair();
  const cfg = config(me.pk, { features: { notes: false, links: false } });
  const store = new EventStore(await tmpdir());
  const fetcher = memoryFetcher([]);
  await sync({ config: cfg, store, fetcher });
  assert.deepEqual(fetcher.calls[0].kinds, [0, 5, 10002, 30023]);
});

test('outbox: also queries write relays from the owner NIP-65 list', async () => {
  const me = keypair();
  const cfg = config(me.pk); // relays: wss://relay.example
  const store = new EventStore(await tmpdir());
  const relayList = sign(me.sk, 10002, '', [['r', 'wss://relay.example/'], ['r', 'wss://write.example', 'write'], ['r', 'wss://read.example', 'read']], 10);
  const onlyOnOutbox = sign(me.sk, 1, 'only on my outbox', [], 20);
  const seen = [];
  const fetcher = async (relays, filter) => { seen.push(relays); return relays.includes('wss://write.example') ? [onlyOnOutbox] : [relayList]; };
  const s = await sync({ config: cfg, store, fetcher });
  assert.deepEqual(seen, [['wss://relay.example'], ['wss://write.example']]);
  assert.deepEqual(s.outbox, ['wss://write.example']);
  assert.equal(s.added, 2);
  const off = await sync({ config: { ...cfg, outbox: false }, store: new EventStore(await tmpdir()), fetcher });
  assert.deepEqual(off.outbox, []);
});
