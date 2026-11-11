import { DurableObject } from 'cloudflare:workers';
import { resolveConfig, contentKinds } from '../../core/config.js';
import { reduceEvents, outboxRelays } from '../../core/events.js';
import { makeRelayClient, fetchAuthor } from '../../core/relay.js';
import { respond } from '../../core/site.js';
import { SiteStore } from './store.js';
import STYLES from '../../src/assets/styles.css';
import THEME from '../../src/assets/theme.js?raw';

function siteConfig(env) {
  return resolveConfig(JSON.parse(env.SITE_CONFIG));
}

const STATIC = {
  '/assets/styles.css': () => new Response(STYLES, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=86400' } }),
  '/assets/theme.js': () => new Response(THEME, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/_refresh') {
      const auth = request.headers.get('authorization') || '';
      if (!env.REFRESH_SECRET || auth !== `Bearer ${env.REFRESH_SECRET}`) return new Response(null, { status: 404 });
      return env.SITE.getByName('site').fetch(new Request(url.origin + '/_refresh', { method: 'POST' }));
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
    if (STATIC[url.pathname]) return STATIC[url.pathname]();
    // Normalise "/post" -> "/post/"
    if (!url.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
    }
    // Edge cache: short TTL; the DO is the source of rendered pages.
    const cache = caches.default;
    const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const res = await env.SITE.getByName('site').fetch(new Request(url.origin + url.pathname, { method: 'GET' }));
    if (res.status === 200 || res.status === 404) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }
};

export class SiteCache extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.config = siteConfig(env);
    this.store = new SiteStore((sql, ...params) => this.ctx.storage.sql.exec(sql, ...params).toArray());
    this.refreshing = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/_refresh') {
      const r = await this.refresh(true);
      return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
    }
    await this.ensureFresh();
    const events = this.store.allEvents();
    const page = respond(events, this.config, url.pathname, { mode: 'server' });
    const headers = {
      'content-type': page.contentType,
      'cache-control': page.status === 200 ? `public, max-age=${Math.min(60, this.config.refreshSeconds)}, stale-while-revalidate=300` : 'public, max-age=30',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-nostroid-events': String(events.length),
      'x-nostroid-synced': String(this.store.meta('lastSync') || 0)
    };
    if (this.env.NOINDEX === '1') headers['x-robots-tag'] = 'noindex';
    return new Response(page.body, { status: page.status, headers });
  }

  /** Serve immediately; refresh from relays in the background when stale. First run blocks. */
  async ensureFresh() {
    const last = Number(this.store.meta('lastSync') || 0);
    const age = Date.now() / 1000 - last;
    if (!last) { await this.refresh(false); return; }
    if (age > this.config.refreshSeconds) this.ctx.waitUntil(this.refresh(false));
  }

  async refresh(full) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const started = Math.floor(Date.now() / 1000);
      const client = makeRelayClient(url => workerWebSocket(url), { timeoutMs: 5000 });
      const kinds = contentKinds(this.config);
      const last = Number(this.store.meta('lastSync') || 0);
      const since = full || !last ? undefined : Math.max(0, last - 3600);
      let relays = this.config.relays;
      let raw = await fetchAuthor(client, relays, this.config.pubkey, kinds, { since });
      if (this.config.outbox) {
        const known = outboxRelays(this.store.allEvents().concat(raw), this.config.pubkey).filter(r => !relays.includes(r));
        if (known.length) raw = raw.concat(await fetchAuthor(client, known, this.config.pubkey, kinds, { since }));
      }
      const merged = reduceEvents(this.store.allEvents().concat(raw), this.config.pubkey);
      const changed = this.store.replaceAll(merged.events);
      this.store.setMeta('lastSync', started);
      if (changed) await this.purgeEdge();
      return { received: raw.length, stored: merged.events.length, rejected: merged.rejected, changed };
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async purgeEdge() {
    // Edge cache entries expire within 60 s on their own; a zone-wide purge needs an API token we deliberately don't hold.
    this.store.setMeta('lastChange', Math.floor(Date.now() / 1000));
  }
}

/** Outbound WebSocket from a Worker: fetch + Upgrade, then accept(). Same interface as the browser WebSocket. */
function workerWebSocket(url) {
  const listeners = { open: [], message: [], close: [], error: [] };
  const ws = {
    _socket: null,
    addEventListener: (t, f) => listeners[t].push(f),
    send: data => ws._socket && ws._socket.send(data),
    close: () => { try { ws._socket && ws._socket.close(); } catch {} }
  };
  fetch(url.replace(/^ws/, 'http'), { headers: { Upgrade: 'websocket' } }).then(res => {
    const s = res.webSocket;
    if (!s) { listeners.error.forEach(f => f(new Error('no websocket'))); return; }
    s.accept();
    ws._socket = s;
    s.addEventListener('message', ev => listeners.message.forEach(f => f(ev)));
    s.addEventListener('close', ev => listeners.close.forEach(f => f(ev)));
    s.addEventListener('error', ev => listeners.error.forEach(f => f(ev)));
    listeners.open.forEach(f => f());
  }).catch(e => listeners.error.forEach(f => f(e)));
  return ws;
}
