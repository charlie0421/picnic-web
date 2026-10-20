'use strict';
// Builds the vote-list CSS manifest (v2) from a production-setting build and a live local page.
// Usage: node build-css-manifest.cjs --url http://127.0.0.1:<port>/ko/vote --wire-dir <dir> --out <json>
//          [--build-dir .next-envtest] [--previous <manifest json, v1 or v2>]
// CSS comes from the build: link assets are parsed from disk, styled-jsx text is traced to build JS.
// The live page and the wire capture are used only to verify the computed values.
// @font-face rules that load build font files are accepted on input and dropped from the output text.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const { parseBrowserEnvelope } = require('../../envelope-test/browser-analyze');

const root = path.resolve(__dirname, '../../..');
const opt = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const arg = name => { const v = opt(name); assert(v, `missing ${name}`); return v; };
const sha = s => createHash('sha256').update(s).digest('hex');
const FONT_URL = /^\/_next\/static\/media\/[0-9a-f]{16}(?:-s)?(?:\.p)?\.woff2$/;
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
/** Same as normalizeCssOrigin in contracts/vote-list.ts. A test keeps the two equal. */
function normalizeCssOrigin(text, origin) { return text.split(`url("${origin}/`).join('url("/'); }
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
/** Captured link and style texts with the capture origin normalized away. */
function wireValues(dir, origin) {
  const links = new Set(), styles = new Set();
  for (const f of fs.readdirSync(dir).filter(f => /^wire-\d+-[123]\.bin$/.test(f))) {
    for (const item of parseBrowserEnvelope(fs.readFileSync(path.join(dir, f))).items) {
      if (item.header.type !== 'replay_recording') continue;
      JSON.stringify(item.payload.records, (k, v) => {
        if (k === '_cssText') links.add(normalizeCssOrigin(v, origin));
        if (v && v.isStyle === true) styles.add(normalizeCssOrigin(v.textContent, origin));
        return v;
      });
    }
  }
  return { links, styles };
}
/** Build-derived CSSOM must equal the live sheet and a captured wire value. Returns the accepted text. */
function checkCss(source, live, wireSet, label) {
  if (source !== live) throw new Error(`${label}: live CSSOM differs from build`);
  if (!wireSet.has(source)) throw new Error(`${label}: CSS missing from wire capture`);
  return source;
}
/**
 * Splits CSSOM rules (sheet order) into the accepted text (all rules) and the output text.
 * An @font-face whose src lists only allowed build font files is dropped from the output.
 * Fails on @import, any other font source mix, and url( anywhere else.
 */
