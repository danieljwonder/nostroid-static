#!/usr/bin/env node
// Publish one NIP-F4 episode (kind 54) from a JSON description, signed with the show key.
//
//   NSEC=<show nsec or 64-hex>  node scripts/publish-episode.js episode.json [--relay wss://... ...] [--dry-run]
//
// episode.json:
//   { "title", "audio": [{ "url", "type"?, "length"? }] | "https://…mp3", "description"?, "image"?,
//     "duration"? (seconds), "published_at"? (ISO 8601 or unix seconds), "guid"? (podcast:item:guid),
//     "feed_guid"? (podcast:guid), "website"?, "content"? (Markdown show notes), "relays"?: [...] }
//
// Prints the event id and per-relay results as JSON on stdout. Exit 1 if no relay accepted it.
// Never prints the key. Run it under `op run` (or similar) so the key is only in this process's env.
import fs from 'node:fs/promises';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { decode, npubEncode } from 'nostr-tools/nip19';

export function episodeEvent(spec, now = Math.floor(Date.now() / 1000)) {
  const title = String(spec.title || '').trim();
  if (!title) throw new Error('title is required');
  const audio = (Array.isArray(spec.audio) ? spec.audio : [typeof spec.audio === 'string' ? { url: spec.audio } : spec.audio]).filter(Boolean);
  if (!audio.length || !audio.every(a => /^https:\/\//.test(a.url || ''))) throw new Error('audio needs at least one https URL');
  const ts = v => (v == null || v === '' ? null : typeof v === 'number' ? v : Math.floor(Date.parse(v) / 1000));
  const published = ts(spec.published_at);
  if (spec.published_at != null && !Number.isFinite(published)) throw new Error('published_at must be ISO 8601 or unix seconds');
  const tags = [['title', title]];
  if (spec.description) tags.push(['description', String(spec.description).trim()]);
  if (spec.image) { if (!/^https:\/\//.test(spec.image)) throw new Error('image must be https'); tags.push(['image', spec.image]); }
  for (const a of audio) tags.push(['audio', a.url, a.type || 'audio/mpeg', ...(a.length ? [String(a.length)] : [])]);
  if (spec.duration) tags.push(['duration', String(Math.round(Number(spec.duration)))]);
  if (published) tags.push(['published_at', String(published)]);
  if (spec.guid) tags.push(['i', `podcast:item:guid:${spec.guid}`]);
  if (spec.feed_guid) tags.push(['i', `podcast:guid:${spec.feed_guid}`]);
  if (spec.website) tags.push(['r', spec.website]);
  tags.push(['client', 'nostroid']);
  return { kind: 54, created_at: published || now, tags, content: String(spec.content || '') };
}

export function keyFromEnv(env = process.env) {
  const v = String(env.NSEC || '').trim();
  if (!v) throw new Error('NSEC is not set');
  if (/^[0-9a-f]{64}$/i.test(v)) return Uint8Array.from(Buffer.from(v, 'hex'));
  const d = decode(v);
  if (d.type !== 'nsec') throw new Error('NSEC must be an nsec or 64-hex private key');
  return d.data;
}

/** Send one event to one relay; resolve { ok, message }. */
export function publishTo(url, event, { timeoutMs = 8000, WS = globalThis.WebSocket } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done) { done = true; try { ws.close(); } catch {} resolve(r); } };
    const ws = new WS(url);
    const timer = setTimeout(() => finish({ ok: false, message: 'timeout' }), timeoutMs);
    ws.addEventListener('open', () => ws.send(JSON.stringify(['EVENT', event])));
    ws.addEventListener('message', m => {
      try { const d = JSON.parse(m.data); if (d[0] === 'OK' && d[1] === event.id) { clearTimeout(timer); finish({ ok: !!d[2], message: d[3] || '' }); } } catch {}
    });
    ws.addEventListener('error', () => { clearTimeout(timer); finish({ ok: false, message: 'connection error' }); });
    ws.addEventListener('close', () => { clearTimeout(timer); finish({ ok: false, message: 'closed before OK' }); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const relays = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--relay') relays.push(args[++i]);
  const dry = args.includes('--dry-run');
  if (!file) { console.error('usage: publish-episode.js episode.json [--relay wss://…]... [--dry-run]'); process.exit(2); }
  const spec = JSON.parse(await fs.readFile(file, 'utf8'));
  const targets = [...new Set([...(spec.relays || []), ...relays])];
  const sk = keyFromEnv();
  const event = finalizeEvent(episodeEvent(spec), sk);
  const out = { id: event.id, pubkey: npubEncode(getPublicKey(sk)), relays: {} };
  if (dry) { out.event = event; console.log(JSON.stringify(out, null, 2)); return; }
  if (!targets.length) throw new Error('no relays: set "relays" in the JSON or pass --relay');
  const results = await Promise.all(targets.map(r => publishTo(r, event)));
  targets.forEach((r, i) => { out.relays[r] = results[i]; });
  console.log(JSON.stringify(out, null, 2));
  if (!results.some(r => r.ok)) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
