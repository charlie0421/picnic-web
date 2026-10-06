'use strict';

/**
 * 전달 시나리오 (설계 §4.3, §5.2). 실제 Next 서버(next start)에서 잰다.
 *
 * 로컬 수집기가 오류 이벤트에 답하는 시간을 조절해 세 가지를 본다.
 *   normal     — 수집기가 300ms 뒤에 답한다. 핸들러가 기록을 남기고 바로 응답해도, SDK 의 route handler 래퍼가
 *                waitUntil 에 건 flush 는 전송이 끝난 뒤에 끝난다. 응답은 전송을 기다리지 않는다.
 *   no-context — Vercel 요청 컨텍스트가 없다. waitUntil 에 아무것도 걸리지 않는다. 가린 로그 한 줄은 남는다.
 *   slow       — 수집기가 flush 제한(2초)보다 늦게 답한다. 경계 함수로 감싼 라우트는 오류를 기록한 요청마다
 *                `[sentry] flush timeout` 을 정확히 한 줄 남긴다. 감싸지 않은 라우트와 기록이 없는 요청은 남기지 않는다.
 *
 * 늦추는 것은 오류 이벤트뿐이다. SDK 는 flush 할 때 표본에서 빠진 transaction 의 집계(client_report)도 보낸다.
 * 그것까지 늦추면 flush 가 그 응답을 기다린다 — 이벤트가 flush 보다 늦게 큐에 들어가도 둘의 끝이 몇 ms 차이로만
 * 갈려서 틈을 놓칠 수 있다(captureException 앞에 5ms 지연을 넣은 실행에서 다섯 가운데 하나가 0ms 로 겹쳤다).
 *
 * 판정(evaluateDelivery)은 순수 함수다 — 단위 테스트(__tests__/scripts/envelope-test-delivery.test.ts)가 CI 에서 돈다.
 * 실행(runDelivery)은 run.js 가 부른다.
 */

const http = require('http');
const { parseEnvelope } = require('./analyze');
const { sleep, listen, freePort, decode, startNext, waitFor, waitUntilReady } = require('./harness');

const NORMAL_DELAY_MS = 300;
/** SDK 의 flush 제한(2000ms)보다 길다. */
const SLOW_DELAY_MS = 2600;
/** 느린 단계에서 응답이 이보다 오래 걸리면 flush 가 응답을 늦춘 것이다. */
const RESPONSE_BUDGET_MS = 1000;
const FLUSH_TIMEOUT_LINE = '[sentry] flush timeout';
/** 이 시나리오의 라우트가 남기는 로그 줄은 모두 이 문자열로 시작하는 사건 코드나 메시지를 쓴다. */
const SAFE_LINE_PREFIX = 'ERROR: envtest';

const PLAIN = '/api/envelope-test/delivery-plain';
const SAFE = '/api/envelope-test/delivery-safe';
const CONTROL = '/api/envelope-test/delivery-control';

const HANDLED_LINE = 'ERROR: envtest.delivery.handled';
const UNHANDLED_LINE = 'ERROR: envtest.delivery.unhandled';

/**
 * 보낼 요청과 기대. 순서가 뜻을 갖는다 — 첫 요청은 서버가 뜬 뒤의 첫 요청이다(모듈이 처음 로드된다).
 *   probe      — 'install' 이면 핸들러가 Vercel 요청 컨텍스트의 가짜를 달고, 'remove' 면 뗀다.
 *   events     — 이 요청이 수집기로 보낼 오류 이벤트의 수.
 *   safeLines  — 서버 출력에 새로 생길 로그 줄의 수. line 은 그 줄에 들어 있어야 하는 문자열이다.
 *   timeoutLines — 새로 생길 `[sentry] flush timeout` 줄의 수.
 */
