import test from 'node:test';
import assert from 'node:assert/strict';
import { SiteStore } from '../server/cloudflare/store.js';
import { memorySql } from './sqlite-adapter.js';
import { respond } from '../core/site.js';
import { reduceEvents } from '../core/events.js';
import { keypair, sign, config } from './helpers.js';

test('SiteStore.replaceAll reports change only when the set differs', () => {
  const me = keypair();
  const s = new SiteStore(memorySql());
  const a = sign(me.sk, 1, 'a'), b = sign(me.sk, 1, 'b');
  assert.equal(s.replaceAll([a, b]), true);
  assert.equal(s.replaceAll([a, b]), false);
  assert.equal(s.replaceAll([a]), true);
  assert.deepEqual(s.allEvents().map(e => e.id), [a.id]);
  s.setMeta('lastSync', 123); assert.equal(s.meta('lastSync'), '123');
});

test('server pipeline: store -> respond gives identical HTML to a direct render', () => {
  const me = keypair();
  const cfg = config(me.pk);
  const ev = [sign(me.sk, 0, '{"name":"Ada"}', [], 100), sign(me.sk, 1, 'hello world', [], 200)];
  const s = new SiteStore(memorySql());
  s.replaceAll(reduceEvents(ev, me.pk).events);
  const viaStore = respond(s.allEvents(), cfg, '/');
  const direct = respond(reduceEvents(ev, me.pk).events, cfg, '/');
  assert.equal(viaStore.body, direct.body);
  assert.match(viaStore.body, /hello world/);
});
