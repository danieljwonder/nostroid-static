/**
 * Default partials: the markup every theme starts from. A theme may override any of them.
 *
 * Signature: (vm, ctx) => SafeHtml
 *   vm   the partial's view-model (documented in THEMES.md); plain data, unescaped strings
 *   ctx  { config, h, p }
 *        h  helpers: html`` (escapes interpolations), raw(), join(), time(ts), date(ts), iso(ts)
 *        p  the resolved partials, so a partial can call another (including overridden ones)
 *
 * Fields ending in `Html` are already-safe HTML (rendered Markdown, rendered notes).
 * Class names used here are the public styling contract: keep them stable.
 */

export const partials = {
  layout: ({ header, body, footer, mode }, { h }) => h.html`<a class="skip" href="#main">Skip to content</a>
${header}
<main id="main" data-mode="${mode}">
${body}
</main>
${footer}`,

  header: ({ siteTitle, homeHref, nav, schemeToggle }, { h }) => h.html`<header class="site-header">
<a class="site-title" href="${homeHref}">${siteTitle}</a>
<nav aria-label="Main">${nav.map(i => h.html`<a href="${i.href}"${i.current ? h.raw(' aria-current="page"') : ''}>${i.label}</a>`)}</nav>
${schemeToggle ? h.raw('<button class="theme-toggle" type="button" hidden aria-label="Toggle dark mode">◐</button>\n') : ''}</header>`,

  footer: ({ profile, poweredBy }, { h }) => h.html`<footer class="site-footer">
<p><a href="${profile.nostrUrl}" rel="me">${profile.name} on Nostr</a>${poweredBy ? h.raw(' · Powered by <a href="https://nostroid.com">Nostroid</a>') : ''}</p>
</footer>`,

  profile: ({ title, picture, aboutHtml, website, websiteLabel }, { h }) => h.html`<section class="profile">
${picture ? h.html`<img class="avatar" src="${picture}" alt="" width="96" height="96">` : ''}
<h1>${title}</h1>
${aboutHtml || ''}
${website ? h.html`<p><a href="${website}" rel="me">${websiteLabel}</a></p>` : ''}
</section>`,

  home: ({ profile, posts, allPostsHref, notes, allNotesHref }, { h, p }) => h.html`${p.profile(profile)}
${posts.length ? h.html`<section><h2 class="section-title">Latest writing</h2>${h.join(posts.map(x => p.postCard(x)), '\n')}${allPostsHref ? h.html`<p><a href="${allPostsHref}">All posts →</a></p>` : ''}</section>` : ''}
${notes.length ? h.html`<section><h2 class="section-title">Recent notes</h2>${h.join(notes.map(x => p.noteCard(x)), '\n')}<p><a href="${allNotesHref}">All notes →</a></p></section>` : ''}`,

  postCard: ({ title, href, published, summary }, { h }) => h.html`<article class="card">
<h2><a href="${href}">${title}</a></h2>
<p class="meta">${h.time(published)}</p>
${summary ? h.html`<p>${summary}</p>` : ''}
</article>`,

  noteCard: ({ html, href, published }, { h }) => h.html`<article class="note">
${html}
<p class="meta"><a href="${href}">${h.time(published)}</a></p>
</article>`,

  blog: ({ posts }, { h, p }) => h.html`<h1>Blog</h1>
${h.join(posts.map(x => p.postCard(x)), '\n')}`,

  post: ({ title, published, updated, image, html, topics, nostrUrl }, { h }) => h.html`<article class="post">
<header><h1>${title}</h1><p class="meta">${h.time(published)}${updated ? h.html` · updated ${h.time(updated)}` : ''}</p></header>
${image ? h.html`<img class="hero" src="${image}" alt="" loading="eager">` : ''}
<div class="prose">${html}</div>
${topics.length ? h.html`<p class="tags">${h.join(topics.map(t => h.html`<span>#${t}</span>`), ' ')}</p>` : ''}
<p class="meta"><a href="${nostrUrl}" rel="nofollow noopener">View on Nostr</a></p>
</article>`,

  notes: ({ notes, older, months }, { h, p }) => h.html`<h1>Notes</h1>
${h.join(notes.map(x => p.noteCard(x)), '\n')}
${older ? p.pager({ prev: null, next: { href: older.href, label: `Older: ${older.label}` } }) : ''}
${months.length > 1 ? p.archive({ months }) : ''}`,

  month: ({ label, notes, newer, older }, { h, p }) => h.html`<h1>Notes <small>${label}</small></h1>
${h.join(notes.map(x => p.noteCard(x)), '\n')}
${p.pager({ prev: newer, next: older })}`,

  note: ({ html, published, month, nostrUrl }, { h }) => h.html`<article class="note note-single">
${html}
<p class="meta">${h.time(published)} · <a href="${month.href}">${month.label}</a> · <a href="${nostrUrl}" rel="nofollow noopener">view on Nostr</a></p>
</article>`,

  /** prev/next: { href, label } | null. Arrows are added here. */
  pager: ({ prev, next }, { h }) => h.html`<nav class="pager" aria-label="Archive">${prev ? h.html`<a rel="prev" href="${prev.href}">← ${prev.label}</a>` : h.raw('<span></span>')}${next ? h.html`<a rel="next" href="${next.href}">${next.label} →</a>` : h.raw('<span></span>')}</nav>`,

  archive: ({ months }, { h }) => h.html`<section class="archive"><h2 class="section-title">Archive</h2><ul>${months.map(m => h.html`<li><a href="${m.href}">${m.label}</a> <span class="meta">${m.count}</span></li>`)}</ul></section>`,

  links: ({ lists }, { h }) => h.html`<h1>Links</h1>
${h.join(lists.map(s => h.html`<section class="links"><h2>${s.title}</h2>${s.description ? h.html`<p>${s.description}</p>` : ''}<ul>${s.items.map(it => h.html`<li><a href="${it.url}" rel="noopener">${it.label}</a></li>`)}</ul></section>`), '\n')}`,

  podcast: ({ title, description, image, feedHref, episodes }, { h, p }) => h.html`<section class="show">
${image ? h.html`<img class="show-art" src="${image}" alt="" width="160" height="160">` : ''}
<h1>${title}</h1>
${description ? h.html`<p>${description}</p>` : ''}
${feedHref ? h.html`<p class="meta"><a href="${feedHref}">Subscribe via RSS</a></p>` : ''}
</section>
<section class="episodes">${h.join(episodes.map(e => p.episodeCard(e)), '\n')}</section>`,

  episodeCard: ({ title, href, published, description, duration }, { h }) => h.html`<article class="card episode">
<h2><a href="${href}">${title}</a></h2>
<p class="meta">${h.time(published)}${duration ? h.html` · ${h.duration(duration)}` : ''}</p>
${description ? h.html`<p>${description}</p>` : ''}
</article>`,

  episode: ({ title, published, duration, audio, html, show, nostrUrl, newer, older }, { h, p }) => h.html`<article class="post episode-single">
<header><p class="meta"><a href="${show.href}">${show.title}</a></p><h1>${title}</h1><p class="meta">${h.time(published)}${duration ? h.html` · ${h.duration(duration)}` : ''}</p></header>
<audio controls preload="metadata" src="${audio[0].url}">${audio.map(a => h.html`<a href="${a.url}">Download (${a.type})</a>`)}</audio>
<div class="prose">${html}</div>
<p class="meta"><a href="${audio[0].url}" download>Download audio</a> · <a href="${nostrUrl}" rel="nofollow noopener">View on Nostr</a></p>
${newer || older ? p.pager({ prev: newer ? { href: newer.href, label: newer.title } : null, next: older ? { href: older.href, label: older.title } : null }) : ''}
</article>`,

  notFound: ({ homeHref }, { h }) => h.html`<h1>Not found</h1><p><a href="${homeHref}">Go home</a></p>`
};

export const PARTIAL_NAMES = Object.keys(partials);