const STEPS = [
  { phase: 'normal', label: '서버의 첫 요청: logError 뒤 바로 응답', path: `${PLAIN}?via=logError`, probe: 'install', status: 200, events: 1, safeLines: 1, line: 'ERROR: envtest delivery legacy', timeoutLines: 0 },
  { phase: 'normal', label: 'logSafeError 뒤 바로 응답(경계 없음)', path: PLAIN, status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계가 잡은 예외', path: `${SAFE}?mode=throw`, status: 500, events: 1, safeLines: 1, line: UNHANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계 안의 기록 한 번', path: `${SAFE}?mode=handled`, status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계 안의 기록 세 번', path: `${SAFE}?mode=multi`, status: 200, events: 3, safeLines: 3, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계 안, 기록 없음', path: `${SAFE}?mode=ok`, status: 200, events: 0, safeLines: 0, line: null, timeoutLines: 0 },
  { phase: 'no-context', label: '요청 컨텍스트 없음', path: PLAIN, probe: 'remove', status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'slow', label: '제한 초과: 경계가 잡은 예외', path: `${SAFE}?mode=throw`, probe: 'install', status: 500, events: 1, safeLines: 1, line: UNHANDLED_LINE, timeoutLines: 1 },
  { phase: 'slow', label: '제한 초과: 경계 안의 기록 세 번', path: `${SAFE}?mode=multi`, status: 200, events: 3, safeLines: 3, line: HANDLED_LINE, timeoutLines: 1 },
  { phase: 'slow', label: '제한 초과: 경계 안, 기록 없음', path: `${SAFE}?mode=ok`, status: 200, events: 0, safeLines: 0, line: null, timeoutLines: 0 },
  { phase: 'slow', label: '제한 초과: 경계 없는 라우트', path: PLAIN, status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
];

/**
 * 관측한 것을 기대와 맞춰 본다. 관측 하나의 모양:
 *   { step, status, sentAt, receivedAt, events: [{ arrivedAt, respondedAt }], waits: [{ registeredAt, settledAt }],
 *     safeLines, matchingLines, timeoutLines }
 * 시각은 모두 같은 기계의 Date.now() 다(실행기와 서버가 한 기계에서 돈다).
 */
function evaluateDelivery(observations) {
  const failures = [];
  const seen = new Set(observations.map((observation) => observation.step.label));
  for (const step of STEPS) {
    if (!seen.has(step.label)) failures.push(`${step.label}: 관측이 없다`);
  }

  for (const observation of observations) {
    const { step } = observation;
    const fail = (message) => failures.push(`${step.label}: ${message}`);

    if (observation.status !== step.status) fail(`응답 코드 기대 ${step.status}, 실제 ${observation.status}`);
    if (observation.events.length !== step.events) fail(`오류 이벤트 기대 ${step.events}건, 실제 ${observation.events.length}건`);
    if (observation.safeLines !== step.safeLines) fail(`로그 줄 기대 ${step.safeLines}줄, 실제 ${observation.safeLines}줄`);
    if (step.line !== null && observation.matchingLines !== step.safeLines) {
      fail(`'${step.line}' 줄 기대 ${step.safeLines}줄, 실제 ${observation.matchingLines}줄`);
    }
    if (observation.timeoutLines !== step.timeoutLines) {
      fail(`'${FLUSH_TIMEOUT_LINE}' 기대 ${step.timeoutLines}줄, 실제 ${observation.timeoutLines}줄`);
    }

    if (step.phase === 'no-context') {
      if (observation.waits.length !== 0) fail(`요청 컨텍스트가 없는데 waitUntil 에 ${observation.waits.length}건이 걸렸다`);
      continue;
    }

    // SDK 의 route handler 래퍼는 요청마다 한 번 flush 를 건다. 경계 함수의 flush 는 after 로 가므로 여기에 잡히지 않는다.
    if (observation.waits.length !== 1) {
      fail(`waitUntil 등록 기대 1건, 실제 ${observation.waits.length}건`);
      continue;
    }
    const [wait] = observation.waits;
    if (wait.settledAt === null) {
      fail('waitUntil 에 건 flush 가 끝나지 않았다');
      continue;
    }
    const responded = observation.events.map((event) => event.respondedAt);
    if (responded.some((at) => at === null)) {
      fail('수집기가 답하지 못한 이벤트가 있다');
      continue;
    }

    if (step.phase === 'normal') {
      if (responded.some((at) => observation.receivedAt >= at)) fail('응답이 전송 완료보다 늦었다 — 응답이 전송을 기다렸다');
      if (responded.some((at) => wait.settledAt < at)) {
        fail('flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다');
      }
    }
    if (step.phase === 'slow') {
      const took = observation.receivedAt - observation.sentAt;
      if (took >= RESPONSE_BUDGET_MS) fail(`응답이 ${took}ms 걸렸다 — flush 가 응답을 늦췄다`);
      if (responded.some((at) => wait.settledAt >= at)) fail('제한을 넘겼는데 flush 가 전송 완료까지 기다렸다');
    }
  }

  return { failures };
}

/**
 * 답하는 시간을 조절할 수 있는 로컬 수집기. 오류 이벤트가 든 envelope 에는 state.delayMs 뒤에 답하고,
 * 그 밖의 것(client_report 등)에는 바로 답한다. state.delayMs 를 바꾸면 그 뒤에 도착한 envelope 부터 적용된다.
 */
function createDelaySink(state) {
  return http.createServer((req, res) => {
    const arrival = { arrivedAt: Date.now(), respondedAt: null, kinds: null };
    state.arrivals.push(arrival);
    const delayMs = state.delayMs;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const envelope = parseEnvelope(decode(Buffer.concat(chunks), req.headers['content-encoding']));
        arrival.kinds = envelope.items.map((item) => item.type);
      } catch {
        arrival.kinds = ['undecodable'];
      }
      const respond = () => {
        arrival.respondedAt = Date.now();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      };
      if (arrival.kinds.includes('event')) setTimeout(respond, delayMs);
      else respond();
    });
  });
}

