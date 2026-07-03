// Generates src/app/theme-dark-chrome.css.
//
// PatternFly 6 only applies its dark palette through a
// `:root:where(.pf-v6-theme-dark)` rule, i.e. when the theme class sits on the
// <html> element - the matching non-root `:where(.pf-v6-theme-dark)` rule only
// sets `color-scheme: dark` and none of the surface/text tokens. That makes
// the theme all-or-nothing on the root and rules out a plain "dark class on
// the masthead" for our dark-chrome / light-content layout.
//
// So we lift the token declarations out of that root rule and re-scope them to
// the chrome containers (.se-masthead, .se-sidebar). The custom properties then
// cascade to every descendant of the chrome, rendering it dark, while the
// workspace keeps the default light palette. Re-run after upgrading PatternFly:
//
//   npm run theme:gen
//
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(here, '../node_modules/@patternfly/react-core/dist/styles/base.css');
const out = resolve(here, '../src/app/theme-dark-chrome.css');

const css = readFileSync(base, 'utf8');
const start = css.search(/:root:where\(\.pf-v6-theme-dark\)\s*\{/);
if (start < 0) throw new Error('Could not find :root:where(.pf-v6-theme-dark) in PatternFly base.css');

const open = css.indexOf('{', start);
let depth = 0;
let close = open;
for (let i = open; i < css.length; i++) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}' && --depth === 0) {
    close = i;
    break;
  }
}
const body = css.slice(open + 1, close).trim();

const header = `/* GENERATED FILE - do not edit by hand. Run \`npm run theme:gen\`.
 *
 * PatternFly 6's dark palette is only defined on :root:where(.pf-v6-theme-dark)
 * (i.e. when the theme class is on <html>). This file re-scopes that same token
 * set to the app's chrome so the masthead and sidebar render dark while the
 * content area stays light. See scripts/gen-dark-chrome.mjs.
 */`;

writeFileSync(out, `${header}\n\n.se-masthead,\n.se-sidebar {\n  color-scheme: dark;\n  ${body}\n}\n`);
console.log(`Wrote ${out} (${body.split(';').length - 1} tokens)`);
