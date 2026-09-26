import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PayPal create/capture 계약 테스트 (docs/audit-2026-09-26/tests-security.md §3.3).
 *
 * - 일반 `it`: 현재 안전한 계약(인증·DB 상품 기준 지급량·금액 대조·멱등)을 고정한다.
 * - `it.fails`: 알려진 결함(U-04, B-P3 — 소유권·금액 검증 전에 PayPal capture 를 호출).
 *   수정되면 뒤집히므로 그때 `it` 으로 전환한다.
 *
 * PayPal HTTP 는 fetch mock 으로, 적립은 service-role rpc mock 으로 호출 횟수까지 검증한다.
 */
const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  product: { id: 'STAR_100', product_name: 'Star 100', web_price_usd: 9.99, star_candy: 100, web_bonus_amount: 10 } as
    | Record<string, unknown>
    | null,
  existingReceipt: null as Record<string, unknown> | null,
  capture: null as Record<string, unknown> | null,
  rpcResult: { receipt_id: 7 } as unknown,
  rpc: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/utils/log-error', () => ({ logError: vi.fn() }));
vi.mock('@/utils/star-candy-bonus', () => ({ getStarCandyBonusExpiryISO: () => '2027-01-01T00:00:00Z' }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({
          data: table === 'products' ? mocks.product : table === 'receipts' ? mocks.existingReceipt : null,
          error: null,
        }),
      });
      return b;
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));

import { POST as createOrder } from '@/app/api/payment/paypal/create-order/route';
import { POST as captureOrder } from '@/app/api/payment/paypal/capture-order/route';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const completedCapture = (custom: Record<string, unknown>, amount = { value: '9.99', currency_code: 'USD' }) => ({
  id: 'CAPTURE-1',
  status: 'COMPLETED',
  purchase_units: [{ custom_id: JSON.stringify(custom), amount, payments: { captures: [{ id: 'C1', status: 'COMPLETED', amount }] } }],
});

const paypalCalls = (pathFragment: string) =>
  mocks.fetch.mock.calls.filter(([url]) => String(url).includes(pathFragment)).length;

const req = (path: string, body: unknown) =>
  new NextRequest(`https://www.picnic.fan${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.user = { id: 'user-a' };
  mocks.product = { id: 'STAR_100', product_name: 'Star 100', web_price_usd: 9.99, star_candy: 100, web_bonus_amount: 10 };
  mocks.existingReceipt = null;
  mocks.capture = completedCapture({ productId: 'STAR_100', userId: 'user-a' });
  mocks.rpcResult = { receipt_id: 7 };
  mocks.rpc.mockReset().mockImplementation(async () => ({ data: mocks.rpcResult, error: null }));
  mocks.fetch.mockReset().mockImplementation(async (url: string) => {
    if (url.includes('/v1/oauth2/token')) return json({ access_token: 'token' });
    if (url.endsWith('/capture')) return json(mocks.capture);
    if (url.endsWith('/v2/checkout/orders')) return json({ id: 'ORDER-1' });
    return json({}, 404);
  });
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('PayPal create-order — 현재 계약', () => {
  it('비로그인은 401, PayPal 호출 0', async () => {
    mocks.user = null;
    const res = await createOrder(req('/api/payment/paypal/create-order', { productId: 'STAR_100' }));

    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('존재하지 않는 상품은 400, PayPal 주문 생성 0', async () => {
    mocks.product = null;
    const res = await createOrder(req('/api/payment/paypal/create-order', { productId: 'NOPE' }));

    expect(res.status).toBe(400);
    expect(paypalCalls('/v2/checkout/orders')).toBe(0);
  });

  it('주문 금액은 클라이언트가 아니라 DB 상품 가격으로 만든다', async () => {
    const res = await createOrder(req('/api/payment/paypal/create-order', { productId: 'STAR_100', amount: '0.01' }));

    expect(res.status).toBe(200);
    const [, init] = mocks.fetch.mock.calls.find(([url]) => String(url).endsWith('/v2/checkout/orders'))!;
    const order = JSON.parse((init as RequestInit).body as string);
    expect(order.purchase_units[0].amount).toMatchObject({ currency_code: 'USD', value: '9.99' });
  });
});

describe('PayPal capture-order — 현재 계약', () => {
  it('비로그인은 401, PayPal 호출 0', async () => {
    mocks.user = null;
    const res = await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('정상 캡처는 DB 상품 기준 지급량으로 정확히 1회 적립한다', async () => {
    mocks.capture = completedCapture({ productId: 'STAR_100', userId: 'user-a', starCandy: 999999 });
    const res = await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_user_id: 'user-a', p_star_candy: 100, p_bonus_amount: 10 });
  });

  it('캡처 금액·통화가 DB 상품과 다르면 400 무적립', async () => {
    mocks.capture = completedCapture({ productId: 'STAR_100', userId: 'user-a' }, { value: '0.01', currency_code: 'USD' });
    const res = await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('다른 사용자의 주문이면 403 무적립', async () => {
    mocks.capture = completedCapture({ productId: 'STAR_100', userId: 'user-b' });
    const res = await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('이미 처리된 주문(영수증 존재)은 적립하지 않는다', async () => {
    mocks.existingReceipt = { id: 1 };
    const res = await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('RPC 가 NULL(멱등 단락)이면 이미 처리됨 응답', async () => {
    mocks.rpcResult = null;
    const res = await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Payment already processed');
  });
});

describe('PayPal capture-order — 알려진 결함 (수정 시 it 으로 전환)', () => {
  // U-04: 주문 조회·소유권 확인 없이 먼저 capture 한다 → 타인 주문을 제출하면 결제는 확정되고 적립만 거부된다.
  it.fails('다른 사용자의 주문은 capture 호출 전에 403 이어야 한다', async () => {
    mocks.capture = completedCapture({ productId: 'STAR_100', userId: 'user-b' });
    await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(paypalCalls('/capture')).toBe(0);
  });

  // U-04: 금액 불일치도 capture 이후에 판정한다 → 잘못된 금액의 결제가 확정된다.
  it.fails('금액이 DB 상품과 다르면 capture 호출 전에 거부해야 한다', async () => {
    mocks.capture = completedCapture({ productId: 'STAR_100', userId: 'user-a' }, { value: '0.01', currency_code: 'USD' });
    await captureOrder(req('/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }));

    expect(paypalCalls('/capture')).toBe(0);
  });
});