const countLines = (output, needle) => output.join('').split('\n').filter((line) => line.includes(needle)).length;

/**
 * 시나리오를 돌려 관측을 모은다. 서버를 따로 띄운다 — 첫 요청이 측정 대상이어야 하고, 표본을 꺼 오류 이벤트만 받는다.
 * 돌려주는 값: { observations, stdout }
 */
async function runDelivery({ root, nextBin, onServer }) {
  const state = { delayMs: NORMAL_DELAY_MS, arrivals: [] };
  const output = [];
  const sink = createDelaySink(state);
  let next;

  try {
    const sinkPort = await listen(sink, '127.0.0.1');
    const port = String(await freePort());
    next = startNext(
      nextBin,
      root,
      {
        ...process.env,
        NODE_ENV: 'production',
        ENVELOPE_TEST: '1',
        PORT: port,
        SENTRY_DSN: `http://envtestkey@127.0.0.1:${sinkPort}/1`,
        NEXT_PUBLIC_SENTRY_DSN: '',
        // transaction 을 받지 않는다. 수집기에 오는 것을 오류 이벤트로 좁혀 요청과 맞추기 쉽게 한다.
        SENTRY_TRACES_SAMPLE_RATE: '0',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      output,
    );
    if (onServer) onServer(next);
    await waitUntilReady(next, output);

    const base = `http://127.0.0.1:${port}`;
    const quiet = () => state.arrivals.every((arrival) => arrival.respondedAt !== null);
    const observations = [];

    for (const step of STEPS) {
      state.delayMs = step.phase === 'slow' ? SLOW_DELAY_MS : NORMAL_DELAY_MS;
      // 앞 단계의 확인 요청이 건 waitUntil 과 이 요청의 것이 같은 ms 에 찍히지 않게 띄운다.
      await sleep(20);

      const before = {
        arrivals: state.arrivals.length,
        safe: countLines(output, SAFE_LINE_PREFIX),
        matching: step.line === null ? 0 : countLines(output, step.line),
        timeout: countLines(output, FLUSH_TIMEOUT_LINE),
      };
      const eventsSince = () =>
        state.arrivals.slice(before.arrivals).filter((arrival) => arrival.kinds !== null && arrival.kinds.includes('event'));

      const sentAt = Date.now();
      const response = await fetch(`${base}${step.path}`, { headers: step.probe ? { 'x-envtest-probe': step.probe } : {} });
      await response.arrayBuffer();
      const receivedAt = Date.now();

      // 늦게 출발하는 envelope 을 기다린 뒤, 기대한 이벤트가 다 오고 수집기가 모두 답할 때까지 기다린다.
      await sleep(200);
      await waitFor(() => eventsSince().length >= step.events && quiet(), 15_000);
      // 느린 단계에서는 flush 제한이 지날 때까지 기다려야 "줄이 없다"를 말할 수 있다.
      if (step.phase === 'slow') await sleep(Math.max(0, receivedAt + SLOW_DELAY_MS - Date.now()));
      await sleep(400);

      const probe = await (await fetch(`${base}${CONTROL}`)).json();
      observations.push({
        step,
        status: response.status,
        sentAt,
        receivedAt,
        events: eventsSince().map(({ arrivedAt, respondedAt }) => ({ arrivedAt, respondedAt })),
        // 핸들러가 끝날 때 건 것이다. 응답을 받은 시각보다 늦을 수 없다(여유 20ms).
        waits: probe.waits.filter((wait) => wait.registeredAt >= sentAt && wait.registeredAt <= receivedAt + 20),
        safeLines: countLines(output, SAFE_LINE_PREFIX) - before.safe,
        matchingLines: step.line === null ? 0 : countLines(output, step.line) - before.matching,
        timeoutLines: countLines(output, FLUSH_TIMEOUT_LINE) - before.timeout,
      });
    }

    return { observations, stdout: output.join('') };
  } finally {
    if (next && next.exitCode === null) next.kill('SIGTERM');
    sink.close();
  }
}

module.exports = {
  STEPS,
  NORMAL_DELAY_MS,
  SLOW_DELAY_MS,
  RESPONSE_BUDGET_MS,
  FLUSH_TIMEOUT_LINE,
  evaluateDelivery,
  runDelivery,
};
