// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => vi.fn());
vi.mock('@/lib/payment/portone-test/runtime', () => ({ createPortOneTestDependencies: runtime }));
import { checkoutPortOneTest, confirmPortOneTest, reconcilePortOneTestPaid } from '@/lib/payment/portone-test/service';
import { createPortOneTestBindings, createPortOneTestRepository } from '@/lib/payment/portone-test/repository';
import { reconcilePortOneTestCancellation, reconcilePortOneTestWebhook } from '@/lib/payment/portone-test/webhook';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const PAYMENT = `web_${CONTEXT}`;
const HASH = 'a'.repeat(64);
const NOW = Date.parse('2026-11-25T00:00:00Z');
const DEADLINE = '2026-11-25T00:01:00Z';
const PAID_AT = '2026-11-25T00:00:00Z';
const LEGACY_KEY = `PAYMENT:${PAYMENT}:PAID`;
const scope = { merchant_id: 'merchant-test', store_id: 'store-test', channel_id: 'channel-test', channel_type: 'TEST' };
const config = { ...scope, channelKey: 'channel-key-test', method: 'CARD', credentialRef: 'portone-test', bindingVersion: '1', apiSecret: 'fixture-secret' };
const input = { actorUserId: USER, orderId: ORDER };
const approval = { ...input, txId: 'tx-test', paymentToken: 'private-token' };
const LEGACY = { contract: 'LEGACY' };
const HOSTED = (paymentMethod: unknown = null, checkoutFlow = 'PG_HOSTED_V1') => ({ contract: 'HOSTED', checkoutFlow, paymentMethod });
const REVIEW = (reason: string) => ({ kind: 'REVIEW_REQUIRED', reason, observationId: CONTEXT, replayed: false });

// Each SDK 0.17.0 variant carries detail fields. Only the type and a clean EasyPay provider may leave this boundary.
const SEVEN = [
  [{ type: 'PaymentMethodCard', card: { number: 'PII-CARD-NUMBER', publisher: 'PII-CARD-PUBLISHER' }, approvalNumber: 'PII-APPROVAL' }, { type: 'CARD' }],
  [{ type: 'PaymentMethodEasyPay', provider: 'KAKAOPAY', easyPayMethod: { type: 'PaymentMethodEasyPayMethodCharge', bank: 'PII-EASY-BANK' } },
    { type: 'EASY_PAY', easy_pay_provider: 'KAKAOPAY' }],
  [{ type: 'PaymentMethodTransfer', bank: 'PII-TRANSFER-BANK' }, { type: 'TRANSFER' }],
  [{ type: 'PaymentMethodVirtualAccount', bank: 'PII-VA-BANK', accountNumber: 'PII-VA-ACCOUNT', remitteeName: 'PII-VA-NAME' }, { type: 'VIRTUAL_ACCOUNT' }],
  [{ type: 'PaymentMethodMobile', phoneNumber: 'PII-PHONE' }, { type: 'MOBILE' }],
  [{ type: 'PaymentMethodGiftCertificate', giftCertificateType: 'PII-GIFT-TYPE', approvalNumber: 'PII-GIFT-APPROVAL' }, { type: 'GIFT_CERTIFICATE' }],
  [{ type: 'PaymentMethodConvenienceStore', store: 'PII-STORE' }, { type: 'CONVENIENCE_STORE' }],
] as const;

function payment(status: string, method?: unknown, paidAt = PAID_AT) {
  return { id: PAYMENT, transactionId: 'tx-test', version: 'V2', status, merchantId: scope.merchant_id, storeId: scope.store_id,
    channel: { id: scope.channel_id, type: 'TEST', key: config.channelKey, pgProvider: 'INICIS_V2' },
    ...(method === undefined ? {} : { method }),
    customData: JSON.stringify({ version: 'v2', order_id: ORDER }), paidAt: status === 'PAID' ? paidAt : undefined,
    amount: { total: 1000, paid: status === 'PAID' ? 1000 : 0, cancelled: 0 }, currency: 'KRW' };
}
function expectedEvidence(key: string, method?: object, paidAt = PAID_AT) {
  const facts = { source: 'LOOKUP', key, provider: 'PORTONE', environment: 'TEST', identity_kind: 'PAYMENT', external_id: PAYMENT,
    parent_external_id: null, order_id: ORDER, user_id: USER, quote_hash: HASH, order_reference: `v2:${ORDER}`, scope,
    amount_minor: '1000', currency: 'KRW', status: 'PAID', provider_completed_at: paidAt, ...(method ? { payment_method: method } : {}) };
  return { ...facts, payload_hash: createHash('sha256').update(JSON.stringify(facts)).digest('hex') };
}
const slotOf = (method: { type: string; easy_pay_provider?: string }) =>
  method.easy_pay_provider === undefined ? method.type : `${method.type}:${method.easy_pay_provider}`;
