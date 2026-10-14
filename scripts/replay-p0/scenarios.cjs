'use strict';
const assert = require('node:assert/strict');

// Test boundary instrumentation; never reaches a product bundle. No SDK private methods.
async function installProbe(page, mode, fakeClock) {
  if (fakeClock) await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') });
  await page.addInitScript(({ mode, fakeClock }) => {
    if (fakeClock) {
      // Sentry obtains native timers from a freshly attached iframe. Keep that public DOM
      // boundary on the same test clock; a separate real-time run verifies SDK delays.
      const append = Element.prototype.appendChild;
      Element.prototype.appendChild = function (node) {
        const result = append.call(this, node);
        if (node instanceof HTMLIFrameElement && node.contentWindow) {
          node.contentWindow.setTimeout = window.setTimeout.bind(window);
          node.contentWindow.clearTimeout = window.clearTimeout.bind(window);
        }
        return result;
      };
    }
    const observers = new Map();
    const probe = window.p0Boundary = { observerCount: () => [...observers.values()].filter(stack => !stack.includes('InjectedScript')).length, workerFinishes: 0, workerInits: 0, held: [],
      release() { for (const send of this.held.splice(0)) send(); } };
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      observe(...args) { observers.set(this, new Error().stack); return super.observe(...args); }
      disconnect() { observers.delete(this); return super.disconnect(); }
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) { super(url, options); this.isSdk = String(url).startsWith('blob:');
        if (this.isSdk) this.addEventListener('message', e => { if (e.data.method === 'init') probe.workerInits++; }); }
      postMessage(...args) {
        if (this.isSdk && args[0]?.method === 'finish') {
          probe.workerFinishes++;
          if (mode === 'hung-sdk-worker' || mode === 'close-compression') {
            probe.held.push(() => super.postMessage(...args)); return;
          }
        }
        return super.postMessage(...args);
      }
    };
  }, { mode, fakeClock });
}
const status = page => page.evaluate(() => ({ ...window.p0Trial.status(), observers: window.p0Boundary.observerCount(),
  workerFinishes: window.p0Boundary.workerFinishes }));
