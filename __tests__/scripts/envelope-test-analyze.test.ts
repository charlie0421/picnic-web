import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

type Envelope = { header: Record<string, unknown>; items: Array<{ type: string; header: Record<string, unknown>; payload: Record<string, unknown> }> };
type Result = { failures: string[]; counts: Array<{ label: string; expected: string; actual: number }> };

const require = createRequire(import.meta.url);
const { parseEnvelope, evaluate, countsSatisfied } = require(
  path.join(process.cwd(), 'scripts/envelope-test/analyze.js'),
) as {
  parseEnvelope: (body: Buffer | string) => Envelope;
  evaluate: (input: Record<string, unknown>) => Result;
  countsSatisfied: (envelopes: Envelope[], expected: unknown) => boolean;
};

const canaries = {
  absent: { cookie: 'cnryA-cookie', authorization: 'cnryA-authz' },
  stdoutOnly: { console: 'cnryC-console' },
  unhandled: { marker: 'cnryB-marker', urlQuery: 'cnryB-urlquery' },
};

const expected = {
  errors: [
    { label: 'logError', handled: true, valueIncludes: 'envtest handled', count: 1 },
    { label: '미처리(node)', handled: false, runtime: 'node', valueIncludes: 'envtest unhandled', count: 1, tripwire: true },
  ],
  transactions: [{ label: '밖으로 부르는 요청', name: 'GET /api/envelope-test/handled', min: 1, childOp: 'http.client' }],
};

const stdoutOk = ['envtest console cnryC-console', ' ⨯ Error: envtest unhandled cnryB-marker url=https://envtest.invalid/callback?code=cnryB-urlquery'].join('\n');

const handledEvent = () => ({
  exception: { values: [{ type: 'Error', value: 'envtest handled', mechanism: { type: 'generic', handled: true } }] },
  request: { url: 'http://127.0.0.1:3000/api/envelope-test/handled', method: 'GET' },
});

const unhandledEvent = () => ({
  exception: {
    values: [{ type: 'Error', value: 'envtest unhandled cnryB-marker url=https://envtest.invalid/callback', mechanism: { handled: false } }],
  },
  tags: { 'redaction.tripwire': '1' },
});

const transaction = () => ({
  type: 'transaction',
  transaction: 'GET /api/envelope-test/handled',
  contexts: { trace: { data: { 'http.target': '/api/envelope-test/handled' } } },
  spans: [{ op: 'http.client', description: 'GET http://localhost:9000/probe', data: { 'url.full': 'http://localhost:9000/probe' } }],
});

const envelopeOf = (type: string, payload: Record<string, unknown>): Envelope => ({
  header: { sdk: { name: 'sentry.javascript.nextjs' } },
  items: [{ type, header: { type }, payload }],
});

const clean = (): Envelope[] => [
  envelopeOf('event', handledEvent()),
  envelopeOf('event', unhandledEvent()),
  envelopeOf('transaction', transaction()),
];

const run = (envelopes: Envelope[], stdout = stdoutOk) =>
  evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker: 'envtest unhandled' });

describe('parseEnvelope', () => {
  it('헤더와 항목을 나눈다. length 가 있는 항목과 없는 항목을 모두 읽는다', () => {
    const first = JSON.stringify({ message: 'a' });
    const second = JSON.stringify({ type: 'transaction', transaction: 'GET /x' });
    const body = [
      JSON.stringify({ event_id: 'e1', dsn: 'http://k@127.0.0.1:1/1' }),
      JSON.stringify({ type: 'event', length: Buffer.byteLength(first) }),
      first,
      JSON.stringify({ type: 'transaction' }),
      second,
      '',
    ].join('\n');

    const envelope = parseEnvelope(Buffer.from(body));

    expect(envelope.header).toMatchObject({ event_id: 'e1' });
    expect(envelope.items.map((item) => item.type)).toEqual(['event', 'transaction']);
    expect(envelope.items[0].payload).toEqual({ message: 'a' });
    expect(envelope.items[1].payload).toEqual({ type: 'transaction', transaction: 'GET /x' });
  });

  it('JSON 이 아닌 본문은 원문을 남겨 canary 검색이 닿게 한다', () => {
    const body = ['{}', JSON.stringify({ type: 'attachment' }), 'raw cnryA-cookie text', ''].join('\n');
    expect(parseEnvelope(body).items[0].payload).toEqual({ __unparsed: 'raw cnryA-cookie text' });
  });
});

