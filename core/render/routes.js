import { esc, truncate, humanDate, iso, raw } from './html.js';
import { defaultTheme, bindPartials } from './theme.js';
import { renderMarkdown, renderNote } from './content.js';
import { personLd } from './layout.js';
import { monthPath } from '../model.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (y, m) => `${MONTHS[m - 1]} ${y}`;

export const noteTitle = n => truncate(n.text, 60) || `Note from ${humanDate(n.published)}`;

const nostrUrl = id => `https://njump.me/${id}`;

/* View-models: the data contract partials receive (documented in THEMES.md). */
export const postCardVm = (p, urls) => ({ title: p.title, href: urls.href(p.path), published: p.published, updated: p.updated, summary: p.summary, image: p.image, topics: p.topics });
export const noteCardVm = (n, urls) => ({ html: raw(renderNote(n.content)), text: n.text, href: urls.href(n.path), published: n.published });
const monthVm = (m, urls) => ({ href: urls.href(m.path), label: monthName(m.year, m.month), year: m.year, month: m.month, count: m.notes.length });

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
  if ((m = p.match(/^\/([a-z0-9][a-z0-9-]{0,63})\/$/)) && !['blog', 'notes', 'links'].includes(m[1])) return { name: 'podcast', show: m[1] };
  if ((m = p.match(/^\/([a-z0-9][a-z0-9-]{0,63})\/([a-z0-9-]+)\/$/)) && !['blog', 'notes', 'links'].includes(m[1])) return { name: 'episode', show: m[1], slug: m[2] };
  if (p === '/sitemap.xml') return { name: 'sitemap' };
  if (p === '/feed.xml') return { name: 'feed' };
  if (p === '/robots.txt') return { name: 'robots' };
  return null;
}

/**
 * Render one route from the model. Returns { body, title, description, ld, ... } for the layout,
 * or { notFound: true }. Pure. Markup comes from the theme's partials; metadata and SEO stay here.
 */
