'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { listen } = require('../envelope-test/harness');
const { parseBrowserEnvelope } = require('../envelope-test/browser-analyze');
const contract = require('./fixtures/sdk-contract.json');
const { installProbe, exerciseNormal, exerciseRace, exerciseCleanup, exerciseNavigation } = require('./scenarios.cjs');
const { exitCode } = require('./result.cjs');
const { compareReplay } = require('./verify.cjs');

async function runProbe({ propagation, cached, scenario = 'capture', mode = 'normal', compression = true, fakeClock = false }) {
  const bundle = await build({
    entryPoints: [path.join(__dirname, 'browser-entry.ts')], bundle: true,
    platform: 'browser', format: 'iife', write: false, metafile: true,
    define: { 'process.env.NODE_ENV': '"test"' },
  });
  const script = bundle.outputFiles[0].contents;
  const workerBundle = await build({ entryPoints: [path.join(__dirname, 'worker-entry.ts')], bundle: true,
    platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"test"' } });
  const envelopes = [], requests = [], external = [];
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/ko/vote') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(fs.readFileSync(path.join(__dirname, 'fixture.html')));
    } else if (request.method === 'GET' && request.url === '/blank') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<!doctype html><body>Local navigation target</body>');
    } else if (request.method === 'GET' && request.url === '/bundle.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      response.end(script);
    } else if (request.method === 'GET' && request.url === '/worker.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      response.end(mode === 'worker-timeout' ? 'onmessage=()=>{while(true){}}' : workerBundle.outputFiles[0].contents);
    } else if (request.method === 'GET' && ['/probe/during', '/probe/after'].includes(request.url)) {
      requests.push({ phase: request.url.split('/').at(-1), baggage: request.headers.baggage || '', trace: request.headers['sentry-trace'] || '' });
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}');
    } else if (request.method === 'POST' && (request.url.startsWith('/api/1/envelope/') || request.url === '/replay')) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try { envelopes.push(parseBrowserEnvelope(Buffer.concat(chunks))); }
      catch { response.writeHead(400); response.end(); return; }
      if (mode === 'fetch-timeout' && request.url === '/replay') return;
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}');
    } else { response.writeHead(404); response.end(); }
  });
  let browser, deadline;
  try {
    const port = await listen(server, '127.0.0.1');
    const origin = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
    await page.exposeBinding('p0TrustedClick', async () => { await page.click('.toggle'); });
    if (scenario !== 'capture') await installProbe(page, mode, fakeClock);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && (['/ko/vote', '/blank', '/bundle.js', '/worker.js', '/replay', '/probe/during', '/probe/after'].includes(url.pathname)
        || url.pathname === '/api/1/envelope/')) return route.continue();
      external.push(url.origin); return route.abort();
    });
    await page.goto(`${origin}/ko/vote`);
    // Separate script asset; the recorder must omit this node itself.
    await page.addScriptTag({ url: `${origin}/bundle.js` });
    const work = async () => scenario === 'capture'
      ? page.evaluate(options => window.replayP0.captureContract(options), { propagation, cached })
      : scenario === 'normal' ? exerciseNormal(page, compression)
        : scenario === 'cleanup' ? exerciseCleanup(page, mode, fakeClock)
          : ['bfcache', 'inp-hide', 'inp-navigation'].includes(mode) ? exerciseNavigation(page, origin, mode) : exerciseRace(page, mode, compression);
    const result = await Promise.race([work(), new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error(`case-timeout:${scenario}:${mode}`)), fakeClock ? 20000 : 70000);
    })]);
    clearTimeout(deadline);
    const records = envelopes.flatMap(x => x.items.filter(i => i.header.type === 'replay_recording').flatMap(i => i.payload.records));
    const nodes = [];
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if ('tagName' in value) nodes.push(value);
      for (const child of Object.values(value)) visit(child);
    }
    visit(records);
    if (mode === 'inp-hide' || mode === 'inp-navigation') {
      const spans = envelopes.flatMap(e => e.items.filter(i => i.header.type === 'span'));
      assert.ok(spans.length > 0, 'actual INP standalone span delivered');
      assert.ok(!/"(?:replay_id|replayId|Replays)"/.test(JSON.stringify(envelopes)), 'INP Replay correlation removed');
    }
    const viewEvidence = scenario === 'normal' ? await compareReplay(browser, origin, envelopes, result.views) : undefined;
    return { ...result, viewEvidence, requests, envelopes, records, external,
      tags: [...new Set(nodes.map(n => n.tagName))],
      bundleSha256: createHash('sha256').update(script).digest('hex'),
      bundleInputs: Object.keys(bundle.metafile.inputs) };
  } finally {
    clearTimeout(deadline);
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function assertNormal(result) {
  assert.equal(result.phase, 'CLOSED'); assert.equal(result.cleanup, 'resolved');
  assert.equal(result.stopped.observers, 0);
  assert.equal(result.observers, 0);
  assert.equal(result.networkStarts.length, 3);
  assert.ok(result.networkStarts.every(x => x.phase === 'RECORDING'));
  const recordings = result.envelopes.flatMap(e => e.items.filter(i => i.header.type === 'replay_recording'));
  assert.deepEqual(recordings.map(i => i.payload.segment.segment_id), [0, 1, 2]);
  assert.equal(new Set(result.envelopes.flatMap(e => e.items.filter(i => i.header.type === 'replay_event').map(i => i.payload.replay_id))).size, 1);
  assert.ok(result.direct.restarted && result.direct.attempted > 0, 'public API restart counterexample observed');
  assert.ok(result.records.every(r => r.type !== 5));
  assert.ok(!JSON.stringify(result.envelopes).includes('canary-p0'));
  const normal = result.envelopes.filter(e => e.items.every(i => !i.header.type.startsWith('replay_')));
  assert.ok(normal.some(e => e.items.some(i => i.header.type === 'event')));
  assert.ok(normal.some(e => e.items.some(i => i.header.type === 'transaction')));
  assert.ok(!/"(?:replay_id|replayId|Replays)"/.test(JSON.stringify(normal)), 'ordinary envelope Replay links removed');
  assert.ok(result.requests.every(r => !r.baggage.includes('sentry-replay_id')));
  assert.deepEqual(result.external, []);
  assert.ok(result.viewEvidence.maxRectError <= 1);
  assert.ok(result.viewEvidence.maxOpacityError <= 0.01);
}

function assertProbe(result, { expectClean }) {
  assert.equal(result.sdkVersion, '9.47.1');
  assert.equal(result.flushed, true);
  assert.deepEqual(result.external, []);
  assert.deepEqual(result.requests.map(x => x.phase), ['during', 'after']);
  assert.ok(result.records.some(x => x.type === 2), 'actual SDK full snapshot received');
  assert.ok(result.envelopes.some(x => x.items.some(i => i.header.type === 'event')), 'ordinary error still delivered');
  assert.ok(result.envelopes.some(x => x.items.some(i => i.header.type === 'transaction')), 'ordinary transaction still delivered');
  const recordings = result.envelopes.flatMap(x => x.items.filter(i => i.header.type === 'replay_recording'));
  assert.deepEqual(recordings.map(i => i.payload.segment.segment_id), [0, 1, 2], 'actual consecutive SDK segments');
  assert.deepEqual([...result.tags].sort(), [...contract.tags].sort(), 'only supported DOM tags');
  const nodes = [];
  const collect = value => {
    if (!value || typeof value !== 'object') return;
    if ('textContent' in value) nodes.push(value);
    Object.values(value).forEach(collect);
  };
  collect(result.records);
  const css = nodes.filter(n => n.isStyle).map(n => n.textContent);
  assert.deepEqual(css, [contract.normalizedCss], 'reviewed recorder-normalized stylesheet');
  assert.equal(createHash('sha256').update(css[0]).digest('hex'), contract.normalizedCssSha256);
  const styles = result.records.filter(r => r.type === 3 && r.data.source === 0)
    .flatMap(r => r.data.attributes).filter(a => Object.hasOwn(a.attributes, 'style')).map(a => a.attributes.style);
  assert.ok(styles.some(s => typeof s === 'string'), 'whole style string recorded');
  assert.ok(styles.some(s => s && typeof s === 'object' && s.opacity === false
    && Array.isArray(s.width) && s.width[1] === 'important'), 'typed style deletion and priority recorded');
  assert.ok(styles.includes(null), 'whole style removal recorded');
  if (expectClean) for (const request of result.requests) {
    assert.ok(!request.baggage.includes('sentry-replay_id'), `${request.phase}: replay correlation escaped createDsc guard`);
  }
}

async function main() {
  const propagation = process.argv.includes('--propagate');
  const caseIndex = process.argv.indexOf('--case'); const scenario = caseIndex === -1 ? 'capture' : process.argv[caseIndex + 1];
  if (['all', 'races', 'limits'].includes(scenario) || (scenario === 'cleanup' && !process.argv.includes('--mode'))) {
    const report = await runAll(scenario);
    const output = process.argv.indexOf('--output');
    if (output !== -1) fs.writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2));
    process.exitCode = scenario === 'all' ? exitCode(report) : report.cases.some(c => c.status === 'fail') ? 1 : 0;
    return;
  }
  assert.ok(['capture', 'normal', 'race', 'cleanup'].includes(scenario), 'supported case');
  const modeIndex = process.argv.indexOf('--mode');
  const mode = modeIndex === -1 ? 'normal' : process.argv[modeIndex + 1];
  const result = await runProbe({ propagation, cached: !process.argv.includes('--fresh'), scenario, mode,
    fakeClock: process.argv.includes('--fake-clock'), compression: !process.argv.includes('--uncompressed') });
  const output = process.argv.indexOf('--output');
  if (output !== -1) fs.writeFileSync(process.argv[output + 1], JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ sdkVersion: result.sdkVersion, propagation,
    requests: result.requests.map(x => ({ phase: x.phase, replayLink: x.baggage.includes('sentry-replay_id'), trace: !!x.trace })),
    guardCalls: result.guardCalls, records: result.records.length, tags: result.tags }));
  if (scenario === 'capture') assertProbe(result, { expectClean: true }); else if (scenario === 'normal') assertNormal(result);
}

