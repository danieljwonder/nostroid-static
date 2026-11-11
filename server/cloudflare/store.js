export const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, kind INTEGER NOT NULL, raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ev_time ON events(created_at);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

/** Verified-event store for the site cache. Holds the reduced set only. */
export class SiteStore {
  constructor(exec) { this.exec = exec; this.exec(SCHEMA); }
  allEvents() { return this.exec('SELECT raw FROM events ORDER BY created_at DESC, id ASC').map(r => JSON.parse(r.raw)); }
  meta(k) { const r = this.exec('SELECT v FROM meta WHERE k = ?', k); return r.length ? r[0].v : null; }
  setMeta(k, v) { this.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, String(v)); }
  /** Replace the stored set with `events`; returns true if anything changed. */
  replaceAll(events) {
    const have = new Set(this.exec('SELECT id FROM events').map(r => r.id));
    const want = new Set(events.map(e => e.id));
    let changed = false;
    for (const id of have) if (!want.has(id)) { this.exec('DELETE FROM events WHERE id = ?', id); changed = true; }
    for (const e of events) if (!have.has(e.id)) { this.exec('INSERT INTO events (id, created_at, kind, raw) VALUES (?, ?, ?, ?)', e.id, e.created_at, e.kind, JSON.stringify(e)); changed = true; }
    return changed;
  }
}
