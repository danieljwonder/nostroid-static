import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceEvents } from '../core/events.js';
import { buildModel } from '../core/model.js';
import { contentKinds, authorPubkeys, resolveConfig } from '../core/config.js';
import { matchRoute } from '../core/render/routes.js';
import { respond } from '../core/site.js';
import { keypair, sign, config } from './helpers.js';

const setup = () => {
  const me = keypair(), show = keypair(), stranger = keypair();
  const cfg = config(me.pk, { podcasts: [{ pubkey: show.pk, path: '/buidlberg/', feed: '/buidlberg/feed.xml' }] });
  const ev = [
    sign(me.sk, 0, JSON.stringify({ name: 'Aether' }), [], 100),
    sign(show.sk, 10154, '', [['title', 'Buidlberg'], ['description', 'Crypto, infrastructure & autonomy.'], ['image', 'https://img.example/art.png'], ['website', 'https://example.com/buidlberg/'], ['p', me.pk, 'host']], 200),
    sign(show.sk, 54, '## Stories\n\n- One\n- Two', [['title', 'First <ep>'], ['description', 'Desc one'], ['audio', 'https://cdn.example/m/2026-11-24.mp3', 'audio/mpeg'], ['i', 'podcast:item:guid:https://example.com/crypto/episodes/2026-11-24'], ['duration', '358'], ['published_at', '1000']], 1001),
    sign(show.sk, 54, 'notes', [['title', 'Second'], ['audio', 'https://cdn.example/m/2026-11-25.mp3'], ['i', 'podcast:item:guid:4ZMPUV3oTxdEin3EU8DJ5']], 2000),
    sign(show.sk, 54, 'no audio', [['title', 'Broken']], 2100),
    sign(stranger.sk, 54, 'forged', [['title', 'Fake'], ['audio', 'https://cdn.example/x.mp3']], 2200)
  ];
  return { me, show, stranger, cfg, ev };
};

test('config: podcasts validated; kinds and authors widen', () => {
  const me = keypair(), show = keypair();
  assert.throws(() => config(me.pk, { podcasts: [{ pubkey: show.pk, path: '/blog/' }] }), /reserved/);
  assert.throws(() => config(me.pk, { podcasts: [{ pubkey: show.pk, path: '/a/b/' }] }), /single lowercase segment/);
  assert.throws(() => config(me.pk, { podcasts: [{ pubkey: show.pk, path: 'x' }, { pubkey: show.pk, path: '/x/' }] }), /duplicate/);
  assert.throws(() => config(me.pk, { podcasts: [{ pubkey: 'nope', path: '/x/' }] }), /pubkey/);
  const cfg = config(me.pk, { podcasts: [{ pubkey: show.pk, path: 'buidlberg' }] });
  assert.deepEqual(cfg.podcasts, [{ pubkey: show.pk, slug: 'buidlberg', path: '/buidlberg/', feed: '' }]);
  assert.deepEqual(authorPubkeys(cfg), [me.pk, show.pk]);
  assert.ok(contentKinds(cfg).includes(54) && contentKinds(cfg).includes(10154));
  assert.ok(!contentKinds(config(me.pk)).includes(54));
});

test('reduceEvents with several owners keeps each author\'s events, rejects strangers, scopes deletions', () => {
  const { me, show, stranger, ev } = setup();
  const r = reduceEvents(ev, [me.pk, show.pk]);
  assert.equal(r.rejected, 1);
  assert.ok(r.events.every(e => e.pubkey !== stranger.pk));
  // a deletion signed by the owner cannot remove the show's episode
  const ep = ev[2];
  const badDel = sign(me.sk, 5, '', [['e', ep.id]], 3000);
  assert.ok(reduceEvents([...ev, badDel], [me.pk, show.pk]).events.some(e => e.id === ep.id));
  const goodDel = sign(show.sk, 5, '', [['e', ep.id]], 3000);
  assert.ok(!reduceEvents([...ev, goodDel], [me.pk, show.pk]).events.some(e => e.id === ep.id));
});

test('model: show metadata, episodes with slugs from guid tail or title, broken ones dropped', () => {
  const { me, show, cfg, ev } = setup();
  const m = buildModel(reduceEvents(ev, [me.pk, show.pk]).events, cfg);
  assert.equal(m.shows.length, 1);
  const s = m.shows[0];
  assert.equal(s.title, 'Buidlberg');
  assert.equal(s.path, '/buidlberg/');
  assert.deepEqual(s.hosts, [{ pubkey: me.pk, role: 'host' }]);
  assert.deepEqual(s.episodes.map(e => e.slug), ['second', '2026-11-24']);
  assert.equal(s.episodes[1].duration, 358);
  assert.equal(s.episodes[1].published, 1000);
  assert.deepEqual(s.episodes[1].audio, [{ url: 'https://cdn.example/m/2026-11-24.mp3', type: 'audio/mpeg' }]);
  assert.equal(s.episodes[0].audio[0].type, 'audio/mpeg');
});

