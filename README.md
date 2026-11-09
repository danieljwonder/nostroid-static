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

## Hosting

The build output is a folder of static files. Upload it to any static host: Cloudflare, Netlify, GitHub Pages, nginx, a bucket, or a box at home.

## License

MIT
