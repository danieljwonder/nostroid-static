/**
 * Mount a Nostroid site beside something that already lives on the same hostname.
 * `prefixes` is a comma-separated list like "/crypto,/podcast"; matching requests are
 * handed on untouched (on Cloudflare, `fetch(request)` from a Route reaches the
 * Custom Domain Worker or origin behind it).
 */
export function parsePrefixes(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => '/' + s.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(s => s !== '/');
}

export function isPassthrough(prefixes, pathname) {
  return prefixes.some(p => pathname === p || pathname.startsWith(p + '/'));
}
