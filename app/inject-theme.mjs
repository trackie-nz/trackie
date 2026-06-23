// Build-time injection of the Trackie theme CSS into the seeded theme drop-in.
//
//   node app/inject-theme.mjs <path-to-actual-checkout>
//
// Run AFTER apply-overlay.sh (which drops in trackie-theme.ts with a sentinel)
// and BEFORE the client build. Kept separate from apply-overlay.sh on purpose so
// the offline drift detector (app/test/assert-overlay.sh) never hits the network.
//
// Source of truth: github.com/trackie-nz/trackie-theme (actual.css). Override the
// ref with TRACKIE_THEME_REF (default 'main') to pin to a tag or commit SHA.
//
// Fails loudly: a release image must not ship a half-applied theme.

import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || process.cwd();
const ref = process.env.TRACKIE_THEME_REF || 'main';
const url = `https://raw.githubusercontent.com/trackie-nz/trackie-theme/refs/heads/${ref}/actual.css`;

const res = await fetch(url);
if (!res.ok) {
  throw new Error(`[theme] fetch failed: ${url} -> HTTP ${res.status}`);
}
const css = (await res.text()).replace(/\s+$/, '');

// The CSS is embedded in a template literal and must satisfy validateThemeCss at
// runtime, so guard the two ways that could break: a non-:root payload, or
// characters that would terminate / interpolate the template literal.
if (!css.startsWith(':root')) {
  throw new Error('[theme] fetched CSS does not start with ":root"');
}
if (css.includes('`') || css.includes('${')) {
  throw new Error('[theme] fetched CSS contains a backtick or ${ - cannot inline safely');
}

const file = path.join(
  target,
  'packages/loot-core/src/server/preferences/trackie-theme.ts',
);
const sentinel = "'@TRACKIE_THEME_CSS@'";
const src = fs.readFileSync(file, 'utf8');
if (!src.includes(sentinel)) {
  throw new Error(`[theme] sentinel ${sentinel} not found in ${file}`);
}
fs.writeFileSync(file, src.replace(sentinel, '`' + css + '`'));
console.log(`[theme] injected ${css.length} bytes from ${url}`);
