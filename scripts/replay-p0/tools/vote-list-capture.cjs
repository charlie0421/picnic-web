'use strict';
// Records /ko/vote with the Sentry Replay SDK and measures the original page, from the repository root,
// while vote-list-server.cjs serves the build:
//   node scripts/replay-p0/tools/vote-list-capture.cjs --out <dir> [--browser chromium|webkit|firefox] [--widths 1280,390]
// Writes wire-<width>-<n>.bin (n=0 session, 1..3 replay segments 0..2), capture-<width>.json, page-<width>.png,
// layout.json and capture-summary.json. Requests outside loopback are aborted.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const playwright = require('playwright');
const { build } = require('esbuild');
const { parseBrowserEnvelope } = require('../../envelope-test/browser-analyze');

const PORT = 53931;
const SELECTORS = ['header', 'main', 'footer', 'main section', '.banner-carousel', '.banner-track', '.banner-slide',
  '.grid > *', 'h3', 'img', 'svg', 'button'];
const BANNER_STEPS = {
  1280: ['--banner-current-index: 2;', '--banner-current-index: 0;'],
  390: ['--banner-current-index: 1;', '--banner-current-index: 2;', '--banner-current-index: 3;', '--banner-current-index: 4;'],
};
const SDK_SOURCE = `import * as S from '@sentry/browser';
const r = S.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true, stickySession: false,
  useCompression: false, minReplayDuration: 0, flushMinDelay: 60000, flushMaxDelay: 60000 });
const c = S.init({ dsn: 'http://synthetic@' + location.host + '/1', environment: 'replay-build-manifest', release: 'replay-build-manifest',
  replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0, tracesSampleRate: 0, tracePropagationTargets: [], integrations: [r] });
r.start();
window.harnessReplay = { flush: () => r.flush(), stop: async () => { await r.stop(); await c.close(3000); } };`;
const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };

// Page functions (serialized by Playwright).
function pageState() {
  return {
    voteTitles: [...document.querySelectorAll('h3')].filter(n => n.textContent.startsWith('Synthetic vote')).length,
    banners: document.querySelectorAll('.banner-slide').length,
    consent: localStorage.getItem('picnic-cookie-consent'),
    reloadTs: sessionStorage.getItem('vote-last-reload-ts'),
    adScripts: [...document.scripts].filter(s => s.id === 'adsense-script' || /googlesyndication/.test(s.src)).length,
    imageErrors: [...document.querySelectorAll('span')].filter(n => n.textContent === '이미지 로딩 실패').length,
    portal: !!document.querySelector('nextjs-portal'),
  };
}
function measure(selectors) {
  return selectors.flatMap(s => [...document.querySelectorAll(s)].map((el, index) => {
    const r = el.getBoundingClientRect();
    return { selector: s, index, x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height,
      opacity: Number(getComputedStyle(el).opacity) };
  }));
}
/** Same masking as the SDK: every non-space character becomes *. */
function maskText() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (n.parentElement && !['STYLE', 'SCRIPT'].includes(n.parentElement.tagName)) n.textContent = n.textContent.replace(/\S/g, '*');
  }
}
/** The control: delete the @font-face rules that load font files, as the manifest output does. */
function removeFontFiles() {
  let removed = 0;
  for (const sheet of document.styleSheets) {
    if (!(sheet.ownerNode instanceof HTMLLinkElement)) continue;
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const rule = sheet.cssRules[i];
      if (rule instanceof CSSFontFaceRule && /url\(/.test(rule.style.getPropertyValue('src'))) { sheet.deleteRule(i); removed++; }
    }
  }
  return removed;
}
/** Finishes finite CSS animations and transitions, as the restore side does before it measures. */
function settle() {
  for (const a of document.getAnimations()) if (a.effect && a.effect.getComputedTiming().endTime !== Infinity) a.finish();
}
/** True when the system has a font named Inter (the replay viewer would use it). */
function hasLocalInter() {
  const c = document.createElement('canvas').getContext('2d');
  const width = font => { c.font = `40px ${font}`; return c.measureText('****ABCabc123').width; };
  return width('Inter, serif') !== width('serif');
}

