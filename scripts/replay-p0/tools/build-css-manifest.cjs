'use strict';
// Builds the vote-list CSS manifest from the envtest build and a live local page.
// Usage: node build-css-manifest.cjs --url http://127.0.0.1:<port>/ko/vote --wire-dir <dir> --out <json>
// The wire capture is used only to verify the computed values. Nothing is derived from it.
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
(async () => {
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
        styled: [...document.querySelectorAll('style[data-styled-jsx]')].map(s => [...s.sheet.cssRules].map(r => r.cssText).join('')),
      };
    }, nextAnnouncerSource());
    const linkCss = live.sheets.map(s => {
      const file = path.join(root, '.next-envtest', s.href.replace(/^\/_next\//, ''));
      const wireText = sdkFix(s.cssom);
      assert(wire.links.has(wireText), `wire mismatch for ${s.href}`);
      return { asset: s.href, sourceSha256: sha(fs.readFileSync(file)), wireSha256: sha(wireText), wire: wireText };
    });
    live.styled = live.styled.map(sdkFix);
    for (const text of live.styled) assert(wire.styles.has(text), 'styled-jsx text missing from wire');
    assert.equal(linkCss.length, wire.links.size); assert.equal(live.styled.length, wire.styles.size);
    const all = [...linkCss.map(c => c.wire), ...live.styled];
    for (const css of all) assert(!/url\(|@import/i.test(css), 'resource reference in CSS');
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
})().catch(error => { console.error(error.message); process.exit(1); });
