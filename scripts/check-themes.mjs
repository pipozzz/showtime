#!/usr/bin/env node
// Lint every theme in src/themes/: id matches folder, WCAG contrast, scoped CSS.
// Runs in CI; contributors can run it with `npm run check:themes`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join('src', 'themes');
const errors = [];
const rows = [];

const hex = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h ?? '');
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// pairs that must stay readable: [foreground, background, minimum, why]
const PAIRS = [
  ['fg', 'bg', 4.5, 'body text'],
  ['muted', 'bg', 4.5, 'secondary text'],
  ['accentInk', 'accent', 4.5, 'text on accent buttons/tags'],
  ['accent', 'bg', 3, 'accent display text (large)'],
  ['redact', 'bg', 3, 'NDA redaction bars must be visible'],
];

/** Every selector in style.css must be scoped to the theme. */
const checkCss = (css, id, file) => {
  const scope = new RegExp(`\\[data-theme=(['"])${id}\\1\\]`);
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = []; // 'rule' | 'keyframes' | 'group'
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      const head = buf.trim();
      buf = '';
      if (/^@keyframes\b/.test(head)) stack.push('keyframes');
      else if (/^@(media|supports|container|layer)\b/.test(head)) stack.push('group');
      else if (stack.at(-1) === 'keyframes') stack.push('frame');
      else {
        for (const sel of head.split(',').map((s) => s.trim()).filter(Boolean)) {
          if (!scope.test(sel)) errors.push(`${file}: selector "${sel}" is not scoped to [data-theme='${id}']`);
        }
        stack.push('rule');
      }
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';' && (stack.at(-1) === 'rule' || stack.at(-1) === 'frame')) {
      buf = '';
    } else {
      buf += ch;
    }
  }
};

for (const folder of readdirSync(ROOT).filter((f) => statSync(join(ROOT, f)).isDirectory()).sort()) {
  const file = join(ROOT, folder, 'theme.ts');
  if (!existsSync(file)) {
    errors.push(`${join(ROOT, folder)}: missing theme.ts`);
    continue;
  }
  const src = readFileSync(file, 'utf8');
  const id = /\bid:\s*'([^']+)'/.exec(src)?.[1];
  if (id !== folder) errors.push(`${file}: id "${id}" must match the folder name "${folder}"`);
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(folder)) errors.push(`${file}: folder name must be kebab-case`);
  for (const field of ['name', 'description', 'author', 'scheme', 'fonts']) {
    if (!new RegExp(`\\b${field}:`).test(src)) errors.push(`${file}: missing \`${field}\``);
  }
  const tokens = Object.fromEntries([...src.matchAll(/\b(bg|fg|muted|line|accent|accentInk|redact):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const row = { theme: folder };
  for (const [a, b, min, why] of PAIRS) {
    const ca = hex(tokens[a]);
    const cb = hex(tokens[b]);
    if (!ca || !cb) {
      errors.push(`${file}: tokens.${!ca ? a : b} must be a 6-digit hex colour like '#0a0a0a'`);
      continue;
    }
    const r = contrast(ca, cb);
    row[`${a}/${b}`] = r.toFixed(1);
    if (r < min) errors.push(`${file}: ${a} on ${b} is ${r.toFixed(2)}:1 — needs ≥ ${min}:1 (${why})`);
  }
  rows.push(row);
  const css = join(ROOT, folder, 'style.css');
  if (existsSync(css)) {
    if (!src.includes("import './style.css'")) errors.push(`${file}: style.css exists but is not imported`);
    checkCss(readFileSync(css, 'utf8'), folder, css);
  }
}

console.table(rows);
if (errors.length) {
  console.error(`\n✖ ${errors.length} theme problem${errors.length > 1 ? 's' : ''}:\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ ${rows.length} themes pass id, contrast and scoping checks`);
