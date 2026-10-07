#!/usr/bin/env node
'use strict';

// Exercises actual auth routes with a local Supabase fixture and Sentry sink.
// No production credentials or outbound auth requests are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseEnvelope } = require('./analyze');
const { listen, freePort, decode, startNext, waitUntilReady, waitFor, sleep } = require('./harness');

const ROOT = path.resolve(__dirname, '../..');
const NEXT = path.join(ROOT, 'node_modules/.bin/next');
const CANARIES = ['Q7xPriv', 'auth-provider-private@example.invalid', 'password=auth-provider-private-canary'];

async function main() {
  const envelopes = [];
  const output = [];
  const responses = [];
  const upstreamCalls = [];
  const decodeFailures = [];
  let next;
  // Return empty public data for prerendering; only signup produces the hostile error.
  const upstream = http.createServer((req, res) => {
    upstreamCalls.push(req.url);
    req.resume();
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/auth/v1/signup')) {
      res.writeHead(400);
      res.end(JSON.stringify({ code: 'unexpected_failure', msg: CANARIES.join(' ') }));
    } else {
      res.setHeader('content-range', '0-0/0');
      res.end('[]');
    }
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
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'auth-fixture-anon-key',
      SUPABASE_URL: `http://localhost:${upstreamPort}`,
      SUPABASE_ANON_KEY: 'auth-fixture-anon-key',
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
      SENTRY_TRACES_SAMPLE_RATE: '1',
    };
    // Next config inlines the fixture URL, so reuse would target a dead fixture port.
    const build = spawn(NEXT, ['build'], { cwd: ROOT, env, stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      build.once('error', reject);
      build.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`auth fixture build failed: ${code}`)));
    });
    next = startNext(NEXT, ROOT, {
      ...env,
      NODE_ENV: 'production',
      PORT: String(port),
      SENTRY_DSN: `http://authfixture@127.0.0.1:${sinkPort}/1`,
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
    await request('register rejected signup', '/api/auth/register', JSON.stringify({
      email: CANARIES[1], password: CANARIES[2],
    }), 400);
    assert.ok(upstreamCalls.some((url) => url.startsWith('/auth/v1/signup')), 'real Supabase client must reach the local signup fixture');
    for (const route of ['register', 'apple', 'google', 'exchange-code', 'kakao']) {
      await request(`${route} malformed JSON`, `/api/auth/${route}`, CANARIES.join(' '), 500);
    }
    const logout = await request('logout success', '/api/auth/logout', '{}', 200, {
      origin: base, 'sec-fetch-site': 'same-origin', accept: 'application/json',
    });
    assert.equal(logout.headers.get('cache-control'), 'no-store');
    assert.equal(logout.headers.get('clear-site-data'), '"cookies"');
    assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'), 'logout must still clear auth cookies');

    for (const [route, expectedStatus] of [['session', 200], ['verify', 401]]) {
      const response = await fetch(`${base}/api/auth/${route}`, { redirect: 'manual' });
      const body = await response.text();
      responses.push({ label: `${route} anonymous`, status: response.status, body });
      assert.equal(response.status, expectedStatus);
    }
    const events = () => envelopes.flatMap((envelope) => envelope.items)
      .filter((item) => item.header.type === 'event').map((item) => item.payload);
    await waitFor(() => events().length >= 6, 30_000, 'auth error events delivered after responses');
    await sleep(1500);
    assert.equal(events().length, 6, 'anonymous requests must not add error events');
    assert.deepEqual(decodeFailures, [], 'every envelope must decode');
    const captured = JSON.stringify(envelopes);
    const stdout = output.join('');
    for (const canary of CANARIES) {
      assert.ok(!captured.includes(canary), `Sentry envelope leaked ${canary}`);
      assert.ok(!stdout.includes(canary), `server output leaked ${canary}`);
    }
    assert.ok(events().every((event) => event.fingerprint?.some((part) => part.startsWith('auth.'))), 'each error needs an auth event fingerprint');
    assert.ok(events().some((event) => event.fingerprint?.some((part) => part.startsWith('auth.register.'))), 'signup rejection must produce an auth register event');
    const report = { statuses: responses.map(({ label, status }) => ({ label, status })), eventCount: events().length, canaryLeaks: 0 };
    const outDir = path.join(ROOT, '.next-envtest/auth-envelope-test');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'envelopes.json'), JSON.stringify(envelopes));
    fs.writeFileSync(path.join(outDir, 'stdout.log'), stdout);
    console.log('[auth-envelope] passed', JSON.stringify(report));
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
