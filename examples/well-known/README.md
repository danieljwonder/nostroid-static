# .well-known templates

- `nostr.json` gives you a NIP-05 identifier (`_@yourdomain` or `name@yourdomain`). Serve it at `/.well-known/nostr.json` with `Access-Control-Allow-Origin: *`.
- For Lightning zaps, use your wallet provider's Lightning address. Self-hosted LNURL-pay is not covered here.
