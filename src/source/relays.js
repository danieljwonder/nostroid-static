import { SimplePool } from 'nostr-tools/pool';

/**
 * Fetch every event matching `filter` from `relays`, paginating backwards with `until`.
 * Stops when a page brings nothing new.
 */
export async function relayFetcher(relays, filter, { maxWait = 8000, pageLimit = 500, maxPages = 200 } = {}) {
  const pool = new SimplePool();
  const seen = new Map();
  try {
    let until;
    for (let page = 0; page < maxPages; page++) {
      const f = { ...filter, limit: pageLimit, ...(until !== undefined ? { until } : {}) };
      const batch = await pool.querySync(relays, f, { maxWait });
      let fresh = 0;
      let oldest = Infinity;
      for (const e of batch) {
        if (!seen.has(e.id)) { seen.set(e.id, e); fresh++; }
        oldest = Math.min(oldest, e.created_at);
      }
      if (fresh === 0) break;
      if (filter.since !== undefined && oldest <= filter.since) break;
      until = oldest; // inclusive; dedupe + "nothing fresh" stop prevents loops
    }
    return [...seen.values()];
  } finally {
    pool.close(relays);
    pool.destroy?.();
  }
}
