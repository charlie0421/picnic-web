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
  it('does not mutate live console arguments or fetch breadcrumb data', async () => {
    const config = await options();
    const request = { url: '/callback?code=private', 'url.query': 'code=private', nested: { url: '/api?token=private' } };
    const args = ['GET /callback?code=private', request];
    const original = structuredClone(args);
    const input = { category: 'console', level: 'warning', data: { arguments: args } };
    const output = config.beforeBreadcrumb(input);
    expect(args).toEqual(original);
    expect(output.data.arguments).toEqual(['GET /callback', { url: '/callback', nested: { url: '/api' } }]);
    expect(output.data.arguments).not.toBe(args);
    const fetchInput = { category: 'fetch', data: request };
    expect(config.beforeBreadcrumb(fetchInput).data.url).toBe('/callback');
    expect(request).toEqual(original[1]);
  });
  it('keeps a breadcrumb token tripwire observable on the error event', async () => {
    const config = await options();
    const crumb = config.beforeBreadcrumb({ category: 'console', message: 'Bearer abcdefghijklmnop123456789' });
    const output = config.beforeSend({ exception: { values: [{ type: 'Error', value: 'fixture' }] }, breadcrumbs: [crumb] });
    expect(output.tags?.['redaction.tripwire']).toBe('1');
    expect(JSON.stringify(output)).not.toContain('abcdefghijklmnop123456789');
  });
  it('copies cycles without invoking application getters', async () => {
    const config = await options();
    const getter = vi.fn(() => '/?token=private');
    const value: Record<string, unknown> = { url: '/a?token=private' };
    value.self = value;
    Object.defineProperty(value, 'derived', { enumerable: true, get: getter });
    const clean = config.beforeBreadcrumb({ category: 'console', data: { arguments: [value] } });
    expect(getter).not.toHaveBeenCalled();
    expect(value.url).toBe('/a?token=private');
    expect(clean.data.arguments[0].url).toBe('/a');
    expect(clean.data.arguments[0].self).toBe(clean.data.arguments[0]);
  });
  it('truncates excessive breadcrumb data while preserving metadata and caller data', async () => {
    const config = await options();
    const input = { data: { arguments: Array(100000).fill('/a?code=private') }, category: 'console', level: 'warning', message: 'safe', timestamp: 123 };
    const clean = config.beforeBreadcrumb(input);
    expect(clean).toMatchObject({ category: 'console', level: 'warning', message: 'safe', timestamp: 123 });
    expect(clean.data.arguments.length).toBeLessThan(10000);
    expect(clean.data.arguments.at(-1)).toBe('[Truncated]');
    expect(clean.data.arguments[0]).toBe('/a');
    expect(JSON.stringify(clean)).not.toContain('private');
    expect(input.data.arguments[0]).toBe('/a?code=private');
  });
  it('keeps data at the value budget and truncates only the next value', async () => {
    const config = await options();
    const fits = config.beforeBreadcrumb({ category: 'console', message: 'safe', data: { arguments: Array(9995).fill('safe') } });
    expect(fits.data.arguments).toHaveLength(9995);
    expect(fits.data.arguments.at(-1)).toBe('safe');
    const exceeds = config.beforeBreadcrumb({ category: 'console', message: 'safe', data: { arguments: Array(9996).fill('/a?code=private') } });
    expect(exceeds.data.arguments).toHaveLength(9996);
    expect(exceeds.data.arguments.at(-1)).toBe('[Truncated]');
    expect(exceeds.data.arguments[9994]).toBe('/a');
  });
  it('marks an excessive object without forwarding its uncopied values', async () => {
    const config = await options();
    const data = Object.fromEntries(Array.from({ length: 12000 }, (_, i) => [`field${i}`, '/a?code=private']));
    const clean = config.beforeBreadcrumb({ data, category: 'console' });
    expect(clean.category).toBe('console');
    expect(clean.data._truncated).toBe('[Truncated]');
    expect(Object.keys(clean.data).length).toBeLessThan(10000);
    expect(JSON.stringify(clean)).not.toContain('private');
    expect(data.field11999).toBe('/a?code=private');
  });
  it('bounds sparse array indexes instead of creating an enormous copied array', async () => {
    const config = await options();
    const sparse = new Array(100000);
    sparse[99999] = '/a?code=private';
    const clean = config.beforeBreadcrumb({ category: 'console', data: { arguments: sparse } });
    expect(clean).not.toBeNull();
    expect(clean.data.arguments.length).toBeLessThanOrEqual(10000);
    expect(clean.data.arguments.at(-1)).toBe('[Truncated]');
    expect(sparse.length).toBe(100000);
  });
  it('truncates only an excessive nested branch and keeps a safe sibling', async () => {
    const config = await options();
    let deep: unknown = { url: '/a?code=private' };
    for (let i = 0; i < 45; i++) deep = { child: deep };
    const input = { category: 'console', data: { deep, safe: { url: '/b?code=private' } } };
    const clean = config.beforeBreadcrumb(input);
    expect(clean.data.safe.url).toBe('/b');
    expect(JSON.stringify(clean.data.deep)).toContain('[Truncated]');
    expect(JSON.stringify(clean)).not.toContain('private');
    expect(input.data.safe.url).toBe('/b?code=private');
  });
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
