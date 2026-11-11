import { verifyEvent } from 'nostr-tools/pure';
import { wellFormed, isReplaceable, isAddressable, dTag } from '../core/events.js';

export const MAX_EVENT_BYTES = 64 * 1024;
export const MAX_SUBS_PER_CONN = 20;
export const MAX_FILTER_LIMIT = 500;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, created_at INTEGER NOT NULL,
  d TEXT, raw TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ev_pk_kind_time ON events(pubkey, kind, created_at);
CREATE INDEX IF NOT EXISTS ev_time ON events(created_at);
CREATE TABLE IF NOT EXISTS tags (event_id TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tag_lookup ON tags(name, value);
CREATE TABLE IF NOT EXISTS deleted (id TEXT PRIMARY KEY);
`;

/**
 * Relay storage over any SQLite that exposes exec(sql, ...params) -> rows[] (Durable Objects
 * `sql.exec(...).toArray()`, or node:sqlite in tests).
 */
export class RelayStore {
  constructor(exec) { this.exec = exec; this.exec(SCHEMA); }

  has(id) { return this.exec('SELECT 1 FROM events WHERE id = ?', id).length > 0; }
  isDeleted(id) { return this.exec('SELECT 1 FROM deleted WHERE id = ?', id).length > 0; }

  /** Returns 'stored' | 'duplicate' | 'replaced-by-newer' | 'deleted'. Assumes the event is verified and allowed. */
  insert(e) {
    if (this.has(e.id)) return 'duplicate';
    if (this.isDeleted(e.id)) return 'deleted';
    const d = isAddressable(e.kind) ? dTag(e) : null;
    if (isReplaceable(e.kind) || isAddressable(e.kind)) {
      const rows = isAddressable(e.kind)
        ? this.exec('SELECT id, created_at FROM events WHERE pubkey = ? AND kind = ? AND d = ?', e.pubkey, e.kind, d)
        : this.exec('SELECT id, created_at FROM events WHERE pubkey = ? AND kind = ?', e.pubkey, e.kind);
      for (const r of rows) {
        if (r.created_at > e.created_at || (r.created_at === e.created_at && r.id < e.id)) return 'replaced-by-newer';
        this.remove(r.id);
      }
    }
    this.exec('INSERT INTO events (id, pubkey, kind, created_at, d, raw) VALUES (?, ?, ?, ?, ?, ?)', e.id, e.pubkey, e.kind, e.created_at, d, JSON.stringify(e));
    for (const t of e.tags) if (t.length >= 2 && t[0].length === 1) this.exec('INSERT INTO tags (event_id, name, value) VALUES (?, ?, ?)', e.id, t[0], t[1]);
    if (e.kind === 5) this.applyDeletion(e);
    return 'stored';
  }

  remove(id) {
    this.exec('DELETE FROM events WHERE id = ?', id);
    this.exec('DELETE FROM tags WHERE event_id = ?', id);
  }

  /** NIP-09: only the author may delete their own events. */
  applyDeletion(del) {
    for (const t of del.tags) {
      if (t[0] === 'e' && /^[0-9a-f]{64}$/.test(t[1] || '')) {
        const rows = this.exec('SELECT id FROM events WHERE id = ? AND pubkey = ? AND kind != 5', t[1], del.pubkey);
        for (const r of rows) this.remove(r.id);
        this.exec('INSERT OR IGNORE INTO deleted (id) VALUES (?)', t[1]);
      } else if (t[0] === 'a') {
        const [kind, pk, d] = String(t[1] || '').split(':');
        if (pk !== del.pubkey) continue;
        const rows = this.exec('SELECT id FROM events WHERE pubkey = ? AND kind = ? AND d = ? AND created_at <= ?', pk, Number(kind), d ?? '', del.created_at);
        for (const r of rows) this.remove(r.id);
      }
    }
  }

  /** NIP-01 filter -> rows (newest first). */
  query(filter) {
    const where = [], params = [];
    if (filter.ids) { where.push(`id IN (${filter.ids.map(() => '?').join(',')})`); params.push(...filter.ids); }
    if (filter.authors) { where.push(`pubkey IN (${filter.authors.map(() => '?').join(',')})`); params.push(...filter.authors); }
    if (filter.kinds) { where.push(`kind IN (${filter.kinds.map(() => '?').join(',')})`); params.push(...filter.kinds); }
    if (filter.since !== undefined) { where.push('created_at >= ?'); params.push(filter.since); }
    if (filter.until !== undefined) { where.push('created_at <= ?'); params.push(filter.until); }
    for (const [k, vals] of Object.entries(filter)) {
      if (k.length === 2 && k[0] === '#' && Array.isArray(vals) && vals.length) {
        where.push(`id IN (SELECT event_id FROM tags WHERE name = ? AND value IN (${vals.map(() => '?').join(',')}))`);
        params.push(k[1], ...vals);
      }
    }
    const limit = Math.min(Math.max(1, Number(filter.limit) || MAX_FILTER_LIMIT), MAX_FILTER_LIMIT);
    const sql = `SELECT raw FROM events${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id ASC LIMIT ?`;
    return this.exec(sql, ...params, limit).map(r => JSON.parse(r.raw));
  }

  count() { return this.exec('SELECT COUNT(*) AS n FROM events')[0].n; }
}

/** Does a stored event match a live subscription filter? (for broadcast) */
export function matches(filter, e) {
  if (filter.ids && !filter.ids.includes(e.id)) return false;
  if (filter.authors && !filter.authors.includes(e.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(e.kind)) return false;
  if (filter.since !== undefined && e.created_at < filter.since) return false;
  if (filter.until !== undefined && e.created_at > filter.until) return false;
  for (const [k, vals] of Object.entries(filter)) {
    if (k.length === 2 && k[0] === '#' && Array.isArray(vals)) {
      if (!e.tags.some(t => t[0] === k[1] && vals.includes(t[1]))) return false;
    }
  }
  return true;
}

export function validFilter(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return false;
  for (const k of ['ids', 'authors']) if (f[k] !== undefined && (!Array.isArray(f[k]) || !f[k].every(x => /^[0-9a-f]{1,64}$/.test(x)))) return false;
  if (f.kinds !== undefined && (!Array.isArray(f.kinds) || !f.kinds.every(Number.isInteger))) return false;
  for (const k of ['since', 'until', 'limit']) if (f[k] !== undefined && !Number.isInteger(f[k])) return false;
  return true;
}

/**
 * Protocol handler. Transport-agnostic: `conn` is { send(string), subs: Map, attach() } managed by the caller.
 * `opts.allowed` is a Set of hex pubkeys permitted to write; empty = nobody (safe default).
 */
export class RelayHandler {
  constructor(store, opts = {}) {
    this.store = store;
    this.allowed = opts.allowed || new Set();
    this.verify = opts.verify || verifyEvent;
    this.now = opts.now || (() => Math.floor(Date.now() / 1000));
    this.onStored = opts.onStored || (() => {});
    this.conns = new Set();
  }

  open(conn) { conn.subs = conn.subs || new Map(); this.conns.add(conn); }
  close(conn) { this.conns.delete(conn); }

  message(conn, text) {
    if (typeof text !== 'string') return conn.send(JSON.stringify(['NOTICE', 'binary messages are not supported']));
    if (text.length > MAX_EVENT_BYTES * 4) return conn.send(JSON.stringify(['NOTICE', 'message too large']));
    let m; try { m = JSON.parse(text); } catch { return conn.send(JSON.stringify(['NOTICE', 'invalid JSON'])); }
    if (!Array.isArray(m)) return conn.send(JSON.stringify(['NOTICE', 'expected an array']));
    switch (m[0]) {
      case 'EVENT': return this.onEvent(conn, m[1]);
      case 'REQ': return this.onReq(conn, m[1], m.slice(2));
      case 'CLOSE': { if (typeof m[1] === 'string') conn.subs.delete(m[1]); conn.attach?.(); return; }
      default: return conn.send(JSON.stringify(['NOTICE', `unknown command ${String(m[0]).slice(0, 20)}`]));
    }
  }

  onEvent(conn, e) {
    const ok = (id, accepted, msg) => conn.send(JSON.stringify(['OK', id, accepted, msg]));
    if (!wellFormed(e)) return ok(e && typeof e.id === 'string' ? e.id : '', false, 'invalid: malformed event');
    if (JSON.stringify(e).length > MAX_EVENT_BYTES) return ok(e.id, false, 'invalid: event too large');
    if (!this.allowed.has(e.pubkey)) return ok(e.id, false, 'restricted: this relay only accepts events from its owner');
    if (e.created_at > this.now() + 900) return ok(e.id, false, 'invalid: created_at is in the future');
    if (!this.verify(e)) return ok(e.id, false, 'invalid: bad signature');
    const r = this.store.insert(e);
    if (r === 'stored') {
      ok(e.id, true, '');
      this.broadcast(e);
      this.onStored(e);
    } else if (r === 'duplicate') ok(e.id, true, 'duplicate: already have this event');
    else if (r === 'replaced-by-newer') ok(e.id, false, 'invalid: a newer version already exists');
    else ok(e.id, false, 'blocked: this event was deleted by its author');
  }

  onReq(conn, subId, filters) {
    if (typeof subId !== 'string' || !subId || subId.length > 64) return conn.send(JSON.stringify(['NOTICE', 'invalid subscription id']));
    if (!filters.length || !filters.every(validFilter)) return conn.send(JSON.stringify(['CLOSED', subId, 'invalid: bad filter']));
    if (!conn.subs.has(subId) && conn.subs.size >= MAX_SUBS_PER_CONN) return conn.send(JSON.stringify(['CLOSED', subId, 'error: too many subscriptions']));
    conn.subs.set(subId, filters);
    conn.attach?.();
    const seen = new Set();
    for (const f of filters) for (const e of this.store.query(f)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      conn.send(JSON.stringify(['EVENT', subId, e]));
    }
    conn.send(JSON.stringify(['EOSE', subId]));
  }

  broadcast(e) {
    for (const c of this.conns) for (const [subId, filters] of c.subs) {
      if (filters.some(f => matches(f, e))) { try { c.send(JSON.stringify(['EVENT', subId, e])); } catch {} }
    }
  }
}

export function relayInfo(env) {
  return {
    name: env.RELAY_NAME || 'Nostroid Relay',
    description: env.RELAY_DESCRIPTION || 'A personal Nostr relay. Anyone can read; only the owner can write.',
    pubkey: env.RELAY_CONTACT_PUBKEY || undefined,
    software: 'https://github.com/danieljwonder/nostroid-static',
    version: '0.1.0',
    supported_nips: [1, 9, 11],
    limitation: { max_message_length: MAX_EVENT_BYTES * 4, max_subscriptions: MAX_SUBS_PER_CONN, max_limit: MAX_FILTER_LIMIT, auth_required: false, payment_required: false, restricted_writes: true }
  };
}
