// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPortOneHostedChannels } from '@/lib/payment/portone-hosted/config';
import { checkoutPortOneHosted, confirmPortOneHosted, getPortOneHostedStatus, lookupPortOneHosted } from '@/lib/payment/portone-hosted/service';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const KEY = '55555555-5555-4555-8555-555555555555';
const BASE_OBSERVATION = '66666666-6666-4666-8666-666666666666';
const METHOD_OBSERVATION = '77777777-7777-4777-8777-777777777777';
const PAYMENT = `web_${CONTEXT}`;
const QUOTE_HASH = 'a'.repeat(64);
const BINDING_HASH = 'b'.repeat(64);
const NOW = Date.parse('2026-11-25T00:00:00Z');
const DEADLINE = '2026-11-25T00:10:00Z';
const PAID_AT = '2026-11-25T00:05:00Z';
const SECRET = 'continuation-secret-for-tests-0123456789';
type Env = 'TEST' | 'LIVE';
type Flow = 'PG_HOSTED_V1' | 'KAKAOPAY_DIRECT_V1';
const ENVS: Env[] = ['TEST', 'LIVE'];

function channel(env: Env, flow: Flow = 'PG_HOSTED_V1', overrides: Record<string, unknown> = {}) {
  const lower = env.toLowerCase();
  return { credentialRef: `hosted.${lower}`, environment: env, bindingVersion: '2', merchant_id: `merchant-${lower}`,
    store_id: `store-${lower}`, channel_id: `channel-${lower}`, channelKey: `channel-key-${lower}`, checkoutFlow: flow,
    payMethod: flow === 'KAKAOPAY_DIRECT_V1' ? 'EASY_PAY' : 'CARD', easyPayProvider: flow === 'KAKAOPAY_DIRECT_V1' ? 'KAKAOPAY' : null,
    buyer: flow === 'KAKAOPAY_DIRECT_V1' ? 'NONE' : 'NAME_EMAIL_PHONE', productType: 'DIGITAL', virtualAccountValidHours: null,
    acceptsCheckout: true, ...overrides };
}
function channelsEnv(entries: ReturnType<typeof channel>[]) {
  const env: Record<string, string> = { PORTONE_HOSTED_CHANNELS: JSON.stringify(entries) };
  for (const entry of entries) {
    env[`PORTONE_HOSTED_SECRET__${entry.credentialRef.toUpperCase().replace(/[^A-Z0-9]/g, '_')}__${entry.environment}`] = `api-secret-${entry.environment}`;
  }
  return env;
}
const scopeOf = (env: Env) => ({ merchant_id: `merchant-${env.toLowerCase()}`, store_id: `store-${env.toLowerCase()}`,
  channel_id: `channel-${env.toLowerCase()}`, channel_type: env });

function payment(env: Env, status: string, method?: unknown, extra: Record<string, unknown> = {}) {
  const s = scopeOf(env);
  return { id: PAYMENT, transactionId: 'tx-hosted', version: 'V2', status, merchantId: s.merchant_id, storeId: s.store_id,
    channel: { id: s.channel_id, type: env, key: `channel-key-${env.toLowerCase()}`, pgProvider: 'INICIS_V2' },
    ...(method === undefined ? {} : { method }), customData: JSON.stringify({ version: 'v2', order_id: ORDER }),
    paidAt: status === 'PAID' ? PAID_AT : undefined, amount: { total: 1000, paid: status === 'PAID' ? 1000 : 0, cancelled: 0 },
    currency: 'KRW', ...extra };
}
const CARD = { type: 'PaymentMethodCard', card: { number: 'PII-CARD' } };
const NAVER = { type: 'PaymentMethodEasyPay', provider: 'NAVERPAY' };
const KAKAO = { type: 'PaymentMethodEasyPay', provider: 'KAKAOPAY' };

