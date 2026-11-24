import { esc, jsonLd, iso, raw } from './html.js';
import { defaultTheme, bindPartials, tokenCss } from './theme.js';
import { profileVm } from './routes.js';

export function makeUrls(config) {
  const base = config.basePath;
  const href = p => base + String(p).replace(/^\//, '');
  const abs = p => new URL(href(p), config.site.url).href;
  return { href, abs };
}

export function navItems(config, model) {
  if (Array.isArray(config.nav)) return config.nav;
  const items = [{ label: 'Home', href: '/' }];
  if (model.posts.length) items.push({ label: 'Blog', href: '/blog/' });
  if (model.notes.length) items.push({ label: 'Notes', href: '/notes/' });
  if (model.links.length) items.push({ label: 'Links', href: '/links/' });
  return items;
}

export function personLd(model, config, urls) {
  const p = model.profile;
  const sameAs = [`https://njump.me/${p.npub}`];
  if (p.website) sameAs.push(p.website);
  return { '@type': 'Person', name: p.name, url: urls.abs('/'), ...(p.picture ? { image: p.picture } : {}), sameAs };
}

/** <head> contents + body shell. The SEO contract lives here, once. */
export function head({ config, model, urls, path, title, description, type = 'website', image, ld, noindex = false, published, modified, prev, next }) {
  const site = config.site;
  const siteTitle = site.title || model.profile.name;
  const fullTitle = title && title !== siteTitle ? `${title} · ${siteTitle}` : siteTitle;
  const desc = description || site.description || model.profile.about.split('\n')[0] || '';
  const canonical = urls.abs(path);
  const img = image || site.image || model.profile.banner || model.profile.picture || '';
  const tokens = tokenCss(config);
  const ldBlock = ld ? `<script type="application/ld+json">${jsonLd({ '@context': 'https://schema.org', ...ld })}</script>` : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}${prev ? `<link rel="prev" href="${esc(urls.abs(prev))}">\n` : ''}${next ? `<link rel="next" href="${esc(urls.abs(next))}">\n` : ''}<meta property="og:type" content="${esc(type)}">
<meta property="og:title" content="${esc(title || siteTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(siteTitle)}">
${img ? `<meta property="og:image" content="${esc(img)}">\n` : ''}<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
${published ? `<meta property="article:published_time" content="${iso(published)}">\n` : ''}${modified ? `<meta property="article:modified_time" content="${iso(modified)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(siteTitle)}" href="${esc(urls.href('/feed.xml'))}">
<link rel="stylesheet" href="${esc(urls.href('/assets/styles.css'))}">
${tokens ? `<style id="nostroid-tokens">\n${tokens}\n</style>\n` : ''}${ldBlock}`;
}

export function shell({ config, model, urls, path, body, mode = 'server', theme = defaultTheme }) {
  const p = bindPartials(theme, config);
  const nav = navItems(config, model).map(i => {
    const external = /^https?:\/\//.test(i.href);
    return { label: i.label, href: external ? i.href : urls.href(i.href), external, current: !external && (i.href === path || (i.href !== '/' && path.startsWith(i.href))) };
  });
  const header = p.header({ siteTitle: config.site.title || model.profile.name, homeHref: urls.href('/'), nav, path, schemeToggle: theme.scheme === 'auto' });
  const footer = p.footer({ profile: profileVm(model, config), poweredBy: !!config.poweredBy });
  return String(p.layout({ header, body: raw(body), footer, mode, path }));
}

export function document({ config, scripts = [], ...rest }) {
  return `<!doctype html>
<html lang="${esc(config.site.lang)}">
<head>
${head({ config, ...rest })}
</head>
<body>
${shell({ config, ...rest })}
${scripts.map(s => `<script type="module" src="${esc(s)}"></script>`).join('\n')}
</body>
</html>
`;
}
