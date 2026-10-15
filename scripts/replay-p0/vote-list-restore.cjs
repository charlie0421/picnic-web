'use strict';
// Usage: node vote-list-restore.cjs [--original <layout.json> --wire-dir <dir>] --output <json>
// Without --original: compares raw-record restore with projected restore (projection loss only).
// With --original: compares projected restore with layout measured on the live page (task 6).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { parseBrowserEnvelope } = require('../envelope-test/browser-analyze');

// .vote-banner-section has no CSS rule, so the contract drops it; 'main section' selects the same box.
const SELECTORS = ['header', 'main', 'footer', 'main section', '.banner-carousel', '.banner-track', '.banner-slide',
  '.grid > *', 'h3', 'img', 'svg', 'button'];
const TAGS = ['html', 'head', 'body', 'meta', 'title', 'link', 'style', 'div', 'span', 'a', 'button', 'img', 'svg',
  'header', 'main', 'section', 'footer', 'h3', 'p', 'next-route-announcer'];
const opt = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const output = opt('--output'); assert(output, 'missing --output');
const wireDir = opt('--wire-dir') ?? path.join(__dirname, 'fixtures/vote-list');
const original = opt('--original') ? JSON.parse(fs.readFileSync(opt('--original'), 'utf8')) : null;

function rawSegments(width) {
  return [1, 2, 3].map(n => parseBrowserEnvelope(fs.readFileSync(path.join(wireDir, `wire-${width}-${n}.bin`))));
}
async function projected(width, page) {
  const envelopes = rawSegments(width).map(e => ({ header: e.header, items: e.items.map(i => ({ header: i.header, payload: i.payload })) }));
  return page.evaluate(async ({ envelopes, bannerCount }) => window.voteList.projectAll(envelopes, bannerCount), { envelopes, bannerCount: 5 });
}
function compare(a, b) {
  const failures = [];
  const key = x => `${x.selector}#${x.index}`;
  const bm = new Map(b.map(x => [key(x), x]));
  for (const selector of SELECTORS) {
    const ca = a.filter(x => x.selector === selector).length, cb = b.filter(x => x.selector === selector).length;
    if (ca !== cb) failures.push({ selector, kind: 'count', a: ca, b: cb });
  }
  for (const x of a) {
    const y = bm.get(key(x)); if (!y) continue;
    for (const f of ['x', 'y', 'width', 'height']) if (Math.abs(x[f] - y[f]) > 1) failures.push({ box: key(x), field: f, a: x[f], b: y[f] });
    if (Math.abs(x.opacity - y.opacity) > 0.01) failures.push({ box: key(x), field: 'opacity', a: x.opacity, b: y.opacity });
  }
  return failures;
}
(async () => {
  const bundle = await build({ entryPoints: [path.join(__dirname, 'vote-list-restore-entry.ts')], bundle: true,
    platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"test"' } });
  const browser = await chromium.launch(); const results = [];
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`<iframe style="border:0;width:${width}px;height:900px"></iframe>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const out = await projected(width, page);
      assert.equal(out.reason, 'ok', `projection failed: ${out.reason}`);
      const restore = async records => page.evaluate(({ records, selectors, tags }) => window.voteList.restore(records, selectors, tags),
        { records, selectors: SELECTORS, tags: TAGS });
      const projectedBoxes = await restore(out.records);
      const reference = original ? original[String(width)].masked
        : await restore(rawSegments(width).flatMap(e => e.items.filter(i => i.header.type === 'replay_recording').flatMap(i => i.payload.records)));
      const banner = s => (s.match(/--banner-current-index: (\d+)/) || [])[1];
      results.push({ width, failures: compare(reference, projectedBoxes), boxes: projectedBoxes.length,
        bannerIndex: { projected: banner(out.trackStyle), reference: original ? banner(original[String(width)].trackStyle) : banner(out.rawTrackStyle) } });
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  const failed = results.filter(r => r.failures.length || r.bannerIndex.projected !== r.bannerIndex.reference);
  console.log(JSON.stringify(results.map(r => ({ width: r.width, failures: r.failures.length, boxes: r.boxes, bannerIndex: r.bannerIndex }))));
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error.message); process.exit(1); });