const metadata = (method: { type: string; easy_pay_provider?: string }, paidAt = PAID_AT) =>
  expectedEvidence(`${LEGACY_KEY}:${slotOf(method)}`, method, paidAt);
const json = (value: unknown) => JSON.stringify(value);

function harness(verification: unknown) {
  const context = { chargeAuthority: false, orderId: ORDER, provider: 'PORTONE', environment: 'TEST', rowVersion: '1',
    paymentState: 'SUBMISSION_UNKNOWN', settlementState: 'NOT_INTAKE', actorDeleted: false,
    quoteId: ORDER, quoteHash: HASH, productId: 'STAR_100', amountMinor: '1000', currency: 'KRW', quantity: '1',
    quoteExpiresAt: DEADLINE, contextId: CONTEXT, verificationBindingPresent: true, paymentId: PAYMENT,
    providerOrderId: null, providerCaptureId: null, attemptId: null, submissionIntentRecorded: true, reviewRequired: false };
  const repository = {
    getChargeContext: vi.fn(async () => ({ kind: 'FOUND', context: { ...context } })),
    prepareProviderContext: vi.fn(async () => ({ kind: 'PREPARED', replayed: true, contextId: CONTEXT, orderId: ORDER,
      quoteId: ORDER, quoteHash: HASH, provider: 'PORTONE', environment: 'TEST', scope, settingsVersion: '1', createRequestKey: USER, paymentId: PAYMENT })),
    claimCharge: vi.fn(), recordSubmissionIntent: vi.fn(),
    bindPaidObservation: vi.fn(async (): Promise<unknown> => ({ kind: 'RECORDED', observationId: CONTEXT, replayed: false })),
    receivePurchase: vi.fn(async () => ({ kind: 'INTAKE_PENDING', orderId: ORDER, inboxId: '44444444-4444-4444-8444-444444444444', replayed: false, grantEligible: false })),
    getWebhookOrder: vi.fn(async () => ({ actorUserId: USER, orderId: ORDER })),
  };
  const binding = { orderId: ORDER, contextId: CONTEXT, quoteId: ORDER, quoteHash: HASH, provider: 'PORTONE', environment: 'TEST',
    billingCountry: 'KR', scope, bindingId: USER, bindingVersion: '1', bindingHash: HASH, credentialRef: 'portone-test', verification };
  const transport = { getPayment: vi.fn(async (): Promise<unknown> => payment('PAID', SEVEN[0][0])), confirmPayment: vi.fn(async () => undefined) };
  const entry = { authorizeProviderEntry: vi.fn(async () => ({ kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT,
    createRequestKey: USER, quoteHash: HASH, bindingHash: HASH, entryNotAfter: DEADLINE })) };
  const deps: any = { repository, config, bindings: { getProviderBinding: vi.fn(async () => binding) }, entry, transport, nowMs: () => NOW };
  const bound = () => repository.bindPaidObservation.mock.calls.map((call: any[]) => call[1]);
  return { deps, repository, context, binding, transport, entry, bound };
}
beforeEach(() => vi.clearAllMocks());

describe('PortOne PAID method evidence: legacy bindings stay byte-identical', () => {
  it.each([undefined, LEGACY])('keeps the legacy key and evidence bytes for an unarmed legacy binding %j', async verification => {
    const h = harness(verification); h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[1][0]));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(true);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY))]);
    expect(h.repository.receivePurchase).toHaveBeenCalledExactlyOnceWith(ORDER, CONTEXT);
  });
  it('keeps binding a legacy PAID read that omits method, exactly as before', async () => {
    const h = harness(LEGACY); h.transport.getPayment.mockResolvedValue(payment('PAID'));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(true);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY))]);
  });
  it('keeps the armed legacy card drill: a non-card PAID read is never bound or published', async () => {
    const h = harness(LEGACY); const settlement = { assertScope: vi.fn(async () => undefined), pinTransaction: vi.fn(), publishPaid: vi.fn(async () => undefined) };
    h.deps.settlement = settlement; h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[1][0]));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.repository.bindPaidObservation).not.toHaveBeenCalled(); expect(settlement.publishPaid).not.toHaveBeenCalled();
    h.transport.getPayment.mockResolvedValue(payment('PAID', { type: 'PaymentMethodCard' }));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(true);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY))]);
    expect(settlement.publishPaid).toHaveBeenCalledTimes(1);
  });
  it('fails closed on an unknown verification contract', async () => {
    const h = harness({ contract: 'OTHER' });
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.transport.getPayment).not.toHaveBeenCalled(); expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
  });
});

