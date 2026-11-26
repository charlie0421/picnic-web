// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handlePortOneHostedWebhook, verifyPortOneHostedWebhook } from '@/lib/payment/portone-hosted/webhook';

const PAYMENT = 'web_33333333-3333-4333-8333-333333333333';
const ORDER = '22222222-2222-4222-8222-222222222222';
const headers = new Headers({ 'webhook-id': 'delivery-1' });
const body = (type: string, paymentId = PAYMENT, storeId = 'store-1') =>
  JSON.stringify({ type, timestamp: '2026-11-25T00:00:00Z', data: { paymentId, storeId, transactionId: 'tx-hosted' } });
const receipt = (outcome: 'ACCEPTED' | 'IGNORED', reasonCode: string | null = null) => ({ outcome, reasonCode, replayed: false, orderId: outcome === 'ACCEPTED' ? ORDER : null });
function options(environment: 'TEST' | 'LIVE' | null, result: unknown = receipt('ACCEPTED')) {
  return { verify: vi.fn(async () => environment), receive: vi.fn(async () => result) };
}

describe('PortOne hosted signed webhook', () => {
  it('refuses a hosted Transaction.Confirm authorization request before verification or any generic acknowledgement', async () => {
    for (const environment of ['TEST', 'LIVE', null] as const) {
      const o = options(environment);
      const response = await handlePortOneHostedWebhook(body('Transaction.Confirm'), headers, o);
      expect(response?.status).toBe(409);
      expect(o.verify).not.toHaveBeenCalled(); expect(o.receive).not.toHaveBeenCalled();
    }
  });
  it('leaves legacy payment ids, unparsable bodies and deliveries no hosted secret verifies to the existing handler', async () => {
    let o = options('LIVE');
    expect(await handlePortOneHostedWebhook(body('Transaction.Paid', 'PAY_123'), headers, o)).toBeNull();
    expect(await handlePortOneHostedWebhook('not json', headers, o)).toBeNull();
    expect(o.receive).not.toHaveBeenCalled();
    o = options(null);
    expect(await handlePortOneHostedWebhook(body('Transaction.Paid'), headers, o)).toBeNull();
    expect(o.verify).toHaveBeenCalledWith(body('Transaction.Paid'), headers, 'store-1');
    expect(o.receive).not.toHaveBeenCalled();
  });
  it.each([
    ['Transaction.Ready', 'TRANSACTION_READY'], ['Transaction.PayPending', 'TRANSACTION_PAY_PENDING'],
    ['Transaction.VirtualAccountIssued', 'TRANSACTION_VIRTUAL_ACCOUNT_ISSUED'], ['Transaction.Paid', 'TRANSACTION_PAID'],
    ['Transaction.Failed', 'TRANSACTION_FAILED'], ['Transaction.PartialCancelled', 'TRANSACTION_PARTIAL_CANCELLED'],
    ['Transaction.Cancelled', 'TRANSACTION_CANCELLED'], ['Transaction.CancelPending', 'TRANSACTION_CANCEL_PENDING'],
    ['Transaction.DisputeCreated', 'OTHER'], ['Transaction.DisputeResolved', 'OTHER'],
  ])('submits %s as a durable unverified hint in the verified environment', async (type, eventType) => {
    for (const environment of ['TEST', 'LIVE'] as const) {
      const o = options(environment);
      const response = await handlePortOneHostedWebhook(body(type), headers, o);
      expect(response?.status).toBe(200);
      expect(o.receive).toHaveBeenCalledExactlyOnceWith({ contract_version: 'web-payment-portone-hosted-event.v1', source: 'WEBHOOK',
        environment, store_id: 'store-1', payment_id: PAYMENT, delivery_id: 'delivery-1', event_type: eventType });
    }
  });
  it('acknowledges only a definitive receipt and never treats it as payment proof', async () => {
    for (const reason of ['SCOPE_MISMATCH', 'NOT_OWNER', 'DELIVERY_CONFLICT']) {
      const response = await handlePortOneHostedWebhook(body('Transaction.Paid'), headers, options('LIVE', receipt('IGNORED', reason)));
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ received: true });
    }
    // A local TEST drill can share the store secret. Its web_ orders are not hosted orders and keep their own path.
    expect(await handlePortOneHostedWebhook(body('Transaction.Paid'), headers, options('TEST', receipt('IGNORED', 'UNKNOWN_PAYMENT')))).toBeNull();
  });
  it('asks PortOne to retry when the receipt RPC is unavailable or the environment is ambiguous', async () => {
    const failing = await handlePortOneHostedWebhook(body('Transaction.Paid'), headers,
      { verify: vi.fn(async () => 'LIVE' as const), receive: vi.fn(async () => { throw new Error('api-secret'); }) });
    expect(failing?.status).toBe(503);
    expect(await failing?.text()).not.toContain('api-secret');
    expect((await handlePortOneHostedWebhook(body('Transaction.Paid'), headers,
      { verify: vi.fn(async () => 'AMBIGUOUS' as const), receive: vi.fn() }))?.status).toBe(503);
  });
  it('rejects malformed hosted deliveries and unknown authorizing-capable types', async () => {
    const o = options('LIVE');
    // Without a canonical id and store there is no environment binding; the existing handler keeps its own checks.
    expect(await handlePortOneHostedWebhook(body('Transaction.Paid', 'web_not-a-uuid'), headers, o)).toBeNull();
    expect(await handlePortOneHostedWebhook(body('Transaction.Paid', PAYMENT, 'bad store'), headers, o)).toBeNull();
    expect(o.verify).not.toHaveBeenCalled();
    expect((await handlePortOneHostedWebhook(body('Transaction.Paid'), new Headers(), o))?.status).toBe(400);
    expect((await handlePortOneHostedWebhook(body('Transaction.SomethingNew'), headers, o))?.status).toBe(503);
    expect(o.receive).not.toHaveBeenCalled();
  });
});

describe('hosted webhook environment binding', () => {
  const verified = vi.fn();
  const channels = { environmentsForStore: (store: string) => (store === 'store-1' ? ['TEST', 'LIVE'] as const : []) };
  it('binds the environment by store and the single secret that verifies, never by guessing', async () => {
    const verify = vi.fn(async (secret: string) => { verified(secret); if (secret !== 'live-secret') throw new Error('invalid'); });
    const env = { PORTONE_HOSTED_WEBHOOK_SECRET__TEST: 'test-secret', PORTONE_HOSTED_WEBHOOK_SECRET__LIVE: 'live-secret' };
    expect(await verifyPortOneHostedWebhook('{}', headers, 'store-1', { channels, env, verify })).toBe('LIVE');
    expect(await verifyPortOneHostedWebhook('{}', headers, 'store-2', { channels, env, verify })).toBeNull();
    expect(await verifyPortOneHostedWebhook('{}', headers, 'store-1', { channels, env: {}, verify })).toBeNull();
    const both = vi.fn(async () => undefined);
    expect(await verifyPortOneHostedWebhook('{}', headers, 'store-1', { channels, env, verify: both })).toBe('AMBIGUOUS');
  });
});
