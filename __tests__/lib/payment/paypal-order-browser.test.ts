import { describe, expect, it, vi } from 'vitest';
import type { PayPalChargeBrowserDto } from '@/lib/payment/paypal-charge/orchestrator';
import { createPayPalOrderActions, createQuotedPayPalOrder } from '@/lib/payment/paypal-order-browser';

const ORDER = 'decc5ea0-6c2b-4b08-8cd9-a6709a5e217f';
const PROVIDER = '1P746844G7552750R';

function harness(capture: PayPalChargeBrowserDto['state'] = 'INTAKE_PENDING') {
  const api = vi.fn(async (action: string) => {
    const state = action === 'provider-order' ? 'PROVIDER_ORDER_READY'
      : action === 'capture' ? capture : 'SUBMISSION_UNKNOWN';
    return { contractVersion: 'web-payment-charge.v1', orderId: ORDER, newOrderAllowed: false, state,
      ...(action === 'provider-order' && { providerOrderId: PROVIDER }) } as const;
  });
  const notify = vi.fn();
  const actions = createPayPalOrderActions(api, notify);
  return { api, actions, notify };
}

describe('PayPal approval callback wiring', () => {
  it('captures the linked order once after onApprove, with no charge on order creation', async () => {
    const { actions, api, notify } = harness();
    await expect(actions.createOrder()).resolves.toBe(PROVIDER);
    expect(api.mock.calls).toEqual([['provider-order']]);
    await Promise.all([actions.approve(PROVIDER), actions.approve(PROVIDER)]);
    expect(api.mock.calls).toEqual([['provider-order'], ['capture', PROVIDER]]);
    expect(notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ state: 'INTAKE_PENDING' }));
  });

  it('reconciles a cancellation and ignores later approval instead of capturing', async () => {
    const { actions, api } = harness();
    await actions.createOrder();
    await actions.cancel();
    await actions.approve(PROVIDER);
    expect(api.mock.calls).toEqual([['provider-order'], ['reconcile']]);
  });

  it('reconciles a mismatched approval without capturing', async () => {
    const { actions, api } = harness();
    await actions.createOrder();
    await actions.approve('OTHER');
    expect(api.mock.calls).toEqual([['provider-order'], ['reconcile']]);
  });

  it('keeps an ambiguous capture indeterminate and uses reconciliation on cleanup', async () => {
    const { actions, api, notify } = harness();
    await actions.createOrder();
    api.mockRejectedValueOnce(new Error('lost ACK'));
    await actions.approve(PROVIDER);
    await actions.cancel();
    expect(api.mock.calls).toEqual([['provider-order'], ['capture', PROVIDER], ['reconcile']]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ state: 'SUBMISSION_UNKNOWN' }));
  });

  it('sends only quote request inputs and rejects a quote for the wrong environment', async () => {
    const request = { productId: 'STAR_100', billingCountry: 'US', requestId: ORDER, acceptedPolicyVersion: 'v1' };
    const fetcher = vi.fn(async () => Response.json({
      contractVersion: 'web-payment-order.v1', orderId: ORDER,
      quote: { environment: 'LIVE', provider: 'paypal', currency: 'USD', productId: 'STAR_100', productName: 'Star',
        amountMinor: '100', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    }));
    await expect(createQuotedPayPalOrder(request, 'SANDBOX', fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/payment/orders', expect.objectContaining({
      body: JSON.stringify({ ...request, provider: 'paypal' }),
    }));
  });
});