module.exports = { runProbe, assertProbe, assertNormal, exitCode };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

function isolation(inputs) {
  const root = path.resolve(__dirname, '../..');
  const matched = [];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(filename);
      else if (/\.(tsx?|jsx?|mjs|cjs|html|json)$/.test(filename) && /replay-p0|replayP0|p0Trial/.test(fs.readFileSync(filename, 'utf8'))) matched.push(filename);
    }
  }
  for (const directory of ['app', 'pages', 'public', 'components', 'lib']) walk(path.join(root, directory));
  assert.deepEqual(matched, [], 'no product/public P0 importer or artifact');
  const unexpected = inputs.filter(p => !p.startsWith('node_modules/') && !p.startsWith('scripts/replay-p0/')
    && !['lib/sentry/browser-scrub.ts', 'lib/sentry/scrub.ts'].includes(p));
  assert.deepEqual(unexpected, [], 'fixture bundle isolation');
  return { scanned: ['app', 'pages', 'public', 'components', 'lib'], matched, unexpected };
}
async function runAll(group = 'all') {
  const report = { normal: 'not-run', barrier: 'not-run', finiteCleanup: 'not-run', limits: 'not-run', isolation: 'not-run',
    expectedLimitations: [], cases: [], unverified: ['Actual background timer throttling; deadlines require the main event loop to run.'] };
  const run = async (name, options, verify) => {
    const start = Date.now();
    try {
      const result = await runProbe(options); if (verify) verify(result);
      assert.deepEqual(result.external, []);
      report.cases.push({ name, status: 'pass', elapsedMs: Date.now() - start, result });
      console.log(JSON.stringify({ case: name, status: 'pass', elapsedMs: Date.now() - start })); return result;
    } catch (error) {
      report.cases.push({ name, status: 'fail', elapsedMs: Date.now() - start, reason: error.message });
      console.log(JSON.stringify({ case: name, status: 'fail', reason: error.message })); return null;
    }
  };
  const pass = names => names.every(name => report.cases.some(c => c.name === name && c.status === 'pass')) ? 'pass' : 'fail';
  if (group === 'all' || group === 'normal') {
    for (const compression of [true, false]) await run(`normal-${compression ? 'compressed' : 'plain'}`, { scenario: 'normal', compression }, assertNormal);
    report.normal = pass(['normal-compressed', 'normal-plain']);
    const normal = report.cases.find(c => c.name === 'normal-compressed')?.result;
    report.expectedLimitations.push({ case: 'direct-restart', observed: !!normal?.direct.restarted && normal.direct.attempted > 0 });
    if (normal) { try { report.isolationEvidence = isolation(normal.bundleInputs); report.isolation = 'pass'; } catch (e) { report.isolation = 'fail'; report.isolationReason = e.message; } }
  }
  if (group === 'all' || group === 'races') {
    const modes = ['close-import', 'close-start', 'close-snapshot', 'close-compression', 'close-transform', 'close-transport', 'close-fetch', 'hidden', 'pagehide', 'bfcache', 'inp-hide', 'inp-navigation'];
    for (const mode of modes) {
      const result = await run(mode, { scenario: 'race', mode });
      if (mode === 'bfcache' && result?.bfcacheVerification === 'unverified') report.unverified.push('Actual BFCache restoration: ' + JSON.stringify(result.notRestored));
    }
    report.barrier = pass(modes);
  }
  if (group === 'all' || group === 'cleanup') {
    await run('finite-fake-clock', { scenario: 'cleanup', mode: 'finite-processor', fakeClock: true });
    await run('finite-real-time', { scenario: 'cleanup', mode: 'finite-processor' });
    report.finiteCleanup = pass(['finite-fake-clock', 'finite-real-time']);
    for (const mode of ['hung-processor', 'hung-sdk-worker']) {
      const result = await run(mode, { scenario: 'cleanup', mode, fakeClock: true });
      report.expectedLimitations.push({ case: mode, observed: result?.cleanup === 'pending' && result.observedPendingAtMs === 60000 });
    }
  }
  if (group === 'all' || group === 'limits') {
    const modes = ['worker-timeout', 'fetch-timeout', 'expired', 'css-canary'];
    for (const mode of modes) await run(mode, { scenario: 'race', mode, fakeClock: mode === 'expired' });
    report.limits = pass(modes);
  }
  return report;
}
module.exports.runAll = runAll;
