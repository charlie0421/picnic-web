'use strict';
// Checks that a deployed page serves the CSS a manifest was generated from. Read-only GETs to the page origin only;
// Node fetch has no cookie jar, and redirects are refused.
// Usage: node scripts/replay-p0/tools/check-production-css.cjs --url https://www.picnic.fan/ko/vote --manifest <json> --out <json>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { chromium } = require('playwright');
const { buildStyleSources, sdkFix } = require('./build-css-manifest.cjs');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const USER_AGENT = 'picnic-replay-manifest-check/1';

/**
 * Every stylesheet link and script src in the page HTML, resolved as a browser resolves them (quotes, character
 * references, comments, raw-text elements and <base href>). The HTML is parsed only: no script runs and nothing loads.
 * Same-origin references are kept as path + query; references to another origin are listed separately so the comparison
 * can refuse them.
 */
function extractPageRefs(html, pageUrl) {
  const page = new URL(pageUrl);
  const { document } = new JSDOM(html, { url: page.href }).window;
  const split = urls => ({
    same: [...new Set(urls.filter(u => u.origin === page.origin).map(u => u.pathname + u.search))].sort(),
    foreign: [...new Set(urls.filter(u => u.origin !== page.origin).map(u => u.href))].sort(),
  });
  const isStylesheet = link => (link.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('stylesheet');
  const sheets = split([...document.querySelectorAll('link[href]')].filter(isStylesheet).map(link => new URL(link.href)));
  const scripts = split([...document.querySelectorAll('script[src]')].map(script => new URL(script.src)));
  const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null;
  const buildId = (/\\"b\\":\\"([A-Za-z0-9_-]{10,40})\\"/.exec(html) || [])[1] ?? null;
  return { css: sheets.same, foreignCss: sheets.foreign, chunks: scripts.same, foreignScripts: scripts.foreign,
    inlineStyles: document.querySelectorAll('style').length, viewport, buildId };
}
/** cssSha: served asset path → sha256 of its bytes. styleTexts: styled-jsx texts derived from served chunks (CSSOM + SDK fix). */
function compareProduction(manifest, refs, cssSha, styleTexts) {
  const reasons = [];
  for (const url of refs.foreignCss) reasons.push(`cross-origin stylesheet: ${url}`);
  for (const url of refs.foreignScripts) reasons.push(`cross-origin script: ${url}`);
  if (refs.inlineStyles) reasons.push(`inline <style> in page HTML: ${refs.inlineStyles}`);
  const expected = new Map(manifest.linkCss.map(c => [c.asset, c.sourceSha256]));
  for (const asset of refs.css) if (!expected.has(asset)) reasons.push(`served CSS not in manifest: ${asset}`);
  for (const [asset, want] of expected) {
    if (!refs.css.includes(asset)) reasons.push(`manifest CSS not served: ${asset}`);
    else if (cssSha.get(asset) !== want) reasons.push(`CSS bytes differ: ${asset}`);
  }
  for (const s of manifest.styleText) {
    if (!s.accept.some(a => styleTexts.has(a.text))) reasons.push(`styled-jsx not derivable from served chunks: ${s.output.sha256}`);
  }
  if (refs.viewport !== manifest.viewport) reasons.push('viewport differs');
  return { ok: reasons.length === 0, reasons };
}
async function main() {
  const opt = name => { const i = process.argv.indexOf(name); assert(i > 0 && process.argv[i + 1], `missing ${name}`); return process.argv[i + 1]; };
  const page = new URL(opt('--url')); const manifest = JSON.parse(fs.readFileSync(opt('--manifest'), 'utf8')); const out = opt('--out');
  assert.equal(manifest.version, 2, 'manifest v2 required');
  const get = async p => {
    const u = new URL(p, page); assert.equal(u.origin, page.origin, `cross-origin request refused: ${u.href}`);
    const r = await fetch(u, { headers: { 'user-agent': USER_AGENT }, redirect: 'error' });
    assert.equal(r.status, 200, `${u.pathname} returned ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const refs = extractPageRefs((await get(page.pathname + page.search)).toString('utf8'), page.href);
  const cssSha = new Map(); for (const asset of refs.css) cssSha.set(asset, sha(await get(asset)));
  const chunks = []; for (const chunk of refs.chunks) chunks.push((await get(chunk)).toString('utf8'));
  const sources = [...buildStyleSources(chunks)];
  const browser = await chromium.launch(); let styleTexts;
  try {
    const p = await browser.newPage();
    const cssom = await p.evaluate(list => list.map(t => {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(t); return [...sheet.cssRules].map(r => r.cssText).join('');
    }), sources);
    styleTexts = new Set(cssom.map(sdkFix));
  } finally { await browser.close(); }
  const result = { checkedAt: new Date().toISOString(), url: page.href, buildId: refs.buildId, css: refs.css,
    chunks: refs.chunks.length, styledSources: sources.length, ...compareProduction(manifest, refs, cssSha, styleTexts) };
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
module.exports = { extractPageRefs, compareProduction };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
