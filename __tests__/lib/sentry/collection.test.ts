import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { REQUEST_DATA_INCLUDE, resolveTracesSampleRate, withoutConsole } from '@/lib/sentry/collection';

// SDK 의 하위 패키지는 @sentry/nextjs 가 쓰는 것과 같은 것을 읽는다(호이스팅에 기대지 않는다).
const requireFromSdk = createRequire(createRequire(import.meta.url).resolve('@sentry/nextjs'));

type Integration = {
  name: string;
  isDefaultInstance?: boolean;
  processEvent?: (event: Record<string, unknown>, hint: unknown, client: unknown) => Record<string, unknown>;
};

describe('resolveTracesSampleRate', () => {
  it.each([
    [undefined, 0.1],
    ['', 0.1],
    ['   ', 0.1],
    ['abc', 0.1],
    ['2', 0.1],
    ['-1', 0.1],
    ['NaN', 0.1],
    ['Infinity', 0.1],
    ['0', 0],
    ['1', 1],
    ['0.25', 0.25],
  ])('%j → %d', (raw, expected) => {
    expect(resolveTracesSampleRate(raw, 0.1)).toBe(expected);
  });
});

describe('withoutConsole', () => {
  it('Console 만 뺀다', () => {
    expect(withoutConsole([{ name: 'Dedupe' }, { name: 'Console' }, { name: 'Http' }])).toEqual([
      { name: 'Dedupe' },
      { name: 'Http' },
    ]);
  });
});

describe('실제 SDK 와의 계약', () => {
  const core = requireFromSdk('@sentry/core') as {
    requestDataIntegration: (options: unknown) => Integration;
    getIntegrationsToSetup: (options: unknown) => Integration[];
  };

  it('REQUEST_DATA_INCLUDE 로 만든 integration 은 url 과 method 만 붙인다', () => {
    const integration = core.requestDataIntegration({ include: REQUEST_DATA_INCLUDE });
    const event: Record<string, unknown> = {
      sdkProcessingMetadata: {
        ipAddress: '203.0.113.9',
        normalizedRequest: {
          url: 'http://localhost/ko/vote?code=SECRET',
          method: 'GET',
          query_string: 'code=SECRET',
          headers: { cookie: 'sb=SECRET', authorization: 'Bearer SECRET', 'x-forwarded-for': '203.0.113.9' },
          cookies: { sb: 'SECRET' },
          data: '{"email":"a@b.co"}',
        },
      },
    };

    integration.processEvent?.(event, {}, { getOptions: () => ({ sendDefaultPii: true }) });

    // url 의 쿼리는 scrubEvent 가 뗀다(lib/sentry/scrub.ts).
    expect(event.request).toEqual({ url: 'http://localhost/ko/vote?code=SECRET', method: 'GET' });
    expect(event.user).toBeUndefined();
  });

  it('node 의 기본 목록에 Console·Http·RequestData 가 있고, 함수 형태의 integrations 가 그것을 바꾼다', () => {
    const node = requireFromSdk('@sentry/node') as { getDefaultIntegrations: (options: unknown) => Integration[] };
    const defaults = node.getDefaultIntegrations({});
    expect(defaults.map((integration) => integration.name)).toEqual(
      expect.arrayContaining(['Console', 'Http', 'RequestData']),
    );

    const userHttp: Integration = { name: 'Http' };
    const userRequestData = core.requestDataIntegration({ include: REQUEST_DATA_INCLUDE });
    const resolved = core.getIntegrationsToSetup({
      defaultIntegrations: defaults,
      integrations: (all: Integration[]) => [...withoutConsole(all), userHttp, userRequestData],
    });

    expect(resolved.map((integration) => integration.name)).not.toContain('Console');
    expect(resolved.filter((integration) => integration.name === 'Http')).toEqual([userHttp]);
    expect(resolved.filter((integration) => integration.name === 'RequestData')).toEqual([userRequestData]);
  });

  it('edge 의 기본 목록에는 Console 이 있고 RequestData 가 없다', () => {
    const edge = requireFromSdk('@sentry/vercel-edge') as {
      getDefaultIntegrations: (options: unknown) => Integration[];
    };
    const names = edge.getDefaultIntegrations({}).map((integration) => integration.name);
    expect(names).toContain('Console');
    expect(names).not.toContain('RequestData');
    expect(withoutConsole(edge.getDefaultIntegrations({})).map((integration) => integration.name)).not.toContain('Console');
  });
});
