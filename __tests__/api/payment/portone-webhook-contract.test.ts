import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PortOne 웹훅 계약 테스트 (docs/audit-2026-09-26/tests-security.md §3.3, 이슈 #77).
 *
 * 서명은 mock 하지 않는다. 테스트용 시크릿으로 Standard Webhooks 서명을 실제로 만들어 보내고,
 * 라우트가 @portone/server-sdk 의 Webhook.verify 로 원문(raw body)을 검증하는지 본다.
 * 외부 호출(PortOne SDK 조회·적립 RPC)과 DB 는 mock 으로 호출 횟수까지 검증한다.
 */
const mocks = vi.hoisted(() => ({
  payment: null as Record<string, unknown> | null,
  verifyError: null as Error | null,
  profile: { deleted_at: null } as { deleted_at: string | null },
  profileError: null as { message: string; code?: string } | null,
  product: null as Record<string, unknown> | null,
  productError: null as { message: string; code?: string } | null,
  productQueries: [] as Array<{ column: string; value: unknown }>,
  rpcResult: { receipt_id: 101 } as unknown,
  rpcError: null as { message: string; code?: string } | null,
  verifyPortOnePayment: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/app/api/payment/portone/webhook/webhook-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/payment/portone/webhook/webhook-helpers')>();
  return {
    ...actual,
    verifyPortOnePayment: mocks.verifyPortOnePayment,
    createServiceRoleSupabaseClient: () => ({
      from: (table: string) => {
        const b: Record<string, unknown> = {};
        Object.assign(b, {
          select: () => b,
          eq: (column: string, value: unknown) => {
            if (table === 'products') mocks.productQueries.push({ column, value });
            return b;
          },
          single: async () =>
            mocks.profileError ? { data: null, error: mocks.profileError } : { data: mocks.profile, error: null },
          maybeSingle: async () =>
            mocks.productError ? { data: null, error: mocks.productError } : { data: mocks.product, error: null },
        });
        return b;
      },
      rpc: mocks.rpc,
    }),
  };
});

import { POST } from '@/app/api/payment/portone/webhook/route';

const USER = '00000000-0000-0000-0000-000000000001';
const SECRET = `whsec_${randomBytes(32).toString('base64')}`;
const OTHER_SECRET = `whsec_${randomBytes(32).toString('base64')}`;

// SDK 의 PaidPayment 형식(id, amount.total, paidAt, method.type)
const paidPayment = (customData: Record<string, unknown> = {}) => ({
  id: 'pay_1',
  status: 'PAID',
  amount: { total: 1000, paid: 1000 },
  currency: 'KRW',
  method: { type: 'PaymentMethodCard' },
  paidAt: '2026-10-17T00:00:00Z',
  customData: JSON.stringify({ userId: USER, productId: 'STAR_100', starCandy: 100, bonusAmount: 10, ...customData }),
});

const product = () => ({ id: 'STAR_100', web_price_krw: 1000, star_candy: 100, web_bonus_amount: 10 });

const paidEvent = (paymentId: unknown = 'pay_1') => ({
  type: 'Transaction.Paid',
  timestamp: '2026-10-17T00:00:00Z',
  data: { paymentId, storeId: 'store-1', transactionId: 'tx_1' },
});

function sign(secret: string, id: string, timestamp: string, rawBody: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
}

type SendOptions = { secret?: string; timestamp?: number; headers?: Record<string, string> | null; sentBody?: string };

/** rawBody 에 서명해 보낸다. sentBody 를 주면 서명한 본문과 다른 본문을 보낸다. */
function webhook(body: unknown, options: SendOptions = {}) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signed =
    options.headers === null
      ? {}
      : options.headers ?? {
          'webhook-id': 'msg_1',
          'webhook-timestamp': timestamp,
          'webhook-signature': sign(options.secret ?? SECRET, 'msg_1', timestamp, rawBody),
        };
  return new NextRequest('https://www.picnic.fan/api/payment/portone/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...signed },
    body: options.sentBody ?? rawBody,
  });
}

