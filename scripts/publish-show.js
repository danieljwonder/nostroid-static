#!/usr/bin/env node
// NIP-F4 show-level events.
//
//   NSEC=<show key>   node scripts/publish-show.js metadata show.json [--relay wss://…]... [--dry-run]
//       show.json: { "title", "description"?, "image"?, "website"?, "hosts"?: [{ "pubkey", "role"? }],
//                    "profile"?: { "name", "about"?, "picture"?, "website"?, "nip05"?, "bot"? }, "relays"?: [...] }
//       Signs kind 10154 (show metadata) and, when "profile" is given, kind 0 for the show key.
//
//   NSEC=<host key>   node scripts/publish-show.js claim <show-pubkey>... [--relay wss://…]... [--dry-run]
//       Signs the host's "authored podcasts" counter-claim. The NIP's prose says kind 10164 and its
//       example says 10064 (nostr-protocol/nips PR #2535 still open), so both are published.
//
// Prints JSON (event ids, per-relay results). Never prints the key; run under `op run`.
import fs from 'node:fs/promises';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { keyFromEnv, publishTo } from './publish-episode.js';

const hex = v => /^[0-9a-f]{64}$/i.test(v || '');
const https = v => /^https:\/\//.test(v || '');

export function showEvents(spec, now = Math.floor(Date.now() / 1000)) {
  const title = String(spec.title || '').trim();
  if (!title) throw new Error('title is required');
  const tags = [['title', title]];
  if (spec.description) tags.push(['description', String(spec.description).trim()]);
  if (spec.image) { if (!https(spec.image)) throw new Error('image must be https'); tags.push(['image', spec.image]); }
  if (spec.website) { if (!https(spec.website)) throw new Error('website must be https'); tags.push(['website', spec.website]); }
  for (const h of spec.hosts || []) {
    if (!hex(h.pubkey)) throw new Error('host pubkey must be 64-hex');
    if (h.role && !['host', 'cohost', 'editor'].includes(h.role)) throw new Error('host role must be host, cohost or editor');
    tags.push(['p', h.pubkey.toLowerCase(), ...(h.role ? [h.role] : [])]);
  }
  const out = [{ kind: 10154, created_at: now, tags, content: '' }];
  if (spec.profile) {
    const p = spec.profile;
    const profile = { name: String(p.name || title) };
    for (const k of ['about', 'nip05', 'lud16']) if (p[k]) profile[k] = String(p[k]);
    for (const k of ['picture', 'website', 'banner']) if (p[k]) { if (!https(p[k])) throw new Error(`profile.${k} must be https`); profile[k] = p[k]; }
    if (p.bot) profile.bot = true;
    out.push({ kind: 0, created_at: now, tags: [], content: JSON.stringify(profile) });
  }
  return out;
}

export const CLAIM_KINDS = [10164, 10064];

export function claimEvents(showPubkeys, now = Math.floor(Date.now() / 1000)) {
  const keys = [...new Set(showPubkeys.map(k => String(k).toLowerCase()))];
  if (!keys.length || !keys.every(hex)) throw new Error('show pubkeys must be 64-hex');
  return CLAIM_KINDS.map(kind => ({ kind, created_at: now, tags: keys.map(k => ['p', k]), content: '' }));
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.shift();
  const relays = [];
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--relay') relays.push(args[++i]);
    else if (args[i] === '--dry-run') continue;
    else pos.push(args[i]);
  }
  const dry = args.includes('--dry-run');
  let events, targets = relays;
  if (mode === 'metadata') {
    const spec = JSON.parse(await fs.readFile(pos[0], 'utf8'));
    events = showEvents(spec);
    targets = [...new Set([...(spec.relays || []), ...relays])];
  } else if (mode === 'claim') {
    events = claimEvents(pos);
  } else {
    console.error('usage: publish-show.js metadata show.json | claim <show-pubkey>...  [--relay wss://…]... [--dry-run]');
    process.exit(2);
  }
  const sk = keyFromEnv();
  const signed = events.map(e => finalizeEvent(e, sk));
  const out = { pubkey: npubEncode(getPublicKey(sk)), events: signed.map(e => ({ kind: e.kind, id: e.id, relays: {} })) };
  if (dry) { out.events = signed; console.log(JSON.stringify(out, null, 2)); return; }
  if (!targets.length) throw new Error('no relays: set "relays" in the JSON or pass --relay');
  let any = false;
  for (const [i, e] of signed.entries()) {
    const results = await Promise.all(targets.map(r => publishTo(r, e)));
    targets.forEach((r, j) => { out.events[i].relays[r] = results[j]; if (results[j].ok) any = true; });
  }
  console.log(JSON.stringify(out, null, 2));
  if (!any) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
