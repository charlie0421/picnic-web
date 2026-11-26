// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const ORDER = '22222222-2222-4222-8222-222222222222';
const PAYMENT = 'web_33333333-3333-4333-8333-333333333333';
const CONTINUATION = `v1.1764029400.${'A'.repeat(43)}`;
const script = readFileSync(join(process.cwd(), 'public/portone-return.js'), 'utf8');
const html = readFileSync(join(process.cwd(), 'public/portone-return.html'), 'utf8');
const BACK = `/ko/star-candy?portone_order=${ORDER}`;

type Options = { fetchResult?: () => Promise<unknown>; fetchThrows?: boolean; abortable?: boolean };
function run(search: string, options: Options = {}) {
  const calls: string[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const aborts = vi.fn();
  class FakeAbortController { signal = { aborted: false }; abort() { aborts(); this.signal.aborted = true; } }
  const fakeWindow: Record<string, unknown> = {
    location: { search, pathname: '/portone-return.html', replace: vi.fn((url: string) => { calls.push(`replace:${url}`); }) },
    history: { replaceState: vi.fn((_state: unknown, _title: string, url: string) => { calls.push(`strip:${url}`); }) },
    fetch: vi.fn((url: string) => {
      calls.push(`fetch:${url}`);
      if (options.fetchThrows) throw new Error('blocked');
      return (options.fetchResult ?? (() => Promise.resolve({ ok: true })))();
    }),
    setTimeout: vi.fn((fn: () => void, ms: number) => { timers.push({ fn, ms, cleared: false }); return timers.length; }),
    clearTimeout: vi.fn((id: number) => { if (timers[id - 1]) timers[id - 1].cleared = true; }),
    URLSearchParams, JSON, Promise, encodeURIComponent,
    ...(options.abortable === false ? {} : { AbortController: FakeAbortController }),
  };
  new Function('window', script)(fakeWindow);
  const fire = () => timers.forEach(timer => { if (!timer.cleared) timer.fn(); });
  return { fakeWindow: fakeWindow as any, calls, timers, aborts, fire };
}
const query = (extra: Record<string, string>) => '?' + new URLSearchParams({ order: ORDER, c: CONTINUATION, lang: 'ko', ...extra }).toString();
const confirmQuery = query({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', transactionType: 'PAYMENT' });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('PortOne mobile return page', () => {
  it('is a static, analytics-free page that loads only the return script without a referrer', () => {
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<script src="/portone-return.js"></script>');
    expect(html).not.toMatch(/gtag|googletagmanager|analytics|sentry/i);
  });
  it('strips provider parameters first, confirms once in the POST body with a bounded deadline and resumes the order', async () => {
    const { fakeWindow, calls, timers } = run(confirmQuery);
    await vi.waitFor(() => expect(fakeWindow.location.replace).toHaveBeenCalled());
    expect(calls[0]).toBe('strip:/portone-return.html');
    expect(fakeWindow.fetch).toHaveBeenCalledExactlyOnceWith(`/api/payment/orders/${ORDER}/portone/hosted/confirm`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' }, signal: expect.objectContaining({ aborted: expect.any(Boolean) }),
      body: JSON.stringify({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', continuation: CONTINUATION }) });
    expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith(BACK);
    expect(timers).toHaveLength(1); expect(timers[0].ms).toBeLessThanOrEqual(10_000); expect(timers[0].cleared).toBe(true);
    expect(calls.filter(call => !call.startsWith('fetch')).join(' ')).not.toContain('private-token');
  });
  it('resumes by status lookup at the deadline when the confirmation never settles and aborts it', async () => {
    const { fakeWindow, fire, aborts } = run(confirmQuery, { fetchResult: () => new Promise(() => undefined) });
    await flush();
    expect(fakeWindow.location.replace).not.toHaveBeenCalled();
    fire();
    expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith(BACK);
    expect(aborts).toHaveBeenCalledTimes(1);
  });
  it('makes a single transition when a late resolve or reject and repeated timer callbacks follow the deadline', async () => {
    for (const settle of ['resolve', 'reject'] as const) {
      let finish!: () => void;
      const { fakeWindow, fire, timers } = run(confirmQuery, { fetchResult: () => new Promise((resolve, reject) => {
        finish = settle === 'resolve' ? () => resolve({ ok: true }) : () => reject(new Error('late')); }) });
      fire(); timers[0].fn(); timers[0].fn();
      finish(); await flush();
      expect(fakeWindow.location.replace).toHaveBeenCalledTimes(1);
      expect(fakeWindow.fetch).toHaveBeenCalledTimes(1);
    }
  });
  it('still bounds the navigation where AbortController is missing and fetch ignores abort', async () => {
    const { fakeWindow, fire } = run(confirmQuery, { abortable: false, fetchResult: () => new Promise(() => undefined) });
    expect(fakeWindow.fetch.mock.calls[0][1]).not.toHaveProperty('signal');
    fire();
    expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith(BACK);
  });
  it('resumes immediately when the request cannot start', () => {
    const { fakeWindow, timers } = run(confirmQuery, { fetchThrows: true });
    expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith(BACK);
    expect(timers[0].cleared).toBe(true);
  });
  it('resumes by status lookup even when confirmation fails in transport', async () => {
    const { fakeWindow } = run(confirmQuery, { fetchResult: () => Promise.reject(new Error('x')) });
    await vi.waitFor(() => expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith(BACK));
  });
  it.each([
    ['a provider failure code', { paymentId: PAYMENT, txId: 'tx', paymentToken: 't', code: 'FAILURE_TYPE_PG' }],
    ['no payment token', { paymentId: PAYMENT, txId: 'tx' }],
    ['a foreign payment id', { paymentId: 'PAY_123', txId: 'tx', paymentToken: 't' }],
    ['an unsafe token', { paymentId: PAYMENT, txId: 'tx', paymentToken: 'a b' }],
    ['a malformed continuation', { paymentId: PAYMENT, txId: 'tx', paymentToken: 't', c: 'v1.x' }],
  ])('never confirms with %s and still resumes the order lookup', async (_label, extra) => {
    const { fakeWindow, calls } = run(query(extra));
    expect(calls[0]).toBe('strip:/portone-return.html');
    expect(fakeWindow.fetch).not.toHaveBeenCalled();
    expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith(BACK);
  });
  it('falls back to the store without an order or with an unknown language', () => {
    const { fakeWindow } = run('?' + new URLSearchParams({ order: 'x', lang: 'xx', paymentToken: 't' }).toString());
    expect(fakeWindow.fetch).not.toHaveBeenCalled();
    expect(fakeWindow.location.replace).toHaveBeenCalledExactlyOnceWith('/ko/star-candy');
  });
});
