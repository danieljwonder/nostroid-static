#!/usr/bin/env node
import { crawlCheck } from '../src/crawl-check.js';

const dir = process.argv[2] || 'dist';
const r = await crawlCheck(dir);
for (const e of r.errors) console.error(`  ✗ ${e}`);
for (const w of r.warnings) console.error(`  ⚠ ${w} (in your content)`);
console.log(`${r.errors.length ? 'FAIL' : 'PASS'}: ${r.urls} sitemap URLs, ${r.links} internal links checked, ${r.errors.length} problems, ${r.warnings.length} content warnings (no JavaScript executed)`);
process.exit(r.errors.length ? 1 : 0);
