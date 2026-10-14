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

async function runProbe({ propagation, cached }) {
  const bundle = await build({
    entryPoints: [path.join(__dirname, 'browser-entry.ts')], bundle: true,
    platform: 'browser', format: 'iife', write: false, metafile: true,
    define: { 'process.env.NODE_ENV': '"test"' },
  });
  const script = bundle.outputFiles[0].contents;
  const envelopes = [], requests = [], external = [];
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/ko/vote') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(fs.readFileSync(path.join(__dirname, 'fixture.html')));
    } else if (request.method === 'GET' && request.url === '/bundle.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      response.end(script);
    } else if (request.method === 'GET' && ['/probe/during', '/probe/after'].includes(request.url)) {
      requests.push({ phase: request.url.split('/').at(-1), baggage: request.headers.baggage || '', trace: request.headers['sentry-trace'] || '' });
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}');
    } else if (request.method === 'POST' && request.url.startsWith('/api/1/envelope/')) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try { envelopes.push(parseBrowserEnvelope(Buffer.concat(chunks))); }
      catch { response.writeHead(400); response.end(); return; }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}');
    } else { response.writeHead(404); response.end(); }
  });
  let browser;
  try {
    const port = await listen(server, '127.0.0.1');
    const origin = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      external.push(url.origin); return route.abort();
    });
    await page.goto(`${origin}/ko/vote`);
    // Separate script asset; the recorder must omit this node itself.
    await page.addScriptTag({ url: `${origin}/bundle.js` });
    const result = await page.evaluate(options => window.replayP0.captureContract(options), { propagation, cached });
    const records = envelopes.flatMap(x => x.items.filter(i => i.header.type === 'replay_recording').flatMap(i => i.payload.records));
    const nodes = [];
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if ('tagName' in value) nodes.push(value);
      for (const child of Object.values(value)) visit(child);
    }
    visit(records);
    return { ...result, requests, envelopes, records, external,
      tags: [...new Set(nodes.map(n => n.tagName))],
      bundleSha256: createHash('sha256').update(script).digest('hex'),
      bundleInputs: Object.keys(bundle.metafile.inputs) };
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
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
  const result = await runProbe({ propagation, cached: !process.argv.includes('--fresh') });
  const output = process.argv.indexOf('--output');
  if (output !== -1) fs.writeFileSync(process.argv[output + 1], JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ sdkVersion: result.sdkVersion, propagation,
    requests: result.requests.map(x => ({ phase: x.phase, replayLink: x.baggage.includes('sentry-replay_id'), trace: !!x.trace })),
    guardCalls: result.guardCalls, records: result.records.length, tags: result.tags }));
  assertProbe(result, { expectClean: true });
}

module.exports = { runProbe, assertProbe };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
