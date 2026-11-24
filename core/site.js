import { buildModel } from './model.js';
import { defaultTheme, resolveTheme } from './render/theme.js';
import { makeUrls, document } from './render/layout.js';
import { matchRoute, renderRoute, notFoundRoute, sitemapXml, atomXml, robotsTxt } from './render/routes.js';

/**
 * One function both runtimes call: (current events, config, path) -> { status, contentType, body }.
 * No I/O. The server caches the result; the browser injects the body into the DOM.
 */
export function respond(events, config, path, { mode = 'server', scripts = [], theme = defaultTheme } = {}) {
  const model = buildModel(events, config);
  const urls = makeUrls(config);
  const route = matchRoute(path);
  if (route?.name === 'sitemap') return { status: 200, contentType: 'application/xml; charset=utf-8', body: sitemapXml(model, urls) };
  if (route?.name === 'feed') return { status: 200, contentType: 'application/atom+xml; charset=utf-8', body: atomXml(model, config, urls) };
  if (route?.name === 'robots') return { status: 200, contentType: 'text/plain; charset=utf-8', body: robotsTxt(urls) };
  const page = route ? renderRoute(route, model, config, urls, theme) : { notFound: true };
  const p = page.notFound ? notFoundRoute(urls, config, theme) : page;
  const html = document({ config, model, urls, mode, scripts, theme, ...p });
  return { status: page.notFound ? 404 : 200, contentType: 'text/html; charset=utf-8', body: html, indexable: !p.noindex && !page.notFound };
}

export { buildModel, makeUrls, matchRoute, renderRoute, resolveTheme, defaultTheme };
