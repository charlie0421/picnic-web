'use strict';
// Builds the vote-list CSS manifest from the envtest build and a live local page.
// Usage: node build-css-manifest.cjs --url http://127.0.0.1:<port>/ko/vote --wire-dir <dir> --out <json>
// CSS comes from the build: link assets are parsed from disk, styled-jsx text is traced to build JS.
// The live page and the wire capture are used only to verify the computed values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const { chromium } = require('playwright');
const { parseBrowserEnvelope } = require('../../envelope-test/browser-analyze');

const root = path.resolve(__dirname, '../../..');
const arg = name => { const i = process.argv.indexOf(name); assert(i > 0, `missing ${name}`); return process.argv[i + 1]; };
const sha = s => createHash('sha256').update(s).digest('hex');
// Same function as @sentry-internal/replay 9.47.1 build/npm/cjs/index.js fixBrowserCompatibilityIssuesInCSS.
function sdkFix(cssText) {
  if (cssText.includes(' background-clip: text;') && !cssText.includes(' -webkit-background-clip: text;')) {
    cssText = cssText.replace(/\sbackground-clip:\s*text;/g, ' -webkit-background-clip: text; background-clip: text;');
  }
  return cssText;
}
function assertSdkFixUnchanged() {
  const src = fs.readFileSync(path.join(root, 'node_modules/@sentry-internal/replay/build/npm/cjs/index.js'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@sentry-internal/replay/package.json'), 'utf8')).version;
  assert.equal(version, '9.47.1');
  assert(src.includes('" -webkit-background-clip: text; background-clip: text;"'), 'SDK CSS fix changed');
}
function classTokens(css) {
  const out = new Set();
  postcss.parse(css).walkRules(rule => {
    selectorParser(s => s.walkClasses(c => { out.add(c.value); })).processSync(rule.selector);
  });
  return out;
}
function statusColors() {
  const src = fs.readFileSync(path.join(root, 'components/client/vote/list/VoteStatusFilter.tsx'), 'utf8');
  const block = src.slice(src.indexOf('const STATUS_DOT_COLOR'), src.indexOf('};', src.indexOf('const STATUS_DOT_COLOR')));
  return [...block.matchAll(/'#([0-9A-F]{6})'/g)].map(m => {
    const n = parseInt(m[1], 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  });
}
function nextAnnouncerSource() {
  const src = fs.readFileSync(path.join(root, 'node_modules/next/dist/client/components/app-router-announcer.js'), 'utf8');
  const m = /announcer\.style\.cssText = '([^']+)'/.exec(src); assert(m, 'announcer style not found');
  return m[1];
}
function wireValues(dir) {
  const links = new Set(), styles = new Set();
  for (const f of fs.readdirSync(dir).filter(f => /^wire-\d+-[123]\.bin$/.test(f))) {
    for (const item of parseBrowserEnvelope(fs.readFileSync(path.join(dir, f))).items) {
      if (item.header.type !== 'replay_recording') continue;
      JSON.stringify(item.payload.records, (k, v) => {
        if (k === '_cssText') links.add(v);
        if (v && v.isStyle === true) styles.add(v.textContent);
        return v;
      });
    }
  }
  return { links, styles };
}
/** Build-derived CSSOM must equal the live sheet and a captured wire value. Returns the wire text. */
function checkCss(source, live, wireSet, label) {
  if (/url\(|@import/i.test(source) || /url\(|@import/i.test(live)) throw new Error(`${label}: resource reference in CSS`);
  if (source !== live) throw new Error(`${label}: live CSSOM differs from build`);
  if (!wireSet.has(source)) throw new Error(`${label}: CSS missing from wire capture`);
  return source;
}
const LITERAL = String.raw`"(?:[^"\\]|\\.)*"`;
const CHAIN = new RegExp(`(${LITERAL})((?:\\.concat\\((?:\\d+|${LITERAL})(?:,(?:\\d+|${LITERAL}))*\\))*)`, 'g');
/** Every string literal in the build JS, with .concat() chains of literal arguments evaluated. */
function buildStyleSources(chunks) {
  const out = new Set();
  for (const text of chunks) {
    for (const m of text.matchAll(CHAIN)) {
      // Literals are matched whole first, so digits and parentheses inside them are not separate tokens.
      // A literal with a JS-only escape is skipped; styled-jsx text built from it then fails to trace (fail closed).
      try {
        let value = JSON.parse(m[1]);
        for (const arg of m[2].match(new RegExp(`${LITERAL}|\\d+`, 'g')) ?? []) value += arg.startsWith('"') ? JSON.parse(arg) : arg;
        if (value.includes('{')) out.add(value);
      } catch { continue; }
    }
  }
  return out;
}
/** styled-jsx text must exist in the build JS; dynamic styles use the numeric jsx-<hash> class. */
function traceStyledJsx(text, sources) {
  return sources.has(text) || sources.has(text.replace(/\.jsx-\d+(?![\w-])/g, '.__jsx-style-dynamic-selector'));
}
function chunkTexts() {
  const dir = path.join(root, '.next-envtest/static/chunks'); const files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(fs.readFileSync(f, 'utf8'));
  } };
  walk(dir); return files;
}
async function main() {
  assertSdkFixUnchanged();
  const url = arg('--url'); const out = arg('--out'); const wire = wireValues(arg('--wire-dir'));
  const buildId = fs.readFileSync(path.join(root, '.next-envtest/BUILD_ID'), 'utf8').trim();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
    const live = await page.evaluate(announcer => {
      const probe = document.createElement('div'); probe.style.cssText = announcer;
      return {
        viewport: document.querySelector('meta[name=viewport]').getAttribute('content'),
        announcerStyle: probe.getAttribute('style'),
        sheets: [...document.styleSheets].filter(s => s.ownerNode.tagName === 'LINK').map(s => ({
          href: new URL(s.href).pathname, cssom: [...s.cssRules].map(r => r.cssText).join('') })),
        // rrweb records <style> text from the CSSOM, not from textContent.
        styled: [...document.querySelectorAll('style[data-styled-jsx]')].map(s => ({
          text: s.textContent, cssom: [...s.sheet.cssRules].map(r => r.cssText).join('') })),
      };
    }, nextAnnouncerSource());
    // Parse trusted sources in a constructed sheet so page scripts cannot change the result.
    const parse = text => page.evaluate(css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
      return [...sheet.cssRules].map(r => r.cssText).join(''); }, text);
    const linkCss = [];
    for (const s of live.sheets) {
      const file = path.join(root, '.next-envtest', s.href.replace(/^\/_next\//, ''));
      const bytes = fs.readFileSync(file);
      const wireText = checkCss(sdkFix(await parse(bytes.toString('utf8'))), sdkFix(s.cssom), wire.links, s.href);
      linkCss.push({ asset: s.href, sourceSha256: sha(bytes), wireSha256: sha(wireText), wire: wireText });
    }
    const sources = buildStyleSources(chunkTexts()); const styled = [];
    for (const s of live.styled) {
      assert(traceStyledJsx(s.text, sources), 'styled-jsx text not found in build output');
      styled.push(checkCss(sdkFix(await parse(s.text)), sdkFix(s.cssom), wire.styles, 'styled-jsx'));
    }
    live.styled = styled;
    assert.equal(linkCss.length, wire.links.size); assert.equal(live.styled.length, wire.styles.size);
    const all = [...linkCss.map(c => c.wire), ...live.styled];
    const classes = new Set(); for (const css of all) for (const t of classTokens(css)) classes.add(t);
    const manifest = {
      version: 1, buildId, sdkVersion: '9.47.1', release: 'replay-vote-list-local', environment: 'replay-vote-list-local',
      viewport: live.viewport, announcerStyle: live.announcerStyle,
      linkCss: linkCss.sort((a, b) => a.asset.localeCompare(b.asset)),
      styleText: live.styled.map(text => ({ sha256: sha(text), text })).sort((a, b) => a.sha256.localeCompare(b.sha256)),
      classes: [...classes].sort(), statusColors: statusColors(),
    };
    fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ buildId, links: linkCss.length, styles: live.styled.length, classes: classes.size }));
  } finally { await browser.close(); }
}
module.exports = { checkCss, buildStyleSources, traceStyledJsx };
if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