beforeEach(() => {
  vi.stubEnv('PORTONE_WEBHOOK_SECRET', SECRET);
  mocks.payment = paidPayment();
  mocks.verifyError = null;
  mocks.profile = { deleted_at: null };
  mocks.profileError = null;
  mocks.product = product();
  mocks.productError = null;
  mocks.productQueries = [];
  mocks.rpcResult = { receipt_id: 101 };
  mocks.rpcError = null;
  mocks.verifyPortOnePayment.mockReset().mockImplementation(async () => {
    if (mocks.verifyError) throw mocks.verifyError;
    return mocks.payment;
  });
  mocks.rpc.mockReset().mockImplementation(async () => ({ data: mocks.rpcResult, error: mocks.rpcError }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PortOne webhook — 서명 검증 (Standard Webhooks, #77)', () => {
  it('올바른 서명의 Transaction.Paid 를 받아 SDK 로 조회하고 1회 적립한다', async () => {
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(200);
    expect(mocks.verifyPortOnePayment).toHaveBeenCalledWith('pay_1');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe('process_portone_capture');
  });

  it('다른 시크릿으로 만든 서명은 401, 조회·적립 0', async () => {
    const res = await POST(webhook(paidEvent(), { secret: OTHER_SECRET }));

    expect(res.status).toBe(401);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('webhook-* 헤더가 없으면 401', async () => {
    const res = await POST(webhook(paidEvent(), { headers: null }));

    expect(res.status).toBe(401);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });

  it('예전 x-portone-signature 헤더만 있으면 401', async () => {
    const res = await POST(webhook(paidEvent(), { headers: { 'x-portone-signature': 'abc' } }));

    expect(res.status).toBe(401);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });

  it('타임스탬프가 5분보다 오래되면 401', async () => {
    const res = await POST(webhook(paidEvent(), { timestamp: Math.floor(Date.now() / 1000) - 600 }));

    expect(res.status).toBe(401);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });

  it('서명한 원문과 다르게 직렬화된 본문은 401 이다(재직렬화 금지)', async () => {
    const raw = '{ "type": "Transaction.Paid", "data": { "paymentId": "pay_1" } }';
    const res = await POST(webhook(raw, { sentBody: JSON.stringify(JSON.parse(raw)) }));

    expect(res.status).toBe(401);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });

  it('공백이 있는 원문도 그 원문 그대로 서명했으면 통과한다', async () => {
    const raw = '{ "type": "Transaction.Paid", "data": { "paymentId": "pay_1" } }';
    const res = await POST(webhook(raw));

    expect(res.status).toBe(200);
    expect(mocks.verifyPortOnePayment).toHaveBeenCalledWith('pay_1');
  });

  it('시크릿이 설정되지 않았으면 500(설정 후 재시도), 조회 0', async () => {
    vi.stubEnv('PORTONE_WEBHOOK_SECRET', '');
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(500);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });

  it('서명 없는 READY 이벤트도 401 이다', async () => {
    const res = await POST(webhook({ type: 'Transaction.Ready', data: { paymentId: 'pay_1' } }, { headers: null }));

    expect(res.status).toBe(401);
  });
});

describe('PortOne webhook — 본문 형식', () => {
  it.each([
    ['Transaction.Ready', { type: 'Transaction.Ready', data: { paymentId: 'pay_1' } }],
    ['Transaction.Cancelled', { type: 'Transaction.Cancelled', data: { paymentId: 'pay_1' } }],
    ['BillingKey.Issued', { type: 'BillingKey.Issued', data: { billingKey: 'bk_1' } }],
  ])('%s 는 200 이고 조회·적립하지 않는다', async (_label, body) => {
    const res = await POST(webhook(body));

    expect(res.status).toBe(200);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('Transaction.Paid 에 paymentId 가 없으면 400 이고, 받은 본문을 응답으로 되돌려주지 않는다', async () => {
    const res = await POST(
      webhook({ type: 'Transaction.Paid', data: { customer: { email: 'buyer@example.com' }, memo: 'cnry-webhook-body' } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing paymentId' });
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });

  it('2024-01-01 형식 {payment_id, status:"Paid"} 도 payment_id 로 조회한다', async () => {
    const res = await POST(webhook({ tx_id: 'tx_1', payment_id: 'pay_1', status: 'Paid' }));

    expect(res.status).toBe(200);
    expect(mocks.verifyPortOnePayment).toHaveBeenCalledWith('pay_1');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('2024-01-01 형식의 Ready 는 200 이고 조회하지 않는다', async () => {
    const res = await POST(webhook({ tx_id: 'tx_1', payment_id: 'pay_1', status: 'Ready' }));

    expect(res.status).toBe(200);
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
  });
});

describe('PortOne webhook — 적립량은 DB 상품이 정한다 (B-P1)', () => {
  it('지급량·금액·영수증을 DB 상품과 SDK 조회 결과로 채운다', async () => {
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(200);
    expect(mocks.productQueries).toEqual([{ column: 'id', value: 'STAR_100' }]);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_user_id: USER,
      p_payment_id: 'pay_1',
      p_product_id: 'STAR_100',
      p_star_candy: 100,
      p_bonus_amount: 10,
      p_total_amount: 1000,
      p_currency: 'KRW',
      p_status: 'PAID',
      p_method: 'PaymentMethodCard',
      p_receipt_data: { payment_id: 'pay_1', amount: 1000, currency: 'KRW', approvedAt: '2026-10-17T00:00:00Z' },
    });
  });

  it('customData 의 지급량을 부풀려도 DB 상품의 지급량만 적립한다', async () => {
    mocks.payment = paidPayment({ starCandy: 1_000_000_000, bonusAmount: 1_000_000_000 });
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_star_candy: 100, p_bonus_amount: 10 });
  });

  it('결제 금액이 상품 가격과 다르면 400 무적립', async () => {
    mocks.payment = { ...paidPayment(), amount: { total: 100, paid: 100 } };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('통화가 KRW 가 아니면 400 무적립', async () => {
    mocks.payment = { ...paidPayment(), currency: 'USD' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('상품이 없으면 400 무적립', async () => {
    mocks.product = null;
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('상품에 원화 가격이 없으면 400 무적립', async () => {
    mocks.product = { ...product(), web_price_krw: null };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('상품 조회가 실패하면 500(재시도 유도), 적립 0', async () => {
    mocks.productError = { message: 'timeout' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('PortOne webhook — 유지되는 계약', () => {
  it('본문의 금액이 아니라 SDK 조회 결과의 금액으로 적립한다', async () => {
    const res = await POST(webhook({ ...paidEvent(), data: { paymentId: 'pay_1', totalAmount: 1 } }));

    expect(res.status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_total_amount: 1000 });
  });

  it('SDK 조회 상태가 PAID 가 아니면 200 무적립', async () => {
    mocks.payment = { ...paidPayment(), status: 'CANCELLED' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('SDK 조회 실패는 502(재시도 유도), 본문 데이터로 적립하지 않는다', async () => {
    mocks.verifyError = new Error('PortOne down');
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(502);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('customData 에 userId 가 없으면 400 무적립', async () => {
    mocks.payment = { ...paidPayment(), customData: JSON.stringify({ productId: 'STAR_100' }) };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('탈퇴 사용자는 403 무적립', async () => {
    mocks.profile = { deleted_at: '2026-01-01T00:00:00Z' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('탈퇴 여부 조회가 실패하면 500(재시도 유도), 적립 0', async () => {
    mocks.profileError = { message: 'timeout' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('프로필 행이 아직 없으면(PGRST116) 탈퇴가 아니므로 적립을 진행한다', async () => {
    mocks.profileError = { code: 'PGRST116', message: 'no rows' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('RPC 가 NULL(이미 처리됨)이면 200 멱등 응답', async () => {
    mocks.rpcResult = null;
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Already processed');
  });

  it('RPC 일시 실패는 500(재시도 유도)', async () => {
    mocks.rpcError = { message: 'deadlock' };
    const res = await POST(webhook(paidEvent()));

    expect(res.status).toBe(500);
  });

  describe('actual route diagnostic context', () => {
    const PRIVATE = 'Q7pPriv private-buyer@example.invalid';
    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
    afterEach(() => vi.restoreAllMocks());
    function checkRecord(code: string, context: Record<string, unknown>) {
      const records = vi.mocked(console.error).mock.calls.flat() as Array<{ message?: string; context?: unknown }>;
      expect(records.find((record) => record?.message === code)?.context).toMatchObject(context);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Q7pPriv');
    }
    it('RPC failure retains payment, user, product and database code without exception details', async () => {
      mocks.rpcError = { code: '23505', message: PRIVATE };
      const response = await POST(webhook(paidEvent()));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('Q7pPriv');
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      checkRecord('payment.portone.webhook.capture.failed', { paymentId: 'pay_1', userId: USER, productId: 'STAR_100', errorCode: '23505' });
    });
    it('provider verification failure retains payment ID without exception details', async () => {
      mocks.verifyError = new Error(PRIVATE);
      const response = await POST(webhook(paidEvent()));
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain('Q7pPriv');
      expect(mocks.rpc).not.toHaveBeenCalled();
      checkRecord('payment.portone.webhook.verification.failed', { paymentId: 'pay_1' });
    });
    it('amount mismatch retains payment, product, amount and currency', async () => {
      mocks.payment = { ...paidPayment(), amount: { total: 100, paid: 100 } };
      const response = await POST(webhook(paidEvent()));
      expect(response.status).toBe(400);
      checkRecord('payment.portone.webhook.amount.failed', { paymentId: 'pay_1', productId: 'STAR_100', amount: 100, currency: 'KRW' });
    });
  });
});
