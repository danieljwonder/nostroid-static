import { html, raw, join, esc, iso, humanDate } from './html.js';
import { partials as defaults, PARTIAL_NAMES } from './partials.js';

const time = ts => raw(`<time datetime="${iso(ts)}">${humanDate(ts)}</time>`);
export const helpers = { html, raw, join, esc, time, date: humanDate, iso };

/**
 * Theme object -> resolved theme. A theme is { name, version, tokens?, partials? }.
 * Unknown partial names are rejected so typos fail loudly instead of silently doing nothing.
 */
export function resolveTheme(theme = {}) {
  const over = theme.partials || {};
  for (const k of Object.keys(over)) {
    if (!PARTIAL_NAMES.includes(k)) throw new Error(`theme "${theme.name || '?'}": unknown partial "${k}" (known: ${PARTIAL_NAMES.join(', ')})`);
    if (typeof over[k] !== 'function') throw new Error(`theme "${theme.name || '?'}": partial "${k}" must be a function`);
  }
  const scheme = theme.scheme || 'auto';
  if (!['auto', 'light', 'dark'].includes(scheme)) throw new Error(`theme "${theme.name || '?'}": scheme must be auto, light or dark`);
  return { name: theme.name || 'default', version: theme.version || '0', scheme, partials: { ...defaults, ...over } };
}

export const defaultTheme = resolveTheme({ name: 'default' });

/** Bind partials to a render context: p.name(vm) -> SafeHtml. */
export function bindPartials(theme, config) {
  const p = {};
  const ctx = { config, h: helpers, p };
  for (const [k, fn] of Object.entries(theme.partials)) p[k] = vm => raw(fn(vm, ctx));
  return p;
}

/**
 * Site token overrides (config.theme) -> CSS in the `site` layer, or '' when there are none.
 * Values were validated by resolveConfig, so they cannot close the rule or the <style> element.
 */
export function tokenCss(config) {
  const t = config.theme || {};
  const decl = o => Object.entries(o || {}).map(([k, v]) => `--${k}: ${v};`).join(' ');
  const light = decl(t.tokens), dark = decl(t.dark);
  if (!light && !dark) return '';
  let css = '@layer site {\n';
  if (light) css += `:root { ${light} }\n`;
  if (dark) css += `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }\n:root[data-theme="dark"] { ${dark} }\n`;
  return css + '}';
}
