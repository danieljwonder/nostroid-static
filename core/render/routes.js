import { esc, truncate, humanDate, iso } from './html.js';
import { renderMarkdown, renderNote } from './content.js';
import { personLd } from './layout.js';
import { monthPath } from '../model.js';

const time = ts => `<time datetime="${iso(ts)}">${humanDate(ts)}</time>`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (y, m) => `${MONTHS[m - 1]} ${y}`;

export const noteTitle = n => truncate(n.text, 60) || `Note from ${humanDate(n.published)}`;

export function postCard(p, urls) {
  return `<article class="card">
<h2><a href="${esc(urls.href(p.path))}">${esc(p.title)}</a></h2>
<p class="meta">${time(p.published)}</p>
${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
</article>`;
}

export function noteCard(n, urls) {
  return `<article class="note">
${renderNote(n.content)}
<p class="meta"><a href="${esc(urls.href(n.path))}">${time(n.published)}</a></p>
</article>`;
}

/**
 * Match a path to a route. Returns { name, params } or null.
 * Paths are site-relative and always end with "/" except file routes.
 */
export function matchRoute(path) {
  const p = path.replace(/\/+$/, '/') || '/';
  if (p === '/') return { name: 'home' };
  if (p === '/blog/') return { name: 'blog' };
  let m;
  if ((m = p.match(/^\/blog\/([a-z0-9-]+)\/$/))) return { name: 'post', slug: m[1] };
  if (p === '/notes/') return { name: 'notes' };
  if ((m = p.match(/^\/notes\/(\d{4})\/(\d{2})\/$/))) return { name: 'month', year: +m[1], month: +m[2] };
  if ((m = p.match(/^\/notes\/([0-9a-f]{16})\/$/))) return { name: 'note', id: m[1] };
  if (p === '/links/') return { name: 'links' };
  if (p === '/sitemap.xml') return { name: 'sitemap' };
  if (p === '/feed.xml') return { name: 'feed' };
  if (p === '/robots.txt') return { name: 'robots' };
  return null;
}

/**
 * Render one route from the model. Returns { body, title, description, ld, ... } for the layout,
 * or { notFound: true }. Pure.
 */
export function renderRoute(route, model, config, urls) {
  const person = personLd(model, config, urls);
  const prof = model.profile;
  const perPage = config.notes.perPage;

  switch (route.name) {
    case 'home': {
      const body = `<section class="profile">
${prof.picture ? `<img class="avatar" src="${esc(prof.picture)}" alt="" width="96" height="96">` : ''}
<h1>${esc(config.site.title || prof.name)}</h1>
${prof.about ? renderNote(prof.about) : ''}
${prof.website ? `<p><a href="${esc(prof.website)}" rel="me">${esc(prof.website.replace(/^https?:\/\//, ''))}</a></p>` : ''}
</section>
${model.posts.length ? `<section><h2 class="section-title">Latest writing</h2>${model.posts.slice(0, 5).map(p => postCard(p, urls)).join('\n')}${model.posts.length > 5 ? `<p><a href="${esc(urls.href('/blog/'))}">All posts →</a></p>` : ''}</section>` : ''}
${model.notes.length ? `<section><h2 class="section-title">Recent notes</h2>${model.notes.slice(0, 10).map(n => noteCard(n, urls)).join('\n')}<p><a href="${esc(urls.href('/notes/'))}">All notes →</a></p></section>` : ''}`;
      return { path: '/', title: '', type: 'profile', ld: { '@type': 'ProfilePage', mainEntity: person, url: urls.abs('/') }, body };
    }
    case 'blog': {
      if (!model.posts.length) return { notFound: true };
      return { path: '/blog/', title: 'Blog', ld: { '@type': 'CollectionPage', url: urls.abs('/blog/') }, body: `<h1>Blog</h1>\n${model.posts.map(p => postCard(p, urls)).join('\n')}` };
    }
    case 'post': {
      const p = model.posts.find(x => x.slug === route.slug);
      if (!p) return { notFound: true };
      const description = p.summary || truncate(p.content.replace(/[#*_>`\[\]()!-]/g, ' '), 160);
      const body = `<article class="post">
<header><h1>${esc(p.title)}</h1><p class="meta">${time(p.published)}${p.updated > p.published + 86400 ? ` · updated ${time(p.updated)}` : ''}</p></header>
${p.image ? `<img class="hero" src="${esc(p.image)}" alt="" loading="eager">` : ''}
<div class="prose">${renderMarkdown(p.content)}</div>
${p.topics.length ? `<p class="tags">${p.topics.map(t => `<span>#${esc(t)}</span>`).join(' ')}</p>` : ''}
<p class="meta"><a href="https://njump.me/${esc(p.event.id)}" rel="nofollow noopener">View on Nostr</a></p>
</article>`;
      const ld = { '@type': 'BlogPosting', headline: p.title, description, datePublished: iso(p.published), dateModified: iso(p.updated), url: urls.abs(p.path), mainEntityOfPage: urls.abs(p.path), author: person, ...(p.image ? { image: p.image } : {}), ...(p.topics.length ? { keywords: p.topics.join(', ') } : {}) };
      return { path: p.path, title: p.title, description, type: 'article', image: p.image, ld, published: p.published, modified: p.updated, body };
    }
    case 'notes': {
      if (!model.notes.length) return { notFound: true };
      const latest = model.notes.slice(0, perPage);
      const older = model.months.find(m => m.notes.some(n => !latest.includes(n)));
      const body = `<h1>Notes</h1>\n${latest.map(n => noteCard(n, urls)).join('\n')}\n${older ? `<nav class="pager" aria-label="Archive"><span></span><a rel="next" href="${esc(urls.href(older.path))}">Older: ${monthName(older.year, older.month)} →</a></nav>` : ''}
${archiveList(model, urls)}`;
      return { path: '/notes/', title: 'Notes', ld: { '@type': 'CollectionPage', url: urls.abs('/notes/') }, next: older ? older.path : null, body };
    }
    case 'month': {
      const i = model.months.findIndex(m => m.year === route.year && m.month === route.month);
      if (i < 0) return { notFound: true };
      const m = model.months[i];
      const newer = model.months[i - 1], older = model.months[i + 1];
      const body = `<h1>Notes <small>${monthName(m.year, m.month)}</small></h1>\n${m.notes.map(n => noteCard(n, urls)).join('\n')}
<nav class="pager" aria-label="Archive">${newer ? `<a rel="prev" href="${esc(urls.href(newer.path))}">← ${monthName(newer.year, newer.month)}</a>` : `<a rel="prev" href="${esc(urls.href('/notes/'))}">← Latest</a>`}${older ? `<a rel="next" href="${esc(urls.href(older.path))}">${monthName(older.year, older.month)} →</a>` : '<span></span>'}</nav>`;
      return { path: m.path, title: `Notes, ${monthName(m.year, m.month)}`, ld: { '@type': 'CollectionPage', url: urls.abs(m.path) }, prev: newer ? newer.path : '/notes/', next: older ? older.path : null, body };
    }
    case 'note': {
      const n = model.notes.find(x => x.event.id.startsWith(route.id));
      if (!n) return { notFound: true };
      const title = noteTitle(n);
      const description = truncate(n.text, 160) || title;
      const body = `<article class="note note-single">\n${renderNote(n.content)}\n<p class="meta">${time(n.published)} · <a href="${esc(urls.href(monthPath(n.year, n.month)))}">${monthName(n.year, n.month)}</a> · <a href="https://njump.me/${esc(n.event.id)}" rel="nofollow noopener">view on Nostr</a></p>\n</article>`;
      const ld = { '@type': 'SocialMediaPosting', headline: title, articleBody: n.text, datePublished: iso(n.published), url: urls.abs(n.path), author: person };
      return { path: n.path, title, description, type: 'article', ld, noindex: !n.indexable, published: n.published, body };
    }
    case 'links': {
      if (!model.links.length) return { notFound: true };
      const body = `<h1>Links</h1>\n${model.links.map(s => `<section class="links"><h2>${esc(s.title)}</h2>${s.description ? `<p>${esc(s.description)}</p>` : ''}<ul>${s.items.map(it => `<li><a href="${esc(it.url)}" rel="noopener">${esc(it.label || it.url.replace(/^https?:\/\//, ''))}</a></li>`).join('')}</ul></section>`).join('\n')}`;
      return { path: '/links/', title: 'Links', ld: { '@type': 'CollectionPage', url: urls.abs('/links/') }, body };
    }
    default: return { notFound: true };
  }
}

