import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { resolveConfig } from '../core/config.js';

export function keypair() {
  const sk = generateSecretKey();
  return { sk, pk: getPublicKey(sk) };
}
let clock = 1_700_000_000;
export function sign(sk, kind, content = '', tags = [], created_at = clock++) {
  return finalizeEvent({ kind, content, tags, created_at }, sk);
}
export async function tmpdir(name = 'nostroid-') {
  const base = process.env.TMPDIR || os.tmpdir();
  return fs.mkdtemp(path.join(base, name));
}
export function config(pk, extra = {}) {
  return resolveConfig({ pubkey: pk, relays: ['wss://relay.example'], site: { url: 'https://example.com/', title: 'Test Site', description: 'A test site' }, ...extra });
}
export const memoryFetcher = events => {
  const calls = [];
  const fn = async (relays, filter) => { calls.push(filter); return events.filter(e => filter.kinds.includes(e.kind) && (!filter.since || e.created_at >= filter.since)); };
  fn.calls = calls;
  return fn;
};
