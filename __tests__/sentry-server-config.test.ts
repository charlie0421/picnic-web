import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Integration = { name: string; options?: Record<string, unknown> };

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  httpIntegration: vi.fn((options: Record<string, unknown>) => ({ name: 'Http', options })),
  requestDataIntegration: vi.fn((options: Record<string, unknown>) => ({ name: 'RequestData', options })),
}));

vi.mock('@sentry/nextjs', () => sentry);

type ServerOptions = {
  tracesSampleRate: number;
  integrations: Integration[] | ((defaults: Integration[]) => Integration[]);
  beforeSend: (event: Record<string, unknown>) => unknown;
  beforeSendTransaction?: (event: Record<string, unknown>) => unknown;
  beforeSendSpan?: (span: Record<string, unknown>) => unknown;
};

async function loadOptions(): Promise<ServerOptions> {
  await import('@/sentry.server.config.js');
  expect(sentry.init).toHaveBeenCalledOnce();
  return sentry.init.mock.calls[0]?.[0] as ServerOptions;
}

describe('Sentry 서버 초기화', () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockClear();
    sentry.httpIntegration.mockClear();
    sentry.requestDataIntegration.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('표본율', () => {
    it.each([
      ['', 0.1],
      ['1', 1],
      ['0', 0],
      ['0.25', 0.25],
      ['2', 0.1],
      ['-1', 0.1],
      ['abc', 0.1],
    ])('SENTRY_TRACES_SAMPLE_RATE=%j 이면 %d 다', async (raw, expected) => {
      vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', raw);
      expect((await loadOptions()).tracesSampleRate).toBe(expected);
    });
  });

  describe('수집 범위', () => {
    const resolve = (options: ServerOptions, defaults: Integration[]): Integration[] => {
      expect(options.integrations).toBeTypeOf('function');
      return (options.integrations as (defaults: Integration[]) => Integration[])(defaults);
    };

    it('기본 integration 에서 Console 을 빼고 요청 데이터 수집을 url 로 좁힌다', async () => {
      const options = await loadOptions();
      const resolved = resolve(options, [{ name: 'InboundFilters' }, { name: 'Console' }, { name: 'RequestData' }, { name: 'Http' }]);

      expect(resolved.map((integration) => integration.name)).toEqual(['InboundFilters', 'RequestData', 'Http', 'Http', 'RequestData']);
      expect(resolved[4].options).toEqual({
        include: { cookies: false, headers: false, query_string: false, data: false, url: true, ip: false },
      });
    });

    it('httpIntegration 의 요청 필터를 그대로 둔다', async () => {
      const options = await loadOptions();
      const http = resolve(options, []).find((integration) => integration.name === 'Http');
      const filters = http?.options as {
        ignoreIncomingRequests: (url: string) => boolean;
        ignoreOutgoingRequests: (url: string) => boolean;
      };

      expect(filters.ignoreIncomingRequests('/api/health')).toBe(true);
      expect(filters.ignoreIncomingRequests('/_next/static/chunks/a.js')).toBe(true);
      expect(filters.ignoreIncomingRequests('/ko/vote')).toBe(false);
      expect(filters.ignoreOutgoingRequests('https://o0.ingest.sentry.io/api/1/envelope/')).toBe(true);
      expect(filters.ignoreOutgoingRequests('https://x.supabase.co/rest/v1/votes')).toBe(false);
    });

    it('오류 이벤트에서 요청 헤더·쿠키·쿼리를 지운다', async () => {
      const options = await loadOptions();
      const event = {
        request: {
          url: 'https://www.picnic.fan/ko/vote?code=SECRET',
          method: 'GET',
          query_string: 'code=SECRET',
          headers: { cookie: 'sb=SECRET' },
          cookies: { sb: 'SECRET' },
        },
      };

      expect(options.beforeSend(event)).toBe(event);
      expect(event.request).toEqual({ url: 'https://www.picnic.fan/ko/vote', method: 'GET' });
    });

    it('API 404 오류를 버리는 기존 필터를 유지한다', async () => {
      const options = await loadOptions();
      expect(options.beforeSend({ exception: { values: [{ value: 'api route returned 404' }] } })).toBeNull();
    });

    it('transaction 과 span 에도 같은 규칙을 건다', async () => {
      const options = await loadOptions();
      const transaction = { type: 'transaction', contexts: { trace: { data: { 'http.target': '/ko/vote?code=SECRET' } } } };
      const span = { description: 'GET https://x.supabase.co/rest/v1/votes?id=eq.5', data: { 'url.query': '?id=eq.5' } };

      expect(options.beforeSendTransaction?.(transaction)).toBe(transaction);
      expect(options.beforeSendSpan?.(span)).toBe(span);
      expect(transaction.contexts.trace.data['http.target']).toBe('/ko/vote');
      expect(span).toEqual({ description: 'GET https://x.supabase.co/rest/v1/votes', data: {} });
    });
  });
});