function archiveList(model, urls) {
  if (model.months.length < 2) return '';
  return `<section class="archive"><h2 class="section-title">Archive</h2><ul>${model.months.map(m => `<li><a href="${esc(urls.href(m.path))}">${monthName(m.year, m.month)}</a> <span class="meta">${m.notes.length}</span></li>`).join('')}</ul></section>`;
}

export function notFoundRoute(urls) {
  return { path: '/404.html', title: 'Not found', noindex: true, body: `<h1>Not found</h1><p><a href="${esc(urls.href('/'))}">Go home</a></p>` };
}

/** Every indexable URL with lastmod, for the sitemap. */
export function sitemapEntries(model) {
  const out = [{ path: '/', lastmod: Math.max(model.profile.updated, ...model.posts.map(p => p.updated), ...model.notes.map(n => n.updated), 0) }];
  if (model.posts.length) { out.push({ path: '/blog/', lastmod: model.posts[0].updated }); for (const p of model.posts) out.push({ path: p.path, lastmod: p.updated }); }
  if (model.notes.length) {
    out.push({ path: '/notes/', lastmod: model.notes[0].updated });
    for (const m of model.months) out.push({ path: m.path, lastmod: m.notes[0].updated });
    for (const n of model.notes) if (n.indexable) out.push({ path: n.path, lastmod: n.updated });
  }
  if (model.links.length) out.push({ path: '/links/', lastmod: Math.max(...model.links.map(s => s.updated)) });
  return out;
}

export function sitemapXml(model, urls) {
  const rows = sitemapEntries(model).map(e => `  <url><loc>${esc(urls.abs(e.path))}</loc><lastmod>${iso(e.lastmod).slice(0, 10)}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

export function atomXml(model, config, urls) {
  const title = config.site.title || model.profile.name;
  const updated = Math.max(model.profile.updated, ...model.posts.map(p => p.updated), 0);
  const entries = model.posts.slice(0, 50).map(p => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(urls.abs(p.path))}"/>
    <id>${esc(urls.abs(p.path))}</id>
    <published>${iso(p.published)}</published>
    <updated>${iso(p.updated)}</updated>
    <summary>${esc(p.summary || truncate(p.content, 280))}</summary>
    <content type="html">${esc(renderMarkdown(p.content))}</content>
  </entry>`);
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(title)}</title>
  <link href="${esc(urls.abs('/'))}"/>
  <link rel="self" href="${esc(urls.abs('/feed.xml'))}"/>
  <id>${esc(urls.abs('/'))}</id>
  <updated>${iso(updated)}</updated>
  <author><name>${esc(model.profile.name)}</name></author>
${entries.join('\n')}
</feed>
`;
}

export const robotsTxt = urls => `User-agent: *\nAllow: /\n\nSitemap: ${urls.abs('/sitemap.xml')}\n`;
