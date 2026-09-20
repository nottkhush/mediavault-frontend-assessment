// Reads the colour tokens from src/styles.css and checks them against WCAG 2.x.
// Text needs 4.5:1. Graphics and control boundaries need 3:1 (WCAG 1.4.11).
// Usage: npm run check:contrast
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const root = css.match(/:root\s*{([^}]*)}/)?.[1] ?? '';
const tokens = Object.fromEntries(
  [...root.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
);

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = 4.5;
const GRAPHIC = 3;
// [foreground token, background token, minimum, what it is]
const PAIRS = [
  ['ink', 'bg', TEXT, 'body text'],
  ['ink', 'bg-soft', TEXT, 'text on filter bar'],
  ['ink-soft', 'bg', TEXT, 'secondary text'],
  ['ink-soft', 'bg-soft', TEXT, 'secondary text on soft surface'],
  ['ink', 'accent-soft', TEXT, 'text on bulk bar and selected card'],
  ['ink-soft', 'accent-soft', TEXT, 'secondary text on selected card'],
  ['bg', 'ink', TEXT, 'pressed status button'],
  ['danger', 'bg', TEXT, 'error text'],
  ['danger', 'danger-soft', TEXT, 'error banner text'],
  ['ink', 'warn-soft', TEXT, 'offline banner and partial-failure notice'],
  ['ink', 'ok-soft', TEXT, 'success notice'],
  ['st-draft-fg', 'st-draft-bg', TEXT, 'status pill: draft'],
  ['st-review-fg', 'st-review-bg', TEXT, 'status pill: in review'],
  ['st-approved-fg', 'st-approved-bg', TEXT, 'status pill: approved'],
  ['st-archived-fg', 'st-archived-bg', TEXT, 'status pill: archived'],
  ['accent', 'bg', GRAPHIC, 'focus ring and selected ring on white'],
  ['accent', 'bg-soft', GRAPHIC, 'focus ring on soft surface'],
  ['line-strong', 'bg', GRAPHIC, 'input and button borders'],
  ['line-strong', 'bg-soft', GRAPHIC, 'input borders on soft surface'],
  ['st-draft-line', 'bg', GRAPHIC, 'draft pill dashed border'],
  ['st-review-line', 'bg', GRAPHIC, 'in review pill border'],
  ['st-approved-line', 'bg', GRAPHIC, 'approved pill border'],
];

let failed = 0;
for (const [fg, bg, min, label] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) {
    console.log(`MISSING  ${label}: token --${!tokens[fg] ? fg : bg} not found`);
    failed++;
    continue;
  }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(
    `${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (needs ${min})  ${label}  [${tokens[fg]} on ${tokens[bg]}]`,
  );
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks pass');
process.exit(failed ? 1 : 0);