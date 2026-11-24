const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => MAP[c]);

/** JSON for <script type="application/ld+json">, safe against </script> breakouts. */
export const jsonLd = obj => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export const iso = ts => new Date(ts * 1000).toISOString();
export const isoDate = ts => iso(ts).slice(0, 10);
export const humanDate = ts => new Date(ts * 1000).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function truncate(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?-]+$/, '') + '…';
}

/** Markup that is already safe. Only html``, raw() and join() create it. */
export class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const part = v => (v == null || v === false ? '' : v instanceof SafeHtml ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
/** Tagged template: every interpolation is escaped unless it is SafeHtml. Arrays are concatenated. */
export const html = (strings, ...vals) => new SafeHtml(strings.reduce((a, s, i) => a + s + (i < vals.length ? part(vals[i]) : ''), ''));
/** Trust a string as HTML. Use only for markup you produced (rendered Markdown/notes, fixed snippets). */
export const raw = s => (s instanceof SafeHtml ? s : new SafeHtml(String(s ?? '')));
export const join = (items, sep = '') => new SafeHtml(items.map(part).join(sep));
