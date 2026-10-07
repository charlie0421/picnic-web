import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sinks = vi.hoisted(() => ({ safeError: vi.fn(), loadScript: vi.fn() }));
vi.mock('@/utils/logger', () => ({ logger: { safeError: sinks.safeError } }));
vi.mock('@paypal/paypal-js', () => ({ loadScript: sinks.loadScript }));

describe('browser payment failures preserve results without adding error events', () => {
  beforeEach(() => {
    vi.resetModules();
    sinks.safeError.mockReset();
    sinks.loadScript.mockReset();
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

  it('PayPal popup cancellation keeps the capture rejection without an extra browser event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Failed to capture PayPal order' }), { status: 500 })));
    const { payPalService } = await import('@/lib/payment/paypal');
    await expect(payPalService.captureOrder('ORDER-CANCELLED')).rejects.toThrow('Failed to capture PayPal order');
    expectNoEvent();
  });
  it('PayPal create rejection reaches the caller without an extra browser event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Q7pPriv')));
    const { payPalService } = await import('@/lib/payment/paypal');
    await expect(payPalService.createOrder({ productId: 'STAR_100', productName: 'Star', amount: 1, starCandy: 100, bonusAmount: 0, userId: 'user_fixture', userEmail: 'private@example.invalid' })).rejects.toThrow('Q7pPriv');
    expectNoEvent();
  });
  it('PayPal SDK load failure remains false without an extra browser event', async () => {
    sinks.loadScript.mockRejectedValue(new Error('Q7pPriv'));
    const { payPalService } = await import('@/lib/payment/paypal');
    expect(await payPalService.initialize()).toBe(false);
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
