'use strict';

/**
 * envelope 테스트의 판정 로직. 순수 함수만 둔다 — 단위 테스트(__tests__/scripts/envelope-test-analyze.test.ts)가
 * CI 에서 돈다. 실행기(run.js)는 실제 Next 서버가 보낸 envelope 과 서버 표준 출력을 모아 evaluate() 에 넘긴다.
 *
 * 판정 순서 (설계 §5.1):
 *   1. 수신 건수 — 아무것도 받지 못한 실행이 통과하는 일을 막는다.
 *   2. 무누출 — 묶음 A 는 envelope 과 표준 출력 어디에도 없다. 묶음 C 는 표준 출력에만 있다.
 *   3. 허용 노출 — 묶음 B 의 marker 는 exception.values[].value 와 Next 의 미처리 오류 줄에만 있다.
 *   4. tripwire 표식은 기대한 이벤트에만 있다. 다른 곳에 있으면 토큰 모양 값이 새다가 가려진 것이다.
 *   5. 가린 기록(logSafeError)의 이벤트는 정해진 모양이고, 가린 로그 줄이 서버 출력에 기대한 수만큼 있다(설계 §4.2, §4.3).
 *   6. 경계(withSafeErrors)를 거친 응답은 정해진 코드와 본문(redirect 는 Location)이고, 거기에 canary 가 없다(설계 §4.7).
 *      경계가 올려보낸 신호의 요청에는 오류 이벤트가 없다.
 */

const TRIPWIRE_KEY = 'redaction.tripwire';
const UNHANDLED_VALUE_PATH = /^exception\.values\[\d+\]\.value$/;

/** Sentry envelope 한 건(압축을 푼 본문)을 헤더와 항목으로 나눈다. */
function parseEnvelope(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  let offset = 0;

  const readLine = () => {
    let end = buffer.indexOf(0x0a, offset);
    if (end === -1) end = buffer.length;
    const line = buffer.subarray(offset, end).toString('utf8');
    offset = end + 1;
    return line;
  };
  // JSON 이 아니면 원문을 남긴다. canary 검색이 닿아야 한다.
  const parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return { __unparsed: text };
    }
  };

  const header = parseJson(readLine());
  const items = [];
  while (offset < buffer.length) {
    const headerLine = readLine();
    if (headerLine === '') continue;
    const itemHeader = parseJson(headerLine);
    let payloadText;
    if (typeof itemHeader.length === 'number') {
      payloadText = buffer.subarray(offset, offset + itemHeader.length).toString('utf8');
      offset += itemHeader.length + 1;
    } else {
      payloadText = readLine();
    }
    items.push({ type: itemHeader.type, header: itemHeader, payload: parseJson(payloadText) });
  }
  return { header, items };
}

/** 값 안의 모든 문자열을 경로와 함께 모은다. 객체의 키도 문자열로 본다(쿠키 이름처럼 값이 키로 실릴 수 있다). */
function collectStrings(value, path, out) {
  if (typeof value === 'string') {
    out.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      out.push({ path: `${childPath}(key)`, value: key });
      collectStrings(child, childPath, out);
    }
  }
  return out;
}

function flatten(envelopes) {
  const records = [];
  for (const envelope of envelopes) {
    for (const hit of collectStrings(envelope.header, 'envelope_header', [])) {
      records.push({ type: 'envelope', payload: null, ...hit });
    }
    for (const item of envelope.items) {
      for (const hit of collectStrings(item.header, 'item_header', [])) {
        records.push({ type: item.type, payload: item.payload, ...hit });
      }
      for (const hit of collectStrings(item.payload, '', [])) {
        records.push({ type: item.type, payload: item.payload, ...hit });
      }
    }
  }
  return records;
}

