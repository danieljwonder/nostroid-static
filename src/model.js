import { createHash } from 'node:crypto';
import { npubEncode } from 'nostr-tools/nip19';
import { dTag } from './store.js';

export const RESERVED = new Set(['blog', 'notes', 'links', 'assets', 'page', 'feed.xml', 'sitemap.xml', 'robots.txt', '404.html', 'index.html']);

const tag = (e, name) => (e.tags.find(t => t[0] === name) || [])[1];

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

export function isReply(e) {
  return e.tags.some(t => t[0] === 'e' && t[3] !== 'mention');
}

export function plainText(s) {
  return String(s || '').replace(/https?:\/\/\S+/g, '').replace(/nostr:\S+/g, '').replace(/\s+/g, ' ').trim();
}

function parseProfile(e, pubkey) {
  let p = {};
  if (e) { try { p = JSON.parse(e.content) || {}; } catch { p = {}; } }
  const npub = npubEncode(pubkey);
  return {
    pubkey, npub,
    name: String(p.display_name || p.displayName || p.name || '').trim() || npub.slice(0, 12) + '…',
    about: String(p.about || ''),
    picture: /^https:\/\//.test(p.picture || '') ? p.picture : '',
    banner: /^https:\/\//.test(p.banner || '') ? p.banner : '',
    website: /^https?:\/\//.test(p.website || '') ? p.website : '',
    nip05: String(p.nip05 || ''),
    lud16: String(p.lud16 || ''),
    updated: e ? e.created_at : 0
  };
}

/**
 * Turn stored events into the site model. Slug assignments are stable:
 * existing entries in `slugs` are never changed; new posts get the next free slug
 * in first-published order.
 */
export function buildModel(events, config, slugs = {}) {
  const pk = config.pubkey;
  const mine = events.filter(e => e.pubkey === pk);
  const profile = parseProfile(mine.find(e => e.kind === 0), pk);
  const nextSlugs = { ...slugs };
  const taken = new Set(Object.values(nextSlugs));

  const posts = !config.features.longform ? [] : mine
    .filter(e => e.kind === 30023 && dTag(e))
    .map(e => {
      const published = parseInt(tag(e, 'published_at'), 10);
      return {
        type: 'post', event: e,
        key: `30023:${pk}:${dTag(e)}`,
        d: dTag(e),
        title: (tag(e, 'title') || '').trim() || dTag(e),
        summary: (tag(e, 'summary') || '').trim(),
        image: /^https:\/\//.test(tag(e, 'image') || '') ? tag(e, 'image') : '',
        topics: e.tags.filter(t => t[0] === 't' && t[1]).map(t => t[1]),
        published: Number.isFinite(published) && published > 0 ? published : e.created_at,
        updated: e.created_at,
        content: e.content
      };
    })
    .sort((a, b) => a.published - b.published || (a.key < b.key ? -1 : 1));

  for (const p of posts) {
    if (!nextSlugs[p.key]) {
      // Some clients write random d-tags (e.g. "4ZMPUV3oTxdEin3EU8DJ5"); a title makes a far better URL.
      const preferTitle = looksRandom(p.d) && slugify(p.title);
      let base = (preferTitle ? slugify(p.title) : slugify(p.d)) || slugify(p.title) || 'post-' + createHash('sha256').update(p.key).digest('hex').slice(0, 8);
      if (RESERVED.has(base)) base = `${base}-post`;
      let s = base, n = 2;
      while (taken.has(s)) s = `${base}-${n++}`;
      nextSlugs[p.key] = s;
      taken.add(s);
    }
    p.slug = nextSlugs[p.key];
    p.path = `/${p.slug}/`;
  }
  posts.sort((a, b) => b.published - a.published || (a.key < b.key ? -1 : 1));

  const notes = !config.features.notes ? [] : mine
    .filter(e => e.kind === 1 && (config.features.replies || !isReply(e)))
    .map(e => ({
      type: 'note', event: e, key: e.id,
      path: `/notes/${e.id.slice(0, 16)}/`,
      published: e.created_at, updated: e.created_at,
      content: e.content,
      text: plainText(e.content),
      indexable: plainText(e.content).length >= config.notes.indexMinChars
    }))
    .sort((a, b) => b.published - a.published || (a.key < b.key ? -1 : 1));

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

  return { model: { profile, posts, notes, links }, slugs: nextSlugs };
}
