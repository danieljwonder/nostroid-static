// Browser mode: copy to dist-browser/nostroid.config.js.
// Server layer: pass the same object as a JSON string in the SITE_CONFIG binding.
export default {
  pubkey: "",                       // npub1... or hex
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
  outbox: true,                     // also read the write relays from your NIP-65 relay list
  site: { title: "", description: "", url: "https://example.com/", lang: "en", image: "" },
  nav: null,                        // null = generated from your content; or [{ label, href }]
  features: { notes: true, longform: true, links: true, replies: false },
  notes: { indexMinChars: 280, perPage: 20 },   // shorter notes are listed but marked noindex
  refreshSeconds: 120,              // server layer: how stale the cache may get before a background refresh
  poweredBy: true,                  // "Powered by Nostroid" footer link
  theme: { tokens: {}, dark: {} }   // design tokens, e.g. { accent: "#6d3fd1" }; see THEMES.md
};