describe('evaluate', () => {
  it('깨끗한 실행은 실패가 없다', () => {
    const result = run(clean());
    expect(result.failures).toEqual([]);
    expect(result.counts.map((count) => count.actual)).toEqual([1, 1, 1]);
    expect(countsSatisfied(clean(), expected)).toBe(true);
  });

  it('아무것도 받지 못하면 건수 단언에서 실패한다', () => {
    const result = run([]);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        '수신 건수 — logError: 기대 1건, 실제 0건',
        '수신 건수 — 미처리(node): 기대 1건, 실제 0건',
        '수신 건수 — 밖으로 부르는 요청: 기대 1건 이상, 실제 0건',
        '허용 노출 확인 실패 — marker 가 exception.values[].value 에 없다',
      ]),
    );
    expect(countsSatisfied([], expected)).toBe(false);
  });

  it('요청 헤더에 실린 canary 를 경로와 함께 보고한다', () => {
    const envelopes = clean();
    envelopes[0].items[0].payload.request = { headers: { authorization: 'Bearer cnryA-authz' }, cookies: { sb: 'cnryA-cookie' } };
    expect(run(envelopes).failures).toEqual(
      expect.arrayContaining([
        '누출(envelope) — authorization: event request.headers.authorization ×1',
        '누출(envelope) — cookie: event request.cookies.sb ×1',
      ]),
    );
  });

  it('envelope 헤더와 항목 헤더도 검색한다', () => {
    const envelopes = clean();
    envelopes[2].header.trace = { transaction: 'GET /x?c=cnryA-cookie' };
    expect(run(envelopes).failures).toContain('누출(envelope) — cookie: envelope envelope_header.trace.transaction ×1');
  });

  it('자식 span 의 쿼리 속성을 찾는다', () => {
    const envelopes = clean();
    (envelopes[2].items[0].payload.spans as Array<{ data: Record<string, string> }>)[0].data['url.query'] = '?token=cnryA-authz';
    expect(run(envelopes).failures).toContain('누출(envelope) — authorization: transaction spans[].data.url.query ×1');
  });

  it('묶음 A 가 표준 출력에 있으면 실패한다', () => {
    expect(run(clean(), `${stdoutOk}\n[Callback] Full URL: /cb?code=cnryA-cookie`).failures).toContain('누출(표준 출력) — cookie');
  });

  it('console canary 가 envelope 에 있으면 실패하고, 표준 출력에 없어도 실패한다', () => {
    const envelopes = clean();
    envelopes[0].items[0].payload.breadcrumbs = [{ category: 'console', message: 'envtest console cnryC-console' }];
    expect(run(envelopes).failures).toContain('누출(envelope) — console: event breadcrumbs[].message ×1');
    expect(run(clean(), ' ⨯ Error: envtest unhandled cnryB-marker').failures).toContain(
      '표준 출력 캡처 확인 실패 — console 이 표준 출력에 없다',
    );
  });

  it('marker 는 exception.values[].value 에서만 허용한다', () => {
    const envelopes = clean();
    envelopes[1].items[0].payload.request = { headers: { 'x-envtest-marker': 'cnryB-marker' } };
    expect(run(envelopes).failures).toContain('누출(envelope) — marker: event request.headers.x-envtest-marker ×1');
  });

  it('묶음 B 의 나머지 값은 예외 메시지에서도 허용하지 않는다', () => {
    const envelopes = clean();
    const values = (envelopes[1].items[0].payload.exception as { values: Array<{ value: string }> }).values;
    values[0].value += '?code=cnryB-urlquery';
    expect(run(envelopes).failures).toContain('누출(envelope) — urlQuery: event exception.values[].value ×1');
  });

  it('묶음 B 가 Next 의 미처리 오류 줄이 아닌 곳에 찍히면 실패한다', () => {
    expect(run(clean(), `${stdoutOk}\n[Callback] cnryB-urlquery`).failures).toContain(
      '누출(표준 출력) — urlQuery: Next 의 미처리 오류 줄이 아닌 곳에 1줄',
    );
  });

  it('request_path 는 있으면 쿼리가 없어야 한다 (라우트 핸들러의 오류에는 이 값이 없다)', () => {
    const withoutQuery = clean();
    withoutQuery[1].items[0].payload.contexts = { nextjs: { request_path: '/api/envelope-test/throw' } };
    expect(run(withoutQuery).failures).toEqual([]);

    const withQuery = clean();
    withQuery[0].items[0].payload.contexts = { nextjs: { request_path: '/ko/vote?next=/mypage' } };
    expect(run(withQuery).failures).toContain('contexts.nextjs.request_path 에 쿼리가 남아 있다');
  });

  it('기대한 이벤트에 tripwire 태그가 없으면 실패한다', () => {
    const envelopes = clean();
    delete envelopes[1].items[0].payload.tags;
    expect(run(envelopes).failures).toContain('미처리(node): redaction.tripwire 태그가 없다');
  });

  it('기대하지 않은 곳의 tripwire 표식은 실패다 — 가려진 누출이다', () => {
    const envelopes = clean();
    envelopes[2].items[0].payload.tags = { 'redaction.tripwire': '1' };
    expect(run(envelopes).failures).toContain('예상하지 않은 tripwire — redaction.tripwire: transaction tags.redaction.tripwire(key) ×1');
  });

  it('stack frame 에 지역 변수가 실리면 실패한다', () => {
    const envelopes = clean();
    const values = (envelopes[1].items[0].payload.exception as { values: Array<Record<string, unknown>> }).values;
    values[0].stacktrace = { frames: [{ filename: 'route.js', vars: { token: 'x' } }] };
    expect(run(envelopes).failures).toContain('미처리(node): stack frame 에 vars 가 실렸다');
  });

  it('자식 span 이 없는 transaction 만 받으면 실패한다', () => {
    const envelopes = clean();
    envelopes[2].items[0].payload.spans = [];
    expect(run(envelopes).failures).toContain(
      '수신 건수 — 밖으로 부르는 요청: 자식 span(http.client)이 있는 transaction 이 0건이다',
    );
  });

  it('들어온 추적을 이어받은 envelope 이 몇 건 왔는지 trace_id 로 센다', () => {
    const withTrace = { ...expected, traceHeaders: [{ label: '이어받은 추적', traceId: 'feed', min: 1 }] };
    const envelopes = clean();
    expect(evaluate({ envelopes, stdout: stdoutOk, canaries, expected: withTrace, unhandledLineMarker: 'envtest unhandled' }).failures).toContain(
      '수신 건수 — 이어받은 추적: envelope 헤더의 trace.trace_id 가 feed 인 것이 기대 1건 이상, 실제 0건',
    );
    expect(countsSatisfied(envelopes, withTrace)).toBe(false);
    envelopes[0].header.trace = { trace_id: 'feed', transaction: 'GET /x' };
    expect(evaluate({ envelopes, stdout: stdoutOk, canaries, expected: withTrace, unhandledLineMarker: 'envtest unhandled' }).failures).toEqual([]);
    expect(countsSatisfied(envelopes, withTrace)).toBe(true);
  });

  it('edge 이벤트는 runtime 태그로 가른다', () => {
    const edge = unhandledEvent();
    edge.tags = { 'redaction.tripwire': '1', runtime: 'edge' } as never;
    const result = run([envelopeOf('event', handledEvent()), envelopeOf('event', edge), envelopeOf('transaction', transaction())]);
    expect(result.failures).toContain('수신 건수 — 미처리(node): 기대 1건, 실제 0건');
  });
});

