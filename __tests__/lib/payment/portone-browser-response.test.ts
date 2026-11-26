import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = {
  paymentId: 'order-fixture',
  orderName: '별사탕',
  totalAmount: 1700,
  currency: 'KRW' as const,
  customer: { userId: 'user-fixture', fullName: '테스트', email: 'buyer@example.invalid' },
  productInfo: { id: 'STAR_100', name: '별사탕', starCandy: 100, bonusAmount: 0 },
};

describe('PortOne browser SDK response', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'fixture-store');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'fixture-channel');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected network call'))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function handle(reply: object) {
    vi.stubGlobal('PortOne', { requestPayment: vi.fn().mockResolvedValue(reply) });
    const { portOneService } = await import('@/lib/payment/portone');
    return portOneService.requestPaymentAuto(request);
  }

  it.each([
    ['omitted', { paymentId: 'order-fixture' }],
    ['null', { paymentId: 'order-fixture', code: null }],
  ] as const)('recognizes the matching payment ID with %s error code', async (_kind, reply) => {
    expect(await handle(reply)).toMatchObject({ success: true, paymentId: 'order-fixture' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an SDK response belonging to another payment', async () => {
    expect(await handle({ paymentId: 'different-order', code: null })).toMatchObject({ success: false });
  });

  it('keeps the PortOne V2 attempt ID from the matching payment response', async () => {
    expect(await handle({ transactionType: 'PAYMENT', paymentId: request.paymentId, txId: 'attempt-001' }))
      .toEqual({ success: true, paymentId: request.paymentId, transactionId: 'attempt-001' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps an authorization awaiting manual approval out of the success path', async () => {
    const result = await handle({ paymentId: 'order-fixture', paymentToken: 'fixture-token' });
    expect(result).toMatchObject({ success: false, error: { code: 'PAYMENT_REQUIRES_CONFIRMATION' } });
    expect(JSON.stringify(result)).not.toContain('fixture-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves an SDK refusal even when the payment ID matches', async () => {
    expect(await handle({ paymentId: 'order-fixture', code: 'USER_CANCEL', message: '취소' }))
      .toEqual({ success: false, error: { code: 'USER_CANCEL', message: '취소' } });
  });
});
