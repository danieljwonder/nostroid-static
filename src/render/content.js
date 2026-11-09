import MarkdownIt from 'markdown-it';
import { esc } from './html.js';

const NOSTR_URI = /nostr:((?:npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+)/g;
const gateway = id => `https://njump.me/${id}`;
const shortId = id => id.slice(0, 10) + '…' + id.slice(-4);

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, opts, env, self) => {
  tokens[idx].attrSet('loading', 'lazy');
  tokens[idx].attrSet('decoding', 'async');
  return defaultImage(tokens, idx, opts, env, self);
};

/** Long-form (NIP-23) Markdown -> safe HTML. Raw HTML is disabled; unsafe URL schemes are rejected by markdown-it. */
export function renderMarkdown(src) {
  const withLinks = String(src || '').replace(NOSTR_URI, (_, id) => `[${shortId(id)}](${gateway(id)})`);
  return md.render(withLinks);
}

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|nostr:((?:npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+)/g;
const IMG_RE = /\.(?:jpe?g|png|gif|webp|avif)(?:\?[^\s]*)?$/i;
const VID_RE = /\.(?:mp4|webm|mov)(?:\?[^\s]*)?$/i;

/** Kind 1 note text -> safe HTML: escape, link URLs, inline images/video, keep line breaks. */
export function renderNote(src) {
  const text = String(src || '');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    out += esc(text.slice(last, m.index));
    if (m[1]) {
      const url = m[1];
      if (IMG_RE.test(url)) out += `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
      else if (VID_RE.test(url)) out += `<video src="${esc(url)}" controls preload="none"></video>`;
      else out += `<a href="${esc(url)}" rel="nofollow noopener">${esc(url.replace(/^https?:\/\//, ''))}</a>`;
    } else {
      out += `<a href="${esc(gateway(m[2]))}" rel="nofollow noopener">${esc(shortId(m[2]))}</a>`;
    }
    last = m.index + m[0].length;
  }
  out += esc(text.slice(last));
  const paras = out.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  return paras.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}