async function captureWidth(browser, width, out, bundle) {
  const checks = []; const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('picnic-cookie-consent', 'denied'));
  const page = await context.newPage();
  const envelopes = []; const blocked = []; const errors = []; const requests = []; const actions = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (new URL(r.url()).hostname === '127.0.0.1') requests.push({ url: r.url(), status: r.status() }); });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/1/envelope/') {
      const raw = route.request().postDataBuffer();
      fs.writeFileSync(path.join(out, `wire-${width}-${envelopes.length}.bin`), raw); envelopes.push(parseBrowserEnvelope(raw));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.continue();
    blocked.push(u.origin); return route.abort();
  });
  try {
    const response = await page.goto(`http://127.0.0.1:${PORT}/ko/vote`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('h3', { timeout: 20000 }); await page.waitForTimeout(2000);
    const before = await page.evaluate(pageState);
    check('status 200', response.status() === 200, response.status());
    check('12 synthetic votes', before.voteTitles === 12, before.voteTitles);
    check('5 banners', before.banners === 5, before.banners);
    check('ads consent denied', before.consent === 'denied', before.consent);
    check('no ad script', before.adScripts === 0, before.adScripts);
    check('no dev portal', !before.portal, before.portal);
    await page.addScriptTag({ content: bundle }); await page.waitForTimeout(1000);
    await page.evaluate(() => window.harnessReplay.flush());
    for (let i = 0; i < BANNER_STEPS[width].length; i++) {
      const prev = await page.locator('.banner-track').getAttribute('style');
      await page.getByRole('button', { name: '다음 배너', exact: true }).click(); await page.waitForTimeout(650);
      actions.push({ kind: 'banner-next', before: prev, after: await page.locator('.banner-track').getAttribute('style') });
    }
    await page.evaluate(() => window.harnessReplay.flush());
    // Scroll through every card to exercise lazy images and the image failure state.
    for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += 700) {
      await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1000);
    const after = await page.evaluate(pageState);
    await page.evaluate(() => window.harnessReplay.flush()); await page.evaluate(() => window.harnessReplay.stop());
    await page.screenshot({ path: path.join(out, `page-${width}.png`), fullPage: true });
    await page.evaluate(() => scrollTo(0, 0));
    // The pointer rests on a card after the scroll, which keeps hover:-translate-y-1 (4px) on it. The replay has no
    // pointer state, so move the pointer off the page before measuring the original.
    await page.mouse.move(-10, -10); await page.waitForTimeout(500); await page.evaluate(settle);
    const raw = await page.evaluate(measure, SELECTORS);
    await page.evaluate(maskText); await page.evaluate(settle);
    const masked = await page.evaluate(measure, SELECTORS);
    const fontFacesRemoved = await page.evaluate(removeFontFiles);
    await page.evaluate(async () => { await document.fonts.ready; return true; }); await page.waitForTimeout(500); await page.evaluate(settle);
    const control = await page.evaluate(measure, SELECTORS);
    const localInter = await page.evaluate(hasLocalInter);
    const layout = { raw, masked, control, trackStyle: await page.locator('.banner-track').getAttribute('style'), fontFacesRemoved, localInter };
    check('banner steps', isDeepStrictEqual(actions.map(a => a.after), BANNER_STEPS[width]), actions.map(a => a.after));
    check('5 image failures', after.imageErrors === 5, after.imageErrors);
    check('no ad script after scroll', after.adScripts === 0, after.adScripts);
    check('no reload', after.reloadTs === null, after.reloadTs);
    check('no RSC refetch', !requests.some(r => new URL(r.url).pathname === '/ko/vote' && new URL(r.url).searchParams.has('_rsc')));
    check('no page errors', errors.length === 0, errors);
    check('session + 3 segments', envelopes.length === 4, envelopes.length);
    fs.writeFileSync(path.join(out, `capture-${width}.json`), JSON.stringify({ width, before, after, actions, errors, blocked, requests }, null, 2));
    return { width, checks, envelopes: envelopes.length, blocked, actions, layout };
  } catch (error) {
    check('scenario completed', false, String(error));
    return { width, checks, envelopes: envelopes.length, blocked, actions, layout: null };
  } finally { await context.close(); }
}
async function main() {
  if (!opt('--out')) throw new Error('missing --out');
  const out = path.resolve(opt('--out'));
  const browserName = opt('--browser', 'chromium'); if (!['chromium', 'webkit', 'firefox'].includes(browserName)) throw new Error('bad --browser');
  const widths = opt('--widths', '1280,390').split(',').map(Number);
  fs.mkdirSync(out, { recursive: true });
  const bundle = (await build({ stdin: { contents: SDK_SOURCE, resolveDir: process.cwd() }, bundle: true, write: false,
    format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  const browser = await playwright[browserName].launch(browserName === 'chromium' ? { headless: true, channel: 'chromium' } : { headless: true });
  const summary = { browser: browserName, version: browser.version(), widths: [] }; const layouts = {};
  try {
    for (const width of widths) {
      const r = await captureWidth(browser, width, out, bundle);
      layouts[width] = r.layout; summary.widths.push({ width: r.width, checks: r.checks, envelopes: r.envelopes, blocked: r.blocked, actions: r.actions });
      console.log(JSON.stringify({ width, failed: r.checks.filter(c => !c.ok).map(c => c.name), envelopes: r.envelopes }));
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify(layouts, null, 2));
  fs.writeFileSync(path.join(out, 'capture-summary.json'), JSON.stringify(summary, null, 2));
  const failed = summary.widths.some(w => w.checks.some(c => !c.ok));
  if (failed && browserName === 'chromium') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
