import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, verifyEvent, generateSecretKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { episodeEvent, keyFromEnv, publishTo } from '../scripts/publish-episode.js';
import { buildModel } from '../core/model.js';
import { reduceEvents } from '../core/events.js';
import { keypair, config } from './helpers.js';

const spec = {
  title: 'Ep 1', description: 'd', audio: 'https://cdn.example/1.mp3', duration: 358.4, published_at: '2026-11-24T19:09:05+00:00',
  guid: 'https://example.com/crypto/episodes/2026-11-25', feed_guid: 'b1a5b6a0-0000-5000-8000-000000000000', content: '## Notes'
};

test('episodeEvent: tags per NIP-F4 + NIP-73, created_at = published_at, validation', () => {
  const e = episodeEvent(spec);
  assert.equal(e.kind, 54);
  assert.equal(e.created_at, Math.floor(Date.parse(spec.published_at) / 1000));
  const t = Object.fromEntries(e.tags.map(x => [x[0] + (x[0] === 'i' ? ':' + x[1].split(':')[1] : ''), x]));
  assert.deepEqual(t.title, ['title', 'Ep 1']);
  assert.deepEqual(t.audio, ['audio', 'https://cdn.example/1.mp3', 'audio/mpeg']);
  assert.deepEqual(t.duration, ['duration', '358']);
  assert.deepEqual(t['i:item'], ['i', 'podcast:item:guid:https://example.com/crypto/episodes/2026-11-25']);
  assert.deepEqual(t['i:guid'], ['i', 'podcast:guid:b1a5b6a0-0000-5000-8000-000000000000']);
  assert.equal(e.content, '## Notes');
  assert.throws(() => episodeEvent({ ...spec, audio: 'http://x' }), /https/);
  assert.throws(() => episodeEvent({ ...spec, title: ' ' }), /title/);
  assert.throws(() => episodeEvent({ ...spec, published_at: 'yesterday' }), /published_at/);
  assert.equal(episodeEvent({ title: 'x', audio: [{ url: 'https://a/1.mp3', type: 'audio/aac', length: 12 }] }, 5).created_at, 5);
});

test('keyFromEnv accepts nsec and hex, never anything else', () => {
  const sk = generateSecretKey();
  assert.deepEqual(keyFromEnv({ NSEC: nsecEncode(sk) }), sk);
  assert.deepEqual(keyFromEnv({ NSEC: Buffer.from(sk).toString('hex') }), sk);
  assert.throws(() => keyFromEnv({ NSEC: 'npub1pe7javs36urdzttcr3krwujn97l4tslzjzvfjp582gn4kmmsh5wsma42nc' }), /nsec/);
  assert.throws(() => keyFromEnv({}), /not set/);
});

test('round trip: a published episode renders in a Nostroid site model', () => {
  const me = keypair(), show = keypair();
  const e = finalizeEvent(episodeEvent(spec), show.sk);
  assert.ok(verifyEvent(e));
  const cfg = config(me.pk, { podcasts: [{ pubkey: show.pk, path: '/show/' }] });
  const m = buildModel(reduceEvents([e], [me.pk, show.pk]).events, cfg);
  assert.equal(m.shows[0].episodes[0].slug, '2026-11-25');
  assert.equal(m.shows[0].episodes[0].duration, 358);
});

test('publishTo: resolves on OK, false on rejection, times out', async () => {
  const sk = generateSecretKey();
  const e = finalizeEvent({ kind: 54, created_at: 1, tags: [['title', 'x'], ['audio', 'https://a/1.mp3']], content: '' }, sk);
  const fakeWS = reply => class {
    constructor() { this.l = {}; setTimeout(() => this.l.open?.(), 0); }
    addEventListener(t, f) { this.l[t] = f; }
    send(data) { const msg = JSON.parse(data); if (reply) setTimeout(() => this.l.message({ data: JSON.stringify(reply(msg[1])) }), 0); }
    close() {}
  };
  assert.deepEqual(await publishTo('wss://x', e, { WS: fakeWS(ev => ['OK', ev.id, true, '']) }), { ok: true, message: '' });
  assert.deepEqual(await publishTo('wss://x', e, { WS: fakeWS(ev => ['OK', ev.id, false, 'blocked: not allowed']) }), { ok: false, message: 'blocked: not allowed' });
  assert.deepEqual(await publishTo('wss://x', e, { WS: fakeWS(null), timeoutMs: 30 }), { ok: false, message: 'timeout' });
});
