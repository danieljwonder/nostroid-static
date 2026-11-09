import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from './model.js';
import { makeUrls } from './render/layout.js';
import { renderSite } from './render/pages.js';
import { esc, iso, isoDate, truncate } from './render/html.js';
import { renderMarkdown } from './render/content.js';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

function assertSafeOutDir(outDir, config) {
  const abs = path.resolve(outDir);
  const forbidden = [path.parse(abs).root, process.cwd(), config.root].filter(Boolean).map(p => path.resolve(p));
  const containsProject = config.root && (path.resolve(config.root) + path.sep).startsWith(abs + path.sep);
  if (forbidden.includes(abs) || containsProject) throw new Error(`refusing to clean output dir ${abs}: choose a dedicated folder like dist/`);
  return abs;
}

function sitemap(pages, urls) {
  const rows = pages.filter(p => p.indexable)
    .map(p => `  <url><loc>${esc(urls.abs(p.path))}</loc><lastmod>${isoDate(p.lastmod)}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

function atom(model, config, urls) {
  const title = config.site.title || model.profile.name;
  const updated = Math.max(model.profile.updated, ...model.posts.map(p => p.updated), 0);
  const entries = model.posts.slice(0, 50).map(p => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(urls.abs(p.path))}"/>
    <id>${esc(urls.abs(p.path))}</id>
    <published>${iso(p.published)}</published>
    <updated>${iso(p.updated)}</updated>
    ${p.summary ? `<summary>${esc(p.summary)}</summary>` : `<summary>${esc(truncate(p.content, 280))}</summary>`}
    <content type="html">${esc(renderMarkdown(p.content))}</content>
  </entry>`);
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(title)}</title>
  <link href="${esc(urls.abs('/'))}"/>
  <link rel="self" href="${esc(urls.abs('/feed.xml'))}"/>
  <id>${esc(urls.abs('/'))}</id>
  <updated>${iso(updated)}</updated>
  <author><name>${esc(model.profile.name)}</name></author>
${entries.join('\n')}
</feed>
`;
}

async function writeFile(outDir, rel, data) {
  const fp = path.join(outDir, rel);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, data);
}

/** Store -> dist/. Reads only the local event store; never touches the network. */
export async function build({ config, store, outDir = 'dist' }) {
  const out = assertSafeOutDir(outDir, config);
  const events = await store.all();
  const { model, slugs } = buildModel(events, config, await store.readSlugs());
  await store.writeSlugs(slugs);
  const urls = makeUrls(config);
  const pages = renderSite(model, config, urls);

  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  for (const p of pages) {
    const rel = p.path.endsWith('/') ? path.join(p.path, 'index.html') : p.path;
    await writeFile(out, rel, p.html);
  }
  await writeFile(out, 'sitemap.xml', sitemap(pages, urls));
  await writeFile(out, 'robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${urls.abs('/sitemap.xml')}\n`);
  await writeFile(out, 'feed.xml', atom(model, config, urls));
  await fs.cp(ASSETS, path.join(out, 'assets'), { recursive: true });

  // User's own static files (e.g. .well-known/nostr.json, favicon) are copied verbatim.
  const pub = path.resolve(config.root || '.', config.publicDir);
  try { await fs.cp(pub, out, { recursive: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }

  return {
    pages: pages.length,
    indexed: pages.filter(p => p.indexable).length,
    posts: model.posts.length,
    notes: model.notes.length,
    linkSets: model.links.length,
    outDir: out
  };
}