function harness(env: Env, flow: Flow = 'PG_HOSTED_V1', options: { channel?: Record<string, unknown> } = {}) {
  const context = { chargeAuthority: false, orderId: ORDER, provider: 'PORTONE', environment: env, rowVersion: '1',
    paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE', actorDeleted: false, quoteId: ORDER, quoteHash: QUOTE_HASH,
    productId: 'STAR_100', amountMinor: '1000', currency: 'KRW', quantity: '1', quoteExpiresAt: DEADLINE, contextId: CONTEXT,
    verificationBindingPresent: true, providerOrderId: null, providerCaptureId: null, paymentId: PAYMENT, attemptId: null,
    submissionIntentRecorded: false, reviewRequired: false };
  const lease = { attemptId: ORDER, leaseToken: CONTEXT, fencingVersion: '1', rowVersion: '2', providerRequestKey: USER,
    submitNotAfter: DEADLINE, quoteHash: QUOTE_HASH };
  const binding = { orderId: ORDER, contextId: CONTEXT, quoteId: ORDER, quoteHash: QUOTE_HASH, provider: 'PORTONE', environment: env,
    billingCountry: 'KR', scope: scopeOf(env), bindingId: USER, bindingVersion: '2', bindingHash: BINDING_HASH,
    credentialRef: `hosted.${env.toLowerCase()}`, verification: { contract: 'HOSTED', checkoutFlow: flow, paymentMethod: null } as unknown };
  const repository = {
    getChargeContext: vi.fn(async () => ({ kind: 'FOUND', context: { ...context } })),
    prepareProviderContext: vi.fn(async () => ({ kind: 'PREPARED', replayed: true, contextId: CONTEXT, orderId: ORDER, quoteId: ORDER,
      quoteHash: QUOTE_HASH, provider: 'PORTONE', environment: env, scope: scopeOf(env), settingsVersion: '1', createRequestKey: KEY, paymentId: PAYMENT })),
    claimCharge: vi.fn(async (): Promise<unknown> => ({ kind: 'SUBMIT', reason: 'LEASE_CLAIMED', lease })),
    recordSubmissionIntent: vi.fn(async (): Promise<unknown> => {
      context.submissionIntentRecorded = true; context.paymentState = 'SUBMISSION_UNKNOWN';
      return { kind: 'SUBMIT', reason: 'INTENT_RECORDED', lease: { ...lease, rowVersion: '3' } };
    }),
    bindPaidObservation: vi.fn(async (_context: string, evidence: { payment_method?: unknown }): Promise<unknown> =>
      ({ kind: 'RECORDED', observationId: evidence.payment_method ? METHOD_OBSERVATION : BASE_OBSERVATION, replayed: false })),
    receivePurchase: vi.fn(),
    receiveHostedEvent: vi.fn(async (): Promise<unknown> => ({ outcome: 'ACCEPTED', reasonCode: null, replayed: false, orderId: ORDER })),
    getHostedOrderStatus: vi.fn(async (): Promise<unknown> => ({ state: null })),
  };
  const transport = { getPayment: vi.fn(async (): Promise<unknown> => payment(env, 'READY')), confirmPayment: vi.fn(async () => undefined) };
  const entry = { authorizeHostedEntry: vi.fn(async (): Promise<unknown> => ({ kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT,
    createRequestKey: KEY, quoteHash: QUOTE_HASH, bindingHash: BINDING_HASH, entryNotAfter: DEADLINE, checkoutFlow: flow,
    environment: env, scope: scopeOf(env) })) };
  const availability = { isOpen: vi.fn(async (_env: Env) => true) };
  const deps: any = { repository, bindings: { getProviderBinding: vi.fn(async () => binding) }, entry, transport, availability,
    channels: readPortOneHostedChannels(channelsEnv([channel(env, flow, options.channel)])), continuationSecret: SECRET, nowMs: () => NOW };
  const bound = () => repository.bindPaidObservation.mock.calls.map(call => call[1] as Record<string, any>);
  const hints = () => repository.receiveHostedEvent.mock.calls.map(call => (call as unknown[])[0] as Record<string, any>);
  return { deps, repository, context, binding, transport, entry, availability, lease, bound, hints };
}
type H = ReturnType<typeof harness>;
const input = { actorUserId: USER, orderId: ORDER };
async function ready(h: H) {
  const result = await checkoutPortOneHosted(h.deps, input);
  if (result.state !== 'READY') throw new Error(`checkout ${result.state}`);
  return result;
}
async function confirmAfterCheckout(h: H, paid: unknown) {
  const entry = await ready(h);
  h.transport.getPayment.mockReset();
  h.transport.getPayment.mockResolvedValueOnce(payment(h.context.environment as Env, 'READY')).mockResolvedValue(paid);
  return confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', continuation: entry.continuation });
}
function submitted(h: H) { h.context.submissionIntentRecorded = true; h.context.paymentState = 'SUBMISSION_UNKNOWN'; }
beforeEach(() => vi.clearAllMocks());