function splitFontRules(rules, label) {
  const kept = []; let removed = 0;
  for (const r of rules) {
    if (r.kind === 'import') throw new Error(`${label}: @import in CSS`);
    if (r.kind === 'font-face') {
      const parts = r.src.split(', ');
      const urls = parts.map(p => /^url\("([^"]*)"\) format\("woff2"\)$/.exec(p));
      if (urls.every(Boolean)) {
        for (const u of urls) if (!FONT_URL.test(u[1])) throw new Error(`${label}: font URL not allowed: ${u[1]}`);
        removed++; continue;
      }
      if (!parts.every(p => /^local\("[^"]*"\)$/.test(p))) throw new Error(`${label}: font src not allowed: ${r.src}`);
    }
    if (/url\(/i.test(r.cssText)) throw new Error(`${label}: resource reference in CSS`);
    kept.push(r.cssText);
  }
  return { accept: rules.map(r => r.cssText).join(''), output: kept.join(''), removed };
}
const LITERAL = String.raw`"(?:[^"\\]|\\.)*"`;
const ARG = `(?:\\d+|${LITERAL})`;
// Compiled styled-jsx: {id:"<hex>",dynamic:[<literal args>],children:"<css>".concat(<literal>,"<css>")...}
const JSX_STYLE = new RegExp(`\\{id:"([0-9a-f]+)",(?:dynamic:\\[(${ARG}(?:,${ARG})*)\\],)?children:(${LITERAL}(?:\\.concat\\(${ARG}(?:,${ARG})*\\))*)\\}`, 'g');
const literal = token => (token.startsWith('"') ? JSON.parse(token) : Number(token));
/** Same as styled-jsx 5.1.6 dist/index stringHash. */
function styledJsxHash(str) {
  let h = 5381, i = str.length;
  while (i) h = (h * 33) ^ str.charCodeAt(--i);
  return h >>> 0;
}
/** Exact styled-jsx text the build generates: static text as compiled, dynamic text with the computed jsx class. */
function buildStyleSources(chunks) {
  assert.equal(require(path.join(root, 'node_modules/styled-jsx/package.json')).version, '5.1.6', 'styled-jsx changed');
  const out = new Set();
  for (const text of chunks) {
    for (const m of text.matchAll(JSX_STYLE)) {
      // Literals are matched whole first, so digits and parentheses inside them are not separate tokens.
      // A literal with a JS-only escape is skipped; styled-jsx text built from it then fails to trace (fail closed).
      try {
        const css = m[3].match(new RegExp(`${LITERAL}|\\d+`, 'g')).map(literal).join('');
        const scope = m[2] === undefined ? `jsx-${m[1]}`
          : `jsx-${styledJsxHash(`${m[1]}-${String(m[2].match(new RegExp(`${LITERAL}|\\d+`, 'g')).map(literal))}`)}`;
        out.add(css.replace(/__jsx-style-dynamic-selector/g, scope));
      } catch { continue; }
    }
  }
  return out;
}
/** styled-jsx text must equal text the build generates. */
function traceStyledJsx(text, sources) { return sources.has(text); }
function chunkTexts(buildDir) {
  const dir = path.join(buildDir, 'static/chunks'); const files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(fs.readFileSync(f, 'utf8'));
  } };
  walk(dir); return files;
}
/** Review summary between two manifests. previous may be v1 (wire fields) or v2. */
function summarizeManifest(previous, next) {
  const view = m => (m.version === 1
    ? { links: new Map(m.linkCss.map(c => [c.asset, `${c.sourceSha256}|${c.wireSha256}|${c.wireSha256}`])),
        styles: new Set(m.styleText.map(s => s.sha256)) }
    : { links: new Map(m.linkCss.map(c => [c.asset, `${c.sourceSha256}|${c.accept.map(a => a.sha256).join(',')}|${c.output.sha256}`])),
        styles: new Set(m.styleText.map(s => s.accept.map(a => a.sha256).join(','))) });
  const a = view(previous), b = view(next);
  const diff = (p, n) => ({ added: [...n].filter(x => !p.has(x)).sort(), removed: [...p].filter(x => !n.has(x)).sort() });
  const assets = [...new Set([...a.links.keys(), ...b.links.keys()])].sort();
  return {
    links: assets.map(asset => ({ asset, status: !a.links.has(asset) ? 'added' : !b.links.has(asset) ? 'removed'
      : a.links.get(asset) === b.links.get(asset) ? 'same' : 'changed' })),
    styles: diff(a.styles, b.styles),
    classes: diff(new Set(previous.classes), new Set(next.classes)),
  };
}
async function main() {
  assertSdkFixUnchanged();
  const url = arg('--url'); const out = arg('--out'); const origin = new URL(url).origin;
  const buildDir = path.resolve(root, opt('--build-dir') ?? '.next-envtest');
  // Read --previous before writing: it may be the same file as --out.
  const previous = opt('--previous') ? JSON.parse(fs.readFileSync(opt('--previous'), 'utf8')) : null;
  const wire = wireValues(arg('--wire-dir'), origin);
  const buildId = fs.readFileSync(path.join(buildDir, 'BUILD_ID'), 'utf8').trim();
  const commit = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const { chromium } = require('playwright');
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
    const parseRules = text => page.evaluate(css => {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
      return [...sheet.cssRules].map(r => ({
        kind: r instanceof CSSImportRule ? 'import' : r instanceof CSSFontFaceRule ? 'font-face' : 'other',
        cssText: r.cssText, src: r instanceof CSSFontFaceRule ? r.style.getPropertyValue('src') : '' }));
    }, text);
    const entry = (accept, output) => ({
      accept: [{ engine: 'chromium', sha256: sha(accept), text: accept }], output: { sha256: sha(output), text: output } });
    const linkCss = []; const removedFontFaces = {};
    for (const s of live.sheets) {
      const bytes = fs.readFileSync(path.join(buildDir, s.href.replace(/^\/_next\//, ''))); const text = bytes.toString('utf8');
      // A constructed sheet drops @import silently; check the source text first.
      if (/@import/i.test(text)) throw new Error(`${s.href}: @import in CSS`);
      const split = splitFontRules(await parseRules(text), s.href);
      const accept = checkCss(sdkFix(split.accept), sdkFix(s.cssom), wire.links, s.href);
      const output = sdkFix(split.output);
      if (/url\(|@import/i.test(output)) throw new Error(`${s.href}: resource reference in output`);
      linkCss.push({ asset: s.href, sourceSha256: sha(bytes), ...entry(accept, output) });
      removedFontFaces[s.href] = split.removed;
    }
    const sources = buildStyleSources(chunkTexts(buildDir)); const styled = [];
    for (const s of live.styled) {
      assert(traceStyledJsx(s.text, sources), 'styled-jsx text not found in build output');
      if (/@import/i.test(s.text)) throw new Error('styled-jsx: @import in CSS');
      const split = splitFontRules(await parseRules(s.text), 'styled-jsx');
      if (split.removed) throw new Error('styled-jsx: font face in styled-jsx');
      const accept = checkCss(sdkFix(split.accept), sdkFix(s.cssom), wire.styles, 'styled-jsx');
      styled.push(entry(accept, accept));
    }
    assert.equal(linkCss.length, wire.links.size); assert.equal(styled.length, wire.styles.size);
    const classes = new Set();
    for (const c of [...linkCss, ...styled]) for (const t of classTokens(c.output.text)) classes.add(t);
    const manifest = {
      version: 2, generatedFrom: { buildId, origin, commit }, sdkVersion: '9.47.1',
      release: 'replay-vote-list-local', environment: 'replay-vote-list-local',
      viewport: live.viewport, announcerStyle: live.announcerStyle,
      linkCss: linkCss.sort((a, b) => a.asset.localeCompare(b.asset)),
      styleText: styled.sort((a, b) => a.output.sha256.localeCompare(b.output.sha256)),
      classes: [...classes].sort(), statusColors: statusColors(),
    };
    if (process.argv.includes('--diagnostic')) {
      delete manifest.release; delete manifest.environment;
      manifest.sourceStyleSha256 = [...new Set([...sources].map(sha))].sort();
    }
    fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ buildId, origin, commit, links: linkCss.length, styles: styled.length, classes: classes.size,
      removedFontFaces, review: previous ? summarizeManifest(previous, manifest) : null }, null, 2));
  } finally { await browser.close(); }
}
module.exports = { checkCss, buildStyleSources, chunkTexts, traceStyledJsx, normalizeCssOrigin, splitFontRules, summarizeManifest, sdkFix };
if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
