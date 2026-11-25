// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), deps: vi.fn(), checkout: vi.fn(), confirm: vi.fn(),
  status: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.session }));
vi.mock('@/lib/payment/portone-hosted/runtime', () => ({ createPortOneHostedDependencies: mocks.deps }));
vi.mock('@/lib/payment/portone-hosted/service', () => ({ checkoutPortOneHosted: mocks.checkout, confirmPortOneHosted: mocks.confirm,
  getPortOneHostedStatus: mocks.status, lookupPortOneHosted: mocks.lookup }));
import { createPortOneHostedOrderHandler } from '@/lib/payment/portone-hosted/order-entry';

const ORDER = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const PAYMENT = 'web_33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://picnic.example';
const params = { params: Promise.resolve({ orderId: ORDER }) };
const CONFIRM = JSON.stringify({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', continuation: 'v1.1.abc' });
function request(body?: string, headers: Record<string, string> = {}, path = 'checkout') {
  return new NextRequest(`${ORIGIN}/api/payment/orders/${ORDER}/portone/hosted/${path}`, {
    method: body === undefined ? 'GET' : 'POST', body, headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers } });
}
const SDK = { storeId: 'store', channelKey: 'key', paymentId: PAYMENT, totalAmount: 1000, currency: 'KRW', payMethod: 'CARD',
  easyPayProvider: null, buyer: 'NAME_EMAIL_PHONE', productType: 'DIGITAL', virtualAccountValidHours: null, giftCertificateType: null,
  isTestChannel: false };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mocks.session.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.deps.mockReturnValue({ marker: 'deps' });
  for (const fn of [mocks.confirm, mocks.status, mocks.lookup]) fn.mockResolvedValue({ state: 'PENDING', orderId: ORDER });
  mocks.checkout.mockResolvedValue({ state: 'READY', orderId: ORDER, environment: 'LIVE', productId: 'STAR_100',
    expiresAt: '2026-11-25T00:10:00Z', continuation: 'v1.1.abc', sdk: { ...SDK, apiSecret: 'leak' } });
});

describe('PortOne hosted order HTTP boundary', () => {
  it('runs on a production origin for an ordinary authenticated user without an admin gate', async () => {
    const response = await createPortOneHostedOrderHandler('checkout')(request('{}'), params);
    expect(response.status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith({ marker: 'deps' }, { actorUserId: USER, orderId: ORDER });
    const body = await response.json();
    expect(body).toEqual({ state: 'READY', orderId: ORDER, environment: 'LIVE', productId: 'STAR_100',
      expiresAt: '2026-11-25T00:10:00Z', continuation: 'v1.1.abc', sdk: SDK });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('passes the confirmation only from the POST body and never echoes the token', async () => {
    const response = await createPortOneHostedOrderHandler('confirm')(request(CONFIRM), params);
    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({ marker: 'deps' }, { actorUserId: USER, orderId: ORDER, paymentId: PAYMENT,
      txId: 'tx-hosted', paymentToken: 'private-token', continuation: 'v1.1.abc' });
    expect(await response.text()).not.toContain('private-token');
  });
  it('serves read-only status by GET and lookup-only recovery by POST', async () => {
    expect((await createPortOneHostedOrderHandler('status')(request(undefined, {}, 'status'), params)).status).toBe(200);
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith({ marker: 'deps' }, { actorUserId: USER, orderId: ORDER });
    expect((await createPortOneHostedOrderHandler('lookup')(request('{}', {}, 'lookup'), params)).status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith({ marker: 'deps' }, { actorUserId: USER, orderId: ORDER });
  });
  it.each(['{}', JSON.stringify({ paymentId: PAYMENT, txId: 'tx', paymentToken: 'x' }),
    JSON.stringify({ paymentId: PAYMENT, txId: 'tx', paymentToken: 'x', continuation: 'c', actorUserId: USER }),
    JSON.stringify({ paymentId: 'PAY_1', txId: 'tx', paymentToken: 'x', continuation: 'c' }),
    JSON.stringify({ paymentId: PAYMENT, txId: 'tx\n', paymentToken: 'x', continuation: 'c' }),
    JSON.stringify({ paymentId: PAYMENT, txId: 'tx', paymentToken: 'x y', continuation: 'c' }),
    '{"paymentId":"a","paymentId":"b","txId":"tx","paymentToken":"x","continuation":"c"}', 'x'.repeat(4097)])('rejects malformed confirmation before auth: %s', async body => {
    expect((await createPortOneHostedOrderHandler('confirm')(request(body), params)).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('rejects cross-site, wrong method, query strings and unauthenticated requests before service access', async () => {
    expect((await createPortOneHostedOrderHandler('checkout')(request('{}', { origin: 'https://other.invalid' }), params)).status).toBe(403);
    expect((await createPortOneHostedOrderHandler('checkout')(request('{}', { 'sec-fetch-site': 'cross-site' }), params)).status).toBe(403);
    expect((await createPortOneHostedOrderHandler('checkout')(request(undefined), params)).status).toBe(405);
    expect((await createPortOneHostedOrderHandler('checkout')(new NextRequest(`${ORIGIN}/api/payment/orders/${ORDER}/portone/hosted/checkout?x=1`,
      { method: 'POST', body: '{}', headers: { origin: ORIGIN, 'content-type': 'application/json' } }), params)).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await createPortOneHostedOrderHandler('checkout')(request('{}'), params)).status).toBe(401);
    expect(mocks.deps).not.toHaveBeenCalled();
  });
  it.each(['AWAITING_DEPOSIT', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED'])('returns the owned %s status as a closed 200 body', async state => {
    mocks.status.mockResolvedValue({ state, orderId: ORDER });
    const response = await createPortOneHostedOrderHandler('status')(request(undefined, {}, 'status'), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state, orderId: ORDER });
  });
  it('maps states to safe statuses and hides provider errors', async () => {
    mocks.checkout.mockResolvedValue({ state: 'BLOCKED', orderId: ORDER });
    expect((await createPortOneHostedOrderHandler('checkout')(request('{}'), params)).status).toBe(409);
    mocks.confirm.mockRejectedValue(new Error('private-token api-secret'));
    const response = await createPortOneHostedOrderHandler('confirm')(request(CONFIRM), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
  });
});
