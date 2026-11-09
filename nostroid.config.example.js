// Copy to nostroid.config.js and fill in.
export default {
  pubkey: "",                       // npub1... or hex
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
  outbox: true,                     // also read the write relays from your NIP-65 relay list
  site: { title: "", description: "", url: "https://example.com/", lang: "en", image: "" },
  nav: null,                        // null = generated from your content; or [{ label, href }]
  features: { notes: true, longform: true, links: true, replies: false },
  notes: { indexMinChars: 280 },    // shorter notes are listed but marked noindex
  pageSize: 20,
  poweredBy: true,
  publicDir: "public",              // copied verbatim into the build, e.g. public/.well-known/nostr.json
  deploy: ""                        // optional shell command `watch` runs after each build
};
