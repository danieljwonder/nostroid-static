import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.xml': 'application/xml', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain', '.json': 'application/json' };

/** Plain static file server with no rewrites. That is the worst case we promise to work on. */
export function serveStatic(dir) {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const fp = path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await fs.readFile(fp);
      res.writeHead(200, { 'content-type': TYPES[path.extname(fp)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const pick = (html, re) => (html.match(re) || [])[1];
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Crawl a built site the way a non-JS crawler does: raw HTML only.
 * Every sitemap URL must return 200 and carry its title, description, matching canonical,
 * parseable JSON-LD and real body text. Every internal link must resolve.
 */
export async function crawlCheck(dir) {
  const robots = await fs.readFile(path.join(dir, 'robots.txt'), 'utf8');
  const sitemapUrl = pick(robots, /Sitemap:\s*(\S+)/);
  if (!sitemapUrl) throw new Error('robots.txt has no Sitemap line');
  const base = new URL(sitemapUrl.replace(/sitemap\.xml$/, ''));
  const sitemap = await fs.readFile(path.join(dir, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));

  const server = await serveStatic(dir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const toLocal = abs => origin + '/' + abs.slice(base.href.length);
  const errors = [];
  const warnings = [];
  const checkedLinks = new Set();
  try {
    for (const loc of locs) {
      const res = await fetch(toLocal(loc));
      const html = await res.text();
      const where = loc.slice(base.href.length - 1) || '/';
      if (res.status !== 200) { errors.push(`${where}: HTTP ${res.status}`); continue; }
      if (!pick(html, /<title>([^<]+)<\/title>/)) errors.push(`${where}: missing <title>`);
      if (!pick(html, /<meta name="description" content="([^"]+)"/)) errors.push(`${where}: missing meta description`);
      const canon = pick(html, /<link rel="canonical" href="([^"]+)"/);
      if (canon !== loc) errors.push(`${where}: canonical ${canon} != ${loc}`);
      if (/<meta name="robots" content="noindex/.test(html)) errors.push(`${where}: in sitemap but noindex`);
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try { JSON.parse(m[1]); } catch { errors.push(`${where}: invalid JSON-LD`); }
      }
      const main = pick(html, /<main id="main">([\s\S]*?)<\/main>/) || '';
      if (text(main).length < 20) errors.push(`${where}: <main> has almost no text without JS`);
      // Links inside the author's own writing are warnings (content to fix), not template failures.
      const prose = [...html.matchAll(/<div class="prose">[\s\S]*?<\/div>/g)].map(m => [m.index, m.index + m[0].length]);
      const inProse = i => prose.some(([a, b]) => i >= a && i < b);
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const href = m[1].replace(/&amp;/g, '&');
        if (/^(https?:|mailto:|#)/.test(href) && !href.startsWith(base.href)) continue;
        const local = href.startsWith(base.href) ? '/' + href.slice(base.href.length) : href;
        if (!local.startsWith(base.pathname)) continue;
        const key = `${inProse(m.index) ? 'c' : 't'}:${local}`;
        if (checkedLinks.has(key)) continue;
        checkedLinks.add(key);
        const r = await fetch(origin + '/' + local.slice(base.pathname.length));
        if (r.status !== 200) (inProse(m.index) ? warnings : errors).push(`${where}: broken internal link ${local}`);
      }
    }
  } finally {
    server.close();
  }
  return { urls: locs.length, links: checkedLinks.size, errors, warnings };
}
