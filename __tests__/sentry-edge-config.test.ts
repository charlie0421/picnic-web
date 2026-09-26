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

  it('edge 에러는 수집하되 성능 트레이싱은 샘플링하지 않는다', async () => {
    await import('@/sentry.edge.config.js');

    expect(sentry.init).toHaveBeenCalledOnce();
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@o0.ingest.sentry.io/0',
        tracesSampleRate: 0,
      }),
    );
  });

  it('Sentry.init 이 throw 해도 edge instrumentation 등록은 요청 경로를 실패시키지 않는다', async () => {
    const failure = new Error('Sentry edge init failed');
    sentry.init.mockImplementationOnce(() => {
      throw failure;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { register } = await import('@/instrumentation');

    await expect(register()).resolves.toBeUndefined();
  });
});
