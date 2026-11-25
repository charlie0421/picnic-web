// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { checkoutPortOneTest, confirmPortOneTest, getPortOneTestStatus } from '@/lib/payment/portone-test/service';
import { readPortOneTestConfig } from '@/lib/payment/portone-test/config';
import { createPortOneTestTransport } from '@/lib/payment/portone-test/transport';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const PAYMENT = `web_${CONTEXT}`;
const HASH = 'a'.repeat(64);
const NOW = Date.parse('2026-11-25T00:00:00Z');
const DEADLINE = '2026-11-25T00:01:00Z';
const scope = { merchant_id: 'merchant-test', store_id: 'store-test', channel_id: 'channel-test', channel_type: 'TEST' };
const config = { ...scope, channelKey: 'channel-key-test', method: 'CARD', credentialRef: 'portone-test', bindingVersion: '1', apiSecret: 'fixture-secret' };
const input = { actorUserId: USER, orderId: ORDER };
const approval = { ...input, txId: 'tx-test', paymentToken: 'private-token' };
function payment(status = 'READY') {
  return { id: PAYMENT, transactionId: 'tx-test', version: 'V2', status, merchantId: scope.merchant_id,
    storeId: scope.store_id, channel: { id: scope.channel_id, type: 'TEST', key: config.channelKey },
    customData: JSON.stringify({ version: 'v2', order_id: ORDER }), paidAt: status === 'PAID' ? '2026-11-25T00:00:00Z' : undefined,
    amount: { total: 1000, paid: status === 'PAID' ? 1000 : 0, cancelled: 0 }, currency: 'KRW' };
}
function harness() {
  const context = { chargeAuthority: false, orderId: ORDER, provider: 'PORTONE', environment: 'TEST', rowVersion: '1',
    paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE', actorDeleted: false,
    quoteId: ORDER, quoteHash: HASH, productId: 'STAR_100', amountMinor: '1000', currency: 'KRW', quantity: '1',
    quoteExpiresAt: DEADLINE, contextId: CONTEXT, verificationBindingPresent: true, paymentId: PAYMENT,
    providerOrderId: null, providerCaptureId: null, attemptId: null, submissionIntentRecorded: false, reviewRequired: false };
  const lease = { attemptId: ORDER, leaseToken: CONTEXT, fencingVersion: '1', rowVersion: '2', providerRequestKey: USER,
    submitNotAfter: DEADLINE, quoteHash: HASH };
  const repository = {
    getChargeContext: vi.fn(async () => ({ kind: 'FOUND', context: { ...context } })),
    prepareProviderContext: vi.fn(async () => ({ kind: 'PREPARED', replayed: true, contextId: CONTEXT, orderId: ORDER,
      quoteId: ORDER, quoteHash: HASH, provider: 'PORTONE', environment: 'TEST', scope, settingsVersion: '1', createRequestKey: USER, paymentId: PAYMENT })),
    claimCharge: vi.fn(async () => ({ kind: 'SUBMIT', reason: 'LEASE_CLAIMED', lease })),
    recordSubmissionIntent: vi.fn(async () => { context.submissionIntentRecorded = true; context.paymentState = 'SUBMISSION_UNKNOWN';
      return { kind: 'SUBMIT', reason: 'INTENT_RECORDED', lease: { ...lease, rowVersion: '3' } }; }),
    bindPaidObservation: vi.fn(async () => ({ kind: 'RECORDED', observationId: CONTEXT, replayed: false })),
    receivePurchase: vi.fn(async () => ({ kind: 'INTAKE_PENDING', grantEligible: false })),
  };
  const binding = { orderId: ORDER, contextId: CONTEXT, quoteId: ORDER, quoteHash: HASH, provider: 'PORTONE', environment: 'TEST',
    billingCountry: 'KR', scope, bindingId: USER, bindingVersion: '1', bindingHash: HASH, credentialRef: 'portone-test' };
  const deps = { repository, config, bindings: { getProviderBinding: vi.fn(async () => binding) },
    entry: { authorizeProviderEntry: vi.fn(async () => ({ kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT,
      createRequestKey: USER, quoteHash: HASH, bindingHash: HASH, entryNotAfter: DEADLINE })) },
    transport: { getPayment: vi.fn(async () => payment()), confirmPayment: vi.fn(async () => undefined) }, nowMs: () => NOW };
  return { deps: deps as any, repository, context, lease, binding, transport: deps.transport, entry: deps.entry };
}