describe.each(ENVS)('PortOne hosted checkout release (%s)', env => {
  it('returns only public SDK settings bound to the frozen order, scope and channel', async () => {
    const h = harness(env);
    const result = await ready(h);
    expect(result).toEqual({ state: 'READY', orderId: ORDER, environment: env, productId: 'STAR_100', expiresAt: DEADLINE,
      continuation: expect.stringMatching(/^v1\.[0-9]+\.[A-Za-z0-9_-]{43}$/),
      sdk: { storeId: `store-${env.toLowerCase()}`, channelKey: `channel-key-${env.toLowerCase()}`, paymentId: PAYMENT, totalAmount: 1000,
        currency: 'KRW', payMethod: 'CARD', easyPayProvider: null, buyer: 'NAME_EMAIL_PHONE', productType: 'DIGITAL',
        virtualAccountValidHours: null, giftCertificateType: null, isTestChannel: env === 'TEST' } });
    expect(JSON.stringify(result)).not.toMatch(/api-secret|merchant-/);
    expect(h.entry.authorizeHostedEntry).toHaveBeenCalledExactlyOnceWith({ actorUserId: USER, orderId: ORDER, contextId: CONTEXT,
      createRequestKey: KEY, bindingHash: BINDING_HASH });
    expect(h.availability.isOpen).toHaveBeenCalledWith(env);
    expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it('maps the dedicated KakaoPay flow to EASY_PAY with the KakaoPay provider', async () => {
    const h = harness(env, 'KAKAOPAY_DIRECT_V1');
    expect((await ready(h)).sdk).toMatchObject({ payMethod: 'EASY_PAY', easyPayProvider: 'KAKAOPAY', buyer: 'NONE' });
  });
  it.each(['TRANSFER', 'VIRTUAL_ACCOUNT', 'MOBILE', 'GIFT_CERTIFICATE', 'EASY_PAY'])('releases the server-mapped %s launch route', async payMethod => {
    const h = harness(env, 'PG_HOSTED_V1', { channel: { payMethod, virtualAccountValidHours: payMethod === 'VIRTUAL_ACCOUNT' ? 24 : null } });
    expect((await ready(h)).sdk).toMatchObject({ payMethod, virtualAccountValidHours: payMethod === 'VIRTUAL_ACCOUNT' ? 24 : null });
  });
  it('releases a configured gift certificate kind and an integrated EASY_PAY wallet without a PICNIC selector', async () => {
    let h = harness(env, 'PG_HOSTED_V1', { channel: { payMethod: 'GIFT_CERTIFICATE', giftCertificateType: 'CULTURELAND' } });
    expect((await ready(h)).sdk).toMatchObject({ payMethod: 'GIFT_CERTIFICATE', giftCertificateType: 'CULTURELAND' });
    h = harness(env, 'PG_HOSTED_V1', { channel: { payMethod: 'EASY_PAY', easyPayProvider: 'NAVERPAY' } });
    expect((await ready(h)).sdk).toMatchObject({ payMethod: 'EASY_PAY', easyPayProvider: 'NAVERPAY', giftCertificateType: null });
  });
  it('does not release a payable checkout while hosted recovery is not open', async () => {
    for (const availability of [null, { isOpen: vi.fn(async () => false) }, { isOpen: vi.fn(async () => { throw new Error('x'); }) }]) {
      const h = harness(env); h.deps.availability = availability;
      expect(await checkoutPortOneHosted(h.deps, input)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
      expect(h.repository.prepareProviderContext).not.toHaveBeenCalled(); expect(h.entry.authorizeHostedEntry).not.toHaveBeenCalled();
    }
  });
  it('stays unavailable when channels, credentials or the continuation secret are not provisioned', async () => {
    let h = harness(env); h.deps.channels = readPortOneHostedChannels({});
    expect((await checkoutPortOneHosted(h.deps, input)).state).toBe('UNAVAILABLE');
    h = harness(env, 'PG_HOSTED_V1', { channel: { acceptsCheckout: false } });
    expect((await checkoutPortOneHosted(h.deps, input)).state).toBe('UNAVAILABLE');
    h = harness(env); h.deps.continuationSecret = null;
    expect((await checkoutPortOneHosted(h.deps, input)).state).toBe('UNAVAILABLE');
    expect(h.entry.authorizeHostedEntry).not.toHaveBeenCalled();
  });
  const authorized = (overrides: Record<string, unknown>) => ({ kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT, createRequestKey: KEY,
    quoteHash: QUOTE_HASH, bindingHash: BINDING_HASH, entryNotAfter: DEADLINE, checkoutFlow: 'PG_HOSTED_V1', environment: env, scope: scopeOf(env), ...overrides });
  it.each([
    ['legacy binding', (h: H) => { h.binding.verification = { contract: 'LEGACY' }; }],
    ['other environment binding', (h: H) => { h.binding.environment = env === 'TEST' ? 'LIVE' : 'TEST'; }],
    ['changed binding scope', (h: H) => { h.binding.scope = { ...scopeOf(env), store_id: 'other-store' }; }],
    ['entry blocked', (h: H) => { h.entry.authorizeHostedEntry.mockResolvedValue({ kind: 'BLOCKED', reason: 'ACTOR_NOT_ALLOWED' }); }],
    ['entry environment', (h: H) => { h.entry.authorizeHostedEntry.mockResolvedValue(authorized({ environment: env === 'TEST' ? 'LIVE' : 'TEST' })); }],
    ['entry flow', (h: H) => { h.entry.authorizeHostedEntry.mockResolvedValue(authorized({ checkoutFlow: 'KAKAOPAY_DIRECT_V1' })); }],
    ['entry scope', (h: H) => { h.entry.authorizeHostedEntry.mockResolvedValue(authorized({ scope: { ...scopeOf(env), channel_id: 'other' } })); }],
    ['expired entry', (h: H) => { h.entry.authorizeHostedEntry.mockResolvedValue(authorized({ entryNotAfter: '2026-11-24T00:00:00Z' })); }],
    ['prepared environment', (h: H) => { h.repository.prepareProviderContext.mockResolvedValue({ kind: 'PREPARED', replayed: true, contextId: CONTEXT,
      orderId: ORDER, quoteId: ORDER, quoteHash: QUOTE_HASH, provider: 'PORTONE', environment: env === 'TEST' ? 'LIVE' : 'TEST',
      scope: scopeOf(env), settingsVersion: '1', createRequestKey: KEY, paymentId: PAYMENT }); }],
  ])('holds checkout on %s', async (_label, change) => {
    const h = harness(env); change(h);
    expect((await checkoutPortOneHosted(h.deps, input)).state).toBe('BLOCKED');
    expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it('never releases checkout again after submission', async () => {
    const h = harness(env); submitted(h);
    expect(await checkoutPortOneHosted(h.deps, input)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.repository.prepareProviderContext).not.toHaveBeenCalled();
  });
});

describe.each(ENVS)('PortOne hosted confirmation (%s)', env => {
  it('confirms once after durable lease and intent, records verified PAID facts and hands recovery to the DB worker', async () => {
    const h = harness(env);
    expect(await confirmAfterCheckout(h, payment(env, 'PAID', CARD))).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.repository.claimCharge).toHaveBeenCalledTimes(1); expect(h.repository.recordSubmissionIntent).toHaveBeenCalledTimes(1);
    expect(h.repository.recordSubmissionIntent.mock.invocationCallOrder[0]).toBeLessThan(h.transport.confirmPayment.mock.invocationCallOrder[0]);
    expect(h.transport.confirmPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ store_id: `store-${env.toLowerCase()}`,
      apiSecret: `api-secret-${env}` }), PAYMENT, { storeId: `store-${env.toLowerCase()}`, txId: 'tx-hosted', paymentToken: 'private-token',
      totalAmount: 1000, currency: 'KRW', ...(env === 'TEST' ? { isTest: true } : {}) });
    expect(h.bound().map(e => [e.key, e.environment, e.payment_method])).toEqual([
      [`PAYMENT:${PAYMENT}:PAID`, env, undefined], [`PAYMENT:${PAYMENT}:PAID:CARD`, env, { type: 'CARD' }]]);
    expect(h.hints()).toEqual([{ contract_version: 'web-payment-portone-hosted-event.v1', source: 'RETURN', environment: env,
      store_id: `store-${env.toLowerCase()}`, payment_id: PAYMENT, delivery_id: expect.stringMatching(/^return:[0-9a-f]{64}$/),
      event_type: 'RETURN', actor_user_id: USER }]);
    expect(h.repository.receivePurchase).not.toHaveBeenCalled();
    expect(JSON.stringify(h.repository.claimCharge.mock.calls) + JSON.stringify(h.bound()) + JSON.stringify(h.hints())).not.toContain('private-token');
    h.context.settlementState = 'GRANTED';
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: 'GRANTED', orderId: ORDER });
  });
  it.each([
    ['KG card-window wallet', NAVER, 'EASY_PAY:NAVERPAY'], ['transfer', { type: 'PaymentMethodTransfer' }, 'TRANSFER'],
    ['virtual account deposit', { type: 'PaymentMethodVirtualAccount', accountNumber: 'PII' }, 'VIRTUAL_ACCOUNT'],
    ['mobile', { type: 'PaymentMethodMobile' }, 'MOBILE'], ['gift certificate', { type: 'PaymentMethodGiftCertificate' }, 'GIFT_CERTIFICATE'],
    ['convenience store', { type: 'PaymentMethodConvenienceStore' }, 'CONVENIENCE_STORE'],
  ])('records the actual %s instrument shown by the integrated PG window', async (_label, method, slot) => {
    const h = harness(env);
    await confirmAfterCheckout(h, payment(env, 'PAID', method));
    expect(h.bound()[1].key).toBe(`PAYMENT:${PAYMENT}:PAID:${slot}`);
    expect(JSON.stringify(h.bound())).not.toContain('PII');
  });
  it.each([
    ['full price', { total: 1000, paid: 1000, cancelled: 0, discount: 0 }],
    ['full price without a discount field', { total: 1000, paid: 1000, cancelled: 0 }],
    ['wallet points', { total: 1000, paid: 700, cancelled: 0, discount: 300 }],
    ['points for the whole order', { total: 1000, paid: 0, cancelled: 0, discount: 1000 }],
  ])('accepts an easy-pay PAID amount with %s under the exact gross/paid/discount equation', async (_label, amount) => {
    const h = harness(env);
    await confirmAfterCheckout(h, payment(env, 'PAID', NAVER, { amount }));
    expect(h.bound().map(e => [e.key, e.amount_minor])).toEqual([[`PAYMENT:${PAYMENT}:PAID`, '1000'], [`PAYMENT:${PAYMENT}:PAID:EASY_PAY:NAVERPAY`, '1000']]);
  });
  it.each([
    ['paid plus discount above total', { total: 1000, paid: 800, cancelled: 0, discount: 300 }],
    ['paid plus discount below total', { total: 1000, paid: 600, cancelled: 0, discount: 300 }],
    ['negative discount', { total: 1000, paid: 1001, cancelled: 0, discount: -1 }],
    ['discount above total', { total: 1000, paid: -1, cancelled: 0, discount: 1001 }],
    ['fractional discount', { total: 1000, paid: 699.5, cancelled: 0, discount: 300.5 }],
    ['string discount', { total: 1000, paid: 700, cancelled: 0, discount: '300' }],
    ['cancelled money', { total: 1000, paid: 700, cancelled: 100, discount: 300 }],
    ['other gross total', { total: 1300, paid: 1000, cancelled: 0, discount: 300 }],
  ])('keeps an ambiguous discounted amount pending without evidence: %s', async (_label, amount) => {
    const h = harness(env);
    expect(await confirmAfterCheckout(h, payment(env, 'PAID', NAVER, { amount }))).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
  });
  it('never turns an absent or unknown method into card', async () => {
    for (const method of [undefined, { type: 'PaymentMethodCrypto' }]) {
      const h = harness(env);
      await confirmAfterCheckout(h, payment(env, 'PAID', method));
      expect(h.bound().map(e => e.key)).toEqual([`PAYMENT:${PAYMENT}:PAID`]);
      expect(h.hints()).toHaveLength(1);
    }
  });
  it('stops method metadata when the base observation needs review', async () => {
    const h = harness(env); h.repository.bindPaidObservation.mockResolvedValueOnce({ kind: 'REVIEW_REQUIRED', reason: 'OBSERVATION_KEY_CONFLICT',
      observationId: BASE_OBSERVATION, replayed: false });
    await confirmAfterCheckout(h, payment(env, 'PAID', CARD));
    expect(h.bound()).toHaveLength(1);
  });
  it('treats READY, virtual account issuance and a browser callback alone as pending, never credit', async () => {
    for (const status of ['READY', 'VIRTUAL_ACCOUNT_ISSUED']) {
      const h = harness(env);
      expect(await confirmAfterCheckout(h, payment(env, status, { type: 'PaymentMethodVirtualAccount' }))).toEqual({ state: 'PENDING', orderId: ORDER });
      expect(h.repository.bindPaidObservation).not.toHaveBeenCalled(); expect(h.repository.receivePurchase).not.toHaveBeenCalled();
    }
  });
  it('rejects a paid read from the other environment, store or price', async () => {
    const other: Env = env === 'TEST' ? 'LIVE' : 'TEST';
    for (const paid of [payment(env, 'PAID', CARD, { channel: { id: scopeOf(env).channel_id, type: other, key: `channel-key-${env.toLowerCase()}` } }),
      payment(env, 'PAID', CARD, { storeId: 'other-store' }), payment(env, 'PAID', CARD, { amount: { total: 1001, paid: 1001, cancelled: 0 } })]) {
      const h = harness(env); await confirmAfterCheckout(h, paid);
      expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
    }
  });
  it('replays and app-switch returns never POST a second confirmation', async () => {
    const h = harness(env); const entry = await ready(h);
    const approval = { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', continuation: entry.continuation };
    await confirmPortOneHosted(h.deps, approval);
    h.transport.confirmPayment.mockRejectedValue(new Error('private-token'));
    expect((await confirmPortOneHosted(h.deps, approval)).state).toBe('PENDING');
    expect((await lookupPortOneHosted(h.deps, input)).state).toBe('PENDING');
    expect(h.transport.confirmPayment).toHaveBeenCalledTimes(1); expect(h.repository.claimCharge).toHaveBeenCalledTimes(1);
    expect(new Set(h.hints().slice(0, 2).map(hint => hint.delivery_id)).size).toBe(1);
  });
  it('keeps a pending result when the recovery hint cannot be delivered', async () => {
    const h = harness(env); h.repository.receiveHostedEvent.mockRejectedValue(new Error('x'));
    expect(await confirmAfterCheckout(h, payment(env, 'PAID', CARD))).toEqual({ state: 'PENDING', orderId: ORDER });
  });
  it.each([
    ['another actor', (c: Record<string, unknown>) => ({ ...c, actorUserId: OTHER })],
    ['another payment', (c: Record<string, unknown>) => ({ ...c, paymentId: `web_${ORDER}` })],
    ['a tampered continuation', (c: Record<string, any>) => ({ ...c, continuation: c.continuation.slice(0, -1) + (c.continuation.endsWith('A') ? 'B' : 'A') })],
    ['a missing continuation', (c: Record<string, unknown>) => ({ ...c, continuation: '' })],
  ])('refuses a confirmation with %s before any provider call', async (_label, change) => {
    const h = harness(env); const entry = await ready(h);
    const approval = change({ ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', continuation: entry.continuation });
    expect((await confirmPortOneHosted(h.deps, approval as any)).state).toBe('BLOCKED');
    expect(h.transport.getPayment).not.toHaveBeenCalled(); expect(h.repository.claimCharge).not.toHaveBeenCalled();
  });
  it('refuses an expired continuation', async () => {
    const h = harness(env); const entry = await ready(h); h.deps.nowMs = () => Date.parse(DEADLINE) + 16 * 60_000;
    expect((await confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token',
      continuation: entry.continuation })).state).toBe('BLOCKED');
    expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it('does not allow the initial CONFIRM when hosted recovery is closed, even with a valid continuation', async () => {
    const h = harness(env); const entry = await ready(h); h.availability.isOpen.mockResolvedValue(false);
    expect((await confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token',
      continuation: entry.continuation })).state).toBe('UNAVAILABLE');
    expect(h.repository.claimCharge).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('holds a payment already PAID before this order recorded intent', async () => {
    const h = harness(env); const entry = await ready(h); h.transport.getPayment.mockResolvedValue(payment(env, 'PAID', CARD));
    expect((await confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token',
      continuation: entry.continuation })).state).toBe('BLOCKED');
    expect(h.repository.claimCharge).not.toHaveBeenCalled(); expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
  });
});

describe.each(ENVS)('PortOne dedicated KakaoPay flow (%s)', env => {
  it('records KakaoPay EasyPay facts, including a read that omits the provider', async () => {
    for (const method of [KAKAO, { type: 'PaymentMethodEasyPay' }]) {
      const h = harness(env, 'KAKAOPAY_DIRECT_V1');
      await confirmAfterCheckout(h, payment(env, 'PAID', method));
      expect(h.bound()).toHaveLength(2);
    }
  });
  it('rejects an affirmative contradiction before confirmation and never records it at PAID', async () => {
    let h = harness(env, 'KAKAOPAY_DIRECT_V1'); const entry = await ready(h);
    h.transport.getPayment.mockResolvedValue(payment(env, 'READY', CARD));
    expect((await confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token',
      continuation: entry.continuation })).state).toBe('BLOCKED');
    expect(h.repository.claimCharge).not.toHaveBeenCalled();
    for (const method of [CARD, NAVER]) {
      h = harness(env, 'KAKAOPAY_DIRECT_V1');
      await confirmAfterCheckout(h, payment(env, 'PAID', method));
      expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
    }
  });
});

