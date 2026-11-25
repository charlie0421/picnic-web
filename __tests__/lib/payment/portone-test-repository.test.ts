// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';
import { createPortOneTestBindings } from '@/lib/payment/portone-test/repository';

const ORDER = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
// A database before the v2 rollout has no binding v2 function, so the adapter reads the v1 service.
function client(data: unknown) {
  const rpc = vi.fn((name: string) => ({ retry: (retry: boolean) => { expect(retry).toBe(false); return {
    abortSignal: async () => (name === 'get_web_payment_provider_binding_v2'
      ? { data: null, error: { code: 'PGRST202', message: 'missing' }, status: 404 } : { data, error: null, status: 200 }),
  }; } }));
  return { rpc };
}
describe('PortOne native RPC adapter', () => {
  it('uses CONFIRM explicitly and preserves the default CAPTURE behavior', async () => {
    for (const action of [undefined, 'CONFIRM'] as const) {
      const c = client({ decision: 'BLOCKED', safe_reason_code: 'ACTOR_NOT_ALLOWED' });
      const repository = createWebPaymentChargeRepository(c as any, action);
      await repository.claimCharge(USER, ORDER, '1');
      await repository.recordSubmissionIntent(USER, ORDER, '1', { attemptId: ORDER, leaseToken: USER, fencingVersion: '1',
        rowVersion: '1', providerRequestKey: USER, submitNotAfter: '2026-11-25T01:00:00Z', quoteHash: 'a'.repeat(64) });
      expect(c.rpc.mock.calls.map((call: any) => call[1].p_action)).toEqual([action ?? 'CAPTURE', action ?? 'CAPTURE']);
    }
  });
  it('rejects PAYPAL and unexpected PORTONE application data from the binding RPC', async () => {
    // The v1 fallback must prove the canonical legacy document. These are the primary DB legacy vector values.
    const wire = { contract_version: 'web-payment-provider-binding.v1', outcome: 'FOUND', charge_authority: false,
      order_id: ORDER, context_id: USER, quote_id: ORDER, quote_hash: 'a'.repeat(64), provider: 'PORTONE', environment: 'TEST',
      billing_country: 'KR', scope: { merchant_id: 'fixture-portone-merchant', store_id: 'fixture-store', channel_id: 'fixture-channel', channel_type: 'TEST' },
      binding_id: 'd1ca0003-0000-4000-8000-000000000002', binding_version: '1',
      binding_hash: '3865ac5115fa1c9b688d240aefc6f1d9bcecea58c2e7d5ada36fd7df1445d52f',
      credential_ref: 'fixture.durability.portone', expected_application: null };
    expect(await createPortOneTestBindings(client(wire) as any).getProviderBinding(USER, ORDER)).toMatchObject({ provider: 'PORTONE', environment: 'TEST' });
    for (const changed of [{ provider: 'PAYPAL' }, { expected_application: {} }, { environment: 'LIVE' }]) {
      await expect(createPortOneTestBindings(client({ ...wire, ...changed }) as any).getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    }
  });
});
