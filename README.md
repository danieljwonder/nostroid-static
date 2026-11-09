# Nostroid Static

Publish from any Nostr client and get a fast, search-friendly static website you can host anywhere.

> **Status:** pre-release. Not ready to use yet.

## How it works

```
relays ──sync──▶ event store ──build──▶ dist/ (static HTML) ──▶ any host
   ▲                                          │
   └──────────── watch (optional) ────────────┘
```

- **sync** fetches your signed events from your relays, verifies each signature, and saves them to `content/events/`.
- **build** turns that event store into plain HTML: one page per post, archives, sitemap, feeds, canonical URLs and structured data. Readers don't need JavaScript to see any content.
- **watch** listens for your new events and runs sync, build and your deploy command for you.

Your key is your identity. Your relays hold your content. Nostroid Static only reads public events and never asks for your private key.

## Quickstart

```sh
npm install
cp nostroid.config.example.js nostroid.config.js   # set pubkey, relays, site.url
npx nostroid sync      # fetch your events into content/
npx nostroid build     # write the site to dist/
npm run check          # crawl dist/ without JavaScript: titles, canonicals, sitemap, links
```

Run `npx nostroid watch` to rebuild automatically whenever you publish. No server? Run `sync && build` on a schedule (cron, CI) instead.

## What gets built

- Long-form posts (NIP-23, kind 30023) at `/<slug>/`. URLs stay the same when you edit a post.
- Notes (kind 1) at `/notes/<id>/`. Short notes are listed but kept out of search indexes.
- Link lists (NIP-51, kind 30003) at `/links/`.
- Home page from your profile, paginated archives, `sitemap.xml`, `robots.txt` and an Atom feed.
- Canonical URLs, Open Graph tags and schema.org JSON-LD on every page.

Deletions (NIP-09) are honoured. Every event's signature is checked before anything is stored.

## Hosting

The build output is a folder of static files. Upload it to any static host: Cloudflare, Netlify, GitHub Pages, nginx, a bucket, or a box at home.

## License

MIT