test('routes: show and episode pages, nav, sitemap, JSON-LD, RSS link; unknown show 404s', () => {
  const { me, show, cfg, ev } = setup();
  const events = reduceEvents(ev, [me.pk, show.pk]).events;
  assert.deepEqual(matchRoute('/buidlberg/'), { name: 'podcast', show: 'buidlberg' });
  assert.deepEqual(matchRoute('/buidlberg/2026-11-24/'), { name: 'episode', show: 'buidlberg', slug: '2026-11-24' });
  assert.deepEqual(matchRoute('/blog/'), { name: 'blog' });
  const home = respond(events, cfg, '/');
  assert.match(home.body, /<a href="\/buidlberg\/">Buidlberg<\/a>/);
  const showPage = respond(events, cfg, '/buidlberg/');
  assert.equal(showPage.status, 200);
  assert.match(showPage.body, /"@type":"PodcastSeries"/);
  assert.match(showPage.body, /type="application\/rss\+xml" title="Buidlberg" href="\/buidlberg\/feed.xml"/);
  assert.match(showPage.body, /Subscribe via RSS/);
  assert.match(showPage.body, /First &lt;ep&gt;/);
  assert.match(showPage.body, /5 min/);
  const ep = respond(events, cfg, '/buidlberg/2026-11-24/');
  assert.equal(ep.status, 200);
  assert.match(ep.body, /<title>First &lt;ep&gt; · Test Site<\/title>/);
  assert.match(ep.body, /"@type":"PodcastEpisode"/);
  assert.match(ep.body, /"contentUrl":"https:\/\/cdn.example\/m\/2026-11-24.mp3"/);
  assert.match(ep.body, /<audio controls preload="metadata" src="https:\/\/cdn.example\/m\/2026-11-24.mp3">/);
  assert.match(ep.body, /<li>One<\/li>/);
  assert.match(ep.body, /rel="prev" href="\/buidlberg\/second\/"/);
  assert.equal(respond(events, cfg, '/buidlberg/nope/').status, 404);
  assert.equal(respond(events, cfg, '/other/').status, 404);
  const sm = respond(events, cfg, '/sitemap.xml').body;
  assert.ok(sm.includes('https://example.com/buidlberg/') && sm.includes('https://example.com/buidlberg/2026-11-24/'));
  // without podcasts configured the same paths are plain 404s and the nav has no show
  const plain = respond(events.filter(e => e.pubkey === me.pk), config(me.pk), '/buidlberg/');
  assert.equal(plain.status, 404);
});

test('episode slug: r tag under this site\'s show path wins; foreign or malformed r tags fall back to the guid', () => {
  const me = keypair(), show = keypair();
  const cfg = config(me.pk, { podcasts: [{ pubkey: show.pk, path: '/buidlberg/' }] });
  const site = cfg.site.url;
  const ep = (r, guid, at) => sign(show.sk, 54, '', [['title', 'T' + at], ['audio', 'https://cdn.example/a.mp3'], ['i', `podcast:item:guid:${guid}`], ...(r ? [['r', r]] : [])], at);
  const ev = [
    ep(new URL('buidlberg/31-forged-routes/', site).href, 'https://x.example/e/2026-11-27', 10),
    ep('https://elsewhere.example/buidlberg/hijack/', 'https://x.example/e/2026-11-26', 20),
    ep(new URL('buidlberg/Bad Slug/', site).href, 'https://x.example/e/2026-11-25', 30),
    ep(new URL('buidlberg/feed.xml', site).href, 'https://x.example/e/2026-11-24', 40),
    ep(null, 'https://x.example/e/2026-11-23', 50)
  ];
  const s = buildModel(reduceEvents(ev, [me.pk, show.pk]).events, cfg).shows[0];
  assert.deepEqual(s.episodes.map(e => e.slug).sort(), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '31-forged-routes'].sort());
  const page = respond(ev, cfg, '/buidlberg/31-forged-routes/');
  assert.equal(page.status, 200);
  assert.equal(respond(ev, cfg, '/buidlberg/2026-11-27/').status, 404);
});
