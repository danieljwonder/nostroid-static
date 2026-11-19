import { DurableObject } from 'cloudflare:workers';
import { RelayStore, RelayHandler, relayInfo } from '../core.js';

/**
 * Sites to notify when an event is stored. Either the single ON_EVENT_URL / ON_EVENT_SECRET pair,
 * or ON_EVENT_TARGETS = JSON [{ "url", "secret", "pubkey"? }] where "pubkey" limits a target to
 * one author's events (one relay, several sites).
 */
export function pingTargets(env) {
  const out = [];
  if (env.ON_EVENT_URL) out.push({ url: env.ON_EVENT_URL, secret: env.ON_EVENT_SECRET || '', pubkey: '' });
  if (env.ON_EVENT_TARGETS) {
    try {
      for (const t of JSON.parse(env.ON_EVENT_TARGETS)) if (t && t.url) out.push({ url: t.url, secret: t.secret || '', pubkey: String(t.pubkey || '').toLowerCase() });
    } catch {}
  }
  return out;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'accept, content-type', 'access-control-allow-methods': 'GET, OPTIONS' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (url.pathname !== '/') return new Response('not found', { status: 404 });
      return env.RELAY.getByName('relay').fetch(request);
    }
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    if (url.pathname === '/' && (request.headers.get('accept') || '').includes('application/nostr+json')) {
      return new Response(JSON.stringify(relayInfo(env)), { headers: { 'content-type': 'application/nostr+json', ...CORS } });
    }
    if (url.pathname === '/') {
      const info = relayInfo(env);
      return new Response(`${info.name}\n\n${info.description}\n\nConnect with a Nostr client: wss://${url.host}/\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (url.pathname === '/_stats') return env.RELAY.getByName('relay').fetch(request);
    return new Response('not found', { status: 404 });
  }
};

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new RelayStore((sql, ...params) => this.ctx.storage.sql.exec(sql, ...params).toArray());
    this.handler = new RelayHandler(this.store, {
      allowed: new Set(String(env.ALLOWED_PUBKEYS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)),
      onStored: e => { for (const t of pingTargets(env)) if (!t.pubkey || t.pubkey === e.pubkey) this.ctx.waitUntil(this.ping(t, e)); }
    });
    // Rehydrate subscriptions of hibernated connections.
    for (const ws of this.ctx.getWebSockets()) this.handler.open(this.wrap(ws));
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  wrap(ws) {
    if (ws.__conn) return ws.__conn;
    const conn = {
      send: s => ws.send(s),
      subs: new Map(Object.entries(ws.deserializeAttachment()?.subs || {})),
      attach: () => { try { ws.serializeAttachment({ subs: Object.fromEntries(conn.subs) }); } catch {} }
    };
    ws.__conn = conn;
    return conn;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/_stats') {
      return new Response(JSON.stringify({ events: this.store.count(), connections: this.ctx.getWebSockets().length }), { headers: { 'content-type': 'application/json' } });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ subs: {} });
    this.handler.open(this.wrap(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const conn = this.wrap(ws);
    if (!this.handler.conns.has(conn)) this.handler.open(conn);
    this.handler.message(conn, message);
  }
  async webSocketClose(ws) { this.handler.close(this.wrap(ws)); }
  async webSocketError(ws) { this.handler.close(this.wrap(ws)); }

  async ping(target, e) {
    try {
      await fetch(target.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(target.secret ? { 'x-nostroid-refresh': target.secret } : {}) }, body: JSON.stringify({ id: e.id, kind: e.kind, pubkey: e.pubkey }) });
    } catch {}
  }
}
