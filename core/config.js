import { decode } from 'nostr-tools/nip19';

const DEFAULTS = {
  relays: [],
  outbox: true,
  site: { title: '', description: '', url: '', lang: 'en', image: '' },
  nav: null,
  features: { notes: true, longform: true, links: true, replies: false },
  notes: { indexMinChars: 280, perPage: 20 },
  refreshSeconds: 120,
  poweredBy: true,
  theme: { tokens: {}, dark: {} }
};

const TOKEN_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const TOKEN_BAD = /[;{}<>\\]|\/\*/;
/** Design tokens -> custom properties. Names like `accent` or `font-body`; values are plain CSS values. */
export function checkTokens(t, where) {
  if (t == null) return {};
  if (typeof t !== 'object' || Array.isArray(t)) throw new Error(`config.${where} must be an object of token: value`);
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    const name = k.replace(/^--/, '');
    if (!TOKEN_NAME.test(name)) throw new Error(`config.${where}: bad token name "${k}" (use lowercase letters, digits and dashes)`);
    const val = String(v).trim();
    if (!val || val.length > 300 || TOKEN_BAD.test(val)) throw new Error(`config.${where}.${name}: value must be a plain CSS value without ; { } < > \\ or comments`);
    out[name] = val;
  }
  return out;
}

export function normalizePubkey(input) {
  const v = String(input ?? '').trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  if (v.startsWith('npub1')) {
    const d = decode(v);
    if (d.type === 'npub') return d.data;
  }
  throw new Error('config.pubkey must be an npub or a 64-character hex public key');
}

/** Pure: raw object -> validated config. Works in browser, Worker and Node. */
export function resolveConfig(raw = {}) {
  const c = {
    ...DEFAULTS,
    ...raw,
    site: { ...DEFAULTS.site, ...(raw.site || {}) },
    features: { ...DEFAULTS.features, ...(raw.features || {}) },
    notes: { ...DEFAULTS.notes, ...(raw.notes || {}) },
    theme: { tokens: checkTokens(raw.theme?.tokens, 'theme.tokens'), dark: checkTokens(raw.theme?.dark, 'theme.dark') }
  };
  c.pubkey = normalizePubkey(raw.pubkey);
  if (!c.site.url) throw new Error('config.site.url is required (absolute URL used for canonical links)');
  const u = new URL(c.site.url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('config.site.url must be http(s)');
  c.site.url = u.origin + u.pathname.replace(/\/?$/, '/');
  c.basePath = u.pathname.replace(/\/?$/, '/');
  if (!Array.isArray(c.relays) || c.relays.length === 0) throw new Error('config.relays must list at least one relay');
  for (const r of c.relays) if (!/^wss?:\/\//.test(r)) throw new Error(`relay must be ws:// or wss://: ${r}`);
  c.relays = c.relays.map(r => r.trim().replace(/\/+$/, ''));
  return c;
}

export function contentKinds(config) {
  const k = new Set([0, 5, 10002]);
  if (config.features.notes) k.add(1);
  if (config.features.longform) k.add(30023);
  if (config.features.links) k.add(30003);
  return [...k].sort((a, b) => a - b);
}
