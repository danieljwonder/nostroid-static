import { esc, truncate, humanDate, iso } from './html.js';
import { renderMarkdown, renderNote } from './content.js';
import { page, personLd } from './layout.js';

const time = ts => `<time datetime="${iso(ts)}">${humanDate(ts)}</time>`;

function noteTitle(n) {
  return truncate(n.text, 60) || `Note from ${humanDate(n.published)}`;
}

function postCard(p, urls) {
  return `<article class="card">
<h2><a href="${esc(urls.href(p.path))}">${esc(p.title)}</a></h2>
<p class="meta">${time(p.published)}</p>
${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
</article>`;
}

function noteCard(n, urls) {
  return `<article class="note">
${renderNote(n.content)}
<p class="meta"><a href="${esc(urls.href(n.path))}">${time(n.published)}</a></p>
</article>`;
}

function pager(base, pageNo, pages, urls) {
  if (pages <= 1) return '';
  const at = i => (i === 1 ? base : `${base}page/${i}/`);
  const prev = pageNo > 1 ? `<a rel="prev" href="${esc(urls.href(at(pageNo - 1)))}">← Newer</a>` : '<span></span>';
  const next = pageNo < pages ? `<a rel="next" href="${esc(urls.href(at(pageNo + 1)))}">Older →</a>` : '<span></span>';
  return `<nav class="pager" aria-label="Pagination">${prev}<span>Page ${pageNo} of ${pages}</span>${next}</nav>`;
}

