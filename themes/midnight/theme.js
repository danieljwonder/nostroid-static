// Example theme: dark-only, cards with cover images. Copy this folder to start your own.
// Build with: npm run build -- --theme themes/midnight
export default {
  name: 'midnight',
  version: '1.0.0',
  scheme: 'dark', // 'auto' (light/dark + toggle), 'light' or 'dark'

  // Override only the partials you need; the rest fall back to the defaults.
  partials: {
    postCard: ({ title, href, published, summary, image }, { h }) => h.html`<article class="card${image ? ' card--image' : ''}">
${image ? h.html`<a class="card-cover" href="${href}" tabindex="-1" aria-hidden="true"><img src="${image}" alt="" loading="lazy"></a>` : ''}
<h2><a href="${href}">${title}</a></h2>
<p class="meta">${h.time(published)}</p>
${summary ? h.html`<p>${summary}</p>` : ''}
</article>`
  }
};
