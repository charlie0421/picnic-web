import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PortOne 웹훅 계약 테스트 (docs/audit-2026-09-26/tests-security.md §3.3).
 *
 * - 일반 `it`: 현재 안전하게 동작하는 계약을 고정한다(회귀 방지).
 * - `it.fails`: 감사에서 확인된 **알려진 결함**. 수정 PR(B-P1·B-P2)이 들어오면 이 테스트가
 *   통과하게 되어 `it.fails` 가 실패로 뒤집히므로, 그때 `it` 으로 바꾼다.
 *
 * 외부 호출(PortOne SDK 조회·적립 RPC)은 모두 mock 으로 호출 횟수까지 검증한다.
 */
const mocks = vi.hoisted(() => ({
  signatureValid: true,
  payment: null as Record<string, unknown> | null,
  verifyError: null as Error | null,
  profile: { deleted_at: null } as { deleted_at: string | null },
  rpcResult: { receipt_id: 101 } as unknown,
  rpcError: null as { message: string } | null,
  products: [] as Array<Record<string, unknown>>,
  verifyPortOnePayment: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/utils/log-error', () => ({ logError: vi.fn() }));

vi.mock('@/app/api/payment/portone/webhook/webhook-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/payment/portone/webhook/webhook-helpers')>();
  return {
    parseCustomData: actual.parseCustomData,
    verifyWebhookSignature: mocks.verifyWebhookSignature,
    verifyPortOnePayment: mocks.verifyPortOnePayment,
    createServiceRoleSupabaseClient: () => ({
      from: (table: string) => {
        const b: Record<string, unknown> = {};
        Object.assign(b, {
          select: () => b,
          eq: () => b,
          in: () => b,
          single: async () =>
            table === 'user_profiles'
              ? { data: mocks.profile, error: null }
              : { data: mocks.products[0] ?? null, error: null },
          maybeSingle: async () => ({ data: mocks.products[0] ?? null, error: null }),
        });
        return b;
      },
      rpc: mocks.rpc,
    }),
  };
});

import { POST } from '@/app/api/payment/portone/webhook/route';

const USER = '00000000-0000-0000-0000-000000000001';

const paidPayment = (customData: Record<string, unknown> = {}) => ({
  paymentId: 'pay_1',
  status: 'PAID',
  totalAmount: 1000,
  currency: 'KRW',
  method: 'CARD',
  customData: JSON.stringify({ userId: USER, productId: 'STAR_100', starCandy: 100, bonusAmount: 0, ...customData }),
});

const webhook = (body: unknown, headers: Record<string, string> = { 'x-portone-signature': 'sig' }) =>
  new NextRequest('https://www.picnic.fan/api/payment/portone/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('PortOne webhook — 현재 계약', () => {
  beforeEach(() => {
    mocks.signatureValid = true;
    mocks.payment = paidPayment();
    mocks.verifyError = null;
    mocks.profile = { deleted_at: null };
    mocks.rpcResult = { receipt_id: 101 };
    mocks.rpcError = null;
    mocks.products = [];
    mocks.verifyWebhookSignature.mockReset().mockImplementation(() => mocks.signatureValid);
    mocks.verifyPortOnePayment.mockReset().mockImplementation(async () => {
      if (mocks.verifyError) throw mocks.verifyError;
      return mocks.payment;
    });
    mocks.rpc.mockReset().mockImplementation(async () => ({ data: mocks.rpcResult, error: mocks.rpcError }));
  });

  it('서명이 틀리면 401, PortOne 조회·적립 0', async () => {
    mocks.signatureValid = false;
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(401);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('PAID 는 본문이 아니라 SDK 조회 결과의 금액으로 1회 적립한다', async () => {
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID', totalAmount: 1 }));

    expect(res.status).toBe(200);
    expect(mocks.verifyPortOnePayment).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPortOnePayment).toHaveBeenCalledWith('pay_1');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe('process_portone_capture');
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_user_id: USER, p_total_amount: 1000 });
  });

  it('SDK 조회 상태가 PAID 가 아니면 200 무적립', async () => {
    mocks.payment = { ...paidPayment(), status: 'CANCELLED' };
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('SDK 조회 실패는 502(재시도 유도), 본문 데이터로 적립하지 않는다', async () => {
    mocks.verifyError = new Error('PortOne down');
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(502);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('customData 에 userId 가 없으면 400 무적립', async () => {
    mocks.payment = { ...paidPayment(), customData: JSON.stringify({ productId: 'STAR_100' }) };
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('탈퇴 사용자는 403 무적립', async () => {
    mocks.profile = { deleted_at: '2026-01-01T00:00:00Z' };
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('RPC 가 NULL(이미 처리됨)이면 200 멱등 응답', async () => {
    mocks.rpcResult = null;
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Already processed');
  });

  it('RPC 일시 실패는 500(재시도 유도)', async () => {
    mocks.rpcError = { message: 'deadlock' };
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));

    expect(res.status).toBe(500);
  });
});

describe('PortOne webhook — 알려진 결함 (수정 시 it 으로 전환)', () => {
  beforeEach(() => {
    mocks.payment = paidPayment();
    mocks.profile = { deleted_at: null };
    mocks.rpcResult = { receipt_id: 101 };
    mocks.rpcError = null;
    mocks.products = [];
    mocks.verifyWebhookSignature.mockReset().mockImplementation(() => false);
    mocks.verifyPortOnePayment.mockReset().mockImplementation(async () => mocks.payment);
    mocks.rpc.mockReset().mockImplementation(async () => ({ data: mocks.rpcResult, error: null }));
  });

  // U-03: 서명 검사 전에 READY 를 200 으로 반환한다.
  it.fails('서명 없는 READY 이벤트는 401 이어야 한다', async () => {
    const res = await POST(webhook({ paymentId: 'pay_1', status: 'READY' }, {}));
    expect(res.status).toBe(401);
  });

  // U-03: 공식 v2 봉투 {type, data:{paymentId}} 를 해석하지 못한다.
  it.fails('공식 v2 봉투 {type:"Transaction.Paid", data:{paymentId}} 의 paymentId 로 조회해야 한다', async () => {
    mocks.verifyWebhookSignature.mockImplementation(() => true);
    await POST(webhook({ type: 'Transaction.Paid', timestamp: '2026-09-26T00:00:00Z', data: { paymentId: 'pay_1' } }));
    expect(mocks.verifyPortOnePayment).toHaveBeenCalledWith('pay_1');
  });

  // U-02: 지급량을 결제 시 클라이언트가 넣은 customData 에서 그대로 믿는다(DB 상품 대조 없음).
  it.fails('customData 지급량이 DB 상품과 다르면 적립하지 않아야 한다', async () => {
    mocks.verifyWebhookSignature.mockImplementation(() => true);
    mocks.products = [{ id: 'STAR_100', price: 1000, star_candy: 100, bonus_amount: 0 }];
    mocks.payment = paidPayment({ starCandy: 1_000_000_000 });

    await POST(webhook({ paymentId: 'pay_1', status: 'PAID' }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('PortOne webhook 서명 검증 헬퍼 — 알려진 결함', () => {
  // U-03: PortOne v2 표준(webhook-id/timestamp/signature + raw body, Standard Webhooks) 이 아니라
  // JSON.stringify(payload) 의 HMAC 을 비교한다. 수정은 @portone/server-sdk Webhook.verify 전환(B-P2).
  it.fails('verifyWebhookSignature 는 표준 헤더(webhook-id·timestamp·signature)를 받아야 한다', async () => {
    const actual = await vi.importActual<typeof import('@/app/api/payment/portone/webhook/webhook-helpers')>(
      '@/app/api/payment/portone/webhook/webhook-helpers',
    );
    // 표준 방식은 (rawBody, headers) 형태의 3번째 이상 인자 또는 별도 verify 함수가 필요하다.
    expect(actual.verifyWebhookSignature.length).toBeGreaterThanOrEqual(3);
  });
});
