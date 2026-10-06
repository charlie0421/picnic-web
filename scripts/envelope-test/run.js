#!/usr/bin/env node
'use strict';

/**
 * envelope 테스트 실행기 (설계 §5.1, §5.2).
 *
 * 실제 Next 서버(Production 빌드, next start)에 실제 요청을 보내고, SDK 가 실제로 내보낸 envelope 을
 * 로컬 수집기로 받는다. 운영 Sentry 로는 아무것도 보내지 않는다. 시나리오는 둘이다.
 *   누출(leak)     — canary 를 넣은 요청을 보내고 envelope 과 서버 출력에서 찾는다(scenario.js, analyze.js).
 *   전달(delivery) — 수집기가 답하는 시간을 조절해, 응답 뒤의 flush 가 무엇을 기다리는지 잰다(delivery.js).
 *
 *   npm run test:envelope                    # 테스트 빌드를 만들고 둘 다 돌린다
 *   npm run test:envelope -- --skip-build    # 이미 만든 .next-envtest 를 다시 쓴다
 *   npm run test:envelope -- --only=leak     # 하나만 돌린다(leak | delivery)
 *
 * 빌드가 Supabase 조회에 의존하므로 CI 에서는 돌리지 않는다. 판정 로직(analyze.js, delivery.js)의 단위 테스트만 CI 에서 돈다.
 * Sentry SDK 를 올리거나 sentry.*.config.js, utils/logger*.ts, utils/log-safe-error.ts, utils/with-safe-errors.ts 를
 * 고치면 다시 돌린다.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { parseEnvelope, evaluate, countsSatisfied } = require('./analyze');
const { TEST_DIST_DIR, TEST_ROUTE_SOURCE, TEST_ROUTE_TARGET } = require('./build-switch');
const { evaluateDelivery, runDelivery } = require('./delivery');
const { sleep, listen, freePort, decode, startNext, waitFor, waitUntilReady } = require('./harness');
const { CANARIES, EXPECTED, UNHANDLED_LINE_MARKER, buildRequests } = require('./scenario');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, TEST_DIST_DIR, 'envelope-test');
const NEXT_BIN = path.join(ROOT, 'node_modules', '.bin', 'next');
const ROUTE_SOURCE = path.join(ROOT, TEST_ROUTE_SOURCE);
const ROUTE_TARGET = path.join(ROOT, TEST_ROUTE_TARGET);
// distDir 이 다르면 Next 가 빌드 중에 이 두 파일을 고친다. 빌드가 끝나면 되돌린다.
const FILES_NEXT_REWRITES = ['next-env.d.ts', 'tsconfig.json'];

const skipBuild = process.argv.includes('--skip-build');
const only = (process.argv.find((arg) => arg.startsWith('--only=')) || '--only=all').slice('--only='.length);
if (!['all', 'leak', 'delivery'].includes(only)) {
  console.error(`[envelope] --only 는 leak 또는 delivery 다: ${only}`);
  process.exit(2);
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

function report(failures) {
  if (failures.length === 0) return 0;
  console.error(`\n[envelope] 실패 ${failures.length}건`);
  for (const failure of failures) console.error(`  - ${failure}`);
  return 1;
}

/** 누출 시나리오. canary 를 넣은 요청을 보내고 envelope 과 서버 출력에서 찾는다. */
async function runLeak(track) {
  const envelopes = [];
  const output = [];
  const sink = createSink(envelopes);
  const upstream = createUpstream();
  let next;

  try {
    // DSN 은 127.0.0.1, 가짜 외부 서버는 localhost 로 부른다. SDK 는 DSN 의 호스트 문자열이 들어간
    // 주소로 가는 요청에 span 을 만들지 않는다(isSentryRequestUrl).
    const sinkPort = await listen(sink, '127.0.0.1');
    const upstreamPort = await listen(upstream, 'localhost');
    const port = String(await freePort());

    next = track(
      startNext(
        NEXT_BIN,
        ROOT,
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
      ),
    );
    await waitUntilReady(next, output);

    const statuses = [];
    const responses = [];
    for (const request of buildRequests(`http://127.0.0.1:${port}`)) {
      const response = await fetch(request.url, { redirect: 'manual', ...request.init });
      const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
      statuses.push(`${request.label} ${response.status}`);
      // redirect 는 따라가지 않는다(redirect: 'manual'). 응답 코드와 Location 을 그대로 본다.
      responses.push({
        label: request.label,
        url: request.url,
        status: response.status,
        location: response.headers.get('location'),
        body,
        expect: request.expect,
      });
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
      responses,
    });

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'envelopes.jsonl'), envelopes.map((envelope) => JSON.stringify(envelope)).join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, 'stdout.log'), stdout);
    // 기대를 적은 요청의 응답만 남긴다. 페이지의 HTML 은 크고 판정에 쓰지 않는다.
    fs.writeFileSync(path.join(OUT_DIR, 'responses.json'), JSON.stringify(responses.filter((response) => response.expect), null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ statuses, ...result }, null, 2));

    const itemCount = envelopes.reduce((sum, envelope) => sum + envelope.items.length, 0);
    console.log(`\n[envelope] 누출 시나리오 — 요청 ${statuses.length}건: ${[...new Set(statuses)].join(', ')}`);
    console.log(`[envelope] 받은 envelope ${envelopes.length}건(항목 ${itemCount}건)`);
    for (const count of result.counts) {
      console.log(`[envelope]   ${count.label}: ${count.actual}건 (기대 ${count.expected})`);
    }

    const code = report(result.failures);
    if (code === 0) console.log('[envelope] 누출 시나리오 통과: 건수가 맞고 canary 가 허용된 곳에만 있다.');
    return code;
  } finally {
    if (next && next.exitCode === null) next.kill('SIGTERM');
    sink.close();
    upstream.close();
  }
}