/** 같은 위치의 적중을 묶어 "종류 경로 ×건수" 로 줄인다. 배열 색인은 지운다. */
function summarize(hits) {
  const grouped = new Map();
  for (const hit of hits) {
    const key = `${hit.type} ${hit.path.replace(/\[\d+\]/g, '[]')}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  return [...grouped.entries()].map(([key, count]) => `${key} ×${count}`);
}

const payloadsOf = (envelopes, type) =>
  envelopes.flatMap((envelope) => envelope.items).filter((item) => item.type === type).map((item) => item.payload);

const exceptionValues = (event) =>
  event && event.exception && Array.isArray(event.exception.values) ? event.exception.values : [];

const isHandled = (event) => exceptionValues(event).every((value) => !value.mechanism || value.mechanism.handled !== false);

// edge 설정은 initialScope 로 runtime=edge 태그를 붙인다(sentry.edge.config.js).
const runtimeOf = (event) => (event.tags && event.tags.runtime === 'edge' ? 'edge' : 'node');

const hasFrameVars = (event) =>
  exceptionValues(event).some((value) =>
    ((value.stacktrace && value.stacktrace.frames) || []).some((frame) => frame && frame.vars !== undefined),
  );

/** 키 순서와 무관하게 비교하려고 객체의 키를 정렬한다. */
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};

const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/**
 * 가린 기록의 이벤트가 정해진 모양인가 (설계 §4.2). rule 에 적은 항목만 본다.
 *   type        — 예외의 type(오류 이름). 표에 없는 이름은 'Error' 여야 한다.
 *   fingerprint — 사건 코드로 이슈를 가른다.
 *   logContext  — contexts.log 에서 timestamp 를 뺀 나머지 전부. 계약을 통과한 필드만 있어야 한다.
 */
function shapeProblems(event, rule) {
  const problems = [];
  if (rule.type !== undefined && exceptionValues(event).some((value) => value.type !== rule.type)) {
    problems.push(`예외 type 이 ${rule.type} 가 아니다`);
  }
  if (rule.fingerprint !== undefined && !sameJson(event.fingerprint, rule.fingerprint)) {
    problems.push('fingerprint 가 기대와 다르다');
  }
  if (rule.logContext !== undefined) {
    const actual = { ...((event.contexts && event.contexts.log) || {}) };
    delete actual.timestamp;
    if (!sameJson(actual, rule.logContext)) {
      problems.push(`contexts.log 가 기대와 다르다(키: ${Object.keys(actual).sort().join(', ') || '없음'})`);
    }
  }
  return problems;
}

/** Location 헤더는 상대 주소일 수도 절대 주소일 수도 있다. 요청 주소를 기준으로 풀어서 비교한다. */
function sameLocation(response, expected) {
  if (typeof response.location !== 'string') return false;
  try {
    return new URL(response.location, response.url).href === new URL(expected, response.url).href;
  } catch {
    return false;
  }
}

/**
 * 응답이 요청에 적은 기대와 같은가. 경계가 뚫려 Next 가 응답해도 코드는 같은 500 이라 본문까지 본다.
 *   status   — 응답 코드.
 *   json     — 본문을 JSON 으로 읽은 값 전부.
 *   body     — 본문 그대로. redirect 처럼 본문이 없어야 하는 응답에 쓴다.
 *   location — Location 헤더가 가리키는 주소.
 */
function responseProblems(response) {
  const problems = [];
  const { status, json, body, location } = response.expect;
  if (response.status !== status) problems.push(`응답 코드 기대 ${status}, 실제 ${response.status}`);
  if (body !== undefined && response.body !== body) problems.push('본문이 정해진 값이 아니다');
  if (location !== undefined && !sameLocation(response, location)) problems.push('Location 이 기대와 다르다');
  if (json !== undefined) {
    let actual;
    let parsed = true;
    try {
      actual = JSON.parse(response.body);
    } catch {
      parsed = false;
    }
    if (!parsed || !sameJson(actual, json)) problems.push('본문이 정해진 JSON 이 아니다');
  }
  return problems;
}

function matchesError(event, rule) {
  if (exceptionValues(event).length === 0) return false;
  if (isHandled(event) !== rule.handled) return false;
  if (rule.runtime && runtimeOf(event) !== rule.runtime) return false;
  if (rule.transaction && event.transaction !== rule.transaction) return false;
  if (
    rule.valueIncludes &&
    !exceptionValues(event).some((value) => typeof value.value === 'string' && value.value.includes(rule.valueIncludes))
  ) {
    return false;
  }
  return true;
}

const transactionsNamed = (envelopes, name) =>
  payloadsOf(envelopes, 'transaction').filter((transaction) => transaction.transaction === name);

const withChildOp = (transactions, op) =>
  transactions.filter((transaction) => (transaction.spans || []).some((span) => span && span.op === op));

/** 기대한 건수가 다 왔는가. 실행기가 기다림을 끝낼 때 쓴다. */
/** envelope 헤더의 trace(DSC)가 이 trace_id 인 envelope 의 수. 들어온 추적 헤더를 실제로 처리했다는 증거다. */
const traceHeadersWithId = (envelopes, traceId) =>
  envelopes.filter((envelope) => envelope.header && envelope.header.trace && envelope.header.trace.trace_id === traceId).length;

function countsSatisfied(envelopes, expected) {
  const errors = payloadsOf(envelopes, 'event');
  return (
    (expected.traceHeaders || []).every((rule) => traceHeadersWithId(envelopes, rule.traceId) >= rule.min) &&
    expected.errors.every((rule) => errors.filter((event) => matchesError(event, rule)).length >= rule.count) &&
    expected.transactions.every((rule) => {
      const matched = transactionsNamed(envelopes, rule.name);
      return (rule.childOp ? withChildOp(matched, rule.childOp) : matched).length >= rule.min;
    })
  );
}

function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker, responses }) {
  const failures = [];
  const counts = [];
  const errors = payloadsOf(envelopes, 'event');
  const tripwireAllowed = new Set();

  // 1. 수신 건수
  for (const rule of expected.errors) {
    const matched = errors.filter((event) => matchesError(event, rule));
    counts.push({ label: rule.label, expected: `${rule.count}`, actual: matched.length });
    if (matched.length !== rule.count) {
      failures.push(`수신 건수 — ${rule.label}: 기대 ${rule.count}건, 실제 ${matched.length}건`);
    }
    for (const event of matched) {
      if (rule.tripwire) {
        tripwireAllowed.add(event);
        if (!event.tags || event.tags[TRIPWIRE_KEY] !== '1') {
          failures.push(`${rule.label}: ${TRIPWIRE_KEY} 태그가 없다`);
        }
      }
      if (hasFrameVars(event)) failures.push(`${rule.label}: stack frame 에 vars 가 실렸다`);
      for (const problem of shapeProblems(event, rule)) failures.push(`${rule.label}: ${problem}`);
    }
  }
  // 오류 이벤트가 없어야 하는 요청. 처리했든 아니든 그 요청의 이벤트는 하나도 오면 안 된다.
  for (const rule of expected.errorFree || []) {
    const actual = errors.filter((event) => event.transaction === rule.transaction).length;
    counts.push({ label: rule.label, expected: '0', actual });
    if (actual !== 0) failures.push(`수신 건수 — ${rule.label}: 오류 이벤트 기대 0건, 실제 ${actual}건`);
  }
  for (const rule of expected.transactions) {
    const matched = transactionsNamed(envelopes, rule.name);
    counts.push({ label: rule.label, expected: `${rule.min} 이상`, actual: matched.length });
    if (matched.length < rule.min) {
      failures.push(`수신 건수 — ${rule.label}: 기대 ${rule.min}건 이상, 실제 ${matched.length}건`);
    } else if (rule.childOp) {
      const withChild = withChildOp(matched, rule.childOp).length;
      if (withChild < rule.min) {
        failures.push(`수신 건수 — ${rule.label}: 자식 span(${rule.childOp})이 있는 transaction 이 ${withChild}건이다`);
      }
    }
  }

  // onRequestError 까지 올라간 오류에는 contexts.nextjs.request_path 가 붙는다(Next 가 req.url 을 그대로 넘긴다).
  // 라우트 핸들러의 오류는 SDK 의 래퍼가 먼저 잡아 이 값이 없다. 있으면 쿼리가 없어야 한다.
  for (const event of errors) {
    const requestPath = event.contexts && event.contexts.nextjs && event.contexts.nextjs.request_path;
    if (typeof requestPath === 'string' && /[?#]/.test(requestPath)) {
      failures.push('contexts.nextjs.request_path 에 쿼리가 남아 있다');
    }
  }

  // 들어온 추적 헤더(sentry-trace, baggage)를 서버가 실제로 처리했는가. 처리하지 않았다면 그 경로의 canary 검사는 공허하다.
  for (const rule of expected.traceHeaders || []) {
    const actual = traceHeadersWithId(envelopes, rule.traceId);
    counts.push({ label: rule.label, expected: `${rule.min} 이상`, actual });
    if (actual < rule.min) {
      failures.push(
        `수신 건수 — ${rule.label}: envelope 헤더의 trace.trace_id 가 ${rule.traceId} 인 것이 기대 ${rule.min}건 이상, 실제 ${actual}건`,
      );
    }
  }

  const records = flatten(envelopes);
  const stdoutLines = stdout.split('\n');

  // 서버 출력에 있어야 하는 줄. 가린 로그 한 줄이 실제로 남았는지 센다.
  for (const rule of expected.stdout || []) {
    const actual = stdoutLines.filter((line) => line.includes(rule.includes)).length;
    counts.push({ label: rule.label, expected: `${rule.count}`, actual });
    if (actual !== rule.count) failures.push(`서버 출력 — ${rule.label}: 기대 ${rule.count}줄, 실제 ${actual}줄`);
  }
  const reportLeak = (name, hits) => {
    for (const where of summarize(hits)) failures.push(`누출(envelope) — ${name}: ${where}`);
  };

  // 2. 무누출
  for (const [name, value] of Object.entries(canaries.absent)) {
    reportLeak(name, records.filter((record) => record.value.includes(value)));
    if (stdout.includes(value)) failures.push(`누출(표준 출력) — ${name}`);
  }
  for (const [name, value] of Object.entries(canaries.stdoutOnly)) {
    reportLeak(name, records.filter((record) => record.value.includes(value)));
    if (!stdout.includes(value)) failures.push(`표준 출력 캡처 확인 실패 — ${name} 이 표준 출력에 없다`);
  }

  // 3. 허용 노출
  for (const [name, value] of Object.entries(canaries.unhandled)) {
    const hits = records.filter((record) => record.value.includes(value));
    const allowed = name === 'marker' ? hits.filter((hit) => UNHANDLED_VALUE_PATH.test(hit.path)) : [];
    reportLeak(name, hits.filter((hit) => !allowed.includes(hit)));
    if (name === 'marker' && allowed.length === 0) {
      failures.push('허용 노출 확인 실패 — marker 가 exception.values[].value 에 없다');
    }
    const stray = stdoutLines.filter((line) => line.includes(value) && !line.includes(unhandledLineMarker));
    if (stray.length > 0) {
      failures.push(`누출(표준 출력) — ${name}: Next 의 미처리 오류 줄이 아닌 곳에 ${stray.length}줄`);
    }
  }

  // 4. tripwire 표식
  const strayTripwire = records.filter(
    (record) => record.value.includes(TRIPWIRE_KEY) && !tripwireAllowed.has(record.payload),
  );
  for (const where of summarize(strayTripwire)) failures.push(`예상하지 않은 tripwire — ${TRIPWIRE_KEY}: ${where}`);

  // 6. 응답 — 기대를 적은 요청은 응답 코드·본문·Location 이 정해진 값이고, 거기에 canary 가 없다. 받은 값은 보고에 싣지 않는다.
  const checked = (responses || []).filter((response) => response.expect);
  const allCanaries = Object.values(canaries).flatMap((group) => Object.entries(group));
  for (const label of [...new Set(checked.map((response) => response.label))]) {
    const group = checked.filter((response) => response.label === label);
    let matched = 0;
    for (const response of group) {
      const problems = responseProblems(response);
      if (problems.length === 0) matched += 1;
      for (const problem of problems) failures.push(`응답 — ${label}: ${problem}`);
      for (const [name, value] of allCanaries) {
        if (response.body.includes(value)) failures.push(`누출(응답 본문) — ${name}: ${label}`);
        if (typeof response.location === 'string' && response.location.includes(value)) {
          failures.push(`누출(응답 헤더) — ${name}: ${label}`);
        }
      }
    }
    counts.push({ label: `응답(${label})`, expected: `${group.length}`, actual: matched });
  }

  return { failures: [...new Set(failures)], counts };
}

module.exports = { parseEnvelope, evaluate, countsSatisfied, TRIPWIRE_KEY };
