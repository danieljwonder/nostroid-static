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

/**
 * Stable pagination. Archive pages are numbered from the OLDEST item, so once a page is
 * full its content and URL never change: publishing one note touches the index page,
 * not every archive page. The index (`base`) always shows the newest `size` items.
 * Page k holds items [(k-1)*size, k*size) counted from the oldest; a page is only created
 * once it has fully dropped off the index, so no page duplicates the index.
 *
 * Returns [{ path, items (newest first), newer, older, label }].
 */
export function stablePages(itemsNewestFirst, size, base) {
  const total = itemsNewestFirst.length;
  const oldestFirst = [...itemsNewestFirst].reverse();
  const last = Math.max(0, Math.ceil(total / size) - 1); // highest archive page number
  const at = k => (k > last || k < 1 ? null : `${base}page/${k}/`);
  const out = [{ path: base, items: itemsNewestFirst.slice(0, size), newer: null, older: at(last), label: '' }];
  for (let k = last; k >= 1; k--) {
    out.push({
      path: at(k),
      items: oldestFirst.slice((k - 1) * size, k * size).reverse(),
      newer: k === last ? base : at(k + 1),
      older: at(k - 1),
      label: `page ${k}`
    });
  }
  return out;
}

function pager(p, urls) {
  if (!p.newer && !p.older) return '';
  const newer = p.newer ? `<a rel="prev" href="${esc(urls.href(p.newer))}">← Newer</a>` : '<span></span>';
  const older = p.older ? `<a rel="next" href="${esc(urls.href(p.older))}">Older →</a>` : '<span></span>';
  return `<nav class="pager" aria-label="Pagination">${newer}${older}</nav>`;
}

function archivePages(ctx, items, base, name, card) {
  return stablePages(items, ctx.config.pageSize, base).map(p => ({
    path: p.path,
    indexable: true,
    lastmod: Math.max(...p.items.map(i => i.updated)),
    html: page({
      ...ctx,
      path: p.path,
      title: p.label ? `${name}, ${p.label}` : name,
      ld: { '@type': 'CollectionPage', url: ctx.urls.abs(p.path) },
      prev: p.newer,
      next: p.older,
      body: `<h1>${name}${p.label ? ` <small>${p.label}</small>` : ''}</h1>\n${p.items.map(card).join('\n')}\n${pager(p, ctx.urls)}`
    })
  }));
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
    out.push(...archivePages(ctx, model.posts, '/blog/', 'Blog', p => postCard(p, urls)));
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
    out.push(...archivePages(ctx, model.notes, '/notes/', 'Notes', x => noteCard(x, urls)));
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
