import { verifyEvent } from 'nostr-tools/pure';

export const isReplaceable = kind => kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
export const isAddressable = kind => kind >= 30000 && kind < 40000;
export const dTag = e => (e.tags.find(t => t[0] === 'd') || [])[1] ?? '';
export const tag = (e, name) => (e.tags.find(t => t[0] === name) || [])[1];

export function eventKey(e) {
  if (isReplaceable(e.kind)) return `${e.kind}:${e.pubkey}`;
  if (isAddressable(e.kind)) return `${e.kind}:${e.pubkey}:${dTag(e)}`;
  return e.id;
}

export function canonical(e) {
  return { id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig };
}

export function wellFormed(e) {
  return e && typeof e === 'object'
    && /^[0-9a-f]{64}$/.test(e.id || '') && /^[0-9a-f]{64}$/.test(e.pubkey || '') && /^[0-9a-f]{128}$/.test(e.sig || '')
    && Number.isInteger(e.created_at) && Number.isInteger(e.kind) && e.kind >= 0 && e.kind < 65536
    && Array.isArray(e.tags) && e.tags.every(t => Array.isArray(t) && t.every(x => typeof x === 'string'))
    && typeof e.content === 'string';
}

/** NIP-01 replacement rule: newer created_at wins; tie -> lowest id. */
export function newer(a, b) {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * Reduce a bag of events (from any number of relays) to the current set for one author:
 * verified signatures only, latest version of replaceable/addressable events, NIP-09 deletions applied.
 * Pure; the same input always gives the same output.
 */
export function reduceEvents(events, owner, { verify = verifyEvent } = {}) {
  const owners = new Set([].concat(owner));
  const byKey = new Map();
  const rejected = [];
  for (const raw of events) {
    if (!wellFormed(raw) || !owners.has(raw.pubkey)) { rejected.push(raw); continue; }
    const e = canonical(raw);
    if (!verify(e)) { rejected.push(raw); continue; }
    const k = eventKey(e);
    const prev = byKey.get(k);
    if (!prev || newer(prev, e) === e) byKey.set(k, e);
  }
  for (const del of [...byKey.values()].filter(e => e.kind === 5)) {
    for (const t of del.tags) {
      if (t[0] === 'e') for (const [k, ev] of byKey) { if (ev.id === t[1] && ev.kind !== 5 && ev.pubkey === del.pubkey) byKey.delete(k); }
      else if (t[0] === 'a') { const ev = byKey.get(t[1]); if (ev && ev.pubkey === del.pubkey && ev.created_at <= del.created_at) byKey.delete(t[1]); }
    }
  }
  const out = [...byKey.values()].sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));
  return { events: out, rejected: rejected.length };
}

/** NIP-65: relays the owner writes to. */
export function outboxRelays(events, owner) {
  const list = events.filter(e => e.kind === 10002 && e.pubkey === owner).sort((a, b) => b.created_at - a.created_at)[0];
  if (!list) return [];
  return list.tags
    .filter(t => t[0] === 'r' && /^wss?:\/\//.test(t[1] || '') && (t[2] === undefined || t[2] === 'write'))
    .map(t => t[1].trim().replace(/\/+$/, ''));
}
