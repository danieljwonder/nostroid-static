# Nostroid Static

Nostr is your CMS. Deploy a site once, publish from any Nostr client, and never rebuild.

> **Status:** pre-release (0.2). Running in production on the author's sites; APIs and config may still change.

## The idea

A normal static site generator rebuilds and redeploys your site every time you post. Nostroid Static doesn't. The deployed code never changes. It reads your signed events from your relays and renders them, so publishing a post is just publishing a Nostr event.

Three parts, use what you need:

| Part | What it does | Where it runs |
|---|---|---|
| **Browser mode** (core) | A handful of static files. The visitor's browser fetches your events from relays, verifies every signature, and renders the pages. | Any static host: a bucket, GitHub Pages, IPFS, nginx, a box at home. |
| **Server layer** (optional) | A Cloudflare Worker with a Durable Object cache. Keeps a verified copy of your events, renders full HTML at request time, and refreshes in the background. Gives crawlers real HTML. | Your own Cloudflare account (free plan is enough). |
| **Relay** (optional) | A minimal owner-only Nostr relay: anyone can read, only your key can write. When it accepts an event it pings your site, so updates land in seconds. | Your own Cloudflare account. |

One codebase, one renderer (`core/`). The server layer does in advance exactly what the browser would do.

## What you get

- Long-form posts (NIP-23, kind 30023) at `/blog/<slug>/`. The slug is your `d` tag, or the title when the `d` tag is machine-generated. Editing a post keeps its URL.
- Notes (kind 1) at `/notes/`, with monthly archives at `/notes/YYYY/MM/` and permalinks at `/notes/<id>/`.
- Link lists (NIP-51, kind 30003) at `/links/`.
- Profile from your kind 0, relay discovery from your kind 10002 (NIP-65 outbox), deletions honoured (NIP-09).
- `sitemap.xml`, `robots.txt`, Atom feed, canonical URLs, Open Graph tags and JSON-LD on every page.
- Every event's signature is verified before anything is rendered. Your private key is never needed.

## SEO, honestly

- **Server layer:** every URL returns complete HTML with its title, description, canonical and structured data. `npm run check -- https://your.site/` crawls the live site with JavaScript off and fails if anything is missing.
- **Browser mode alone:** crawlers see the site title and description, not per-post content. Fine for a personal mirror; if search traffic matters, add the server layer.

## Quickstart: browser mode

```sh
npm install
npm run build:browser                       # -> dist-browser/
cp nostroid.config.example.js dist-browser/nostroid.config.js
# edit: pubkey (npub or hex), relays, site.url
```

Upload `dist-browser/` to any static host. Routes use `#/` so no rewrite rules are needed.

## Server layer on Cloudflare

```sh
npm run build:site-worker                   # -> dist-worker/site.mjs
```

Deploy `dist-worker/site.mjs` as a Worker with:

- a Durable Object binding `SITE` → class `SiteCache` (SQLite; migration `new_sqlite_classes: ["SiteCache"]`)
- `SITE_CONFIG`: your config as a JSON string
- `REFRESH_SECRET` (secret): lets your relay call `POST /_refresh` with header `x-nostroid-refresh`
- `NOINDEX=1` (optional) to keep a mirror out of search engines

`scripts/deploy-cf.sh` uploads via the REST API with a scoped token (`CF_ACCOUNT_ID`, `CF_API_TOKEN`). Attach a custom domain and disable the `workers.dev` URL.

## Relay on Cloudflare

```sh
npm run build:relay-worker                  # -> dist-worker/relay.mjs
```

Bindings: Durable Object `RELAY` → class `Relay` (SQLite), `ALLOWED_PUBKEYS` (comma-separated hex), `RELAY_NAME`, `RELAY_DESCRIPTION`, `RELAY_CONTACT_PUBKEY`, and optionally `ON_EVENT_URL` + `ON_EVENT_SECRET` to ping your site. Implements NIP-01, NIP-09, NIP-11; ephemeral events are relayed but never stored. Add the relay to your NIP-65 relay list and your clients will write to it.

## Configuration

See `nostroid.config.example.js`. Required: `pubkey`, `relays`, `site.url`. Optional: `site.title/description/image/lang`, `nav`, `features` (notes, longform, links), `notes.indexMinChars` (shorter notes get `noindex`), `notes.perPage`, `refreshSeconds`, `poweredBy`, `theme.tokens` / `theme.dark` (design tokens).

## Themes

Restyle with tokens in the config, a `custom.css`, or a theme package that overrides individual templates. See [THEMES.md](THEMES.md); `themes/midnight/` is a working example.

## Development

```sh
npm test            # node --test; the SQLite stores run against node:sqlite locally
npm run build       # all three bundles
```

Node 22+ (Durable Object SQL is tested with the built-in `node:sqlite`, so no emulator is needed).

## License

MIT
