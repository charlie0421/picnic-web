import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRIPWIRE_KEY, redactTokenShapes, scrubEvent, scrubSpan, stripUrlQueries } from '@/lib/sentry/scrub';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVlLTEyMw';
const OPAQUE = 'abc123def456ghi789jkl';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stripUrlQueries', () => {
  it.each([
    ['http://127.0.0.1:3274/ko/vote?code=SECRET', 'http://127.0.0.1:3274/ko/vote'],
    ['/ko/vote?code=SECRET', '/ko/vote'],
    ['/?code=SECRET', '/'],
    ['GET /ko/vote?code=SECRET', 'GET /ko/vote'],
    ['middleware GET /ko/vote?code=SECRET', 'middleware GET /ko/vote'],
    ['https://x.supabase.co/rest/v1/votes?select=*&id=eq.5#frag', 'https://x.supabase.co/rest/v1/votes'],
    ['https://app.example/cb#access_token=SECRET', 'https://app.example/cb'],
    // 따옴표와 괄호는 토큰을 끊지 않는다. 뒤에 붙은 값이 살아남으면 안 된다.
    ["/ko/vote?a='x'&code=SECRET", '/ko/vote'],
    ['/ko/vote?a=(x)&code=SECRET', '/ko/vote'],
    ['failed to fetch https://x/y?token=SECRET (status 500)', 'failed to fetch https://x/y (status 500)'],
    ['callback?code=SECRET', 'callback'],
    ['redirect ?code=SECRET now', 'redirect  now'],
    ['#access_token=SECRET', ''],
    ['a?b/c?code=SECRET', 'a?b/c'],
    ['app:///_next/server/app/api/x/route.js?v=SECRET', 'app:///_next/server/app/api/x/route.js'],
  ])('%j → %j', (input, expected) => {
    expect(stripUrlQueries(input)).toBe(expected);
  });

  it.each([
    'What is this? I do not know',
    "Unexpected token '?' in JSON",
    'SELECT * FROM t WHERE a = ?',
    'Object.?',
    'C# and F#',
    'GET /[lang]/vote',
    'render route (app) /[lang]/vote',
    '(?:a|b)=c',
    '',
  ])('%j 는 그대로 둔다', (input) => {
    expect(stripUrlQueries(input)).toBe(input);
  });
});

describe('redactTokenShapes', () => {
  it.each([
    [`token ${JWT} end`, 'token [redacted-jwt] end'],
    [`${JWT} ${JWT}`, '[redacted-jwt] [redacted-jwt]'],
    [`/reset/${JWT}/confirm`, '/reset/[redacted-jwt]/confirm'],
    [`Authorization: Bearer ${JWT}`, 'Authorization: Bearer [redacted-jwt]'],
    [`Authorization: Bearer ${OPAQUE}`, 'Authorization: Bearer [redacted]'],
    // payload 가 {} 이면 둘째 덩어리는 'e30' 이다. 서명이 없는 토큰(alg none)은 셋째 덩어리가 비어 있다.
    ['token eyJhbGciOiJIUzI1NiJ9.e30.c2lnbmF0dXJlLXZhbHVlLTEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI end', 'token [redacted-jwt] end'],
    ['token eyJhbGciOiJub25lIn0.e30. end', 'token [redacted-jwt] end'],
    // 숫자가 없는 불투명 토큰도 토큰이다.
    ['Authorization: Bearer abcdefghijklmnop', 'Authorization: Bearer [redacted]'],
    [`authorization: bearer ${OPAQUE}==`, 'authorization: Bearer [redacted]'],
  ])('%j → %j', (input, expected) => {
    expect(redactTokenShapes(input)).toBe(expected);
  });

  it.each([
    'eyJ',
    'eyJabc.def.ghi is too short to be a token',
    'eyJhbGciOiJIUzI1NiJ9 alone is one segment only',
    'Bearer token is missing from the request',
    'Bearer authentication failed for this request',
    'the bearer of bad news arrived in 2026',
  ])('%j 는 그대로 둔다', (input) => {
    expect(redactTokenShapes(input)).toBe(input);
  });
});

