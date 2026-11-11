import { npubEncode } from 'nostr-tools/nip19';
import { dTag, tag } from './events.js';

export const RESERVED = new Set(['blog', 'notes', 'links', 'assets', 'feed.xml', 'sitemap.xml', 'robots.txt', '404.html', 'index.html', '_refresh']);

export function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** No separators, 10+ chars, mixes letters and digits: almost certainly machine-generated. */
export function looksRandom(d) {
  const s = String(d || '');
  return s.length >= 10 && !/[-_\s.]/.test(s) && /\d/.test(s) && /[a-z]/i.test(s);
}

export const isReply = e => e.tags.some(t => t[0] === 'e' && t[3] !== 'mention');

export const plainText = s => String(s || '').replace(/https?:\/\/\S+/g, '').replace(/nostr:\S+/g, '').replace(/\s+/g, ' ').trim();

/** UTC year/month bucket for archives. */
export function monthOf(ts) {
  const d = new Date(ts * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
export const monthPath = (y, m) => `/notes/${y}/${String(m).padStart(2, '0')}/`;

function parseProfile(e, pubkey) {
  let p = {};
  if (e) { try { p = JSON.parse(e.content) || {}; } catch { p = {}; } }
  const npub = npubEncode(pubkey);
  const https = v => (/^https:\/\//.test(v || '') ? v : '');
  return {
    pubkey, npub,
    name: String(p.display_name || p.displayName || p.name || '').trim() || npub.slice(0, 12) + '…',
    about: String(p.about || ''),
    picture: https(p.picture), banner: https(p.banner),
    website: /^https?:\/\//.test(p.website || '') ? p.website : '',
    nip05: String(p.nip05 || ''), lud16: String(p.lud16 || ''),
    updated: e ? e.created_at : 0
  };
}

/**
 * Current events (already reduced) -> site model. Deterministic: no state files.
 * Post slugs: d-tag, or title when the d-tag is machine-generated. On collision the
 * NEWER post gets a short id suffix, so an older post's URL never moves.
 */
export function buildModel(events, config) {
  const pk = config.pubkey;
  const mine = events.filter(e => e.pubkey === pk);
  const profile = parseProfile(mine.find(e => e.kind === 0), pk);

  const posts = !config.features.longform ? [] : mine
    .filter(e => e.kind === 30023 && dTag(e))
    .map(e => {
      const published = parseInt(tag(e, 'published_at'), 10);
      const title = (tag(e, 'title') || '').trim() || dTag(e);
      return {
        type: 'post', event: e, d: dTag(e), title,
        summary: (tag(e, 'summary') || '').trim(),
        image: /^https:\/\//.test(tag(e, 'image') || '') ? tag(e, 'image') : '',
        topics: e.tags.filter(t => t[0] === 't' && t[1]).map(t => t[1]),
        published: Number.isFinite(published) && published > 0 ? published : e.created_at,
        updated: e.created_at,
        content: e.content
      };
    })
    .sort((a, b) => a.published - b.published || (a.event.id < b.event.id ? -1 : 1)); // oldest first for slug priority

  const taken = new Set();
  for (const p of posts) {
    let base = (looksRandom(p.d) && slugify(p.title)) ? slugify(p.title) : (slugify(p.d) || slugify(p.title) || 'post');
    if (RESERVED.has(base)) base = `${base}-post`;
    let s = base;
    if (taken.has(s)) s = `${base}-${p.event.id.slice(0, 6)}`;
    taken.add(s);
    p.slug = s;
    p.path = `/blog/${s}/`;
  }
  posts.sort((a, b) => b.published - a.published || (a.event.id < b.event.id ? -1 : 1));

  const notes = !config.features.notes ? [] : mine
    .filter(e => e.kind === 1 && (config.features.replies || !isReply(e)))
    .map(e => ({
      type: 'note', event: e,
      path: `/notes/${e.id.slice(0, 16)}/`,
      published: e.created_at, updated: e.created_at,
      content: e.content, text: plainText(e.content),
      indexable: plainText(e.content).length >= config.notes.indexMinChars,
      ...monthOf(e.created_at)
    }))
    .sort((a, b) => b.published - a.published || (a.event.id < b.event.id ? -1 : 1));

  const months = [];
  for (const n of notes) {
    const last = months[months.length - 1];
    if (last && last.year === n.year && last.month === n.month) last.notes.push(n);
    else months.push({ year: n.year, month: n.month, path: monthPath(n.year, n.month), notes: [n] });
  }

  const links = !config.features.links ? [] : mine
    .filter(e => e.kind === 30003)
    .map(e => ({
      title: (tag(e, 'title') || dTag(e) || 'Links').trim(),
      description: (tag(e, 'description') || '').trim(),
      updated: e.created_at,
      items: e.tags.filter(t => t[0] === 'r' && /^https?:\/\//.test(t[1] || '')).map(t => ({ url: t[1], label: (t[2] || '').trim() }))
    }))
    .filter(s => s.items.length)
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

  return { profile, posts, notes, months, links };
}
