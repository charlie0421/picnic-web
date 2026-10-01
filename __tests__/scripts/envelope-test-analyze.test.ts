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

  it('edge 이벤트는 runtime 태그로 가른다', () => {
    const edge = unhandledEvent();
    edge.tags = { 'redaction.tripwire': '1', runtime: 'edge' } as never;
    const result = run([envelopeOf('event', handledEvent()), envelopeOf('event', edge), envelopeOf('transaction', transaction())]);
    expect(result.failures).toContain('수신 건수 — 미처리(node): 기대 1건, 실제 0건');
  });
});