describe('PortOne PAID method evidence: hosted bindings', () => {
  it.each(SEVEN)('records the financial base, then type-only %j metadata, and never opens intake', async (method, expected) => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', method));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY)), json(metadata(expected))]);
    expect(json(h.bound())).not.toMatch(/PII-/);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it.each([1, 33, 40])('accepts a clean %i-character EasyPay provider', async length => {
    const h = harness(HOSTED()); const provider = 'A'.repeat(length);
    h.transport.getPayment.mockResolvedValue(payment('PAID', { type: 'PaymentMethodEasyPay', provider }));
    await reconcilePortOneTestPaid(h.deps, input, PAYMENT);
    expect(h.bound()[1]).toEqual(metadata({ type: 'EASY_PAY', easy_pay_provider: provider }));
  });
  it.each([
    ['omitted method', undefined], ['null method', null], ['unrecognized type', { type: 'PaymentMethodCrypto' }],
    ['inherited key', { type: 'toString' }], ['missing type', { card: {} }], ['billing key method', { type: 'BillingKeyPaymentMethodCard' }],
    ['lowercase provider', { type: 'PaymentMethodEasyPay', provider: 'kakaopay' }], ['spaced provider', { type: 'PaymentMethodEasyPay', provider: 'KAKAO PAY' }],
    ['empty provider', { type: 'PaymentMethodEasyPay', provider: '' }], ['numeric provider', { type: 'PaymentMethodEasyPay', provider: 7 }],
    ['null provider', { type: 'PaymentMethodEasyPay', provider: null }], ['41-character provider', { type: 'PaymentMethodEasyPay', provider: 'A'.repeat(41) }],
  ])('keeps %s unknown: base facts only, never inferred as CARD', async (_label, method) => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', method));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY))]);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled();
  });
  it('never treats virtual account issuance or a READY read as payment', async () => {
    for (const status of ['VIRTUAL_ACCOUNT_ISSUED', 'READY', 'PENDING']) {
      const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment(status, SEVEN[3][0]));
      expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
      expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
    }
  });
  it.each([{ storeId: 'other-store' }, { merchantId: 'other' }, { channel: { id: 'other-channel', type: 'TEST', key: config.channelKey } },
    { channel: { id: scope.channel_id, type: 'LIVE', key: config.channelKey } }, { amount: { total: 1001, paid: 1001, cancelled: 0 } },
    { customData: JSON.stringify({ version: 'v2', order_id: USER }) }])('keeps scope, identity and price checks for hosted reads %j', async changed => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue({ ...payment('PAID', SEVEN[1][0]), ...changed });
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
  });
  it('replays an exact observation with the same keys and payloads', async () => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[1][0]));
    await reconcilePortOneTestPaid(h.deps, input, PAYMENT); await reconcilePortOneTestPaid(h.deps, input, PAYMENT);
    const calls = h.bound().map(json);
    expect(calls).toHaveLength(4); expect(calls.slice(2)).toEqual(calls.slice(0, 2));
  });
  it('observes a late EasyPay provider on its own key while the base stays identical', async () => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', { type: 'PaymentMethodEasyPay' }));
    await reconcilePortOneTestPaid(h.deps, input, PAYMENT);
    h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[1][0]));
    await reconcilePortOneTestPaid(h.deps, input, PAYMENT);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY)), json(metadata({ type: 'EASY_PAY' })),
      json(expectedEvidence(LEGACY_KEY)), json(metadata({ type: 'EASY_PAY', easy_pay_provider: 'KAKAOPAY' }))]);
  });
  it.each([
    [{ type: 'EASY_PAY', easy_pay_provider: 'KAKAOPAY' }, { type: 'PaymentMethodEasyPay' }, { type: 'EASY_PAY' }],
    [{ type: 'EASY_PAY', easy_pay_provider: 'KAKAOPAY' }, { type: 'PaymentMethodEasyPay', provider: 'NAVERPAY' }, { type: 'EASY_PAY', easy_pay_provider: 'NAVERPAY' }],
    [{ type: 'CARD' }, { type: 'PaymentMethodTransfer' }, { type: 'TRANSFER' }],
  ])('derives the key from the observed method only, never from the bound %j', async (boundMethod, method, observed) => {
    const h = harness(HOSTED(boundMethod)); h.transport.getPayment.mockResolvedValue(payment('PAID', method));
    await reconcilePortOneTestPaid(h.deps, input, PAYMENT);
    expect(h.bound()[1]).toEqual(metadata(observed));
  });
  it.each(['PAYMENT_METHOD_CONFLICT', 'OBSERVATION_KEY_CONFLICT'])('honors metadata %s review without granting', async reason => {
    const h = harness(HOSTED({ type: 'CARD' })); h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[2][0]));
    h.repository.bindPaidObservation.mockResolvedValueOnce({ kind: 'RECORDED', observationId: CONTEXT, replayed: true })
      .mockResolvedValueOnce(REVIEW(reason));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled();
  });
  it('stops before metadata when the financial base needs review', async () => {
    const h = harness(HOSTED()); h.repository.bindPaidObservation.mockResolvedValue(REVIEW('OBSERVATION_KEY_CONFLICT'));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY))]);
  });
  it('a later brand never hides a changed paidAt: the base key carries the conflict and metadata is not sent', async () => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', { type: 'PaymentMethodEasyPay' }));
    await reconcilePortOneTestPaid(h.deps, input, PAYMENT);
    const LATER = '2026-11-25T00:00:30Z';
    h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[1][0], LATER));
    h.repository.bindPaidObservation.mockResolvedValueOnce(REVIEW('OBSERVATION_KEY_CONFLICT'));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    const calls = h.bound();
    expect(calls.map(json)).toEqual([json(expectedEvidence(LEGACY_KEY)), json(metadata({ type: 'EASY_PAY' })),
      json(expectedEvidence(LEGACY_KEY, undefined, LATER))]);
    expect(calls[2].key).toBe(calls[0].key); expect(calls[2].payload_hash).not.toBe(calls[0].payload_hash);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('recovers a partial ACK by replaying the existing base key, without submitting or crediting', async () => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[1][0]));
    h.repository.bindPaidObservation.mockResolvedValueOnce({ kind: 'RECORDED', observationId: CONTEXT, replayed: false })
      .mockRejectedValueOnce(new Error('WEB_PAYMENT_CHARGE_UNAVAILABLE'));
    await expect(reconcilePortOneTestPaid(h.deps, input, PAYMENT)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    const calls = h.bound().map(json);
    expect(calls).toEqual([json(expectedEvidence(LEGACY_KEY)), json(metadata(SEVEN[1][1])),
      json(expectedEvidence(LEGACY_KEY)), json(metadata(SEVEN[1][1]))]);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
    expect(h.repository.claimCharge).not.toHaveBeenCalled();
  });
  it('sends the true observed method on the dedicated KakaoPay flow too, and still never opens intake', async () => {
    const h = harness(HOSTED(null, 'KAKAOPAY_DIRECT_V1')); h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[0][0]));
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.bound()[1]).toEqual(metadata({ type: 'CARD' }));
    expect(h.repository.receivePurchase).not.toHaveBeenCalled();
  });
  it('never binds or publishes a hosted order inside the armed legacy settlement drill', async () => {
    const h = harness(HOSTED()); const settlement = { assertScope: vi.fn(async () => undefined), pinTransaction: vi.fn(), publishPaid: vi.fn() };
    h.deps.settlement = settlement;
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(false);
    expect(h.repository.bindPaidObservation).not.toHaveBeenCalled(); expect(settlement.publishPaid).not.toHaveBeenCalled();
  });
  it('keeps hosted checkout release and manual confirmation closed', async () => {
    const h = harness(HOSTED()); h.context.submissionIntentRecorded = false; h.context.paymentState = 'NOT_SUBMITTED';
    expect(await checkoutPortOneTest(h.deps, input)).toEqual({ state: 'BLOCKED', orderId: ORDER });
    expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'BLOCKED', orderId: ORDER });
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled(); expect(h.repository.claimCharge).not.toHaveBeenCalled();
    expect(h.transport.confirmPayment).not.toHaveBeenCalled(); expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it('records method evidence from the confirm recovery entry but stays PENDING', async () => {
    const h = harness(HOSTED()); h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[2][0]));
    expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY)), json(metadata({ type: 'TRANSFER' }))]);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('records method evidence from the signed webhook entry and does not acknowledge it', async () => {
    const h = harness(HOSTED()); runtime.mockReturnValue(h.deps);
    h.transport.getPayment.mockResolvedValue(payment('PAID', SEVEN[4][0]));
    expect(await reconcilePortOneTestWebhook(PAYMENT)).toBe(false);
    expect(h.bound().map(json)).toEqual([json(expectedEvidence(LEGACY_KEY)), json(metadata({ type: 'MOBILE' }))]);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled();
  });
});

