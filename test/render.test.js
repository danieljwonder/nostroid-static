import test from 'node:test';
import assert from 'node:assert/strict';
import { renderNote, renderMarkdown } from '../src/render/content.js';
import { jsonLd } from '../src/render/html.js';

test('notes escape HTML and link URLs and images', () => {
  const html = renderNote('<script>alert(1)</script>\nsee https://example.com/a and https://img.example/x.png\n\nnext para');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<a href="https://example.com/a"'));
  assert.ok(html.includes('<img src="https://img.example/x.png"'));
  assert.equal((html.match(/<p>/g) || []).length, 2);
});

test('markdown: tables, lazy images, no raw HTML, no javascript: links', () => {
  const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n![alt](https://x/y.jpg)\n\n<b>raw</b>\n\n[x](javascript:alert(1))');
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(!html.includes('<b>raw</b>'));
  assert.ok(!html.includes('href="javascript:'));
});

test('nostr: URIs become links', () => {
  const html = renderNote('hi nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  assert.ok(html.includes('https://njump.me/npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'));
});

test('JSON-LD cannot break out of its script tag', () => {
  const out = jsonLd({ headline: '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script>'));
  assert.equal(JSON.parse(out).headline, '</script><script>alert(1)</script>');
});
