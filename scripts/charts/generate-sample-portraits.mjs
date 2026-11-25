// Generates the fictional portraits for the synthetic chart preview (lib/charts/fandom-preview.ts).
// Usage: node scripts/charts/generate-sample-portraits.mjs public/images/charts/sample
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const groups = [
  ['VELA NINE', '#ffb4c8', '#a97cf0', ['Rin', 'Hana']],
  ['Blue Cinema', '#a6d8ff', '#5b6cf0', ['Arin', 'Seo']],
  ['Lunar Post', '#ffe2a6', '#f0857a', ['Sol', 'Dami']],
  ['June Atlas', '#bff2d6', '#3fa89d', ['Yun', 'Theo']],
  ['Coral Static', '#ffc8ad', '#f2648c', ['Ella', 'Bom']],
  ['Mono Garden', '#dcf5ad', '#5fae68', ['Ian', 'Seri']],
  ['NORTH SIGNAL', '#adc9ff', '#34449a', ['Ryu', 'Haon']],
  ['Glass Engine', '#b8f1ff', '#2f87b2', ['Ezra', 'Doha']],
  ['Arc Harbor', '#e3cbff', '#5d40a6', ['Kyle', 'Yeon']],
  ['Paper Comet', '#ffeaa8', '#de7a34', ['Noa', 'Siwoo']],
];
const solos = [['Haneul', '#c4eaff', '#7894f2'], ['Lumi', '#ffd8f1', '#c06ad6']];
const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const hair = [
  // short
  'M29 34C28 23 34 19 40 19C47 19 53 23 51 34C48 29 44 27 40 27C35 27 31 29 29 34Z',
  // bob
  'M28 37C27 23 33 18 40 18C48 18 53 23 52 37C52 41 50 44 48 45L48 32C45 28 35 28 32 32L32 45C30 44 28 41 28 37Z',
  // long
  'M27 39C26 22 33 17 40 17C48 17 54 22 53 39L54 55L47 53L48 32C45 27 35 27 32 32L33 53L26 55Z',
  // bun
  'M29 34C28 23 34 19 40 19C47 19 53 23 51 34C48 29 44 27 40 27C35 27 31 29 29 34ZM40 9A5.5 5.5 0 1 1 40 20A5.5 5.5 0 1 1 40 9Z',
];
const skins = ['#f8dfcc', '#f1cdb0', '#e6b892', '#d9a47c'];
const hairs = ['#2b2038', '#3d2a22', '#1d1a2e', '#5a3b2c', '#6b4f8f'];
const clothes = ['#ffffff', '#2f2a4a', '#ffe9a8', '#e8f0ff', '#3b3260', '#fff1f5'];
const pick = (list, n) => list[n % list.length];
const figure = (style, h) => {
  const skin = pick(skins, h >>> 3), hairFill = pick(hairs, h >>> 5), cloth = pick(clothes, h >>> 7);
  return `<path d="M15 80C15 60 27 51 40 51C53 51 65 60 65 80Z" fill="${cloth}"/>` +
    `<path d="M35 44H45V53C45 56 35 56 35 53Z" fill="${skin}"/>` +
    `<path d="M34 51C36 55 44 55 46 51" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="2"/>` +
    `<circle cx="40" cy="35" r="11.5" fill="${skin}"/>` +
    `<path d="${hair[style]}" fill="${hairFill}"/>`;
};
const svg = (id, from, to, angle, inner, sparkle) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">` +
  `<defs><linearGradient id="${id}" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
  `<rect width="80" height="80" fill="url(#${id})"/>` +
  `<circle cx="${sparkle[0]}" cy="${sparkle[1]}" r="22" fill="#fff" opacity=".22"/>` +
  `<circle cx="${80 - sparkle[0]}" cy="70" r="3" fill="#fff" opacity=".5"/>` +
  inner + `</svg>\n`;
const files = [];
const write = (name, text) => { writeFileSync(`${out}/${name}`, text); files.push(name); };
for (const [en, from, to, members] of groups) {
  const h = hash(en);
  const side = (dx, k) => `<g transform="translate(${8.8 + dx} 17.6) scale(.78)">${figure((h + k) % 4, hash(en + k))}</g>`;
  const inner = side(-17, 1) + side(17, 2) + figure(h % 4, h);
  write(`g-${slug(en)}.svg`, svg('g', from, to, 45 + (h % 4) * 20, inner, [58 - (h % 3) * 8, 18]));
  members.forEach((m, j) => {
    const mh = hash(m);
    const inner = figure(mh % 4, mh);
    write(`a-${slug(m)}.svg`, svg('a', j ? to : from, j ? from : to, 30 + j * 90, inner, [j ? 20 : 60, 20]));
  });
}
for (const [en, from, to] of solos) {
  const mh = hash(en);
  write(`a-${slug(en)}.svg`, svg('a', from, to, 120, figure(mh % 4, mh), [62, 16]));
}
console.log(files.length, 'files');
