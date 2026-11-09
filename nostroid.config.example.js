// Copy to nostroid.config.js and fill in.
export default {
  pubkey: "",                       // npub1... or hex
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
  site: { title: "", description: "", url: "https://example.com", lang: "en", image: "" },
  nav: [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog/" },
    { label: "Links", href: "/links/" }
  ],
  features: { notes: true, longform: true, links: true, podcast: false },
  notes: { indexMinChars: 280 },    // shorter notes are listed but noindex
  pageSize: 20,
  poweredBy: true,
  deploy: ""                        // optional shell command run by `watch` after build
};
