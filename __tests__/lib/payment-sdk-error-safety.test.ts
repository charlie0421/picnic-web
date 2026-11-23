import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sinks = vi.hoisted(() => ({ safeError: vi.fn() }));
vi.mock('@/utils/logger', () => ({ logger: { safeError: sinks.safeError } }));

describe('browser payment failures preserve results without adding error events', () => {
  beforeEach(() => {
    vi.resetModules();
    sinks.safeError.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store_fixture');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel_fixture');
    delete window.PortOne;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete window.PortOne;
  });
  function expectNoEvent() {
    expect(sinks.safeError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  }

  it('uses a fixed message for an unavailable PayPal quote without a browser error event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Q7pPriv' }, { status: 503 })));
    const { createQuotedPayPalOrder } = await import('@/lib/payment/paypal-order-browser');
    await expect(createQuotedPayPalOrder({ productId: 'STAR_100', billingCountry: 'US',
      requestId: 'decc5ea0-6c2b-4b08-8cd9-a6709a5e217f', acceptedPolicyVersion: 'fixture' }, 'SANDBOX'))
      .rejects.toThrow('WEB_PAYPAL_ORDER_UNAVAILABLE');
    expectNoEvent();
  });
  it('PortOne SDK cancellation rejection keeps the existing UI error without an extra browser event', async () => {
    window.PortOne = { requestPayment: vi.fn().mockRejectedValue(new Error('Payment cancelled')) };
    const { portOneService } = await import('@/lib/payment/portone');
    expect(await portOneService.requestPayment({ paymentId: 'pay_fixture', orderName: 'Star', totalAmount: 1000, currency: 'KRW', payMethod: 'CARD', customer: { userId: 'user_fixture', fullName: 'Fixture', email: 'private@example.invalid' }, productInfo: { id: 'STAR_100', name: 'Star', starCandy: 100, bonusAmount: 0 } })).toEqual({ success: false, error: { code: 'PAYMENT_ERROR', message: 'Payment cancelled' } });
    expectNoEvent();
  });
  it('PortOne verification network failure remains false without an extra browser event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Q7pPriv')));
    const { portOneService } = await import('@/lib/payment/portone');
    expect(await portOneService.verifyPayment('pay_fixture')).toBe(false);
    expectNoEvent();
  });
  it('PortOne SDK load failure remains false without an extra browser event', async () => {
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      (node as HTMLScriptElement).dispatchEvent(new Event('error'));
      return node;
    });
    const { portOneService } = await import('@/lib/payment/portone');
    expect(await portOneService.initialize()).toBe(false);
    expectNoEvent();
  });
});
