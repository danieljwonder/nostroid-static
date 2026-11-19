import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrefixes, isPassthrough } from '../server/passthrough.js';

test('passthrough prefixes: normalised, exact or nested match only', () => {
  const p = parsePrefixes(' /crypto, shop/ ,/, ');
  assert.deepEqual(p, ['/crypto', '/shop']);
  assert.ok(isPassthrough(p, '/crypto'));
  assert.ok(isPassthrough(p, '/crypto/feed.xml'));
  assert.ok(isPassthrough(p, '/shop/x'));
  assert.ok(!isPassthrough(p, '/cryptocurrency/'));
  assert.ok(!isPassthrough(p, '/'));
  assert.ok(!isPassthrough(parsePrefixes(''), '/crypto/'));
});

test('relay ping targets: legacy pair plus per-pubkey JSON targets', async () => {
  // pingTargets lives in the Cloudflare wrapper; import it without the cloudflare: module resolving.
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../relay/cloudflare/worker.js', import.meta.url), 'utf8'));
  const body = src.slice(src.indexOf('export function pingTargets'), src.indexOf('const CORS'));
  const pingTargets = new Function(body.replace('export function pingTargets', 'return function pingTargets') + '')();
  const env = { ON_EVENT_URL: 'https://a/_refresh', ON_EVENT_SECRET: 's1', ON_EVENT_TARGETS: JSON.stringify([{ url: 'https://b/_refresh', secret: 's2', pubkey: 'AB' }, { nope: 1 }]) };
  const t = pingTargets(env);
  assert.deepEqual(t, [
    { url: 'https://a/_refresh', secret: 's1', pubkey: '' },
    { url: 'https://b/_refresh', secret: 's2', pubkey: 'ab' }
  ]);
  assert.deepEqual(pingTargets({ ON_EVENT_TARGETS: 'not json' }), []);
});
