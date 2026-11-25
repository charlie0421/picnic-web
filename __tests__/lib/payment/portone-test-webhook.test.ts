// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => vi.fn());
vi.mock('@/lib/payment/portone-test/runtime', () => ({ createPortOneTestDependencies: runtime }));
import { reconcilePortOneTestWebhook } from '@/lib/payment/portone-test/webhook';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const PAYMENT = `web_${CONTEXT}`;
const scope = { merchant_id: 'merchant-test', store_id: 'store-test', channel_id: 'channel-test', channel_type: 'TEST' };
function fixture() {
  const context = { orderId: ORDER, provider: 'PORTONE', environment: 'TEST', currency: 'KRW', quantity: '1', amountMinor: '1000',
    contextId: CONTEXT, paymentId: PAYMENT, verificationBindingPresent: true, quoteId: ORDER, quoteHash: 'a'.repeat(64),
    settlementState: 'INTAKE_PENDING', submissionIntentRecorded: true, reviewRequired: false };
  const actual = { id: PAYMENT, transactionId: 'actual-v2-transaction', version: 'V2', status: 'PAID', merchantId: scope.merchant_id,
    storeId: scope.store_id, channel: { id: scope.channel_id, type: 'TEST', key: 'channel-key-test' },
    amount: { total: 1000, paid: 1000, cancelled: 0 }, currency: 'KRW', paidAt: '2026-11-25T00:00:00Z',
    customData: JSON.stringify({ version: 'v2', order_id: ORDER }) };
  const repository = { getWebhookOrder: vi.fn(async () => ({ actorUserId: USER, orderId: ORDER })),
    getChargeContext: vi.fn(async () => ({ kind: 'FOUND', context })),
    bindPaidObservation: vi.fn(async () => ({ kind: 'RECORDED', observationId: CONTEXT, replayed: true })),
    receivePurchase: vi.fn(async () => ({ kind: 'INTAKE_PENDING', replayed: true })),
    claimCharge: vi.fn(), recordSubmissionIntent: vi.fn(), prepareProviderContext: vi.fn() };
  const transport = { getPayment: vi.fn(async () => actual), confirmPayment: vi.fn() };
  const deps = { repository, transport, config: { ...scope, channelKey: 'channel-key-test', credentialRef: 'portone-test', bindingVersion: '1' },
    bindings: { getProviderBinding: vi.fn(async () => ({ ...context, billingCountry: 'KR', bindingVersion: '1', credentialRef: 'portone-test', scope })) },
    entry: { authorizeProviderEntry: vi.fn() }, nowMs: () => Date.parse('2026-11-25T00:01:00Z') };
  runtime.mockReturnValue(deps);
  return { repository, transport, deps, context, actual };
}
beforeEach(() => vi.clearAllMocks());
describe('PortOne TEST signed-webhook reconciliation entry', () => {
  it('resolves the actual owner and accepts repeatable native PAID intake without confirming', async () => {
    const h = fixture();
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(true);
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(true);
    expect(h.repository.getWebhookOrder).toHaveBeenCalledWith(PAYMENT);
    expect(h.repository.getChargeContext).toHaveBeenCalledWith(USER, ORDER);
    expect(h.repository.bindPaidObservation).toHaveBeenCalledTimes(2);
    expect(h.repository.bindPaidObservation.mock.calls[0]).toEqual(h.repository.bindPaidObservation.mock.calls[1]);
    expect(h.transport.confirmPayment).not.toHaveBeenCalled();
    expect(h.repository.claimCharge).not.toHaveBeenCalled();
    expect(h.repository.prepareProviderContext).not.toHaveBeenCalled();
    expect(h.deps.entry.authorizeProviderEntry).not.toHaveBeenCalled();
  });
  it('refuses missing owner, disabled config, mismatched payment and unverified pending status', async () => {
    let h = fixture(); h.repository.getWebhookOrder.mockResolvedValue(null as any);
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(false); expect(h.transport.getPayment).not.toHaveBeenCalled();
    h = fixture(); h.deps.config = null as any;
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(false); expect(h.repository.getWebhookOrder).not.toHaveBeenCalled();
    h = fixture(); h.context.paymentId = `web_${ORDER}`;
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(false); expect(h.transport.getPayment).not.toHaveBeenCalled();
    h = fixture(); h.actual.status = 'READY';
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(false); expect(h.repository.receivePurchase).not.toHaveBeenCalled();
  });
  it('returns false for native review/held evidence and permits transport failure to retry the webhook', async () => {
    const h = fixture(); h.repository.bindPaidObservation.mockResolvedValueOnce({ kind: 'REVIEW_REQUIRED' } as any);
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(false); expect(h.repository.receivePurchase).not.toHaveBeenCalled();
    h.transport.getPayment.mockRejectedValue(new Error('PORTONE_TEST_UNAVAILABLE'));
    await expect(reconcilePortOneTestWebhook(PAYMENT)).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
    expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
});