describe('scrubEvent', () => {
  it('request 에 url 과 method 만 남기고 쿼리를 뗀다', () => {
    const event = {
      request: {
        url: 'http://127.0.0.1:3274/api/payment/portone/webhook?token=SECRET',
        method: 'POST',
        query_string: 'token=SECRET',
        headers: { cookie: 'sb=SECRET', authorization: 'Bearer SECRET', 'x-portone-signature': 'SECRET' },
        cookies: { sb: 'SECRET' },
        data: '{"paymentId":"SECRET"}',
        env: { REMOTE_ADDR: '203.0.113.9' },
      },
    };

    expect(scrubEvent(event)).toBe(event);
    expect(event.request).toEqual({ url: 'http://127.0.0.1:3274/api/payment/portone/webhook', method: 'POST' });
  });

  it('처리되지 않은 예외의 request_path 에서 쿼리를 뗀다', () => {
    const event = {
      contexts: { nextjs: { request_path: '/api/envelope-test/throw?code=SECRET', router_kind: 'App Router' } },
    };
    scrubEvent(event);
    expect(event.contexts.nextjs).toEqual({ request_path: '/api/envelope-test/throw', router_kind: 'App Router' });
  });

  it('transaction 의 이름, trace 속성, 자식 span, breadcrumb 에 같은 규칙을 건다', () => {
    const event = {
      type: 'transaction',
      transaction: 'GET /ko/vote?code=SECRET',
      contexts: {
        trace: {
          op: 'http.server',
          data: {
            'http.target': '/ko/vote?code=SECRET',
            'next.span_name': 'GET /ko/vote?code=SECRET',
            'http.method': 'GET',
            'http.response.status_code': 200,
            'sentry.sample_rate': 0.1,
          },
        },
      },
      spans: [
        {
          op: 'http.client',
          description: 'GET https://x.supabase.co/rest/v1/votes?select=*',
          data: {
            'url.full': 'https://x.supabase.co/rest/v1/votes?select=*&user_id=eq.SECRET',
            'url.query': '?select=*&user_id=eq.SECRET',
            'http.query': '?select=*&user_id=eq.SECRET',
            'url.fragment': '#SECRET',
            'http.fragment': '#SECRET',
            'http.request.method': 'GET',
          },
        },
      ],
      breadcrumbs: [
        { category: 'http', data: { url: 'https://api.example/userinfo?access_token=SECRET', 'http.query': '?access_token=SECRET', status_code: 200 } },
      ],
    };

    scrubEvent(event);

    expect(event.transaction).toBe('GET /ko/vote');
    expect(event.contexts.trace.data).toEqual({
      'http.target': '/ko/vote',
      'next.span_name': 'GET /ko/vote',
      'http.method': 'GET',
      'http.response.status_code': 200,
      'sentry.sample_rate': 0.1,
    });
    expect(event.spans[0]).toEqual({
      op: 'http.client',
      description: 'GET https://x.supabase.co/rest/v1/votes',
      data: { 'url.full': 'https://x.supabase.co/rest/v1/votes', 'http.request.method': 'GET' },
    });
    expect(event.breadcrumbs[0].data).toEqual({ url: 'https://api.example/userinfo', status_code: 200 });
    expect(JSON.stringify(event)).not.toContain('SECRET');
    expect(event).not.toHaveProperty('tags');
  });

  it('예외 메시지에서 URL 쿼리·JWT·Bearer·이메일을 가리고 tripwire 태그를 붙인다', () => {
    const event = {
      tags: { service: 'picnic-web' },
      exception: {
        values: [
          {
            type: 'Error',
            value: `envtest unhandled MARKER url=https://envtest.invalid/callback?code=SECRET jwt=${JWT} auth=Bearer ${OPAQUE} email=user.name+tag@example.co.kr`,
            stacktrace: {
              frames: [
                { filename: 'app:///_next/server/app/api/x/route.js?v=SECRET', abs_path: '/var/task/route.js#SECRET', function: '?' },
              ],
            },
          },
        ],
      },
    };

    scrubEvent(event);

    expect(event.exception.values[0].value).toBe(
      'envtest unhandled MARKER url=https://envtest.invalid/callback jwt=[redacted-jwt] auth=Bearer [redacted] email=[redacted-email]',
    );
    expect(event.exception.values[0].stacktrace.frames[0]).toEqual({
      filename: 'app:///_next/server/app/api/x/route.js',
      abs_path: '/var/task/route.js',
      function: '?',
    });
    expect(event.tags).toEqual({ service: 'picnic-web', [TRIPWIRE_KEY]: '1' });
  });

  it('토큰 모양 값은 이벤트의 어느 문자열에 있든 가리고 태그를 붙인다', () => {
    const event = { contexts: { log: { detail: { note: `leaked ${JWT}`, list: [`Bearer ${OPAQUE}`] } } }, extra: { n: 1, ok: true, none: null } };
    scrubEvent(event);
    expect(event.contexts.log.detail).toEqual({ note: 'leaked [redacted-jwt]', list: ['Bearer [redacted]'] });
    expect((event as { tags?: Record<string, string> }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
  });

  it('SDK 내부 자료(sdkProcessingMetadata)는 건드리지 않고, 거기 있는 토큰으로 태그를 붙이지 않는다', () => {
    // beforeSend 시점의 이벤트에는 요청 헤더 원문이 든 내부 자료가 붙어 있다. 전송 전에 SDK 가 지우고,
    // 같은 요청의 다른 이벤트와 객체를 공유한다. 고치면 다른 이벤트의 판정이 달라진다.
    const normalizedRequest = {
      url: 'http://127.0.0.1:3274/api/x?code=SECRET',
      headers: { authorization: `Bearer ${OPAQUE}`, cookie: `sb=${JWT}` },
    };
    const event = {
      request: { url: 'http://127.0.0.1:3274/api/x?code=SECRET', method: 'GET' },
      sdkProcessingMetadata: { normalizedRequest },
    };

    scrubEvent(event);

    expect(event.request).toEqual({ url: 'http://127.0.0.1:3274/api/x', method: 'GET' });
    expect(event).not.toHaveProperty('tags');
    expect(event.sdkProcessingMetadata.normalizedRequest).toBe(normalizedRequest);
    expect(normalizedRequest).toEqual({
      url: 'http://127.0.0.1:3274/api/x?code=SECRET',
      headers: { authorization: `Bearer ${OPAQUE}`, cookie: `sb=${JWT}` },
    });
  });

  it('envelope 헤더로 나가는 DSC 에서 쿼리를 떼되, 추적이 공유하는 원본은 고치지 않는다', () => {
    // 들어온 요청의 baggage(sentry-transaction)는 그대로 DSC 가 되고 envelope 헤더의 trace 로 나간다.
    const dynamicSamplingContext = { trace_id: 'abc', public_key: 'k', transaction: '/api/pay?code=SECRET' };
    const event = { sdkProcessingMetadata: { dynamicSamplingContext, normalizedRequest: { headers: {} } } };

    scrubEvent(event);

    expect(event.sdkProcessingMetadata.dynamicSamplingContext).toEqual({ trace_id: 'abc', public_key: 'k', transaction: '/api/pay' });
    expect(dynamicSamplingContext.transaction).toBe('/api/pay?code=SECRET');
    expect(event).not.toHaveProperty('tags');
  });

  it('DSC 와 이벤트의 transaction 은 / 가 없는 이름이어도 ? 와 # 뒤를 버린다', () => {
    // baggage 의 sentry-transaction 은 요청을 보낸 쪽이 정한다. URL 모양이 아니어도 쿼리처럼 쓰인 부분을 버린다.
    for (const name of ['callback?SECRET', 'callback#SECRET']) {
      const event = { transaction: name, sdkProcessingMetadata: { dynamicSamplingContext: { transaction: name } } };
      scrubEvent(event);
      expect(event.transaction).toBe('callback');
      expect(event.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe('callback');
    }
  });

  it('DSC 에 토큰 모양 값이 있으면 가리고 태그를 붙인다', () => {
    const event = { sdkProcessingMetadata: { dynamicSamplingContext: { transaction: `GET /reset/${JWT}` } } };
    scrubEvent(event);
    expect(event.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe('GET /reset/[redacted-jwt]');
    expect((event as { tags?: unknown }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
  });

  it('URL 을 담는 필드는 / 가 없는 상대 주소여도 ? 와 # 뒤를 버린다', () => {
    const event = {
      contexts: { nextjs: { request_path: 'callback?SECRET' } },
      spans: [{ data: { url: 'callback#SECRET', 'url.full': 'cb?x', 'http.target': 'cb#y', 'http.url': 'cb?z' } }],
    };
    scrubEvent(event);
    expect(event.contexts.nextjs.request_path).toBe('callback');
    expect(event.spans[0].data).toEqual({ url: 'callback', 'url.full': 'cb', 'http.target': 'cb', 'http.url': 'cb' });
  });

  it('span 에 남은 tripwire 표식을 이벤트 태그로 올린다', () => {
    const fromChild = { spans: [{ data: { [TRIPWIRE_KEY]: '1' } }] };
    const fromRoot = { contexts: { trace: { data: { [TRIPWIRE_KEY]: '1' } } } };
    expect((scrubEvent(fromChild) as { tags?: unknown }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
    expect((scrubEvent(fromRoot) as { tags?: unknown }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
  });

  it('message 만 있는 이벤트는 같은 객체를 그대로 돌려준다', () => {
    const event = { message: 'edge failure' };
    expect(scrubEvent(event)).toBe(event);
    expect(event).toEqual({ message: 'edge failure' });
  });

  it('8,192자가 넘는 예외 메시지는 자른다', () => {
    const event = { exception: { values: [{ value: 'x'.repeat(9000) }] } };
    scrubEvent(event);
    expect(event.exception.values[0].value).toBe(`${'x'.repeat(8192)}…`);
  });

  it('두 번 걸어도 결과가 같다', () => {
    const build = () => ({
      request: { url: 'https://h/p?x=1', method: 'GET' },
      exception: { values: [{ value: `a ${JWT} b@c.io /p?q=1` }] },
      spans: [{ description: 'GET /p?q=1', data: { 'url.query': '?q=1' } }],
    });
    const once = scrubEvent(build());
    const twice = scrubEvent(scrubEvent(build()) as object);
    expect(twice).toEqual(once);
  });

  it('가리다가 실패하면 이벤트를 버리고, 원본 오류의 메시지를 찍지 않는다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const event = { contexts: {} as Record<string, unknown> };
    Object.defineProperty(event.contexts, 'boom', {
      enumerable: true,
      get() {
        throw new TypeError('getter failed with SECRET');
      },
    });

    expect(scrubEvent(event)).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('[sentry] 이벤트를 가리지 못해 버린다:', 'TypeError');
  });

  it.each([
    ['슬래시', '/'.repeat(200_000)],
    ['물음표', '?'.repeat(200_000)],
    ['경로와 쿼리의 반복', '/a?b=c '.repeat(30_000)],
    ['eyJ 의 반복', 'eyJ'.repeat(70_000)],
    ['덜 끝난 JWT 의 반복', 'eyJaaaaaaaaaa.'.repeat(15_000)],
    ['Bearer 의 반복', 'Bearer '.repeat(30_000)],
    ['숫자 없는 긴 Bearer 토큰', `bearer ${'a'.repeat(200_000)}`],
    ['골뱅이의 반복', 'a@'.repeat(100_000)],
    ['공백', ' '.repeat(200_000)],
    ['Bearer 뒤의 긴 공백', `Bearer ${' '.repeat(200_000)}`],
    ['짧은 토큰 여러 개와 물음표 하나', `${'a '.repeat(100_000)}/p?q=1`],
    ['마침표로 끊긴 eyJ 의 반복', 'eyJ.'.repeat(50_000)],
  ])('길이를 믿을 수 없는 입력을 선형 시간에 처리한다: %s', (_name, input) => {
    const started = performance.now();
    stripUrlQueries(input);
    redactTokenShapes(input);
    scrubEvent({ exception: { values: [{ value: input }] }, contexts: { nextjs: { request_path: input } } });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('scrubSpan', () => {
  it('설명과 속성에서 쿼리를 떼고 같은 객체를 돌려준다', () => {
    const span = {
      description: 'GET https://x.supabase.co/rest/v1/votes?id=eq.5',
      op: 'http.client',
      data: { 'url.full': 'https://x.supabase.co/rest/v1/votes?id=eq.5', 'url.query': '?id=eq.5', 'http.request.method': 'GET' },
    };

    expect(scrubSpan(span)).toBe(span);
    expect(span).toEqual({
      description: 'GET https://x.supabase.co/rest/v1/votes',
      op: 'http.client',
      data: { 'url.full': 'https://x.supabase.co/rest/v1/votes', 'http.request.method': 'GET' },
    });
  });

  it('토큰 모양 값을 가리고 span 의 data 에 표식을 남긴다', () => {
    const span = { description: `GET /reset/${JWT}`, data: { 'http.request.method': 'GET' } as Record<string, unknown> };
    scrubSpan(span);
    expect(span.description).toBe('GET /reset/[redacted-jwt]');
    expect(span.data).toEqual({ 'http.request.method': 'GET', [TRIPWIRE_KEY]: '1' });
  });

  it('가리다가 실패하면 설명과 속성을 비운다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const data = {} as Record<string, unknown>;
    Object.defineProperty(data, 'boom', {
      enumerable: true,
      get() {
        throw new Error('getter failed');
      },
    });
    const span = { description: 'GET /p?q=SECRET', data, span_id: 'abc' };

    expect(scrubSpan(span)).toBe(span);
    expect(span).toEqual({ description: undefined, data: {}, span_id: 'abc' });
  });
});
