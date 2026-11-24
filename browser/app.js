// Nostroid Static, browser mode. Reads relays, verifies, renders. No server needed.
import { resolveConfig, contentKinds } from '../core/config.js';
import { reduceEvents, outboxRelays } from '../core/events.js';
import { makeRelayClient, fetchAuthor } from '../core/relay.js';
import { buildModel } from '../core/model.js';
import { makeUrls, shell } from '../core/render/layout.js';
import { matchRoute, renderRoute, notFoundRoute } from '../core/render/routes.js';
import { resolveTheme, tokenCss } from '../core/render/theme.js';
import THEME_SRC from 'nostroid:theme';

const theme = resolveTheme(THEME_SRC);

const CACHE_KEY = 'nostroid:events:v1';

function currentPath(config) {
  // Hash routing (works on any host incl. IPFS gateways) with path routing as a fallback.
  if (location.hash.startsWith('#/')) return location.hash.slice(1);
  const base = config.basePath.replace(/\/$/, '');
  const p = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname;
  return p || '/';
}

function useHashLinks(root, config) {
  // Rewrite internal links to hash form so navigation never needs a server rewrite.
  const base = config.basePath;
  for (const a of root.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (h.startsWith(base) && !/\.(xml|txt|css|js|png|jpe?g|webp|svg|ico)$/.test(h)) a.setAttribute('href', '#' + h.slice(base.length - 1));
  }
}

async function loadEvents(config, status) {
  const client = makeRelayClient(url => new WebSocket(url), { timeoutMs: 6000 });
  const kinds = contentKinds(config);
  let relays = config.relays;
  status('Reading your relays…');
  let raw = await fetchAuthor(client, relays, config.pubkey, kinds);
  if (config.outbox) {
    const extra = outboxRelays(raw, config.pubkey).filter(r => !relays.includes(r));
    if (extra.length) { relays = [...relays, ...extra]; raw = raw.concat(await fetchAuthor(client, extra, config.pubkey, kinds)); }
  }
  return reduceEvents(raw, config.pubkey).events;
}

export async function start(rawConfig) {
  const config = resolveConfig(rawConfig);
  const urls = makeUrls(config);
  const app = document.getElementById('app');
  const tokens = tokenCss(config);
  if (tokens) { const st = document.createElement('style'); st.id = 'nostroid-tokens'; st.textContent = tokens; document.head.appendChild(st); }
  const status = msg => { const el = document.getElementById('status'); if (el) el.textContent = msg; };

  let events = [];
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.pubkey === config.pubkey) events = c.events; } catch {}

  function render() {
    const model = buildModel(events, config);
    const path = currentPath(config);
    const route = matchRoute(path);
    const page = route ? renderRoute(route, model, config, urls, theme) : { notFound: true };
    const p = page.notFound ? notFoundRoute(urls, config, theme) : page;
    const siteTitle = config.site.title || model.profile.name;
    document.title = p.title && p.title !== siteTitle ? `${p.title} · ${siteTitle}` : siteTitle;
    app.innerHTML = shell({ config, model, urls, path, body: p.body, mode: 'browser', theme });
    useHashLinks(app, config);
    window.scrollTo(0, 0);
  }

  if (events.length) render(); else status('Loading…');
  window.addEventListener('hashchange', render);

  try {
    const fresh = await loadEvents(config, status);
    if (fresh.length) {
      events = fresh;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ pubkey: config.pubkey, events })); } catch {}
    }
    render();
  } catch (e) {
    if (!events.length) app.innerHTML = `<main id="main"><h1>Could not reach any relay</h1><p>${String(e.message || e)}</p></main>`;
  }
}
