#!/usr/bin/env node
// Generate the Starring brand assets: `npm run brand`.
//
// The mark: a four-point star breaking out of a ring — STAR + RING, and the idea
// behind the product: your work is bigger than the circle GitHub can see.
// SVGs are composed by hand; satori only turns the wordmark text into outlines,
// so nothing depends on installed fonts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { createElement as h } from 'react';
import satori from 'satori';

const require = createRequire(import.meta.url);
const font = (pkg, file) => readFileSync(require.resolve(`${pkg}/files/${file}`));
const fonts = [
  { name: 'Anton', data: font('@fontsource/anton', 'anton-latin-400-normal.woff'), weight: 400 },
  { name: 'Space Grotesk', data: font('@fontsource/space-grotesk', 'space-grotesk-latin-500-normal.woff'), weight: 500 },
  { name: 'JetBrains Mono', data: font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400 },
];

const INK = '#0a0a0a';
const BONE = '#f2f0e9';
const ACID = '#d4ff00';
const OLIVE = '#5f7000'; // acid's partner on light backgrounds (AA on bone)

// ---------- the mark (64×64 grid) ----------
const STAR = 'M32 2.5C32.9 23.5 40.5 31.1 61.5 32C40.5 32.9 32.9 40.5 32 61.5C31.1 40.5 23.5 32.9 2.5 32C23.5 31.1 31.1 23.5 32 2.5Z';
let uid = 0;
/** Mark contents: ring with a knock-out gap around the star, then the star. */
const markBody = ({ star = BONE, ring = ACID } = {}) => {
  const id = `k${++uid}`;
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="${STAR}" fill="#000" stroke="#000" stroke-width="7" stroke-linejoin="round"/></mask></defs>`
    + `<circle cx="32" cy="32" r="18.5" fill="none" stroke="${ring}" stroke-width="6" mask="url(#${id})"/>`
    + `<path d="${STAR}" fill="${star}"/>`;
};
const markSvg = ({ size = 64, tile, ...colors } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${tile ? `<rect width="64" height="64" rx="14" fill="${tile}"/><g transform="translate(6.4 6.4) scale(.8)">${markBody(colors)}</g>` : markBody(colors)}</svg>`;

// ---------- wordmark (text → outlines via satori) ----------
const wordmarkSvg = async ({ fg, accent, size }) => {
  const width = Math.ceil(size * 3.62);
  const height = Math.ceil(size * 1.18);
  const svg = await satori(
    h('div', { style: { display: 'flex', fontFamily: 'Anton', fontSize: size, lineHeight: 1.18 } },
      h('span', { style: { color: fg } }, 'STAR'),
      h('span', { style: { color: accent } }, 'RING')),
    { width, height, fonts },
  );
  return { svg, width, height };
};
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** Horizontal lockup: mark + wordmark, one self-contained SVG. */
const lockupSvg = async ({ fg, accent, star, ring, size = 100 }) => {
  const w = await wordmarkSvg({ fg, accent, size });
  const m = size * 1.06;
  const gap = size * 0.26;
  const W = Math.ceil(m + gap + w.width);
  const H = Math.ceil(Math.max(m, w.height));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + `<svg x="0" y="${(H - m) / 2}" width="${m}" height="${m}" viewBox="0 0 64 64">${markBody({ star, ring })}</svg>`
    + `<svg x="${m + gap}" y="${(H - w.height) / 2 + size * 0.02}" width="${w.width}" height="${w.height}" viewBox="0 0 ${w.width} ${w.height}">${inner(w.svg)}</svg>`
    + `</svg>`;
};
const textSvg = async (node, width, height) => satori(node, { width, height, fonts });
const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
const place = (svg, x, y, w, hh) => {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? `0 0 ${w} ${hh}`;
  return `<svg x="${x}" y="${y}" width="${w}" height="${hh}" viewBox="${vb}">${inner(svg)}</svg>`;
};

mkdirSync('public/brand', { recursive: true });
mkdirSync('docs/brand', { recursive: true });

const dark = { fg: BONE, accent: ACID, star: BONE, ring: ACID };
const light = { fg: INK, accent: OLIVE, star: INK, ring: OLIVE };

writeFileSync('public/brand/mark.svg', markSvg(dark));
writeFileSync('public/brand/mark-light.svg', markSvg(light));
writeFileSync('public/favicon.svg', markSvg({ tile: INK, ...dark }));
writeFileSync('public/brand/app-icon.png', png(markSvg({ tile: INK, ...dark }), 512));
writeFileSync('public/apple-touch-icon.png', png(markSvg({ tile: INK, ...dark }), 180));

const logoDark = await lockupSvg(dark);
const logoLight = await lockupSvg(light);
writeFileSync('public/brand/logo.svg', logoDark);
writeFileSync('public/brand/logo-light.svg', logoLight);

// GitHub social preview (1280×640) — upload in repo Settings → General → Social preview
{
  const kicker = await textSvg(h('div', { style: { display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 24, letterSpacing: 3, color: ACID } }, 'OPEN SOURCE  ·  STARRING.DEV'), 900, 40);
  const claim = await textSvg(h('div', { style: { display: 'flex', fontFamily: 'Space Grotesk', fontSize: 38, color: BONE } }, 'Your developer career as a scroll story, including the work GitHub can’t show.'), 1140, 110);
  const big = await lockupSvg({ ...dark, size: 200 });
  const bw = Number(/width="(\d+)"/.exec(big)[1]);
  const bh = Number(/height="(\d+)"/.exec(big)[1]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640"><rect width="1280" height="640" fill="${INK}"/>`
    + place(kicker, 72, 60, 900, 40) + place(big, 72, 180, bw, bh) + place(claim, 72, 470, 1140, 110) + `</svg>`;
  writeFileSync('docs/brand/social-preview.png', png(svg, 1280));
}

// Presentation sheet
{
  const title = await textSvg(h('div', { style: { display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 20, letterSpacing: 3, color: ACID } }, 'STARRING — BRAND v1'), 600, 30);
  const note = await textSvg(h('div', { style: { display: 'flex', fontFamily: 'Space Grotesk', fontSize: 26, color: '#8a877e' } }, 'A star breaking out of a ring: STAR + RING, and the product’s point — your work is bigger than the circle GitHub can see.'), 1290, 80);
  const lw = Number(/width="(\d+)"/.exec(logoDark)[1]);
  const lh = Number(/height="(\d+)"/.exec(logoDark)[1]);
  const scale = 520 / lw;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="860" viewBox="0 0 1400 860"><rect width="1400" height="860" fill="#141412"/>`;
  s += place(title, 56, 50, 600, 30);
  s += `<rect x="56" y="110" width="630" height="230" fill="${INK}"/>` + place(logoDark, 56 + (630 - 520) / 2, 110 + (230 - lh * scale) / 2, 520, lh * scale);
  s += `<rect x="714" y="110" width="630" height="230" fill="${BONE}"/>` + place(logoLight, 714 + (630 - 520) / 2, 110 + (230 - lh * scale) / 2, 520, lh * scale);
  let x = 56;
  for (const size of [160, 96, 48, 32, 16]) {
    s += place(markSvg({ tile: INK, ...dark }), x, 380 + (160 - size), size, size);
    x += size + 36;
  }
  s += place(markSvg(dark), 560, 380, 160, 160) + place(markSvg(light), 760, 380, 160, 160).replace('<svg', '<svg style="background:#f2f0e9"');
  s += `<rect x="760" y="380" width="160" height="160" fill="${BONE}"/>` + place(markSvg(light), 760, 380, 160, 160);
  [[INK, 'Ink'], [BONE, 'Bone'], [ACID, 'Acid'], [OLIVE, 'Olive']].forEach(([c], i) => {
    s += `<rect x="${980 + i * 90}" y="400" width="70" height="70" fill="${c}" stroke="#333"/>`;
  });
  s += place(note, 56, 620, 1290, 80) + `</svg>`;
  writeFileSync('docs/brand/sheet.png', png(s, 1400));
}
console.log('✓ brand assets → public/brand/, public/favicon.svg, public/apple-touch-icon.png, docs/brand/');
