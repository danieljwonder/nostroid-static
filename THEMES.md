# Themes

Change how a Nostroid site looks without touching the core. Three levels, cheapest first:

| Level | You edit | Good for |
|---|---|---|
| 1. Tokens | `theme.tokens` in your config | colours, fonts, width, corner radius |
| 2. CSS | a `custom.css`, or a theme's `styles.css` | anything CSS can do |
| 3. Partials | a theme's `theme.js` | changing the markup itself |

Themes are part of the deployed code. Changing a theme means a new build and deploy; your content still comes from relays and never needs one.

## 1. Tokens (no CSS needed)

```js
// nostroid.config.js (or the SITE_CONFIG binding)
theme: {
  tokens: { accent: "#b845f5", "font-body": "Georgia, serif", measure: "46rem" },
  dark:   { accent: "#d08cff" }          // only applied in dark mode
}
```

Each key becomes a CSS custom property (`accent` → `--accent`). Values are plain CSS values; `; { } < > \` and comments are rejected.

| Token | Default (light) | |
|---|---|---|
| `bg` `fg` `muted` `line` `accent` | `#fafaf8` `#1b1b1b` `#6b6b6b` `#e4e4e0` `#6d3fd1` | page colours |
| `code-bg` | 6% of `fg` | code block background |
| `font-body` `font-heading` `font-mono` | system UI, inherit, monospace | |
| `font-size` `line-height` | `17px` `1.65` | body text |
| `measure` | `42rem` | content width |
| `radius` `avatar-radius` | `6px` `50%` | |

Themes may define more tokens of their own.

## 2. CSS layers

The stylesheet is built in three cascade layers: `core < theme < site`. A later layer always wins, whatever the selector specificity, so you never need `!important`.

```sh
node scripts/build-browser.js --css ../my-site/custom.css
node scripts/build-worker.js site --css ../my-site/custom.css
```

`--css` can be repeated. `@import` is not supported; put each file on the command line instead.

## 3. Theme packages

```
my-theme/
  theme.js      required
  styles.css    optional, goes in @layer theme
  assets/       optional fonts/images, served at /assets/theme/<file>
```

```js
// theme.js
export default {
  name: 'my-theme',
  version: '1.0.0',
  scheme: 'auto',            // 'auto' = light/dark + toggle; 'light' or 'dark' = fixed, no toggle
  partials: {                // override only what you need
    postCard: ({ title, href, published, summary, image }, { h }) => h.html`<article class="card">
<h2><a href="${href}">${title}</a></h2>
<p class="meta">${h.time(published)}</p>
</article>`
  }
};
```

Reference assets from `styles.css` relative to the stylesheet: `url(theme/my-font.woff2)`.

Build with the theme (both modes take the same flags):

```sh
node scripts/build-browser.js --theme ../my-theme --css ../my-site/custom.css
node scripts/build-worker.js site --theme ../my-theme
```

A theme folder can live anywhere, for example in your private site repo. `theme.js` is bundled into the site, so it should not import packages. Everything it needs arrives in `ctx`. See `themes/midnight/` for a working example.

### Writing partials

A partial is `(vm, ctx) => html`.

- `vm`: the view-model below. Strings are raw (unescaped) text.
- `ctx.h`: helpers. `h.html` is a tagged template that **escapes every interpolation** unless it is already safe (`h.html` output, `h.raw()`, fields ending in `Html` or named `html`). Arrays are concatenated. `h.join(items, sep)`, `h.time(ts)` (a `<time>` element), `h.date(ts)`, `h.iso(ts)`, `h.esc(s)`.
- `ctx.p`: all partials, already bound, so `p.postCard(vm)` uses the theme's version if it has one.
- `ctx.config`: the resolved site config.

Use `h.html` for markup. A partial that returns a plain string is trusted as-is, so escape it yourself.

Themes cannot change the `<head>`: title, description, canonical, Open Graph and JSON-LD stay in core, so SEO and safety don't depend on the theme.

### Partials and view-models

| Partial | View-model |
|---|---|
| `layout` | `{ header, body, footer, mode, path }`: the first three are rendered HTML. Must keep an element with `id="main"`. |
| `header` | `{ siteTitle, homeHref, nav: [{ label, href, current, external }], path, schemeToggle }` |
| `footer` | `{ profile, poweredBy }` |
| `profile` | `{ name, title, picture, banner, about, aboutHtml, website, websiteLabel, npub, nostrUrl }` |
| `home` | `{ profile, posts: [postCard vm] (≤5), allPostsHref \| null, notes: [noteCard vm] (≤10), allNotesHref }` |
| `postCard` | `{ title, href, published, updated, summary, image, topics }` |
| `noteCard` | `{ html, text, href, published }` |
| `blog` | `{ posts: [postCard vm] }` |
| `post` | postCard vm + `{ html, nostrUrl }`, `updated` only when more than a day after `published` (else `null`) |
| `notes` | `{ notes, older: month \| null, months: [month] }` |
| `month` | `{ label, notes, newer: month, older: month \| null }` (`newer` falls back to `{ href: '/notes/', label: 'Latest' }`) |
| `note` | noteCard vm + `{ title, month: { href, label }, nostrUrl }` |
| `pager` | `{ prev, next }`, each `{ href, label } \| null` |
| `archive` | `{ months: [month] }` |
| `links` | `{ lists: [{ title, description, items: [{ url, label }] }] }` |
| `notFound` | `{ homeHref }` |

`month` = `{ href, label, year, month, count }`. Timestamps are Unix seconds. Hrefs are already resolved for the site's base path.

### Styling contract

The default partials use these classes, and themes that keep the default markup can rely on them: `skip`, `site-header`, `site-title`, `theme-toggle`, `site-footer`, `profile`, `avatar`, `section-title`, `card`, `meta`, `note`, `note-single`, `post`, `hero`, `prose`, `tags`, `pager`, `archive`, `links`, plus `main[data-mode="server|browser"]`. Renaming or removing one is a breaking change and gets called out in the changelog.
