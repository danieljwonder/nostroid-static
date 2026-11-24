import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent } from 'nostr-tools/pure';
import { showEvents, claimEvents, CLAIM_KINDS } from '../scripts/publish-show.js';
import { buildModel } from '../core/model.js';
import { reduceEvents } from '../core/events.js';
import { keypair, config } from './helpers.js';

test('showEvents: kind 10154 tags, optional kind 0 profile, validation', () => {
  const host = keypair();
  const [meta, profile] = showEvents({ title: 'Show', description: 'd', image: 'https://i/x.png', website: 'https://w/', hosts: [{ pubkey: host.pk, role: 'host' }], profile: { name: 'Show', about: 'a', nip05: 'show@w', bot: true } }, 5);
  assert.equal(meta.kind, 10154);
  assert.deepEqual(meta.tags, [['title', 'Show'], ['description', 'd'], ['image', 'https://i/x.png'], ['website', 'https://w/'], ['p', host.pk, 'host']]);
  assert.equal(profile.kind, 0);
  assert.deepEqual(JSON.parse(profile.content), { name: 'Show', about: 'a', nip05: 'show@w', bot: true });
  assert.equal(showEvents({ title: 'x' }).length, 1);
  assert.throws(() => showEvents({ title: 'x', image: 'http://i' }), /https/);
  assert.throws(() => showEvents({ title: 'x', hosts: [{ pubkey: 'nope' }] }), /64-hex/);
  assert.throws(() => showEvents({ title: 'x', hosts: [{ pubkey: host.pk, role: 'owner' }] }), /role/);
});

test('claimEvents: both disputed kinds, deduped lowercase p tags', () => {
  const a = keypair(), b = keypair();
  const ev = claimEvents([a.pk.toUpperCase(), b.pk, a.pk], 9);
  assert.deepEqual(ev.map(e => e.kind), CLAIM_KINDS);
  for (const e of ev) assert.deepEqual(e.tags, [['p', a.pk], ['p', b.pk]]);
  assert.throws(() => claimEvents([]), /64-hex/);
});

test('round trip: signed 10154 drives the show page model', () => {
  const me = keypair(), show = keypair();
  const [meta] = showEvents({ title: 'Buidlberg', description: 'Briefing', hosts: [{ pubkey: me.pk, role: 'host' }] }).map(e => finalizeEvent(e, show.sk));
  const cfg = config(me.pk, { podcasts: [{ pubkey: show.pk, path: '/b/' }] });
  const m = buildModel(reduceEvents([meta], [me.pk, show.pk]).events, cfg);
  assert.equal(m.shows[0].title, 'Buidlberg');
  assert.deepEqual(m.shows[0].hosts, [{ pubkey: me.pk, role: 'host' }]);
});
