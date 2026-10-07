#!/usr/bin/env node
'use strict';

// Exercises actual payment routes with a local Supabase fixture and Sentry sink.
// No production credentials or outbound payment requests are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseEnvelope } = require('./analyze');
const { listen, freePort, decode, startNext, waitUntilReady, waitFor, sleep } = require('./harness');

const ROOT = path.resolve(__dirname, '../..');
const NEXT = path.join(ROOT, 'node_modules/.bin/next');
const CANARIES = ['Q7pPriv', 'payment-private@example.invalid', 'token=private-payment-canary'];
const { createHmac } = require('node:crypto');

async function main() {
  const envelopes = [];
  const output = [];
  const responses = [];
  const upstreamCalls = [];
  const decodeFailures = [];
  let next;
  // Public prerender data only. Payment/DB writes must never reach this fixture.
  const upstream = http.createServer((req, res) => {
    upstreamCalls.push(req.url);
    req.resume();
    res.setHeader('content-type', 'application/json');
    res.setHeader('content-range', '0-0/0');
    res.end('[]');
  });
  const sink = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        envelopes.push(parseEnvelope(decode(Buffer.concat(chunks), req.headers['content-encoding'])));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      } catch (error) {
        decodeFailures.push(String(error));
        res.writeHead(400);
        res.end('{}');
      }
    });
  });
  const snapshots = ['next-env.d.ts', 'tsconfig.json'].map((name) => [name, fs.readFileSync(path.join(ROOT, name))]);
  try {
    const upstreamPort = await listen(upstream, 'localhost');
    const sinkPort = await listen(sink, '127.0.0.1');
    const port = await freePort();
    const env = {
      ...process.env,
      ENVELOPE_TEST: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${upstreamPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'payment-fixture-anon-key',
      SUPABASE_URL: `http://localhost:${upstreamPort}`,
      SUPABASE_ANON_KEY: 'payment-fixture-anon-key',
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'payment-fixture-service-key',
      PORTONE_API_SECRET: '',
      PORTONE_WEBHOOK_SECRET: 'payment-fixture-webhook-secret',
      PAYPAL_CLIENT_ID: '',
      PAYPAL_CLIENT_SECRET: '',
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
      SENTRY_TRACES_SAMPLE_RATE: '1',
    };
    // Next config inlines the fixture URL, so reuse would target a dead fixture port.
    const build = spawn(NEXT, ['build'], { cwd: ROOT, env, stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      build.once('error', reject);
      build.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`payment fixture build failed: ${code}`)));
    });
    next = startNext(NEXT, ROOT, {
      ...env,
      NODE_ENV: 'production',
      PORT: String(port),
      SENTRY_DSN: `http://paymentfixture@127.0.0.1:${sinkPort}/1`,
    }, output);
    await waitUntilReady(next, output);
    const base = `http://127.0.0.1:${port}`;
    async function request(label, route, body, expectedStatus, headers = {}) {
      const response = await fetch(`${base}${route}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/json', ...headers },
        body,
      });
      const text = await response.text();
      responses.push({ label, status: response.status, body: text, cookies: response.headers.getSetCookie() });
      assert.equal(response.status, expectedStatus, `${label}: status`);
      for (const canary of CANARIES) assert.ok(!text.includes(canary), `${label}: response leaked ${canary}`);
      return response;
    }
    await request('webhook malformed JSON', '/api/payment/portone/webhook', CANARIES.join(' '), 500);
    const payload = JSON.stringify({ paymentId: 'pay_fixture', status: 'PAID', customer: { email: CANARIES[1] }, memo: CANARIES.join(' ') });
    await request('webhook invalid signature', '/api/payment/portone/webhook', payload, 401, { 'x-portone-signature': 'invalid-signature' });
    const signature = createHmac('sha256', env.PORTONE_WEBHOOK_SECRET).update(payload).digest('hex');
    await request('webhook provider unavailable', '/api/payment/portone/webhook', payload, 502, { 'x-portone-signature': signature });
    for (const route of ['paypal/create-order', 'paypal/capture-order', 'portone/confirm', 'portone/verify']) {
      await request(`${route} anonymous`, `/api/payment/${route}`, JSON.stringify({ memo: CANARIES.join(' ') }), 401);
    }
    for (const route of ['portone/callback', 'toss/result']) {
      const url = new URL(`${base}/api/payment/${route}`);
      url.searchParams.set('token', CANARIES[2]);
      url.searchParams.set('returnTo', '/ko/star-candy');
      const response = await fetch(url, { redirect: 'manual' });
      const body = await response.text();
      responses.push({ label: `${route} redirect`, status: response.status });
      assert.equal(response.status, 307);
      const location = new URL(response.headers.get('location'));
      assert.equal(location.pathname, '/ko/star-candy');
      assert.equal(location.searchParams.get('toss_token'), CANARIES[2]);
      // Token forwarding is the existing redirect contract; it must not enter logs.
      for (const canary of CANARIES) assert.ok(!body.includes(canary));
    }
    const events = () => envelopes.flatMap((envelope) => envelope.items)
      .filter((item) => item.header.type === 'event').map((item) => item.payload);
    await waitFor(() => events().length >= 4, 30_000, 'payment error events delivered after responses');
    await sleep(1500);
    assert.equal(events().length, 4, 'anonymous requests must not add error events');
    assert.ok(events().every((event) => !event.tags?.['redaction.tripwire']), 'approved fields must not trigger redaction.tripwire');
    assert.deepEqual(decodeFailures, [], 'every envelope must decode');
    const captured = JSON.stringify(envelopes);
    const stdout = output.join('');
    for (const canary of CANARIES) {
      assert.ok(!captured.includes(canary), `Sentry envelope leaked ${canary}`);
      assert.ok(!stdout.includes(canary), `server output leaked ${canary}`);
    }
    assert.ok(events().every((event) => event.fingerprint?.some((part) => part.startsWith('payment.'))), 'each error needs an payment event fingerprint');
    assert.ok(JSON.stringify(events()).includes('pay_fixture'), 'verified payment ID must survive safe logging');
    assert.ok(upstreamCalls.every((url) => !url.startsWith('/rest/v1/rpc/')), 'no payment RPC may run');
    const report = { statuses: responses.map(({ label, status }) => ({ label, status })), eventCount: events().length, canaryLeaks: 0 };
    const outDir = path.join(ROOT, '.next-envtest/payment-envelope-test');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'envelopes.json'), JSON.stringify(envelopes));
    fs.writeFileSync(path.join(outDir, 'stdout.log'), stdout);
    console.log('[payment-envelope] passed', JSON.stringify(report));
  } finally {
    if (next && next.exitCode === null) {
      next.kill('SIGTERM');
      await new Promise((resolve) => next.once('exit', resolve));
    }
    await Promise.all([new Promise((resolve) => upstream.close(resolve)), new Promise((resolve) => sink.close(resolve))]);
    for (const [name, content] of snapshots) fs.writeFileSync(path.join(ROOT, name), content);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
