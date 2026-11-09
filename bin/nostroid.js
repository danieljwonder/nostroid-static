#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { EventStore } from '../src/store.js';
import { sync } from '../src/source/sync.js';
import { build } from '../src/build.js';
import { watch } from '../src/watch.js';

const HELP = `nostroid <command> [options]

Commands:
  sync     Fetch your events from relays into the local store
  build    Render the local store to static HTML
  watch    Sync + build (+ deploy) whenever you publish

Options:
  --config <file>   Config file (default: nostroid.config.js)
  --content <dir>   Event store directory (default: content)
  --out <dir>       Output directory (default: dist)
  --full            sync: re-read everything instead of incremental
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: 'nostroid.config.js' },
    content: { type: 'string', default: 'content' },
    out: { type: 'string', default: 'dist' },
    full: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
});

const cmd = positionals[0];
if (values.help || !cmd) { console.log(HELP); process.exit(cmd ? 0 : 1); }

try {
  const config = await loadConfig(values.config);
  const store = new EventStore(path.resolve(config.root, values.content));
  const outDir = path.resolve(config.root, values.out);
  if (cmd === 'sync') {
    const s = await sync({ config, store, full: values.full });
    console.log(`synced ${s.received} events (${s.incremental ? 'incremental' : 'full'}): +${s.added} new, ${s.replaced} replaced, ${s.deleted} deleted, ${s.rejected} rejected`);
    process.exit(0);
  } else if (cmd === 'build') {
    const b = await build({ config, store, outDir });
    console.log(`built ${b.pages} pages (${b.indexed} indexed): ${b.posts} posts, ${b.notes} notes, ${b.linkSets} link sets -> ${b.outDir}`);
  } else if (cmd === 'watch') {
    await watch({ config, store, outDir });
  } else {
    console.error(`unknown command: ${cmd}\n\n${HELP}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`nostroid: ${e.message}`);
  process.exit(1);
}