describe.each(ENVS)('PortOne hosted owned historical status (%s)', env => {
  it.each([['AWAITING_DEPOSIT', 'AWAITING_DEPOSIT'], ['CANCELLED', 'CANCELLED'], ['REFUND_PENDING', 'REFUND_PENDING'],
    ['REFUNDED', 'REFUNDED'], ['FAILED', 'FAILED'], ['REVIEW', 'BLOCKED']])('reports %s over the charge context, including after a grant', async (status, expected) => {
    const h = harness(env); submitted(h); h.context.settlementState = 'GRANTED';
    h.repository.getHostedOrderStatus.mockResolvedValue({ state: status });
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: expected, orderId: ORDER });
    expect(h.repository.getHostedOrderStatus).toHaveBeenCalledWith(USER, ORDER);
  });
  it('uses the ordinary charge context for a null state and keeps the new pre-context order flow', async () => {
    const h = harness(env); h.context.contextId = null as any; h.context.paymentId = null as any; h.context.verificationBindingPresent = false;
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: 'NOT_SUBMITTED', orderId: ORDER });
    h.context.contextId = CONTEXT; h.context.paymentId = PAYMENT; h.context.verificationBindingPresent = true;
    expect((await checkoutPortOneHosted(h.deps, input)).state).toBe('READY');
  });
  it('never shows GRANTED or releases a launch when the status read fails or is malformed', async () => {
    let h = harness(env); h.context.settlementState = 'GRANTED'; h.repository.getHostedOrderStatus.mockRejectedValue(new Error('x'));
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
    h = harness(env); h.repository.getHostedOrderStatus.mockRejectedValue(new Error('x'));
    expect(await checkoutPortOneHosted(h.deps, input)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
    expect(h.repository.prepareProviderContext).not.toHaveBeenCalled();
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
  });
  it.each(['AWAITING_DEPOSIT', 'CANCELLED', 'FAILED', 'REFUNDED', 'REVIEW'])('never releases a fresh SDK launch for %s', async status => {
    const h = harness(env); h.repository.getHostedOrderStatus.mockResolvedValue({ state: status });
    expect((await checkoutPortOneHosted(h.deps, input)).state).toBe(status === 'REVIEW' ? 'BLOCKED' : status);
    expect(h.repository.prepareProviderContext).not.toHaveBeenCalled(); expect(h.entry.authorizeHostedEntry).not.toHaveBeenCalled();
  });
  it('reports a blocked-before-grant review without confirming', async () => {
    const h = harness(env); const entry = await ready(h); h.repository.getHostedOrderStatus.mockResolvedValue({ state: 'REVIEW' });
    expect(await confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token',
      continuation: entry.continuation })).toEqual({ state: 'BLOCKED', orderId: ORDER });
    expect(h.repository.claimCharge).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
  it('a duplicate mobile return after virtual account issuance reports the deposit wait and never posts twice', async () => {
    const h = harness(env); const entry = await ready(h);
    h.transport.getPayment.mockResolvedValueOnce(payment(env, 'READY'))
      .mockResolvedValue(payment(env, 'VIRTUAL_ACCOUNT_ISSUED', { type: 'PaymentMethodVirtualAccount' }));
    h.transport.confirmPayment.mockImplementation(async () => { h.repository.getHostedOrderStatus.mockResolvedValue({ state: 'AWAITING_DEPOSIT' }); });
    const approval = { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', continuation: entry.continuation };
    expect(await confirmPortOneHosted(h.deps, approval)).toEqual({ state: 'AWAITING_DEPOSIT', orderId: ORDER });
    expect(await confirmPortOneHosted(h.deps, approval)).toEqual({ state: 'AWAITING_DEPOSIT', orderId: ORDER });
    expect(h.transport.confirmPayment).toHaveBeenCalledTimes(1); expect(h.repository.bindPaidObservation).not.toHaveBeenCalled();
  });
  it('re-reads the provider for a deposit wait but not for ended or refunding attempts', async () => {
    let h = harness(env); submitted(h); h.repository.getHostedOrderStatus.mockResolvedValue({ state: 'AWAITING_DEPOSIT' });
    h.transport.getPayment.mockResolvedValue(payment(env, 'VIRTUAL_ACCOUNT_ISSUED', { type: 'PaymentMethodVirtualAccount' }));
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'AWAITING_DEPOSIT', orderId: ORDER });
    expect(h.transport.getPayment).toHaveBeenCalledTimes(1); expect(h.hints()).toHaveLength(1);
    for (const status of ['CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED']) {
      h = harness(env); submitted(h); h.context.settlementState = 'GRANTED'; h.repository.getHostedOrderStatus.mockResolvedValue({ state: status });
      expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: status, orderId: ORDER });
      expect(h.transport.getPayment).not.toHaveBeenCalled();
    }
  });
});

