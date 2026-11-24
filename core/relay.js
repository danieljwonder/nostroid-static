/**
 * Minimal NIP-01 client. `connect(url)` must return a WebSocket-like object
 * (send/close/addEventListener). Browsers pass `url => new WebSocket(url)`;
 * Workers pass a fetch+Upgrade adapter; tests pass a fake.
 */
export function makeRelayClient(connect, { timeoutMs = 6000, log = () => {} } = {}) {
  function query(url, filters) {
    return new Promise(resolve => {
      const events = [];
      let ws, done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); try { ws && ws.close(); } catch {} resolve(events); };
      const timer = setTimeout(() => { log(`${url}: timeout`); finish(); }, timeoutMs);
      const sub = 'n' + Math.random().toString(36).slice(2, 10);
      try { ws = connect(url); } catch (e) { log(`${url}: ${e.message}`); return finish(); }
      ws.addEventListener('open', () => ws.send(JSON.stringify(['REQ', sub, ...filters])));
      ws.addEventListener('message', ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m[0] === 'EVENT' && m[1] === sub && m[2]) events.push(m[2]);
        else if (m[0] === 'EOSE' && m[1] === sub) finish();
        else if (m[0] === 'CLOSED' && m[1] === sub) finish();
      });
      ws.addEventListener('error', () => finish());
      ws.addEventListener('close', () => finish());
    });
  }

  /** Query all relays in parallel; return the union, deduped by id. */
  async function fetchAll(relays, filters) {
    const results = await Promise.all([...new Set(relays)].map(r => query(r, filters)));
    const seen = new Map();
    for (const list of results) for (const e of list) if (e && e.id && !seen.has(e.id)) seen.set(e.id, e);
    return [...seen.values()];
  }

  return { query, fetchAll };
}

/** Everything the site needs for one author (or a list of them), paginating backwards until relays run dry. */
export async function fetchAuthor(client, relays, pubkey, kinds, { since, pageLimit = 500, maxPages = 40 } = {}) {
  const all = new Map();
  let until;
  for (let i = 0; i < maxPages; i++) {
    const f = { authors: [].concat(pubkey), kinds, limit: pageLimit };
    if (since !== undefined) f.since = since;
    if (until !== undefined) f.until = until;
    const batch = await client.fetchAll(relays, [f]);
    let fresh = 0, oldest = Infinity;
    for (const e of batch) { if (!all.has(e.id)) { all.set(e.id, e); fresh++; } oldest = Math.min(oldest, e.created_at); }
    if (fresh === 0 || batch.length < pageLimit / 4) break;
    if (since !== undefined && oldest <= since) break;
    until = oldest;
  }
  return [...all.values()];
}