function paginate(items, size) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: pages }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** Returns [{ path, html, indexable, lastmod }] for every page on the site. */
export function renderSite(model, config, urls) {
  const ctx = { config, model, urls };
  const out = [];
  const prof = model.profile;
  const person = personLd(model, config, urls);
  const latest = Math.max(prof.updated, ...model.posts.map(p => p.updated), ...model.notes.map(n => n.updated), 0);

  // Home
  const home = `<section class="profile">
${prof.picture ? `<img class="avatar" src="${esc(prof.picture)}" alt="" width="96" height="96">` : ''}
<h1>${esc(config.site.title || prof.name)}</h1>
${prof.about ? renderNote(prof.about) : ''}
${prof.website ? `<p><a href="${esc(prof.website)}" rel="me">${esc(prof.website.replace(/^https?:\/\//, ''))}</a></p>` : ''}
</section>
${model.posts.length ? `<section><h2 class="section-title">Latest writing</h2>${model.posts.slice(0, 5).map(p => postCard(p, urls)).join('\n')}${model.posts.length > 5 ? `<p><a href="${esc(urls.href('/blog/'))}">All posts →</a></p>` : ''}</section>` : ''}
${model.notes.length ? `<section><h2 class="section-title">Recent notes</h2>${model.notes.slice(0, 10).map(n => noteCard(n, urls)).join('\n')}<p><a href="${esc(urls.href('/notes/'))}">All notes →</a></p></section>` : ''}`;
  out.push({ path: '/', indexable: true, lastmod: latest, html: page({ ...ctx, path: '/', title: '', type: 'profile', ld: { '@type': 'ProfilePage', mainEntity: person, url: urls.abs('/') }, body: home }) });

  // Blog archive + posts
  if (model.posts.length) {
    const chunks = paginate(model.posts, config.pageSize);
    chunks.forEach((items, i) => {
      const n = i + 1;
      const path = n === 1 ? '/blog/' : `/blog/page/${n}/`;
      const body = `<h1>Blog${n > 1 ? ` <small>page ${n}</small>` : ''}</h1>\n${items.map(p => postCard(p, urls)).join('\n')}\n${pager('/blog/', n, chunks.length, urls)}`;
      out.push({ path, indexable: true, lastmod: items[0].updated, html: page({ ...ctx, path, title: n > 1 ? `Blog, page ${n}` : 'Blog', ld: { '@type': 'CollectionPage', url: urls.abs(path) }, prev: n > 1 ? (n === 2 ? '/blog/' : `/blog/page/${n - 1}/`) : null, next: n < chunks.length ? `/blog/page/${n + 1}/` : null, body }) });
    });
    for (const p of model.posts) {
      const description = p.summary || truncate(p.content.replace(/[#*_>`\[\]()!-]/g, ' '), 160);
      const body = `<article class="post">
<header><h1>${esc(p.title)}</h1><p class="meta">${time(p.published)}${p.updated > p.published + 86400 ? ` · updated ${time(p.updated)}` : ''}</p></header>
${p.image ? `<img class="hero" src="${esc(p.image)}" alt="" loading="eager">` : ''}
<div class="prose">${renderMarkdown(p.content)}</div>
${p.topics.length ? `<p class="tags">${p.topics.map(t => `<span>#${esc(t)}</span>`).join(' ')}</p>` : ''}
</article>`;
      const ld = { '@type': 'BlogPosting', headline: p.title, description, datePublished: iso(p.published), dateModified: iso(p.updated), url: urls.abs(p.path), mainEntityOfPage: urls.abs(p.path), author: person, ...(p.image ? { image: p.image } : {}), ...(p.topics.length ? { keywords: p.topics.join(', ') } : {}) };
      out.push({ path: p.path, indexable: true, lastmod: p.updated, html: page({ ...ctx, path: p.path, title: p.title, description, type: 'article', image: p.image, ld, published: p.published, modified: p.updated, body }) });
    }
  }

  // Notes archive + notes
  if (model.notes.length) {
    const chunks = paginate(model.notes, config.pageSize);
    chunks.forEach((items, i) => {
      const n = i + 1;
      const path = n === 1 ? '/notes/' : `/notes/page/${n}/`;
      const body = `<h1>Notes${n > 1 ? ` <small>page ${n}</small>` : ''}</h1>\n${items.map(x => noteCard(x, urls)).join('\n')}\n${pager('/notes/', n, chunks.length, urls)}`;
      out.push({ path, indexable: true, lastmod: items[0].updated, html: page({ ...ctx, path, title: n > 1 ? `Notes, page ${n}` : 'Notes', ld: { '@type': 'CollectionPage', url: urls.abs(path) }, prev: n > 1 ? (n === 2 ? '/notes/' : `/notes/page/${n - 1}/`) : null, next: n < chunks.length ? `/notes/page/${n + 1}/` : null, body }) });
    });
    for (const n of model.notes) {
      const title = noteTitle(n);
      const description = truncate(n.text, 160) || title;
      const body = `<article class="note note-single">\n${renderNote(n.content)}\n<p class="meta">${time(n.published)} · <a href="https://njump.me/${esc(n.event.id)}" rel="nofollow noopener">view on Nostr</a></p>\n</article>`;
      const ld = { '@type': 'SocialMediaPosting', headline: title, articleBody: n.text, datePublished: iso(n.published), url: urls.abs(n.path), author: person };
      out.push({ path: n.path, indexable: n.indexable, lastmod: n.updated, html: page({ ...ctx, path: n.path, title, description, type: 'article', ld, noindex: !n.indexable, published: n.published, body }) });
    }
  }

  // Links
  if (model.links.length) {
    const body = `<h1>Links</h1>\n${model.links.map(s => `<section class="links"><h2>${esc(s.title)}</h2>${s.description ? `<p>${esc(s.description)}</p>` : ''}<ul>${s.items.map(it => `<li><a href="${esc(it.url)}" rel="noopener">${esc(it.label || it.url.replace(/^https?:\/\//, ''))}</a></li>`).join('')}</ul></section>`).join('\n')}`;
    out.push({ path: '/links/', indexable: true, lastmod: Math.max(...model.links.map(s => s.updated)), html: page({ ...ctx, path: '/links/', title: 'Links', ld: { '@type': 'CollectionPage', url: urls.abs('/links/') }, body }) });
  }

  // 404 (not in sitemap)
  out.push({ path: '/404.html', indexable: false, lastmod: latest, html: page({ ...ctx, path: '/404.html', title: 'Not found', noindex: true, body: `<h1>Not found</h1><p><a href="${esc(urls.href('/'))}">Go home</a></p>` }) });
  return out;
}