describe.each(ENVS)('PortOne hosted confirmed expiry (%s)', env => {
  const LATER = Date.parse(DEADLINE) + 1;
  it('reports EXPIRED only for an unsubmitted order past its quote deadline, and never launches or confirms it', async () => {
    const h = harness(env); const entry = await ready(h); h.deps.nowMs = () => LATER;
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: 'EXPIRED', orderId: ORDER });
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'EXPIRED', orderId: ORDER });
    h.repository.prepareProviderContext.mockClear(); h.entry.authorizeHostedEntry.mockClear();
    expect(await checkoutPortOneHosted(h.deps, input)).toEqual({ state: 'EXPIRED', orderId: ORDER });
    expect(h.repository.prepareProviderContext).not.toHaveBeenCalled();
    // The continuation itself is still inside its grace window here; expiry is decided by the order.
    h.deps.nowMs = () => Date.parse(DEADLINE) + 60_000;
    expect(await confirmPortOneHosted(h.deps, { ...input, paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token',
      continuation: entry.continuation })).toEqual({ state: 'EXPIRED', orderId: ORDER });
    expect(h.repository.claimCharge).not.toHaveBeenCalled(); expect(h.transport.confirmPayment).not.toHaveBeenCalled();
    expect(h.transport.getPayment).not.toHaveBeenCalled();
  });
  it('keeps a submitted order lookup-only after the quote deadline instead of calling it expired', async () => {
    const h = harness(env); submitted(h); h.deps.nowMs = () => LATER;
    h.transport.getPayment.mockResolvedValue(payment(env, 'PAID', CARD));
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.transport.confirmPayment).not.toHaveBeenCalled();
  });
});