export function renderRoute(route, model, config, urls, theme = defaultTheme) {
  const person = personLd(model, config, urls);
  const prof = model.profile;
  const perPage = config.notes.perPage;
  const p = bindPartials(theme, config);

  switch (route.name) {
    case 'home': {
      const body = p.home({
        profile: profileVm(model, config),
        posts: model.posts.slice(0, 5).map(x => postCardVm(x, urls)),
        allPostsHref: model.posts.length > 5 ? urls.href('/blog/') : null,
        notes: model.notes.slice(0, 10).map(x => noteCardVm(x, urls)),
        allNotesHref: urls.href('/notes/')
      });
      return { path: '/', title: '', type: 'profile', ld: { '@type': 'ProfilePage', mainEntity: person, url: urls.abs('/') }, body: String(body) };
    }
    case 'blog': {
      if (!model.posts.length) return { notFound: true };
      return { path: '/blog/', title: 'Blog', ld: { '@type': 'CollectionPage', url: urls.abs('/blog/') }, body: String(p.blog({ posts: model.posts.map(x => postCardVm(x, urls)) })) };
    }
    case 'post': {
      const post = model.posts.find(x => x.slug === route.slug);
      if (!post) return { notFound: true };
      const description = post.summary || truncate(post.content.replace(/[#*_>`\[\]()!-]/g, ' '), 160);
      const body = p.post({
        ...postCardVm(post, urls),
        updated: post.updated > post.published + 86400 ? post.updated : null,
        html: raw(renderMarkdown(post.content)),
        nostrUrl: nostrUrl(post.event.id)
      });
      const ld = { '@type': 'BlogPosting', headline: post.title, description, datePublished: iso(post.published), dateModified: iso(post.updated), url: urls.abs(post.path), mainEntityOfPage: urls.abs(post.path), author: person, ...(post.image ? { image: post.image } : {}), ...(post.topics.length ? { keywords: post.topics.join(', ') } : {}) };
      return { path: post.path, title: post.title, description, type: 'article', image: post.image, ld, published: post.published, modified: post.updated, body: String(body) };
    }
    case 'notes': {
      if (!model.notes.length) return { notFound: true };
      const latest = model.notes.slice(0, perPage);
      const older = model.months.find(m => m.notes.some(n => !latest.includes(n)));
      const body = p.notes({ notes: latest.map(x => noteCardVm(x, urls)), older: older ? monthVm(older, urls) : null, months: model.months.map(m => monthVm(m, urls)) });
      return { path: '/notes/', title: 'Notes', ld: { '@type': 'CollectionPage', url: urls.abs('/notes/') }, next: older ? older.path : null, body: String(body) };
    }
    case 'month': {
      const i = model.months.findIndex(m => m.year === route.year && m.month === route.month);
      if (i < 0) return { notFound: true };
      const m = model.months[i];
      const newer = model.months[i - 1], older = model.months[i + 1];
      const body = p.month({
        label: monthName(m.year, m.month),
        notes: m.notes.map(x => noteCardVm(x, urls)),
        newer: newer ? monthVm(newer, urls) : { href: urls.href('/notes/'), label: 'Latest' },
        older: older ? monthVm(older, urls) : null
      });
      return { path: m.path, title: `Notes, ${monthName(m.year, m.month)}`, ld: { '@type': 'CollectionPage', url: urls.abs(m.path) }, prev: newer ? newer.path : '/notes/', next: older ? older.path : null, body: String(body) };
    }
    case 'note': {
      const n = model.notes.find(x => x.event.id.startsWith(route.id));
      if (!n) return { notFound: true };
      const title = noteTitle(n);
      const description = truncate(n.text, 160) || title;
      const body = p.note({ ...noteCardVm(n, urls), title, month: { href: urls.href(monthPath(n.year, n.month)), label: monthName(n.year, n.month) }, nostrUrl: nostrUrl(n.event.id) });
      const ld = { '@type': 'SocialMediaPosting', headline: title, articleBody: n.text, datePublished: iso(n.published), url: urls.abs(n.path), author: person };
      return { path: n.path, title, description, type: 'article', ld, noindex: !n.indexable, published: n.published, body: String(body) };
    }
    case 'links': {
      if (!model.links.length) return { notFound: true };
      const lists = model.links.map(s => ({ title: s.title, description: s.description, items: s.items.map(it => ({ url: it.url, label: it.label || it.url.replace(/^https?:\/\//, '') })) }));
      return { path: '/links/', title: 'Links', ld: { '@type': 'CollectionPage', url: urls.abs('/links/') }, body: String(p.links({ lists })) };
    }
    case 'podcast': {
      const show = model.shows.find(s => s.slug === route.show);
      if (!show) return { notFound: true };
      const vm = showVm(show, urls);
      const body = p.podcast({ ...vm, episodes: show.episodes.map(e => episodeVm(e, show, urls)) });
      const ld = { '@type': 'PodcastSeries', name: show.title, description: show.description, url: urls.abs(show.path), ...(show.image ? { image: show.image } : {}), ...(vm.feedHref ? { webFeed: urls.abs(vm.feedHref) } : {}) };
      return { path: show.path, title: show.title, description: show.description, image: show.image, ld, body: String(body), feed: vm.feedHref ? { href: vm.feedHref, title: show.title } : null };
    }
    case 'episode': {
      const show = model.shows.find(s => s.slug === route.show);
      const ep = show && show.episodes.find(e => e.slug === route.slug);
      if (!ep) return { notFound: true };
      const description = ep.description || truncate(ep.content.replace(/[#*_>`\[\]()!-]/g, ' '), 160);
      const i = show.episodes.indexOf(ep);
      const body = p.episode({ ...episodeVm(ep, show, urls), html: raw(renderMarkdown(ep.content)), show: showVm(show, urls), newer: i > 0 ? episodeVm(show.episodes[i - 1], show, urls) : null, older: i < show.episodes.length - 1 ? episodeVm(show.episodes[i + 1], show, urls) : null });
      const ld = { '@type': 'PodcastEpisode', name: ep.title, description, datePublished: iso(ep.published), url: urls.abs(ep.path), ...(ep.duration ? { timeRequired: `PT${ep.duration}S` } : {}), ...(ep.image || show.image ? { image: ep.image || show.image } : {}),
        associatedMedia: { '@type': 'MediaObject', contentUrl: ep.audio[0].url, encodingFormat: ep.audio[0].type }, partOfSeries: { '@type': 'PodcastSeries', name: show.title, url: urls.abs(show.path) } };
      return { path: ep.path, title: ep.title, description, type: 'article', image: ep.image || show.image, ld, published: ep.published, modified: ep.updated, body: String(body), feed: show.feed ? { href: show.feed, title: show.title } : null };
    }
    default: return { notFound: true };
  }
}

export function showVm(show, urls) {
  return { title: show.title, description: show.description, image: show.image, website: show.website, href: urls.href(show.path), feedHref: show.feed ? (show.feed.startsWith('/') ? urls.href(show.feed) : show.feed) : '', npub: show.npub, nostrUrl: nostrUrl(show.npub), hosts: show.hosts };
}

export function episodeVm(ep, show, urls) {
  return { title: ep.title, href: urls.href(ep.path), published: ep.published, description: ep.description, image: ep.image || show.image, audio: ep.audio, duration: ep.duration, nostrUrl: nostrUrl(ep.event.id) };
}

export function profileVm(model, config) {
  const prof = model.profile;
  return {
    name: prof.name, title: config.site.title || prof.name, picture: prof.picture, banner: prof.banner,
    about: prof.about, aboutHtml: prof.about ? raw(renderNote(prof.about)) : null,
    website: prof.website, websiteLabel: prof.website ? prof.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '',
    npub: prof.npub, nostrUrl: nostrUrl(prof.npub)
  };
}

export function notFoundRoute(urls, config, theme = defaultTheme) {
  const p = bindPartials(theme, config);
  return { path: '/404.html', title: 'Not found', noindex: true, body: String(p.notFound({ homeHref: urls.href('/') })) };
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
  for (const s of model.shows) { out.push({ path: s.path, lastmod: s.updated }); for (const e of s.episodes) out.push({ path: e.path, lastmod: e.updated }); }
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