type Reply = { data?: unknown; error?: { code: string; message: string } };
function rpcClient(replies: Record<string, Reply>) {
  const rpc = vi.fn((name: string, _args: unknown) => ({ retry: (retry: boolean) => { expect(retry).toBe(false); return {
    abortSignal: async () => { const reply = replies[name]; if (!reply) throw new Error('unexpected rpc');
      return { data: reply.data ?? null, error: reply.error ?? null, status: reply.error ? 404 : 200 }; },
  }; } }));
  return { rpc };
}
// Primary DB vectors from the PG15/17-passing SQL: the exact jsonb::text documents and their SHA-256.
const LEGACY_DOC = '{"provider": "PORTONE", "binding_id": "d1ca0003-0000-4000-8000-000000000002", "environment": "TEST", "credential_ref": "fixture.durability.portone", "expected_scope": {"store_id": "fixture-store", "channel_id": "fixture-channel", "merchant_id": "fixture-portone-merchant", "channel_type": "TEST"}, "binding_version": "1", "contract_version": "web-payment-verification-binding.v1", "expected_application": null}';
const LEGACY_HASH = '3865ac5115fa1c9b688d240aefc6f1d9bcecea58c2e7d5ada36fd7df1445d52f';
const HOSTED_DOC = '{"provider": "PORTONE", "binding_id": "d1ca0003-0000-4000-8000-0000000000a1", "environment": "TEST", "checkout_flow": "PG_HOSTED_V1", "credential_ref": "fixture.methods.hosted", "expected_scope": {"store_id": "fixture-store", "channel_id": "fixture-channel", "merchant_id": "fixture-portone-merchant", "channel_type": "TEST"}, "binding_version": "2", "contract_version": "web-payment-verification-binding.v2", "expected_application": null}';
const HOSTED_HASH = 'ee5f7dcfe5faddf84b97ca756975e7a3aab59c14ece0b5eb70bebc00638e30d7';
const FIXTURE_SCOPE = { merchant_id: 'fixture-portone-merchant', store_id: 'fixture-store', channel_id: 'fixture-channel', channel_type: 'TEST' };
const V1_FOUND = { contract_version: 'web-payment-provider-binding.v1', outcome: 'FOUND', charge_authority: false,
  order_id: ORDER, context_id: CONTEXT, quote_id: ORDER, quote_hash: HASH, provider: 'PORTONE', environment: 'TEST',
  billing_country: 'KR', scope: FIXTURE_SCOPE, binding_id: 'd1ca0003-0000-4000-8000-000000000002', binding_version: '1',
  binding_hash: LEGACY_HASH, credential_ref: 'fixture.durability.portone', expected_application: null };