describe('evaluate — 가린 기록의 모양과 서버 출력 (설계 §4.2, §4.3)', () => {
  const USER_ID = '4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a';
  const safeExpected = {
    errors: [
      {
        label: '가린 기록',
        handled: true,
        valueIncludes: 'envtest.boundary.handled',
        count: 1,
        type: 'Error',
        fingerprint: ['{{ default }}', 'envtest.boundary.handled'],
        logContext: { userId: USER_ID, httpStatus: 502, errorCode: 'unknown', droppedFields: ['paymentId'] },
      },
    ],
    transactions: [],
    stdout: [{ label: '가린 로그 줄', includes: 'ERROR: envtest.boundary.handled', count: 1 }],
  };
  const safeStdout = [
    'envtest console cnryC-console',
    '[2026-10-06T00:00:00.000Z] ERROR: envtest.boundary.handled {',
    "  message: 'envtest.boundary.handled',",
    "    stack: 'Error: envtest.boundary.handled\\n' +",
    '}',
  ].join('\n');
  const safeEvent = () => ({
    exception: { values: [{ type: 'Error', value: 'envtest.boundary.handled', mechanism: { type: 'generic', handled: true } }] },
    fingerprint: ['{{ default }}', 'envtest.boundary.handled'],
    // 키 순서는 판정과 무관하다.
    contexts: { log: { droppedFields: ['paymentId'], errorCode: 'unknown', httpStatus: 502, timestamp: '2026-10-06T00:00:00.000Z', userId: USER_ID } },
  });
  const runSafe = (event: Record<string, unknown>, stdout = safeStdout) =>
    evaluate({
      envelopes: [envelopeOf('event', event)],
      stdout,
      canaries: { absent: canaries.absent, stdoutOnly: canaries.stdoutOnly, unhandled: {} },
      expected: safeExpected,
      unhandledLineMarker: 'envtest unhandled',
    });

  it('모양이 맞고 로그 줄이 기대한 수만큼 있으면 실패가 없다', () => {
    const result = runSafe(safeEvent());
    expect(result.failures).toEqual([]);
    expect(result.counts).toEqual([
      { label: '가린 기록', expected: '1', actual: 1 },
      { label: '가린 로그 줄', expected: '1', actual: 1 },
    ]);
  });

  it('예외 type 이 기대와 다르면 실패한다 — 표에 없는 오류 이름이 그대로 나간 것이다', () => {
    const event = safeEvent();
    event.exception.values[0].type = 'EnvtestSecretName';
    expect(runSafe(event).failures).toEqual(['가린 기록: 예외 type 이 Error 가 아니다']);
  });

  it('fingerprint 가 없거나 다르면 실패한다', () => {
    const missing = safeEvent() as Record<string, unknown>;
    delete missing.fingerprint;
    const different = { ...safeEvent(), fingerprint: ['envtest.boundary.handled'] };
    expect(runSafe(missing).failures).toEqual(['가린 기록: fingerprint 가 기대와 다르다']);
    expect(runSafe(different).failures).toEqual(['가린 기록: fingerprint 가 기대와 다르다']);
  });

  it('contexts.log 에 계약 밖의 키가 있으면 실패하고, 값은 보고에 싣지 않는다', () => {
    const event = safeEvent();
    Object.assign(event.contexts.log, { email: 'someone@example.com' });
    expect(runSafe(event).failures).toEqual([
      '가린 기록: contexts.log 가 기대와 다르다(키: droppedFields, email, errorCode, httpStatus, userId)',
    ]);
  });

  it('contexts.log 의 값이 다르거나 빠지면 실패한다', () => {
    const changed = safeEvent();
    changed.contexts.log.droppedFields = [];
    const missing = safeEvent() as { contexts?: unknown };
    delete missing.contexts;
    expect(runSafe(changed).failures).toEqual([
      '가린 기록: contexts.log 가 기대와 다르다(키: droppedFields, errorCode, httpStatus, userId)',
    ]);
    expect(runSafe(missing as Record<string, unknown>).failures).toEqual(['가린 기록: contexts.log 가 기대와 다르다(키: 없음)']);
  });

  it('가린 로그 줄이 없거나 더 많으면 실패한다', () => {
    const none = runSafe(safeEvent(), 'envtest console cnryC-console');
    const twice = runSafe(safeEvent(), `${safeStdout}\n${safeStdout}`);
    expect(none.failures).toEqual(['서버 출력 — 가린 로그 줄: 기대 1줄, 실제 0줄']);
    expect(twice.failures).toEqual(['서버 출력 — 가린 로그 줄: 기대 1줄, 실제 2줄']);
  });

  it('모양을 적지 않은 규칙은 예전처럼 건수만 본다', () => {
    expect(run(clean()).failures).toEqual([]);
  });
});

