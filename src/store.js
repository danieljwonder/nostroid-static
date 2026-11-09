import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyEvent } from 'nostr-tools/pure';

export function isReplaceable(kind) {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
}
export function isAddressable(kind) {
  return kind >= 30000 && kind < 40000;
}
export function dTag(e) {
  return (e.tags.find(t => t[0] === 'd') || [])[1] ?? '';
}
export function eventKey(e) {
  if (isReplaceable(e.kind)) return `${e.kind}:${e.pubkey}`;
  if (isAddressable(e.kind)) return `${e.kind}:${e.pubkey}:${dTag(e)}`;
  return e.id;
}
// NIP-01: newer created_at wins; tie -> lowest id wins
function newer(a, b) {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? a : b;
  return a.id < b.id ? a : b;
}
function canonical(e) {
  return { id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig };
}

export class EventStore {
  constructor(dir) {
    this.dir = dir;
    this.eventsDir = path.join(dir, 'events');
  }

  async all() {
    let files = [];
    try { files = await fs.readdir(this.eventsDir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const out = [];
    for (const f of files.filter(f => f.endsWith('.json')).sort()) {
      out.push(JSON.parse(await fs.readFile(path.join(this.eventsDir, f), 'utf8')));
    }
    return out;
  }

  async readJson(name, fallback) {
    try { return JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  }
  async writeJson(name, value) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, name), JSON.stringify(value, null, 2) + '\n');
  }
  readMeta() { return this.readJson('meta.json', {}); }
  writeMeta(m) { return this.writeJson('meta.json', m); }
  readSlugs() { return this.readJson('slugs.json', {}); }
  writeSlugs(s) {
    const sorted = Object.fromEntries(Object.entries(s).sort(([a], [b]) => (a < b ? -1 : 1)));
    return this.writeJson('slugs.json', sorted);
  }

  /** Merge verified events from `owner` into the store. Returns counts. */
  async apply(incoming, owner) {
    const current = await this.all();
    const byKey = new Map(current.map(e => [eventKey(e), e]));
    const stats = { received: incoming.length, added: 0, replaced: 0, rejected: 0, deleted: 0, unchanged: 0 };

    for (const raw of incoming) {
      const e = canonical(raw);
      if (e.pubkey !== owner || !verifyEvent({ ...e })) { stats.rejected++; continue; }
      const key = eventKey(e);
      const prev = byKey.get(key);
      if (!prev) { byKey.set(key, e); stats.added++; continue; }
      if (prev.id === e.id) { stats.unchanged++; continue; }
      const win = newer(prev, e);
      if (win === e) { byKey.set(key, e); stats.replaced++; } else stats.unchanged++;
    }

    // NIP-09 deletions by the owner (kind 5 events are kept so re-syncs stay deleted)
    const deletions = [...byKey.values()].filter(e => e.kind === 5);
    for (const del of deletions) {
      for (const t of del.tags) {
        if (t[0] === 'e') {
          for (const [k, ev] of byKey) if (ev.id === t[1] && ev.kind !== 5) { byKey.delete(k); stats.deleted++; }
        } else if (t[0] === 'a') {
          const ev = byKey.get(t[1]);
          if (ev && ev.created_at <= del.created_at) { byKey.delete(t[1]); stats.deleted++; }
        }
      }
    }

    await fs.mkdir(this.eventsDir, { recursive: true });
    const keepIds = new Set([...byKey.values()].map(e => e.id));
    for (const e of current) if (!keepIds.has(e.id)) await fs.rm(path.join(this.eventsDir, `${e.id}.json`), { force: true });
    const currentIds = new Set(current.map(e => e.id));
    for (const e of byKey.values()) {
      if (!currentIds.has(e.id)) await fs.writeFile(path.join(this.eventsDir, `${e.id}.json`), JSON.stringify(e, null, 2) + '\n');
    }
    return stats;
  }
}
