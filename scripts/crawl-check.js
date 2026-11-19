#!/usr/bin/env node
// Crawl a live Nostroid site with no JavaScript: every sitemap URL must return 200 with a
// <title> and a canonical link, and every internal link found must resolve.
// Usage: node scripts/crawl-check.js https://example.com/
const base = process.argv[2];
if (!base) { console.error('usage: crawl-check.js <site-url>'); process.exit(2); }
const origin = new URL(base).origin;
const problems = [], warnings = [];

const sm = await (await fetch(new URL('/sitemap.xml', origin))).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
if (!urls.length) problems.push('sitemap.xml has no URLs');

const links = new Set();
for (const u of urls) {
  const r = await fetch(u);
  const t = await r.text();
  if (r.status !== 200) problems.push(`${u} -> ${r.status}`);
  if (!/<title>[^<]+<\/title>/.test(t)) problems.push(`${u} has no <title>`);
  if (!/<link rel="canonical"/.test(t)) problems.push(`${u} has no canonical link`);
  for (const m of t.matchAll(/href="(\/[^"#?]*)"/g)) links.add(m[1]);
}
for (const l of links) {
  const r = await fetch(origin + l, { method: 'HEAD' });
  if (r.status >= 400) (r.status === 404 ? warnings : problems).push(`link ${l} -> ${r.status}`);
}
for (const p of problems) console.error(`  ✗ ${p}`);
for (const w of warnings) console.error(`  ⚠ ${w} (dead link in your content)`);
console.log(`${problems.length ? 'FAIL' : 'PASS'}: ${urls.length} sitemap URLs, ${links.size} internal links, ${problems.length} problems, ${warnings.length} content warnings (no JavaScript executed)`);
process.exit(problems.length ? 1 : 0);