// A hosted binding as the v1 getter returns it: v1 shape, hosted fields, and its actual v2-derived hash.
const V1_SHAPED_HOSTED = { ...V1_FOUND, binding_id: 'd1ca0003-0000-4000-8000-0000000000a1', binding_version: '2',
  binding_hash: HOSTED_HASH, credential_ref: 'fixture.methods.hosted' };
const V2_LEGACY = { ...V1_FOUND, contract_version: 'web-payment-provider-binding.v2',
  binding_contract_version: 'web-payment-verification-binding.v1', checkout_flow: null, payment_method: null };
const V2_HOSTED = { ...V2_LEGACY, binding_contract_version: 'web-payment-verification-binding.v2', checkout_flow: 'PG_HOSTED_V1',
  payment_method: { type: 'EASY_PAY', easy_pay_provider: 'KAKAOPAY', source: 'LOOKUP', trust: 'SERVER_REPORTED' } };
const MISSING = { error: { code: 'PGRST202', message: 'Could not find the function' } };
const V2 = 'get_web_payment_provider_binding_v2';
const V1 = 'get_web_payment_provider_binding';

describe('PortOne provider binding v2 adapter', () => {
  it('reads the v2 service RPC and maps a legacy verification contract', async () => {
    const c = rpcClient({ [V2]: { data: V2_LEGACY } });
    expect(await createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER)).toMatchObject({ contextId: CONTEXT, verification: LEGACY });
    expect(c.rpc.mock.calls).toEqual([[V2, { p_actor_user_id: USER, p_order_id: ORDER }]]);
  });
  it('maps a hosted verification contract with the server-reported LOOKUP method', async () => {
    const binding = await createPortOneTestBindings(rpcClient({ [V2]: { data: V2_HOSTED } }) as any).getProviderBinding(USER, ORDER);
    expect(binding?.verification).toEqual(HOSTED({ type: 'EASY_PAY', easy_pay_provider: 'KAKAOPAY' }));
    for (const [flow, method, expected] of [['KAKAOPAY_DIRECT_V1', null, null],
      ['PG_HOSTED_V1', { type: 'CARD', source: 'LOOKUP', trust: 'SERVER_REPORTED' }, { type: 'CARD' }],
      ['PG_HOSTED_V1', { type: 'EASY_PAY', easy_pay_provider: 'A'.repeat(40), source: 'LOOKUP', trust: 'SERVER_REPORTED' },
        { type: 'EASY_PAY', easy_pay_provider: 'A'.repeat(40) }]] as const) {
      const value = await createPortOneTestBindings(rpcClient({ [V2]: { data: { ...V2_HOSTED, checkout_flow: flow, payment_method: method } } }) as any)
        .getProviderBinding(USER, ORDER);
      expect(value?.verification).toEqual(HOSTED(expected, flow));
    }
  });
  it.each(['NOT_FOUND', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED'])('returns null for the closed v2 %s DTO', async outcome => {
    const wire = { contract_version: 'web-payment-provider-binding.v2', outcome, charge_authority: false };
    expect(await createPortOneTestBindings(rpcClient({ [V2]: { data: wire } }) as any).getProviderBinding(USER, ORDER)).toBeNull();
    await expect(createPortOneTestBindings(rpcClient({ [V2]: { data: { ...wire, checkout_flow: null } } }) as any)
      .getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
  });
  it('uses the compatible v1 service only when the v2 function does not exist', async () => {
    const c = rpcClient({ [V2]: MISSING, [V1]: { data: V1_FOUND } });
    expect(await createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER)).toMatchObject({ verification: LEGACY });
    expect(c.rpc.mock.calls.map(call => call[0])).toEqual([V2, V1]);
  });
  it('never downgrades to v1 after another v2 failure', async () => {
    for (const reply of [{ error: { code: '42883', message: 'inner' } }, { error: { code: 'PGRST301', message: 'jwt' } },
      { error: { code: '42501', message: 'permission denied' } }, { error: { code: '57014', message: 'timeout' } }]) {
      const c = rpcClient({ [V2]: reply, [V1]: { data: V1_FOUND } });
      await expect(createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
      expect(c.rpc.mock.calls.map(call => call[0])).toEqual([V2]);
    }
  });
  it.each([
    ['v1 DTO from the v2 function', V1_FOUND],
    ['hosted without a flow', { ...V2_HOSTED, checkout_flow: null }],
    ['legacy with a flow', { ...V2_LEGACY, checkout_flow: 'PG_HOSTED_V1' }],
    ['legacy with a method', { ...V2_LEGACY, payment_method: V2_HOSTED.payment_method }],
    ['unknown flow', { ...V2_HOSTED, checkout_flow: 'PG_REDIRECT_V9' }],
    ['unknown contract', { ...V2_HOSTED, binding_contract_version: 'web-payment-verification-binding.v3' }],
    ['webhook source', { ...V2_HOSTED, payment_method: { ...V2_HOSTED.payment_method, source: 'WEBHOOK' } }],
    ['client trust', { ...V2_HOSTED, payment_method: { ...V2_HOSTED.payment_method, trust: 'CLIENT_REPORTED' } }],
    ['missing trust', { ...V2_HOSTED, payment_method: { type: 'CARD', source: 'LOOKUP' } }],
    ['unknown type', { ...V2_HOSTED, payment_method: { type: 'CRYPTO', source: 'LOOKUP', trust: 'SERVER_REPORTED' } }],
    ['SDK type name', { ...V2_HOSTED, payment_method: { type: 'PaymentMethodCard', source: 'LOOKUP', trust: 'SERVER_REPORTED' } }],
    ['provider on card', { ...V2_HOSTED, payment_method: { type: 'CARD', easy_pay_provider: 'KAKAOPAY', source: 'LOOKUP', trust: 'SERVER_REPORTED' } }],
    ['unclean provider', { ...V2_HOSTED, payment_method: { ...V2_HOSTED.payment_method, easy_pay_provider: 'kakao' } }],
    ['41-character provider', { ...V2_HOSTED, payment_method: { ...V2_HOSTED.payment_method, easy_pay_provider: 'A'.repeat(41) } }],
    ['null provider', { ...V2_HOSTED, payment_method: { ...V2_HOSTED.payment_method, easy_pay_provider: null } }],
    ['extra method detail', { ...V2_HOSTED, payment_method: { ...V2_HOSTED.payment_method, card_number: 'x' } }],
    ['extra key', { ...V2_HOSTED, extra: null }],
    ['missing key', (({ payment_method: _omitted, ...rest }) => rest)(V2_HOSTED)],
    ['live environment', { ...V2_HOSTED, environment: 'LIVE' }],
  ])('fails closed on a malformed v2 binding: %s', async (_label, wire) => {
    const c = rpcClient({ [V2]: { data: wire }, [V1]: { data: V1_FOUND } });
    await expect(createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    expect(c.rpc.mock.calls.map(call => call[0])).toEqual([V2]);
  });
  it('sends hosted method evidence only through the identity binding RPC and parses a method conflict review', async () => {
    const c = rpcClient({ bind_web_payment_provider_identity: { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PAYMENT_METHOD_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: CONTEXT, replayed: false } } });
    const evidence = metadata({ type: 'CARD' });
    expect(await createPortOneTestRepository(c as any).bindPaidObservation(CONTEXT, evidence as any))
      .toEqual({ kind: 'REVIEW_REQUIRED', reason: 'PAYMENT_METHOD_CONFLICT', observationId: CONTEXT, replayed: false });
    expect(c.rpc.mock.calls).toEqual([['bind_web_payment_provider_identity', { p_context_id: CONTEXT, p_evidence: evidence }]]);
  });
});

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
describe('PortOne v1 fallback must prove a genuine legacy binding', () => {
  it('uses primary DB vectors that are independent of the adapter', () => {
    expect(sha256(LEGACY_DOC)).toBe(LEGACY_HASH);
    expect(sha256(HOSTED_DOC)).toBe(HOSTED_HASH);
  });
  it('accepts a PGRST202 fallback only with the proven canonical legacy hash', async () => {
    const c = rpcClient({ [V2]: MISSING, [V1]: { data: V1_FOUND } });
    expect(await createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER))
      .toMatchObject({ bindingHash: LEGACY_HASH, credentialRef: 'fixture.durability.portone', scope: FIXTURE_SCOPE, verification: LEGACY });
    expect(c.rpc.mock.calls.map(call => call[0])).toEqual([V2, V1]);
  });
  it.each([
    ['a hosted binding in the v1 shape with its v2-derived hash', V1_SHAPED_HOSTED],
    ['legacy fields with the hosted hash', { ...V1_FOUND, binding_hash: HOSTED_HASH }],
    ['a changed binding id', { ...V1_FOUND, binding_id: 'd1ca0003-0000-4000-8000-0000000000a1' }],
    ['a changed credential', { ...V1_FOUND, credential_ref: 'fixture.methods.hosted' }],
    ['a changed binding version', { ...V1_FOUND, binding_version: '2' }],
    ['a changed store', { ...V1_FOUND, scope: { ...FIXTURE_SCOPE, store_id: 'other-store' } }],
    ['a changed channel', { ...V1_FOUND, scope: { ...FIXTURE_SCOPE, channel_id: 'other-channel' } }],
    ['a changed merchant', { ...V1_FOUND, scope: { ...FIXTURE_SCOPE, merchant_id: 'other-merchant' } }],
    ['an arbitrary hash', { ...V1_FOUND, binding_hash: 'b'.repeat(64) }],
  ])('fails closed on an unproven fallback: %s', async (_label, wire) => {
    const c = rpcClient({ [V2]: MISSING, [V1]: { data: wire } });
    await expect(createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    expect(c.rpc.mock.calls.map(call => call[0])).toEqual([V2, V1]);
  });
  it('keeps closed v1 outcomes and v1 errors without retry', async () => {
    const closed = rpcClient({ [V2]: MISSING, [V1]: { data: { contract_version: 'web-payment-provider-binding.v1', outcome: 'NOT_FOUND', charge_authority: false } } });
    expect(await createPortOneTestBindings(closed as any).getProviderBinding(USER, ORDER)).toBeNull();
    for (const reply of [{ error: { code: 'PGRST202', message: 'missing too' } }, { error: { code: '57014', message: 'timeout' } }]) {
      const c = rpcClient({ [V2]: MISSING, [V1]: reply });
      await expect(createPortOneTestBindings(c as any).getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
      expect(c.rpc.mock.calls.map(call => call[0])).toEqual([V2, V1]);
    }
  });

  // Real repository behind the real service and webhook entries.
  const fixturePayment = (status: string, method?: unknown) => ({ ...payment(status, method), merchantId: FIXTURE_SCOPE.merchant_id,
    storeId: FIXTURE_SCOPE.store_id, channel: { id: FIXTURE_SCOPE.channel_id, type: 'TEST', key: 'channel-key-test', pgProvider: 'INICIS_V2' } });
  function fallback(wire: typeof V1_FOUND) {
    const h = harness(undefined);
    const c = rpcClient({ [V2]: MISSING, [V1]: { data: wire } });
    h.deps.bindings = createPortOneTestBindings(c as any);
    // The config matches the returned fields, so only the hash proof can decide.
    h.deps.config = { ...FIXTURE_SCOPE, channelKey: 'channel-key-test', method: 'CARD', credentialRef: wire.credential_ref,
      bindingVersion: wire.binding_version, apiSecret: 'fixture-secret' };
    h.repository.prepareProviderContext.mockResolvedValue({ kind: 'PREPARED', replayed: true, contextId: CONTEXT, orderId: ORDER,
      quoteId: ORDER, quoteHash: HASH, provider: 'PORTONE', environment: 'TEST', scope: FIXTURE_SCOPE, settingsVersion: '1',
      createRequestKey: USER, paymentId: PAYMENT });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT,
      createRequestKey: USER, quoteHash: HASH, bindingHash: wire.binding_hash, entryNotAfter: DEADLINE });
    h.transport.getPayment.mockResolvedValue(fixturePayment('PAID', { type: 'PaymentMethodCard' }));
    const settlement = { assertScope: vi.fn(async () => undefined), matches: vi.fn(async () => true), pinTransaction: vi.fn(async () => undefined),
      publishPaid: vi.fn(async () => undefined), publishCancelled: vi.fn(async () => undefined) };
    return { ...h, c, settlement };
  }
  const notSubmitted = (h: ReturnType<typeof fallback>) => {
    h.context.submissionIntentRecorded = false; h.context.paymentState = 'NOT_SUBMITTED';
  };
  const cancelled = { type: 'Transaction.Cancelled', data: { paymentId: PAYMENT, storeId: FIXTURE_SCOPE.store_id,
    transactionId: 'tx-test', cancellationId: 'cancel-1' } };
  const delivery = { deliveryId: 'delivery-1', bodySha256: 'c'.repeat(64) };

  it('keeps the exact legacy card case working with the proven real hash', async () => {
    let h = fallback(V1_FOUND); notSubmitted(h);
    expect(await checkoutPortOneTest(h.deps, input)).toMatchObject({ state: 'READY', paymentId: PAYMENT, method: 'CARD' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledWith(expect.objectContaining({ bindingHash: LEGACY_HASH }));
    h = fallback(V1_FOUND);
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(true);
    expect(h.bound().map((e: any) => [e.key, 'payment_method' in e, e.scope])).toEqual([[LEGACY_KEY, false, FIXTURE_SCOPE]]);
    expect(h.repository.receivePurchase).toHaveBeenCalledExactlyOnceWith(ORDER, CONTEXT);
    h = fallback(V1_FOUND); h.deps.settlement = h.settlement;
    expect(await reconcilePortOneTestPaid(h.deps, input, PAYMENT)).toBe(true);
    expect(h.settlement.publishPaid).toHaveBeenCalledTimes(1);
    h = fallback(V1_FOUND); h.deps.settlement = h.settlement; runtime.mockReturnValue(h.deps);
    expect(await reconcilePortOneTestCancellation(cancelled, delivery)).toBe('ACCEPTED');
  });
  it('an unproven fallback never releases SDK settings or confirms', async () => {
    let h = fallback(V1_SHAPED_HOSTED); notSubmitted(h);
    expect(await checkoutPortOneTest(h.deps, input)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled();
    h = fallback(V1_SHAPED_HOSTED); notSubmitted(h);
    expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
    expect(h.transport.getPayment).not.toHaveBeenCalled(); expect(h.repository.claimCharge).not.toHaveBeenCalled();
    expect(h.repository.recordSubmissionIntent).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('an unproven fallback never reads, binds, takes intake, signals or grants on recovery and webhook entries', async () => {
    for (const armed of [false, true]) {
      let h = fallback(V1_SHAPED_HOSTED); if (armed) h.deps.settlement = h.settlement;
      expect(await confirmPortOneTest(h.deps, approval)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
      await expect(reconcilePortOneTestPaid(h.deps, input, PAYMENT)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
      runtime.mockReturnValue(h.deps);
      await expect(reconcilePortOneTestWebhook(PAYMENT)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
      expect(h.transport.getPayment).not.toHaveBeenCalled(); expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
      expect(h.repository.receivePurchase).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
      expect(h.settlement.publishPaid).not.toHaveBeenCalled();
      h = fallback(V1_SHAPED_HOSTED); h.deps.settlement = h.settlement; runtime.mockReturnValue(h.deps);
      expect(await reconcilePortOneTestCancellation(cancelled, delivery)).toBe('UNAVAILABLE');
      expect(h.settlement.publishCancelled).not.toHaveBeenCalled();
    }
  });
});
