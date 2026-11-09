import { spawn } from 'node:child_process';
import { SimplePool } from 'nostr-tools/pool';
import { syncKinds } from './config.js';
import { sync, outboxRelays } from './source/sync.js';
import { build } from './build.js';

function runDeploy(cmd, log) {
  return new Promise(resolve => {
    if (!cmd) return resolve(0);
    const child = spawn(cmd, { shell: true, stdio: 'inherit' });
    child.on('exit', code => {
      if (code !== 0) log(`deploy FAILED with exit code ${code}`);
      resolve(code ?? 1);
    });
  });
}

/**
 * Subscribe to the owner's new events; debounce; then sync -> build -> deploy.
 * Runs one full cycle on start so the site is current before listening.
 */
export async function watch({ config, store, outDir = 'dist', debounceMs = 5000, log = console.log }) {
  let running = false, pending = false, timer = null;

  async function cycle(reason) {
    if (running) { pending = true; return; }
    running = true;
    try {
      log(`[nostroid] ${reason}: syncing`);
      const s = await sync({ config, store });
      log(`[nostroid] sync: +${s.added} new, ${s.replaced} replaced, ${s.deleted} deleted, ${s.rejected} rejected`);
      const b = await build({ config, store, outDir });
      log(`[nostroid] build: ${b.pages} pages (${b.indexed} indexed)`);
      await runDeploy(config.deploy, log);
    } catch (e) {
      log(`[nostroid] cycle FAILED: ${e.message}`);
    } finally {
      running = false;
      if (pending) { pending = false; schedule('queued change'); }
    }
  }
  function schedule(reason) {
    clearTimeout(timer);
    timer = setTimeout(() => cycle(reason), debounceMs);
  }

  await cycle('startup');
  const relays = [...new Set([...config.relays.map(r => r.replace(/\/+$/, '')), ...(config.outbox !== false ? outboxRelays(await store.all(), config.pubkey) : [])])];
  const pool = new SimplePool();
  const sub = pool.subscribe(relays, { authors: [config.pubkey], kinds: syncKinds(config), since: Math.floor(Date.now() / 1000) }, {
    onevent: e => { log(`[nostroid] event kind ${e.kind} ${e.id.slice(0, 8)}`); schedule('new event'); }
  });
  log(`[nostroid] watching ${relays.length} relays`);
  const stop = () => { clearTimeout(timer); sub.close(); pool.close(relays); pool.destroy?.(); };
  process.once('SIGINT', () => { stop(); process.exit(0); });
  process.once('SIGTERM', () => { stop(); process.exit(0); });
  return stop;
}