async function ready(page, mode, compression) {
  await page.evaluate(async ({ mode, compression }) => {
    window.p0Trial = window.replayP0.createTrial(mode, compression); await window.p0Trial.prepare();
  }, { mode, compression });
  if (compression && (await status(page)).phase === 'RECORDING') {
    await page.waitForFunction(() => window.p0Boundary.workerInits > 0, undefined, { timeout: 5000 });
  }
}
async function cleanup(page) {
  await page.waitForFunction(() => window.p0Trial.status().cleanup !== 'pending', undefined, { timeout: 6000 });
}
async function exerciseNormal(page, compression) {
  await ready(page, 'normal', compression);
  const views = await page.evaluate(async () => {
    const t = window.p0Trial; await t.ordinary('during', true); await t.ordinary('during', false);
    const views = [t.view()]; await t.flush();
    await t.step(1); views.push(t.view()); await t.flush();
    await t.step(2); views.push(t.view()); await t.flush();
    t.close('hidden'); return views;
  });
  await cleanup(page);
  const stopped = await status(page);
  await page.evaluate(async () => { const t = window.p0Trial; await t.prepare(); await t.flush();
    await t.ordinary('after', true); await t.ordinary('after', false); });
  const direct = await page.evaluate(() => window.p0Trial.directRestart());
  return { ...await status(page), views, direct, stopped };
}
async function exerciseRace(page, mode, compression) {
  if (mode === 'close-import') {
    await page.evaluate(() => { const t = window.p0Trial = window.replayP0.createTrial('close-import');
      window.p0Preparing = t.prepare(); t.close('ineligible'); t.releaseImport(); });
    await page.evaluate(() => window.p0Preparing);
  } else {
    await ready(page, mode, compression);
    if (mode === 'close-compression') {
      await page.evaluate(() => { void window.p0Trial.flush(); });
      await page.waitForFunction(() => window.p0Boundary.workerFinishes > 0, undefined, { timeout: 5000 });
      await page.evaluate(() => { window.p0Trial.close('ineligible'); window.p0Boundary.release(); });
    } else if (mode === 'hidden') {
      // Handler injection is explicit. Real hidden navigation is a separate case below;
      // headless window minimize/freeze did not change visibilityState on this platform.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } else if (mode === 'pagehide') {
      // Event-path test; actual BFCache is reported separately.
      await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    } else if (mode === 'expired') {
      await page.clock.fastForward(300000);
    } else if (mode === 'css-canary') {
      await page.evaluate(async () => {
        await window.p0Trial.flush(); document.querySelector('style').textContent += '.canary-css { color: red; }';
        await new Promise(resolve => requestAnimationFrame(resolve)); await window.p0Trial.flush();
      });
    } else await page.evaluate(() => window.p0Trial.flush());
  }
  await cleanup(page);
  const before = await status(page);
  await page.evaluate(async () => { await window.p0Trial.prepare(); await window.p0Trial.flush(); });
  const after = await status(page);
  assert.equal(after.phase, 'CLOSED', mode); assert.equal(after.cleanup, 'resolved', mode);
  assert.equal(after.sdkStarts, before.sdkStarts, mode + ': no controller restart');
  assert.equal(after.networkStarts.length, before.networkStarts.length, mode + ': no later send');
  assert.ok(after.networkStarts.every(x => x.phase === 'RECORDING' && (after.closedAt === null || x.time <= after.closedAt)));
  assert.equal(after.observers, 0, mode + ': rrweb observers disconnected');
  assert.equal(after.networkStarts.length, ['close-fetch', 'fetch-timeout', 'css-canary'].includes(mode) ? 1 : 0, mode);
  return { ...after, visibilityInjection: mode === 'hidden' };
}
async function exerciseCleanup(page, mode, fakeClock) {
  await ready(page, mode, true);
  // Stop owns the SDK flush. Finite retry is before transport; no local transport retry is involved.
  if (mode === 'hung-sdk-worker') {
    await page.evaluate(() => { void window.p0Trial.flush(); });
    await page.waitForFunction(() => window.p0Boundary.workerFinishes > 0, undefined, { timeout: 5000 });
  }
  await page.evaluate(() => window.p0Trial.close('ineligible'));
  if (mode !== 'hung-sdk-worker') {
    await page.waitForFunction(() => window.p0Trial.status().processorTimes.length > 0, undefined, { timeout: 5000 });
  }
  if (fakeClock) {
    for (const step of [0, 5000, 10000, 30000, 15000]) {
      await page.clock.runFor(step);
      await page.evaluate(() => Promise.resolve());
    }
  } else await page.waitForFunction(() => window.p0Trial.status().cleanup !== 'pending', undefined, { timeout: 60000 });
  const result = await status(page);
  assert.equal(result.phase, 'CLOSED'); assert.equal(result.networkStarts.length, 0);
  assert.equal(result.observers, 0);
  if (mode === 'finite-processor') {
    assert.equal(result.cleanup, 'resolved');
    assert.equal(result.processorTimes.length, 4);
    const gaps = result.processorTimes.slice(1).map((time, i) => time - result.processorTimes[i]);
    [5000, 10000, 30000].forEach((minimum, i) => assert.ok(gaps[i] >= minimum - 20 && gaps[i] < minimum + 3000, 'retry interval'));
    result.retryGapsMs = gaps;
  } else {
    assert.equal(result.cleanup, 'pending');
    if (mode === 'hung-processor') assert.equal(result.processorTimes.length, 1);
    else assert.ok(result.workerFinishes > 0);
    result.observedPendingAtMs = 60000;
  }
  return result;
}
module.exports = { installProbe, exerciseNormal, exerciseRace, exerciseCleanup };

async function exerciseNavigation(page, origin) {
  await ready(page, 'bfcache', true);
  const cdp = await page.context().newCDPSession(page);
  const notRestored = [];
  await cdp.send('Page.enable');
  cdp.on('Page.backForwardCacheNotUsed', e => notRestored.push(e.notRestoredExplanations.map(x => x.reason)));
  await page.goto(origin + '/blank');
  const lifecycle = await page.evaluate(() => JSON.parse(sessionStorage.getItem('p0-lifecycle')));
  assert.ok(lifecycle.some(x => x.event === 'pagehide' && x.phase === 'CLOSED'));
  assert.ok(lifecycle.some(x => x.event === 'visibilitychange' && x.hidden && x.phase === 'CLOSED'));
  await page.goBack();
  const restored = await page.evaluate(() => !!window.p0Trial?.status().restored);
  let restoredStatus;
  if (restored) {
    await cleanup(page);
    await page.evaluate(async () => { await window.p0Trial.prepare(); await window.p0Trial.flush(); });
    restoredStatus = await status(page);
    assert.equal(restoredStatus.phase, 'CLOSED'); assert.equal(restoredStatus.networkStarts.length, 0);
    assert.equal(restoredStatus.sdkStarts, 1); assert.equal(restoredStatus.observers, 0);
  }
  await cdp.detach();
  return { sdkVersion: '9.47.1', lifecycle, restored, restoredStatus, notRestored,
    bfcacheVerification: restored ? 'pass' : 'unverified', hiddenBarrier: 'pass' };
}
module.exports.exerciseNavigation = exerciseNavigation;