describe('PortOne TEST server checkout', () => {
  it('requires local runtime, the explicit switch and named complete TEST credentials', () => {
    const env = { NODE_ENV: 'test', PORTONE_TEST_CHECKOUT_ENABLED: 'true', PORTONE_TEST_API_SECRET: 'fixture-secret',
      PORTONE_TEST_CHANNEL_CONFIG: JSON.stringify({ ...scope, channelKey: config.channelKey, method: 'CARD', credentialRef: 'portone-test', bindingVersion: '1' }) };
    expect(readPortOneTestConfig(env)).toMatchObject(config);
    for (const changed of [{ NODE_ENV: 'production' }, { PORTONE_TEST_CHECKOUT_ENABLED: 'false' },
      { PORTONE_TEST_API_SECRET: '' }, { VERCEL_ENV: 'preview' }, { PORTONE_TEST_CHANNEL_CONFIG: '{}' }]) {
      expect(readPortOneTestConfig({ ...env, ...changed })).toBeNull();
    }
    expect(readPortOneTestConfig({ NODE_ENV: 'test', PORTONE_API_SECRET: 'legacy' })).toBeNull();
  });
  it('releases a frozen checkout only after a repeatable real entry decision', async () => {
    const h = harness();
    for (let i = 0; i < 2; i++) expect(await checkoutPortOneTest(h.deps, input)).toEqual({ state: 'READY', orderId: ORDER,
      paymentId: PAYMENT, storeId: scope.store_id, channelKey: config.channelKey, method: 'CARD', productId: 'STAR_100',
      totalAmount: 1000, currency: 'KRW', expiresAt: DEADLINE });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(2);
    expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it.each(['ACTOR_NOT_ALLOWED', 'PROVIDER_SCOPE_CHANGED', 'VERIFICATION_BINDING_CHANGED'])('holds revoked role/scope: %s', async reason => {
    const h = harness(); h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'BLOCKED', reason } as any);
    expect(await checkoutPortOneTest(h.deps, input)).toEqual({ state: 'BLOCKED', orderId: ORDER });
    expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it('does not reveal checkout to another owner or a mismatched frozen binding', async () => {
    const h = harness(); h.repository.getChargeContext.mockResolvedValueOnce({ kind: 'NOT_FOUND' } as any);
    expect(await checkoutPortOneTest(h.deps, input)).toEqual({ state: 'BLOCKED', orderId: ORDER });
    h.binding.scope = { ...scope, store_id: 'other-store' };
    expect(await checkoutPortOneTest(h.deps, input)).toEqual({ state: 'BLOCKED', orderId: ORDER });
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled();
  });
  it.each([
    { channel: undefined }, { channel: { id: scope.channel_id, type: 'TEST' } }, { transactionId: 'other-tx' },
    { storeId: 'other' }, { merchantId: 'other' }, { version: 'V1' }, { status: 'PENDING' }, { currency: 'USD' },
    { customData: JSON.stringify({ version: 'v2', order_id: ORDER, user_id: USER }) }, { amount: { total: 1001 } },
  ])('never claims or submits a malformed or mismatched preconfirm observation %j', async changed => {
    const h = harness(); h.transport.getPayment.mockResolvedValue({ ...payment(), ...changed } as any);
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('BLOCKED');
    expect(h.repository.claimCharge).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('performs one POST after intent and never treats its response as paid', async () => {
    const h = harness();
    expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.transport.confirmPayment).toHaveBeenCalledExactlyOnceWith(config, PAYMENT,
      { storeId: scope.store_id, txId: 'tx-test', paymentToken: 'private-token', totalAmount: 1000, currency: 'KRW', isTest: true });
    expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
    expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.transport.confirmPayment).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.repository.claimCharge.mock.calls) + JSON.stringify(h.repository.recordSubmissionIntent.mock.calls)).not.toContain('private-token');
  });
  it('does not POST again after a provider timeout, including a router replay', async () => {
    const h = harness(); h.transport.confirmPayment.mockRejectedValue(new Error('private-token fixture-secret'));
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('PENDING');
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('PENDING');
    expect(h.transport.confirmPayment).toHaveBeenCalledTimes(1);
  });
  it('closes a failed preconfirm GET before native claim or any provider POST', async () => {
    const h = harness(); h.transport.getPayment.mockRejectedValue(new Error('PORTONE_TEST_UNAVAILABLE'));
    expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
    expect(h.repository.claimCharge).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('uses the native lease to prevent two simultaneous router requests from confirming twice', async () => {
    const h = harness();
    h.repository.claimCharge.mockResolvedValueOnce({ kind: 'SUBMIT', reason: 'LEASE_CLAIMED', lease: h.lease })
      .mockResolvedValue({ kind: 'BLOCKED', reason: 'LEASE_ACTIVE' } as any);
    const results = await Promise.all([confirmPortOneTest(h.deps, approval), confirmPortOneTest(h.deps, approval)]);
    expect(results.every(result => result.state === 'PENDING')).toBe(true);
    expect(h.transport.confirmPayment).toHaveBeenCalledTimes(1);
  });
  it('rechecks the live deadline after native intent commits', async () => {
    const h = harness(); let now = NOW; h.deps.nowMs = () => now;
    const original = h.repository.recordSubmissionIntent.getMockImplementation()!;
    h.repository.recordSubmissionIntent.mockImplementation(async () => { const result = await original(); now += 120000; return result; });
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('BLOCKED');
    expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('LOOKUP_ONLY and an active non-owner lease never submit', async () => {
    for (const command of [{ kind: 'LOOKUP_ONLY' }, { kind: 'BLOCKED', reason: 'LEASE_ACTIVE' }]) {
      const h = harness(); h.repository.claimCharge.mockResolvedValue(command as any);
      expect((await confirmPortOneTest(h.deps, approval)).state).toBe('PENDING');
      expect(h.transport.confirmPayment).not.toHaveBeenCalled();
    }
  });
  it('recovers an intent LOOKUP_ONLY decision through independent GET without submitting', async () => {
    const h = harness(); h.repository.recordSubmissionIntent.mockResolvedValue({ kind: 'LOOKUP_ONLY' } as any);
    h.transport.getPayment.mockResolvedValueOnce(payment()).mockResolvedValueOnce(payment('PAID'));
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('PENDING');
    expect(h.transport.getPayment).toHaveBeenCalledTimes(2);
    expect(h.repository.bindPaidObservation).toHaveBeenCalledTimes(1);
    expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it.each(['leaseToken', 'attemptId', 'fencingVersion', 'providerRequestKey', 'quoteHash', 'submitNotAfter'])('holds changed intent lease identity: %s', async field => {
    const h = harness(); h.repository.recordSubmissionIntent.mockResolvedValue({ kind: 'SUBMIT', reason: 'INTENT_RECORDED',
      lease: { ...h.lease, [field]: field === 'submitNotAfter' ? '2026-11-24T00:00:00Z' : 'different' } } as any);
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('BLOCKED');
    expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('binds actual independent PAID evidence and grants only from the native state', async () => {
    const h = harness(); h.transport.getPayment.mockResolvedValueOnce(payment()).mockResolvedValueOnce(payment('PAID'));
    expect((await confirmPortOneTest(h.deps, approval)).state).toBe('PENDING');
    expect(h.repository.bindPaidObservation.mock.calls[0]).toEqual([CONTEXT, expect.objectContaining({
      provider: 'PORTONE', environment: 'TEST', identity_kind: 'PAYMENT', external_id: PAYMENT,
      order_reference: `v2:${ORDER}`, amount_minor: '1000', currency: 'KRW', status: 'PAID', scope,
    })]);
    expect(JSON.stringify(h.repository.bindPaidObservation.mock.calls)).not.toMatch(/private-token|fixture-secret/);
    h.context.settlementState = 'GRANTED';
    expect(await getPortOneTestStatus(h.deps, input)).toEqual({ state: 'GRANTED', orderId: ORDER });
  });
  it('status is read-only owner recovery even after role loss and never invokes entry or provider', async () => {
    const h = harness(); h.context.submissionIntentRecorded = true; h.context.paymentState = 'SUBMISSION_UNKNOWN';
    expect(await getPortOneTestStatus(h.deps, input)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled(); expect(h.transport.getPayment).not.toHaveBeenCalled();
    expect(h.repository.receivePurchase).not.toHaveBeenCalled();
  });
});

describe('PortOne TEST bounded transport', () => {
  it('uses documented V2 fields, the server store and exactly one nonredirecting request', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    await createPortOneTestTransport(fetcher).confirmPayment(config as any, PAYMENT,
      { storeId: scope.store_id, txId: 'tx-test', paymentToken: 'private-token', totalAmount: 1000, currency: 'KRW', isTest: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`https://api.portone.io/payments/${PAYMENT}/confirm`);
    const init = (fetcher.mock.calls[0] as any)[1];
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
    expect(JSON.parse(init.body)).toEqual({ storeId: scope.store_id, txId: 'tx-test', paymentToken: 'private-token', totalAmount: 1000, currency: 'KRW', isTest: true });
  });
  it.each([new Response('secret-error', { status: 500 }), new Response('x'.repeat(65537)), new Response('not json')])('closes on failed or oversized GET without exposing its body', async response => {
    const transport = createPortOneTestTransport(vi.fn(async () => response));
    await expect(transport.getPayment(config as any, PAYMENT)).rejects.toThrow('PORTONE_TEST_UNAVAILABLE');
  });
});