describe('evaluate — 경계가 돌려준 응답 (설계 §4.7)', () => {
  const SAFE_500 = { status: 500, json: { error: 'Internal server error' } };
  const safeResponse = () => ({ label: 'boundary-throw', status: 500, body: '{"error":"Internal server error"}', expect: SAFE_500 });
  const runResponses = (responses: Array<Record<string, unknown>>) =>
    evaluate({ envelopes: clean(), stdout: stdoutOk, canaries, expected, unhandledLineMarker: 'envtest unhandled', responses });

  it('응답 코드와 본문이 정해진 값이면 실패가 없고, 요청 종류마다 건수를 센다', () => {
    const result = runResponses([safeResponse(), safeResponse(), { ...safeResponse(), label: 'boundary-hostile' }]);

    expect(result.failures).toEqual([]);
    expect(result.counts.slice(-2)).toEqual([
      { label: '응답(boundary-throw)', expected: '2', actual: 2 },
      { label: '응답(boundary-hostile)', expected: '1', actual: 1 },
    ]);
  });

  it('키 순서와 공백은 판정과 무관하다', () => {
    const expectation = { status: 200, json: { ok: true, order: 1 } };
    const response = { label: 'boundary-handled', status: 200, body: '{ "order": 1, "ok": true }', expect: expectation };
    expect(runResponses([response]).failures).toEqual([]);
  });

  it('응답 코드가 다르면 실패한다', () => {
    const result = runResponses([{ ...safeResponse(), status: 200 }]);

    expect(result.failures).toEqual(['응답 — boundary-throw: 응답 코드 기대 500, 실제 200']);
    expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-throw)', expected: '1', actual: 0 }]);
  });

  // 경계가 뚫리면 Next 가 응답한다. 코드는 같은 500 이고 본문만 다르다.
  it.each([
    ['Next 의 기본 500 본문', 'Internal Server Error'],
    ['빈 본문', ''],
    ['다른 JSON', '{"error":"Internal server error","detail":"x"}'],
  ])('본문이 정해진 JSON 이 아니면(%s) 실패한다', (_label, body) => {
    const result = runResponses([{ ...safeResponse(), body }]);

    expect(result.failures).toEqual(['응답 — boundary-throw: 본문이 정해진 JSON 이 아니다']);
    expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-throw)', expected: '1', actual: 0 }]);
  });

  it('본문에 canary 가 있으면 실패하고, 본문은 보고에 싣지 않는다', () => {
    const result = runResponses([{ ...safeResponse(), body: '{"error":"envtest cnryA-cookie cnryB-marker"}' }]);

    expect(result.failures).toEqual([
      '응답 — boundary-throw: 본문이 정해진 JSON 이 아니다',
      '누출(응답 본문) — cookie: boundary-throw',
      '누출(응답 본문) — marker: boundary-throw',
    ]);
  });

  describe('경계가 올려보낸 redirect() 신호', () => {
    const REDIRECT = { status: 307, location: '/api/envelope-test/redirected', body: '' };
    const redirected = () => ({
      label: 'boundary-redirect',
      url: 'http://127.0.0.1:3000/api/envelope-test/boundary-redirect?code=x',
      status: 307,
      location: '/api/envelope-test/redirected',
      body: '',
      expect: REDIRECT,
    });

    it('응답 코드·Location·빈 본문이 맞으면 실패가 없다', () => {
      const result = runResponses([redirected(), redirected()]);

      expect(result.failures).toEqual([]);
      expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-redirect)', expected: '2', actual: 2 }]);
    });

    it('Location 이 절대 주소여도 같은 곳을 가리키면 맞다', () => {
      const absolute = { ...redirected(), location: 'http://127.0.0.1:3000/api/envelope-test/redirected' };
      expect(runResponses([absolute]).failures).toEqual([]);
    });

    // 경계가 신호를 오류로 다루면 307 대신 고정된 500 이 나온다.
    it('경계가 신호를 오류로 다뤄 500 을 돌려주면 실패한다', () => {
      const result = runResponses([{ ...redirected(), status: 500, location: null, body: '{"error":"Internal server error"}' }]);

      expect(result.failures).toEqual([
        '응답 — boundary-redirect: 응답 코드 기대 307, 실제 500',
        '응답 — boundary-redirect: 본문이 정해진 값이 아니다',
        '응답 — boundary-redirect: Location 이 기대와 다르다',
      ]);
      expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-redirect)', expected: '1', actual: 0 }]);
    });

    it('응답 코드가 다른 redirect(308)면 실패한다', () => {
      expect(runResponses([{ ...redirected(), status: 308 }]).failures).toEqual(['응답 — boundary-redirect: 응답 코드 기대 307, 실제 308']);
    });

    it.each([
      ['다른 경로', '/api/envelope-test/elsewhere'],
      ['쿼리가 붙은 주소', '/api/envelope-test/redirected?next=/x'],
      ['다른 호스트', 'https://envtest.invalid/api/envelope-test/redirected'],
      ['빈 값', ''],
      ['없음', null],
    ])('Location 이 기대와 다르면(%s) 실패한다', (_label, location) => {
      expect(runResponses([{ ...redirected(), location }]).failures).toEqual(['응답 — boundary-redirect: Location 이 기대와 다르다']);
    });

    it('본문이 비어 있지 않으면 실패한다', () => {
      expect(runResponses([{ ...redirected(), body: 'Redirecting...' }]).failures).toEqual(['응답 — boundary-redirect: 본문이 정해진 값이 아니다']);
    });

    it('Location 에 canary 가 있으면 실패하고, 받은 값은 보고에 싣지 않는다', () => {
      const result = runResponses([{ ...redirected(), location: '/api/envelope-test/redirected?code=cnryA-cookie' }]);

      expect(result.failures).toEqual(['응답 — boundary-redirect: Location 이 기대와 다르다', '누출(응답 헤더) — cookie: boundary-redirect']);
    });

    describe('핸들러가 redirect 앞에서 쓴 쿠키', () => {
      const withCookie = (setCookies: unknown) => ({
        ...redirected(),
        label: 'boundary-stateful-1',
        setCookies,
        expect: { ...REDIRECT, cookie: { name: 'envtest-boundary', value: 'kept' } },
      });

      it.each([
        ['속성이 붙은 쿠키', ['envtest-boundary=kept; Path=/']],
        ['속성이 없는 쿠키', ['envtest-boundary=kept']],
        ['다른 쿠키와 함께', ['other=1; Path=/', 'envtest-boundary=kept; Path=/; HttpOnly']],
      ])('Set-Cookie 에 그 이름과 값이 있으면(%s) 맞다', (_label, setCookies) => {
        const result = runResponses([withCookie(setCookies)]);

        expect(result.failures).toEqual([]);
        expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-stateful-1)', expected: '1', actual: 1 }]);
      });

      it.each([
        ['Set-Cookie 가 없다', []],
        ['기록이 없다', undefined],
        ['값이 다르다', ['envtest-boundary=dropped; Path=/']],
        ['값의 앞부분만 같다', ['envtest-boundary=kept2; Path=/']],
        ['이름의 뒷부분만 같다', ['x-envtest-boundary=kept; Path=/']],
        ['다른 쿠키뿐이다', ['other=1; Path=/']],
      ])('쿠키가 응답에 없으면(%s) 실패한다', (_label, setCookies) => {
        const result = runResponses([withCookie(setCookies)]);

        expect(result.failures).toEqual(['응답 — boundary-stateful-1: Set-Cookie 에 envtest-boundary 이 기대한 값으로 없다']);
        expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-stateful-1)', expected: '1', actual: 0 }]);
      });

      it('Set-Cookie 에 canary 가 있으면 실패하고, 받은 값은 보고에 싣지 않는다', () => {
        const result = runResponses([withCookie(['envtest-boundary=kept; Path=/', 'session=cnryA-cookie; Path=/'])]);

        expect(result.failures).toEqual(['누출(응답 헤더) — cookie: boundary-stateful-1']);
      });
    });

    it('그 요청의 오류 이벤트는 처리했든 아니든 하나도 없어야 한다', () => {
      const transaction = 'GET /api/envelope-test/boundary-redirect';
      const withRule = { ...expected, errorFree: [{ label: '올려보낸 redirect 신호', transaction }] };
      const judge = (envelopes: Envelope[]) =>
        evaluate({ envelopes, stdout: stdoutOk, canaries, expected: withRule, unhandledLineMarker: 'envtest unhandled' });

      const none = judge(clean());
      expect(none.failures).toEqual([]);
      expect(none.counts).toContainEqual({ label: '올려보낸 redirect 신호', expected: '0', actual: 0 });

      // 경계가 신호를 오류로 잡으면 가린 기록의 이벤트가 이 요청의 transaction 이름으로 온다.
      const safeEvent = {
        transaction,
        exception: { values: [{ type: 'Error', value: 'envtest.boundary.unhandled', mechanism: { type: 'generic', handled: true } }] },
      };
      const recorded = judge([...clean(), envelopeOf('event', safeEvent), envelopeOf('event', { ...safeEvent })]);
      expect(recorded.failures).toEqual(['수신 건수 — 올려보낸 redirect 신호: 오류 이벤트 기대 0건, 실제 2건']);
      expect(recorded.counts).toContainEqual({ label: '올려보낸 redirect 신호', expected: '0', actual: 2 });
    });
  });

  it('기대를 적지 않은 응답은 보지 않는다 — 페이지의 HTML 은 요청 주소를 담는다', () => {
    const result = runResponses([{ label: 'page', status: 200, body: '<html>/ko/vote?code=cnryA-cookie</html>' }]);

    expect(result.failures).toEqual([]);
    expect(result.counts.map((count) => count.label)).not.toContain('응답(page)');
  });
});
