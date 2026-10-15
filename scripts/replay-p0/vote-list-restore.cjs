'use strict';
// Usage: node vote-list-restore.cjs [--original <layout.json>] [--wire-dir <dir>] --output <json>
// Without --original: compares raw-record restore with projected restore (projection loss only). Gate: no difference.
// With --original: compares projected restore with the original page's control measurement (font files removed),
// classifies the differences, and records the font effect (masked original vs control). Gate: no 'other' difference.
// Both gates also require the same banner index. The restore page has no network: every request is aborted.
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

function compare(a, b) {
  const failures = [];
  const key = x => `${x.selector}#${x.index}`;
  const bm = new Map(b.map(x => [key(x), x]));
  for (const selector of new Set([...a, ...b].map(x => x.selector))) {
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
/**
 * Known differences between the original control (a) and the projected restore (b). Everything else is 'other'.
 * Hover is not a class: the capture moves the pointer off the page before it measures the original.
 */
function classifyFailures(failures) {
  const out = { mediaOpacity: [], svgPlaceholder: [], other: [] };
  for (const f of failures) {
    if (f.kind === 'count') out.other.push(f);
    // The SDK does not record class changes on blocked media, so loaded images stay at opacity-0 in the recording.
    else if (/^img#/.test(f.box) && f.field === 'opacity' && f.a === 1 && f.b === 0) out.mediaOpacity.push(f);
    // An empty svg placeholder sits up to 2px off the icon it replaces.
    else if (/^svg#/.test(f.box) && (f.field === 'x' || f.field === 'y') && Math.abs(f.a - f.b) <= 2) out.svgPlaceholder.push(f);
    else out.other.push(f);
  }
  return out;
}
/** How much the real font moves boxes compared with the fallback font. Recorded, not a gate. */
function fontEffect(masked, control) {
  const diffs = compare(masked, control).filter(f => f.kind !== 'count' && f.field !== 'opacity');
  return { boxes: new Set(diffs.map(d => d.box)).size, maxDelta: diffs.reduce((m, d) => Math.max(m, Math.abs(d.a - d.b)), 0) };
}
async function main() {
  const opt = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const output = opt('--output'); assert(output, 'missing --output');
  const wireDir = opt('--wire-dir') ?? path.join(__dirname, 'fixtures/vote-list');
  const original = opt('--original') ? JSON.parse(fs.readFileSync(opt('--original'), 'utf8')) : null;
  const rawSegments = width => [1, 2, 3].map(n => parseBrowserEnvelope(fs.readFileSync(path.join(wireDir, `wire-${width}-${n}.bin`))));
  const bundle = await build({ entryPoints: [path.join(__dirname, 'vote-list-restore-entry.ts')], bundle: true,
    platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"test"' } });
  const browser = await chromium.launch(); const results = [];
  const banner = s => (s.match(/--banner-current-index: (\d+)/) || [])[1];
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let aborted = 0;
      await page.route('**/*', route => { aborted++; return route.abort(); });
      await page.setContent(`<iframe style="border:0;width:${width}px;height:900px"></iframe>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const envelopes = rawSegments(width).map(e => ({ header: e.header, items: e.items.map(i => ({ header: i.header, payload: i.payload })) }));
      const out = await page.evaluate(async ({ envelopes, bannerCount }) => window.voteList.projectAll(envelopes, bannerCount), { envelopes, bannerCount: 5 });
      assert.equal(out.reason, 'ok', `projection failed: ${out.reason}`);
      const restore = records => page.evaluate(({ records, selectors, tags }) => window.voteList.restore(records, selectors, tags),
        { records, selectors: SELECTORS, tags: TAGS });
      const projectedBoxes = await restore(out.records);
      if (original) {
        const o = original[String(width)]; assert(o && o.control, 'layout.json has no control measurement');
        const failures = compare(o.control, projectedBoxes);
        results.push({ width, mode: 'original', failures, classification: classifyFailures(failures), fontEffect: fontEffect(o.masked, o.control),
          boxes: projectedBoxes.length, aborted, bannerIndex: { projected: banner(out.trackStyle), reference: banner(o.trackStyle) } });
      } else {
        const rawRecords = rawSegments(width).flatMap(e => e.items.filter(i => i.header.type === 'replay_recording').flatMap(i => i.payload.records));
        results.push({ width, mode: 'raw', failures: compare(await restore(rawRecords), projectedBoxes), boxes: projectedBoxes.length, aborted,
          bannerIndex: { projected: banner(out.trackStyle), reference: banner(out.rawTrackStyle) } });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  const counts = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length]));
  console.log(JSON.stringify(results.map(r => ({ width: r.width, mode: r.mode, failures: r.failures.length, boxes: r.boxes, aborted: r.aborted,
    bannerIndex: r.bannerIndex, ...(r.classification ? { classes: counts(r.classification), fontEffect: r.fontEffect } : {}) }))));
  const failed = results.filter(r => r.bannerIndex.projected !== r.bannerIndex.reference
    || (r.mode === 'raw' ? r.failures.length > 0 : r.classification.other.length > 0));
  process.exitCode = failed.length ? 1 : 0;
}
module.exports = { compare, classifyFailures, fontEffect };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
