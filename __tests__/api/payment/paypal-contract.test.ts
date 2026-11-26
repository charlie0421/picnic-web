import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createOrder } from '@/app/api/payment/paypal/create-order/route';
import { POST as captureOrder } from '@/app/api/payment/paypal/capture-order/route';

const calls = vi.hoisted(() => ({ auth: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: calls.auth, createSupabaseServerClient: calls.auth,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: calls.service }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['create-order', createOrder, { productId: 'STAR_100', amount: '0.01', userId: 'old-client' }],
  ['capture-order', captureOrder, { orderID: 'ANOTHER-USERS-ORDER' }],
  ['capture-order', captureOrder, { orderID: 'ORDER1', amount: '0.01' }],
] as const)('retires the legacy %s entry without an auth, database or provider call', async (path, handler, body) => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const response = await handler(new NextRequest('https://www.picnic.fan/api/payment/paypal/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  expect(response.status).toBe(410);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ error: 'LEGACY_PAYPAL_ROUTE_RETIRED' });
  expect(calls.auth).not.toHaveBeenCalled();
  expect(calls.service).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
