#!/usr/bin/env node
'use strict';

/**
 * envelope 테스트 실행기 (설계 §5.1).
 *
 * 실제 Next 서버(Production 빌드, next start)에 실제 요청을 보내고, SDK 가 실제로 내보낸 envelope 을
 * 로컬 수집기로 받아 canary 를 찾는다. 운영 Sentry 로는 아무것도 보내지 않는다.
 *
 *   npm run test:envelope                  # 테스트 빌드를 만들고 돌린다
 *   npm run test:envelope -- --skip-build  # 이미 만든 .next-envtest 를 다시 쓴다
 *
 * 빌드가 Supabase 조회에 의존하므로 CI 에서는 돌리지 않는다. 판정 로직(analyze.js)의 단위 테스트만 CI 에서 돈다.
 * Sentry SDK 를 올리거나 sentry.*.config.js 를 고치면 다시 돌린다.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { parseEnvelope, evaluate, countsSatisfied } = require('./analyze');
const { TEST_DIST_DIR, TEST_ROUTE_SOURCE, TEST_ROUTE_TARGET } = require('./build-switch');
const { CANARIES, EXPECTED, UNHANDLED_LINE_MARKER, buildRequests } = require('./scenario');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, TEST_DIST_DIR, 'envelope-test');
const NEXT_BIN = path.join(ROOT, 'node_modules', '.bin', 'next');
const ROUTE_SOURCE = path.join(ROOT, TEST_ROUTE_SOURCE);
const ROUTE_TARGET = path.join(ROOT, TEST_ROUTE_TARGET);
// distDir 이 다르면 Next 가 빌드 중에 이 두 파일을 고친다. 빌드가 끝나면 되돌린다.
const FILES_NEXT_REWRITES = ['next-env.d.ts', 'tsconfig.json'];

const skipBuild = process.argv.includes('--skip-build');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

async function freePort() {
  const probe = http.createServer();
  const port = await listen(probe, '127.0.0.1');
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function decode(body, encoding) {
  if (encoding === 'gzip') return zlib.gunzipSync(body);
  if (encoding === 'br') return zlib.brotliDecompressSync(body);
  if (encoding === 'deflate') return zlib.inflateSync(body);
  return body;
}

/** 로컬 Sentry 수집기. 받은 envelope 을 그대로 풀어 배열에 쌓는다. */
function createSink(envelopes) {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        envelopes.push(parseEnvelope(decode(Buffer.concat(chunks), req.headers['content-encoding'])));
      } catch (error) {
        envelopes.push({ header: { __decodeError: String(error) }, items: [] });
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
}

/** 서버가 밖으로 부르는 요청을 받아 주는 가짜 외부 서버. */
function createUpstream() {
  return http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
}

function snapshotFiles() {
  return FILES_NEXT_REWRITES.map((name) => ({ name, content: fs.readFileSync(path.join(ROOT, name)) }));
}

function restoreFiles(snapshot) {
  for (const { name, content } of snapshot) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) fs.writeFileSync(file, content);
  }
}

/** 테스트용 라우트를 app/ 에 복사한다. 빌드가 끝나면 지운다 — 저장소의 app/ 에는 없어야 한다. */
function installTestRoutes() {
  if (fs.existsSync(ROUTE_TARGET)) {
    throw new Error(`${TEST_ROUTE_TARGET} 가 이미 있다. 이전 실행이 남긴 것이면 지우고 다시 실행한다.`);
  }
  fs.cpSync(ROUTE_SOURCE, ROUTE_TARGET, { recursive: true });
}

function removeTestRoutes() {
  fs.rmSync(ROUTE_TARGET, { recursive: true, force: true });
}

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(NEXT_BIN, ['build'], {
      cwd: ROOT,
      stdio: 'inherit',
      // DSN 을 비워 빌드 중의 오류가 운영 Sentry 로 가지 않게 한다. NEXT_PUBLIC_ 값은 빌드에 박힌다.
      env: { ...process.env, ENVELOPE_TEST: '1', SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '', NEXT_TELEMETRY_DISABLED: '1' },
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`next build 가 실패했다(코드 ${code})`))));
  });
}

function startNext(env, output) {
  const child = spawn(NEXT_BIN, ['start', '-p', env.PORT], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  return child;
}

async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(250);
  }
  if (what) throw new Error(`시간 초과: ${what}`);
  return false;
}