describe.each(ENVS)('PortOne hosted lookup-only recovery (%s)', env => {
  it('recovers an unknown outcome by lookup only, after checkout and opening are closed', async () => {
    const h = harness(env, 'PG_HOSTED_V1', { channel: { acceptsCheckout: false } }); submitted(h); h.availability.isOpen.mockResolvedValue(false);
    h.transport.getPayment.mockResolvedValue(payment(env, 'PAID', CARD));
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'PENDING', orderId: ORDER });
    expect(h.transport.getPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ apiSecret: `api-secret-${env}` }), PAYMENT);
    expect(h.bound()).toHaveLength(2);
    expect(h.hints()).toEqual([expect.objectContaining({ source: 'RETURN', environment: env, payment_id: PAYMENT, actor_user_id: USER })]);
    expect(h.transport.confirmPayment).not.toHaveBeenCalled(); expect(h.entry.authorizeHostedEntry).not.toHaveBeenCalled();
  });
  it('does not read the provider or send a hint for an order without recorded intent', async () => {
    const h = harness(env);
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'NOT_SUBMITTED', orderId: ORDER });
    expect(h.transport.getPayment).not.toHaveBeenCalled(); expect(h.repository.receiveHostedEvent).not.toHaveBeenCalled();
  });
  it('reads only the owner order and returns a closed state for others', async () => {
    const h = harness(env); h.repository.getChargeContext.mockResolvedValue({ kind: 'NOT_FOUND' } as any);
    expect(await lookupPortOneHosted(h.deps, input)).toEqual({ state: 'BLOCKED', orderId: ORDER });
    expect(await getPortOneHostedStatus(h.deps, input)).toEqual({ state: 'BLOCKED', orderId: ORDER });
  });
});
