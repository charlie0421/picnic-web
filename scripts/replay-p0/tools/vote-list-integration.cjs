'use strict';
// Exercises the product's own Sentry instance. Never injects a recorder or a second Sentry client.
// Start vote-list-server.cjs --integration first, then run this with --out <evidence dir>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { build } = require('esbuild');
const { SELECTORS, measure, maskText, removeFontFiles, settle } = require('./vote-list-capture.cjs');
const { compare, classifyFailures } = require('../vote-list-restore.cjs');
const { parseBrowserEnvelope } = require('../../envelope-test/browser-analyze');
const ORIGIN = 'http://127.0.0.1:53931';
const opt = name => process.argv[process.argv.indexOf(name) + 1];
async function main() {
  if (!process.argv.includes('--out')) throw new Error('missing --out');
  const out = path.resolve(opt('--out')); fs.mkdirSync(out, { recursive: true });
  const viewer = await build({ entryPoints: [path.join(__dirname, '../vote-list-restore-entry.ts')], bundle: true, platform: 'browser', format: 'iife', write: false });
  const browser = await chromium.launch({ headless: true }); const results = [];
  try {
    const cases = [
      { name: 'desktop', width: 1280, positive: true }, { name: 'mobile', width: 390, positive: true },
      { name: 'no-consent', consent: null }, { name: 'granted', consent: 'granted' },
      { name: 'json-denial', consent: '{"ads":false}' }, { name: 'query', suffix: '?status=end' },
      { name: 'fragment', suffix: '#private' }, { name: 'empty-query', suffix: '?' },
      { name: 'http-only-cookie', cookie: true }, { name: 'auth-error', authError: true },
      ...['more', 'menu', 'hash', 'history', 'consent-event', 'storage', 'pagehide', 'sign-in'].map(action => ({ name: 'close-' + action, action })),
    ];
    for (const scenario of cases.filter(s => !process.argv.includes('--only') || opt('--only').split(',').includes(s.name))) {
      const context = await browser.newContext({ viewport: { width: scenario.width || 1280, height: 900 } });
      const consent = Object.hasOwn(scenario, 'consent') ? scenario.consent : 'denied';
      await context.addInitScript(value => { if (value !== null) localStorage.setItem('picnic-cookie-consent', value); }, consent);
      if (scenario.cookie) await context.addCookies([{ name: 'HttpOnlyCanary', value: 'synthetic', url: ORIGIN, httpOnly: true }]);
      const page = await context.newPage(); const replay = [], ordinary = [], errors = [], blocked = [], requests = [], baggageLinks = [];
      page.on('pageerror', e => { if (!String(e).includes('replay-integration-synthetic-error')) errors.push(String(e)); });
      page.on('request', request => {
        if (request.url().includes('/replay')) requests.push(request.url());
        if ((request.headers().baggage || '').includes('replay_id')) baggageLinks.push(new URL(request.url()).pathname);
      });
      await page.route('**/*', async route => {
        const request = route.request(); const u = new URL(request.url());
        if (!['127.0.0.1', 'localhost'].includes(u.hostname)) { blocked.push(u.origin); return route.abort(); }
        if (scenario.authError && u.pathname === '/api/replay/eligibility') return route.fulfill({ status: 503, body: '{}' });
        if (request.method() === 'POST' && (u.pathname === '/replay' || u.pathname === '/api/1/envelope/')) {
          const raw = request.postDataBuffer(); const collection = u.pathname === '/replay' ? replay : ordinary;
          fs.writeFileSync(path.join(out, `${scenario.name}-${u.pathname === '/replay' ? 'replay' : 'ordinary'}-${collection.length}.bin`), raw);
          collection.push(parseBrowserEnvelope(raw));
        }
        return route.continue();
      });
      try {
        await page.goto(ORIGIN + '/ko/vote' + (scenario.suffix || ''), { waitUntil: 'load', timeout: 90000 });
        await page.waitForSelector('h3', { timeout: 20000 });
        if (scenario.positive || scenario.action) {
          await expectReplay(page, replay, 1);
          if (scenario.positive) {
            await page.evaluate(() => { setTimeout(() => { throw new Error('replay-integration-synthetic-error'); }, 0); });
            const deadline = Date.now() + 5000;
            while (!ordinary.some(e => e.items.some(i => i.header.type === 'event')) && Date.now() < deadline) await page.waitForTimeout(50);
            assert(ordinary.some(e => e.items.some(i => i.header.type === 'event')), 'ordinary error delivered during Replay');
          }
          if (scenario.action) {
            const count = replay.length;
            await closeAction(page, scenario.action);
            await page.waitForTimeout(3500); assert.equal(replay.length, count, 'no requests after ' + scenario.action);
          } else {
          await page.getByRole('button', { name: '다음 배너', exact: true }).click();
          await expectReplay(page, replay, 2);
          await page.evaluate(() => scrollTo(0, 650)); await expectReplay(page, replay, 3);
          await page.evaluate(() => fetch('/api/replay/eligibility').then(r => r.json()));
          // Freeze the recording before measuring a masked, font-free reference.
          const count = replay.length;
          await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
          await page.waitForTimeout(3500);
          assert.equal(replay.length, count, 'no requests after close');
          await verifyRestore(browser, page, replay, scenario.width, viewer.outputFiles[0].text, out, scenario.name);
          }
          const ids = replay.map(e => e.items.find(i => i.header.type === 'replay_event').payload.segment_id);
          assert.deepEqual(ids, ids.map((_, i) => i), 'ordered consecutive segments');
          for (const e of replay) {
            const text = JSON.stringify(e); assert(!/Synthetic vote|Synthetic artist|HttpOnlyCanary|synthetic-anon-key/.test(text), 'no raw fixture text');
          }
        } else { await page.waitForTimeout(5000); assert.equal(replay.length, 0, 'ineligible page sends no Replay'); }
        assert.equal(errors.length, 0, 'no page errors');
        assert(ordinary.length > 0, 'ordinary telemetry still delivered');
        assert.deepEqual(baggageLinks, [], 'no Replay links in outgoing baggage headers');
        assert(!/replay_id|replayId|\"Replays\"/.test(JSON.stringify(ordinary)), 'no Replay correlation in ordinary telemetry');
        results.push({ name: scenario.name, passed: true, replay: replay.length, ordinary: ordinary.length, blocked });
      } catch (error) {
        results.push({ name: scenario.name, passed: false, error: String(error), replay: replay.length, ordinary: ordinary.length, errors, requests,
          state: await page.evaluate(() => ({ href: location.href, ready: document.readyState, cookies: document.cookie,
            banners: document.querySelectorAll('.banner-slide').length, ads: !!document.getElementById('adsense-script') })) });
        await page.screenshot({ path: path.join(out, `${scenario.name}-failure.png`) });
      } finally { await context.close(); }
      console.log(JSON.stringify(results.at(-1)));
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'integration.json'), JSON.stringify(results, null, 2) + '\n'); }
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
async function expectReplay(page, received, count) {
  const deadline = Date.now() + 12000;
  while (received.length < count && Date.now() < deadline) await page.waitForTimeout(100);
  assert(received.length >= count, `expected ${count} projected segments, received ${received.length}`);
}
async function closeAction(page, action) {
  if (action === 'more') return page.getByRole('button', { name: '더보기', exact: true }).click();
  if (action === 'menu') return page.locator('header a[href="/ko/mypage"]:visible').first().click();
  if (action === 'sign-in') {
    await page.route('**/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }) }));
    return page.evaluate(async () => {
      const enc = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: '00000000-0000-4000-8000-000000000001', exp: Math.floor(Date.now()/1000) + 3600, aud: 'authenticated' }) + '.c3ludGhldGlj';
      const result = await window.supabase.auth.setSession({ access_token: token, refresh_token: 'synthetic-refresh' });
      if (result.error) throw new Error('synthetic sign-in failed: ' + result.error.name + ': ' + result.error.message);
    });
  }
  return page.evaluate(action => {
    if (action === 'hash') location.hash = 'closed';
    else if (action === 'history') history.pushState(null, '', '/ko/vote?closed=1');
    else if (action === 'consent-event') window.dispatchEvent(new CustomEvent('picnic-consent-updated'));
    else window.dispatchEvent(new Event(action));
  }, action);
}
async function verifyRestore(browser, original, envelopes, width, bundle, out, name, options = {}) {
  // A closed diagnostic panel removes its Stop button after capture has already stopped.
  // Compare product controls; recording ID/control masking is asserted separately by the diagnostic suite.
  const selectors = options.excludeDiagnosticControls ? SELECTORS.map(s => s === 'button' ? 'button:not(.fixed.bottom-4.right-4 button)' : s) : SELECTORS;
  await original.evaluate(() => scrollTo(0, 0)); await original.mouse.move(-10, -10);
  await original.waitForTimeout(600); await original.evaluate(maskText); await original.evaluate(removeFontFiles);
  await original.evaluate(async () => { await document.fonts.ready; }); await original.evaluate(settle);
  const control = await original.evaluate(measure, selectors);
  const track = await original.locator('.banner-track').getAttribute('style');
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('**/*', route => route.abort());
  try {
    await page.setContent(`<iframe style="border:0;width:${width}px;height:900px"></iframe>`);
    await page.addScriptTag({ content: bundle });
    const records = envelopes.flatMap(e => e.items.filter(i => i.header.type === 'replay_recording').flatMap(i => i.payload.records));
    const tags = ['html', 'head', 'body', 'meta', 'title', 'link', 'style', 'div', 'span', 'a', 'button', 'img', 'svg', 'header', 'main', 'section', 'footer', 'h3', 'p', 'next-route-announcer'];
    const restored = await page.evaluate(({ records, selectors, tags }) => window.voteList.restore(records, selectors, tags), { records, selectors, tags });
    const differences = classifyFailures(compare(control, restored));
    const restoredTrack = Array.from(JSON.stringify(records).matchAll(/--banner-current-index: \d+;/g)).at(-1)?.[0] || '';
    fs.writeFileSync(path.join(out, `${name}-restore.json`), JSON.stringify({ differences, track, restoredTrack, boxes: restored.length }, null, 2));
    assert.equal(differences.other.length, 0, 'no new layout loss'); assert.equal(restoredTrack, track, 'banner position restored');
  } finally { await page.close(); }
}
module.exports = { verifyRestore };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
