import { syncKinds } from '../config.js';
import { relayFetcher } from './relays.js';

const norm = u => u.trim().replace(/\/+$/, '');

/** NIP-65: relays the owner writes to ("r" tags with no marker or marked "write"). */
export function outboxRelays(events, owner) {
  const list = events.filter(e => e.kind === 10002 && e.pubkey === owner).sort((a, b) => b.created_at - a.created_at)[0];
  if (!list) return [];
  return list.tags
    .filter(t => t[0] === 'r' && /^wss?:\/\//.test(t[1] || '') && (t[2] === undefined || t[2] === 'write'))
    .map(t => norm(t[1]));
}

/**
 * Pull the owner's events into the store.
 * Incremental by default (since last sync minus an overlap window); `full` re-reads everything.
 * With `config.outbox` (default on), relays from the owner's NIP-65 list are queried too.
 */
export async function sync({ config, store, fetcher = relayFetcher, full = false, overlap = 3600, now = () => Math.floor(Date.now() / 1000) }) {
  const meta = await store.readMeta();
  const startedAt = now();
  const filter = { authors: [config.pubkey], kinds: syncKinds(config) };
  if (!full && meta.lastSync) filter.since = Math.max(0, meta.lastSync - overlap);

  const configured = config.relays.map(norm);
  const stats = await store.apply(await fetcher(config.relays, filter), config.pubkey);

  let extra = [];
  if (config.outbox !== false) {
    const known = new Set(configured);
    extra = outboxRelays(await store.all(), config.pubkey).filter(r => !known.has(r));
    if (extra.length) {
      const more = await store.apply(await fetcher(extra, filter), config.pubkey);
      for (const k of ['received', 'added', 'replaced', 'rejected', 'deleted', 'unchanged']) stats[k] += more[k];
    }
  }

  await store.writeMeta({ ...meta, lastSync: startedAt });
  return { ...stats, incremental: filter.since !== undefined, relays: configured.length + extra.length, outbox: extra };
}
