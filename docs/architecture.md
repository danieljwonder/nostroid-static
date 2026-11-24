# Architecture

```
                 ┌──────────── Nostr relays: the source of truth ─────────────┐
                 │   your own relay (optional, owner-only writes) + outbox     │
                 └────────────────┬──────────────────────────────┬────────────┘
         BROWSER MODE             │                              │   SERVER LAYER (optional)
  static files on any host  ◀─────┘                              └────▶  Worker + Durable Object cache
  renders in the browser                                                renders HTML at request time
```

## `core/` (isomorphic)

No Node-only APIs. Runs unchanged in the browser, in a Worker and under `node --test`.

- `config.js`: validates and normalises the config (npub → hex, trailing slashes, defaults).
- `relay.js`: relay client over an injected `connect(url)` so the browser's `WebSocket` and the Worker's `fetch` + `Upgrade: websocket` share one implementation. Timeouts, dedupe, EOSE handling.
- `events.js`: signature verification, replaceable/addressable reduction, NIP-09 deletions, NIP-65 outbox extraction.
- `model.js`: events → content model (profile, posts, notes by month, links, NIP-F4 shows with episodes). Slugs are deterministic from the event set, so there is no slug file to keep.
- `render/`: pure functions from model to HTML strings. `routes.js` maps a path to a page and builds the view-models; `partials.js` holds the default markup; `theme.js` resolves a theme (partial overrides, colour scheme) and turns config tokens into CSS; `layout.js` holds the SEO contract (title, description, canonical, Open Graph, JSON-LD) in one place, out of a theme's reach. See `THEMES.md`.
- `site.js`: `respond(events, config, path, { theme })` → `{ status, contentType, body }`. The single entry point both runtimes call.

## `browser/`

`index.html` + `app.js` (bundled by esbuild). Loads `nostroid.config.js`, fetches events, verifies, calls `respond()` and injects the body. Hash routing (`#/notes/2026/11/`) so it works on hosts without rewrite rules, including IPFS gateways.

## `server/cloudflare/`

Worker in front of one Durable Object per site (`SiteCache`, SQLite). Request → edge cache (≤60 s, stale-while-revalidate) → DO renders from stored events. If the last sync is older than `refreshSeconds` the DO serves immediately and refreshes in the background; the first request blocks. `POST /_refresh` with the shared secret forces a refresh (your relay calls it).

## `relay/`

`core.js` is the protocol and storage, tested locally against `node:sqlite`. `cloudflare/worker.js` wraps it in a Durable Object with WebSocket hibernation, so idle connections cost nothing. Writes are allowlisted by pubkey and signature-verified; reads are open. Ephemeral kinds (20000–29999) are broadcast to live subscribers and never stored.

## Testing

`node --test test/`. The SQLite-backed stores take an `exec(sql, ...params) → rows[]` adapter, satisfied by `ctx.storage.sql` in production and `node:sqlite` in tests. No wrangler or miniflare required.
