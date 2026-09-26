import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

describe('Sentry edge 초기화', () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockReset();
    sentry.captureRequestError.mockReset();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('edge 오류 이벤트만 수집하도록 트레이싱·이벤트 샘플링을 설정하지 않는다', async () => {
    await import('@/sentry.edge.config.js');

    expect(sentry.init).toHaveBeenCalledOnce();
    const options = sentry.init.mock.calls[0]?.[0] as {
      beforeSend?: (event: Record<string, unknown>) => unknown;
      [key: string]: unknown;
    };
    expect(options).toEqual(expect.objectContaining({
      dsn: 'https://public@o0.ingest.sentry.io/0',
    }));
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
    expect(options).not.toHaveProperty('sampleRate');

    const event = { message: 'edge failure' };
    expect(options.beforeSend).toBeTypeOf('function');
    expect(options.beforeSend?.(event)).toBe(event);
  });

  it('Sentry.init 이 throw 해도 edge instrumentation 등록은 요청 경로를 실패시키지 않는다', async () => {
    const failure = new Error('Sentry edge init failed');
    sentry.init.mockImplementationOnce(() => {
      throw failure;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { register } = await import('@/instrumentation');

    await expect(register()).resolves.toBeUndefined();
    expect(sentry.init).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Sentry Edge 초기화 실패'),
      failure,
    );
  });
});