/** 전달 시나리오. 서버를 새로 띄운다 — 서버의 첫 요청이 측정 대상이다. */
async function runDeliveryScenario(track) {
  const { observations, stdout } = await runDelivery({ root: ROOT, nextBin: NEXT_BIN, onServer: track });
  const result = evaluateDelivery(observations);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'delivery-stdout.log'), stdout);
  fs.writeFileSync(path.join(OUT_DIR, 'delivery.json'), JSON.stringify({ observations, ...result }, null, 2));

  console.log(`\n[envelope] 전달 시나리오 — 요청 ${observations.length}건`);
  for (const observation of observations) {
    const [wait] = observation.waits;
    const responded = observation.events.map((event) => event.respondedAt).filter((at) => at !== null);
    const parts = [
      `${observation.status}`,
      `응답 ${observation.receivedAt - observation.sentAt}ms`,
      `이벤트 ${observation.events.length}건`,
      wait && wait.settledAt !== null ? `flush ${wait.settledAt - wait.registeredAt}ms` : `waitUntil ${observation.waits.length}건`,
      wait && wait.settledAt !== null && responded.length > 0 ? `전송 완료 대비 ${wait.settledAt - Math.max(...responded)}ms` : null,
      `로그 ${observation.safeLines}줄`,
      `제한 초과 ${observation.timeoutLines}줄`,
    ].filter(Boolean);
    console.log(`[envelope]   ${observation.step.label}: ${parts.join(', ')}`);
  }

  const code = report(result.failures);
  if (code === 0) console.log('[envelope] 전달 시나리오 통과: flush 가 전송을 기다리고, 제한 초과가 경계에서만 한 줄씩 남는다.');
  return code;
}

async function main() {
  const snapshot = snapshotFiles();
  const servers = new Set();
  const track = (child) => {
    servers.add(child);
    return child;
  };
  let routesInstalled = false;

  const cleanup = () => {
    for (const child of servers) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
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

    const codes = [];
    if (only !== 'delivery') codes.push(await runLeak(track));
    if (only !== 'leak') codes.push(await runDeliveryScenario(track));
    console.log(`\n[envelope] 결과 파일: ${OUT_DIR}`);
    return Math.max(...codes);
  } finally {
    cleanup();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[envelope] 실행 실패: ${error.stack || error}`);
    process.exit(2);
  },
);
