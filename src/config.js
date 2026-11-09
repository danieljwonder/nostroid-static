import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decode } from 'nostr-tools/nip19';

const DEFAULTS = {
  relays: [],
  site: { title: '', description: '', url: '', lang: 'en', image: '' },
  nav: null, // null = generated from the content that exists
  features: { notes: true, longform: true, links: true, replies: false },
  notes: { indexMinChars: 280 },
  pageSize: 20,
  poweredBy: true,
  publicDir: 'public',
  deploy: ''
};

export function normalizePubkey(input) {
  const v = String(input ?? '').trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  if (v.startsWith('npub1')) {
    const d = decode(v);
    if (d.type === 'npub') return d.data;
  }
  throw new Error('config.pubkey must be an npub or a 64-character hex public key');
}

export function resolveConfig(raw = {}) {
  const c = {
    ...DEFAULTS,
    ...raw,
    site: { ...DEFAULTS.site, ...(raw.site || {}) },
    features: { ...DEFAULTS.features, ...(raw.features || {}) },
    notes: { ...DEFAULTS.notes, ...(raw.notes || {}) }
  };
  c.pubkey = normalizePubkey(raw.pubkey);
  if (!c.site.url) throw new Error('config.site.url is required (absolute URL used for canonical links)');
  const u = new URL(c.site.url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('config.site.url must be http(s)');
  c.site.url = u.origin + u.pathname.replace(/\/?$/, '/');
  c.basePath = new URL(c.site.url).pathname;
  if (!Array.isArray(c.relays) || c.relays.length === 0) throw new Error('config.relays must list at least one relay');
  for (const r of c.relays) {
    if (!/^wss?:\/\//.test(r)) throw new Error(`relay must be ws:// or wss://: ${r}`);
  }
  if (!Number.isInteger(c.pageSize) || c.pageSize < 1) throw new Error('config.pageSize must be a positive integer');
  return c;
}

export async function loadConfig(file = 'nostroid.config.js') {
  const abs = path.resolve(file);
  const mod = await import(pathToFileURL(abs).href);
  const c = resolveConfig(mod.default ?? mod);
  c.root = path.dirname(abs);
  return c;
}

export function syncKinds(config) {
  const k = new Set([0, 5, 10002]);
  if (config.features.notes) k.add(1);
  if (config.features.longform) k.add(30023);
  if (config.features.links) k.add(30003);
  return [...k].sort((a, b) => a - b);
}