async function main() {
  const snapshot = snapshotFiles();
  const envelopes = [];
  const output = [];
  const sink = createSink(envelopes);
  const upstream = createUpstream();
  let next;
  let routesInstalled = false;

  const cleanup = () => {
    if (next && next.exitCode === null) next.kill('SIGTERM');
    if (routesInstalled) removeTestRoutes();
    routesInstalled = false;
    restoreFiles(snapshot);
  };
  // Ctrl+C 로 끊어도 복사한 라우트와 Next 가 고친 파일이 남지 않게 한다.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      cleanup();
      process.exit(130);
    });
  }

  try {
    if (!skipBuild) {
      installTestRoutes();
      routesInstalled = true;
      try {
        await build();
      } finally {
        removeTestRoutes();
        routesInstalled = false;
        restoreFiles(snapshot);
      }
    }
    if (!fs.existsSync(path.join(ROOT, TEST_DIST_DIR, 'BUILD_ID'))) {
      throw new Error(`${TEST_DIST_DIR} 에 빌드가 없다. --skip-build 없이 다시 실행한다.`);
    }

    // DSN 은 127.0.0.1, 가짜 외부 서버는 localhost 로 부른다. SDK 는 DSN 의 호스트 문자열이 들어간
    // 주소로 가는 요청에 span 을 만들지 않는다(isSentryRequestUrl).
    const sinkPort = await listen(sink, '127.0.0.1');
    const upstreamPort = await listen(upstream, 'localhost');
    const port = String(await freePort());

    next = startNext(
      {
        ...process.env,
        NODE_ENV: 'production',
        ENVELOPE_TEST: '1',
        PORT: port,
        SENTRY_DSN: `http://envtestkey@127.0.0.1:${sinkPort}/1`,
        NEXT_PUBLIC_SENTRY_DSN: '',
        SENTRY_TRACES_SAMPLE_RATE: '1',
        ENVELOPE_TEST_UPSTREAM: `http://localhost:${upstreamPort}`,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      output,
    );

    await waitFor(
      () => {
        if (next.exitCode !== null) throw new Error(`next start 가 종료됐다(코드 ${next.exitCode})\n${output.join('')}`);
        return output.join('').includes('Ready in');
      },
      60_000,
      'next start 준비',
    );

    const statuses = [];
    for (const request of buildRequests(`http://127.0.0.1:${port}`)) {
      const response = await fetch(request.url, { redirect: 'manual', ...request.init });
      await response.arrayBuffer();
      statuses.push(`${request.label} ${response.status}`);
    }

    // SDK 는 응답 뒤에 내보낸다. 기대한 건수가 다 올 때까지 기다리고, 늦게 오는 것을 조금 더 받는다.
    await waitFor(() => countsSatisfied(envelopes, EXPECTED), 30_000);
    await sleep(3_000);

    const stdout = output.join('');
    const result = evaluate({
      envelopes,
      stdout,
      canaries: CANARIES,
      expected: EXPECTED,
      unhandledLineMarker: UNHANDLED_LINE_MARKER,
    });

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'envelopes.jsonl'), envelopes.map((envelope) => JSON.stringify(envelope)).join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, 'stdout.log'), stdout);
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ statuses, ...result }, null, 2));

    const itemCount = envelopes.reduce((sum, envelope) => sum + envelope.items.length, 0);
    console.log(`\n[envelope] 요청 ${statuses.length}건: ${[...new Set(statuses)].join(', ')}`);
    console.log(`[envelope] 받은 envelope ${envelopes.length}건(항목 ${itemCount}건)`);
    for (const count of result.counts) {
      console.log(`[envelope]   ${count.label}: ${count.actual}건 (기대 ${count.expected})`);
    }
    console.log(`[envelope] 결과 파일: ${OUT_DIR}`);

    if (result.failures.length > 0) {
      console.error(`\n[envelope] 실패 ${result.failures.length}건`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
      return 1;
    }
    console.log('\n[envelope] 통과: 건수가 맞고 canary 가 허용된 곳에만 있다.');
    return 0;
  } finally {
    cleanup();
    sink.close();
    upstream.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[envelope] 실행 실패: ${error.stack || error}`);
    process.exit(2);
  },
);
