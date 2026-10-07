#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { build } = require('esbuild');
const { listen, freePort, startNext, waitUntilReady } = require('./harness');
const { parseBrowserEnvelope, evaluateBrowserEnvelopes } = require('./browser-analyze');

const ROOT = path.resolve(__dirname, '../..');
const TARGET = path.join(ROOT, 'app/api/envelope-test/browser');
const OUT = path.join(ROOT, '.next-envtest/browser-envelope-test');

async function main() {
  const envelopes = [], failures = [], output = [], pageErrors = [], blocked = [], requests = [];
  let next, browser, installed = false;
  const upstream = http.createServer((req, res) => {
    req.resume(); res.setHeader('content-type', 'application/json'); res.end('[]');
  });
  const sink = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') { res.end(); return; }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try { envelopes.push(parseBrowserEnvelope(Buffer.concat(chunks))); }
      catch (error) { failures.push(String(error)); }
      res.setHeader('content-type', 'application/json'); res.end('{}');
    });
  });
  const snapshots = ['next-env.d.ts', 'tsconfig.json'].map((name) => [name, fs.readFileSync(path.join(ROOT, name))]);
  try {
    const portsFile = path.join(OUT, 'ports.json');
    const saved = process.argv.includes('--skip-build') ? JSON.parse(fs.readFileSync(portsFile, 'utf8')) : null;
    const listenAt = (server, host, port) => new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(port, host, () => resolve(port));
    });
    const upstreamPort = saved ? await listenAt(upstream, 'localhost', saved.upstreamPort) : await listen(upstream, 'localhost');
    const sinkPort = saved ? await listenAt(sink, '127.0.0.1', saved.sinkPort) : await listen(sink, '127.0.0.1');
    const port = saved ? saved.port : await freePort();
    const env = {
      ...process.env, ENVELOPE_TEST: '1', NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${upstreamPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser-fixture-anon-key',
      SUPABASE_URL: `http://localhost:${upstreamPort}`, SUPABASE_ANON_KEY: 'browser-fixture-anon-key', SUPABASE_SERVICE_ROLE_KEY: '',
      NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`, SENTRY_DSN: '', SENTRY_AUTH_TOKEN: '',
      NEXT_PUBLIC_SENTRY_DSN: `http://browserfixture@127.0.0.1:${sinkPort}/1`,
      NEXT_PUBLIC_SENTRY_APPLICATION_KEY: '', NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE: '1',
      NEXT_PUBLIC_SENTRY_SESSION_SAMPLE_RATE: '1', NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE: '1',
    };
    if (fs.existsSync(path.dirname(TARGET))) throw new Error('Envelope fixture directory already exists');
    fs.cpSync(path.join(__dirname, 'browser-fixture'), TARGET, { recursive: true }); installed = true;
    if (!saved) {
    const child = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['build'], { cwd: ROOT, env, stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Browser fixture build failed: ${code}`)));
    });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(portsFile, JSON.stringify({ upstreamPort, sinkPort, port }));
    }
    // Serve the exact locked SDK's recorder at its lazy-load URL. No CDN request or mock recorder.
    const replay = await build({
      stdin: { contents: "import { replayIntegration } from '@sentry/browser'; window.Sentry = window.Sentry || {}; window.Sentry.replayIntegration = replayIntegration;", resolveDir: ROOT },
      bundle: true, write: false, platform: 'browser', format: 'iife', conditions: ['browser'],
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    next = startNext(path.join(ROOT, 'node_modules/.bin/next'), ROOT, { ...env, NODE_ENV: 'production', PORT: String(port) }, output);
    await waitUntilReady(next, output);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('request', (request) => requests.push({ url: request.url(), state: 'request' }));
    page.on('response', (response) => requests.push({ url: response.url(), status: response.status() }));
    page.on('requestfailed', (request) => requests.push({ url: request.url(), failure: request.failure() }));
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const version = require('@sentry/nextjs/package.json').version;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.href === `https://browser.sentry-cdn.com/${version}/replay.min.js`) {
        await route.fulfill({ contentType: 'application/javascript', body: Buffer.from(replay.outputFiles[0].contents), headers: { 'access-control-allow-origin': '*' } });
      } else if (['localhost', '127.0.0.1'].includes(url.hostname)) await route.continue();
      else { blocked.push(url.origin); await route.abort(); }
    });
    await page.goto(`http://localhost:${port}/api/envelope-test/browser?code=privacy-meta-query#privacy-meta-fragment`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.privacyReplayReady?.(), { timeout: 30000 });
    await page.evaluate(() => window.runPrivacyFixture());
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'envelopes.json'), JSON.stringify(envelopes, null, 2));
    fs.writeFileSync(path.join(OUT, 'diagnostics.json'), JSON.stringify({ failures, pageErrors, blocked }, null, 2));
    if (failures.length || pageErrors.length || blocked.length) throw new Error(JSON.stringify({ failures, pageErrors, blocked }));
    const report = evaluateBrowserEnvelopes(envelopes);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('[browser-envelope] passed', JSON.stringify(report));
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'debug.json'), JSON.stringify({ failures, pageErrors, blocked, requests, output }, null, 2));
    await browser?.close();
    if (next && next.exitCode === null) { next.kill('SIGTERM'); await new Promise((resolve) => next.once('exit', resolve)); }
    await Promise.all([new Promise((resolve) => upstream.close(resolve)), new Promise((resolve) => sink.close(resolve))]);
    if (installed) {
      fs.rmSync(TARGET, { recursive: true, force: true });
      if (fs.readdirSync(path.dirname(TARGET)).length === 0) fs.rmdirSync(path.dirname(TARGET));
    }
    for (const [name, content] of snapshots) fs.writeFileSync(path.join(ROOT, name), content);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
