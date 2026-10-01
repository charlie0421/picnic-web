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
});
