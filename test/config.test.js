import test from 'node:test';
import assert from 'node:assert/strict';
import { npubEncode } from 'nostr-tools/nip19';
import { normalizePubkey, resolveConfig } from '../src/config.js';
import { keypair } from './helpers.js';

test('pubkey accepts hex and npub', () => {
  const { pk } = keypair();
  assert.equal(normalizePubkey(pk.toUpperCase()), pk);
  assert.equal(normalizePubkey(npubEncode(pk)), pk);
  assert.throws(() => normalizePubkey('nsec1abc'), /npub or a 64-character hex/);
  assert.throws(() => normalizePubkey(''), /npub/);
});

test('site.url is required and normalised with a trailing slash', () => {
  const { pk } = keypair();
  assert.throws(() => resolveConfig({ pubkey: pk, relays: ['wss://r'] }), /site.url is required/);
  const c = resolveConfig({ pubkey: pk, relays: ['wss://r'], site: { url: 'https://example.com/blog' } });
  assert.equal(c.site.url, 'https://example.com/blog/');
  assert.equal(c.basePath, '/blog/');
});

test('relays must be websockets', () => {
  const { pk } = keypair();
  assert.throws(() => resolveConfig({ pubkey: pk, relays: ['https://r'], site: { url: 'https://x.com' } }), /ws:\/\//);
});
