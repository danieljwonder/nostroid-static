# Architecture

## Pipeline

1. **sync** (`src/source/`): fetches events from the configured relays (or a personal relay), verifies signatures, removes duplicates, keeps only the latest version of replaceable and addressable events, and writes them to `content/events/<id>.json`.
2. **build** (`src/model/` then `src/render/`): reads only the store, never the network. Events become normalised models, and pure functions render them to HTML strings. Same input, same output.
3. **watch** (`src/cli/watch.js`): subscribes to the author's pubkey, debounces bursts of new events, then runs sync, build and the deploy command.

The browser never renders content. Client JavaScript is optional enhancement only.

## Personal relay mode (optional)

The relay list in the config can point at a relay you run yourself. Recommended policy: only accept writes signed by your own pubkey, and list the relay in your NIP-65 relay list. In this mode the relay is the canonical home for your events and `watch` subscribes to it. Nostroid Static does not ship relay software. Use an existing relay that can enforce an owner-only write policy.

## SEO contract

Every URL is served as complete HTML containing its title, meta description, canonical link, Open Graph tags and JSON-LD. URLs stay stable. Long-form posts (kind 30023) use the `d` tag as the slug. Notes use the event id. Podcast episodes have their slug fixed in `content/slugs.json` on first build.
