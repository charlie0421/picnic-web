import { beforeEach, describe, expect, it, vi } from 'vitest';

const { init } = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  init, browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  captureRouterTransitionStart: vi.fn(),
}));
beforeEach(() => {
  vi.resetModules(); init.mockClear(); vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'http://fixture@localhost/1');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_APPLICATION_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_SESSION_SAMPLE_RATE', '0');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE', '0');
});
async function options() { await import('@/instrumentation-client'); return init.mock.calls[0][0]; }

describe('browser Sentry URL privacy', () => {
  it('redacts errors after applying existing filters', async () => {
    const config = await options();
    const event = { exception: { values: [{ type: 'Error', value: 'failure /callback?code=secret-error' }] }, request: { url: 'https://picnic.test/?token=secret-request', headers: { cookie: 'secret-cookie' } } };
    expect(config.beforeSend(event)).toEqual({ exception: { values: [{ type: 'Error', value: 'failure /callback' }] }, request: { url: 'https://picnic.test/' } });
  });
  it('redacts transactions, child spans and navigation breadcrumbs', async () => {
    const config = await options();
    expect(config.beforeSendTransaction?.({ transaction: '/callback?code=private' })).toEqual({ transaction: '/callback' });
    expect(config.beforeSendSpan?.({ description: 'GET /api?token=private', data: { 'http.url': '/api?token=private' } })).toEqual({ description: 'GET /api', data: { 'http.url': '/api' } });
    expect(config.beforeBreadcrumb({ category: 'navigation', data: { from: '/a?code=private', to: '/b#private' } })).toEqual({ category: 'navigation', data: { from: '/a', to: '/b' } });
    expect(config.beforeBreadcrumb({ category: 'navigation', data: { from: 'callback#private', to: '#private' } })).toEqual({ category: 'navigation', data: { from: 'callback', to: '' } });
    expect(config.beforeBreadcrumb({ category: 'ui.click', message: 'secret' })).toBeNull();
    expect(config.beforeBreadcrumb({ category: 'console', level: 'debug', message: 'secret' })).toBeNull();
  });
});
