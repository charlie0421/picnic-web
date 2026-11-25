// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';
import { createPortOneTestBindings } from '@/lib/payment/portone-test/repository';
import { readPortOneHostedChannels } from '@/lib/payment/portone-hosted/config';
import { createHostedContinuation, verifyHostedContinuation } from '@/lib/payment/portone-hosted/continuation';
import { createHostedEntryGate } from '@/lib/payment/portone-hosted/entry';
import { createHostedAvailability, createPortOneHostedRepository } from '@/lib/payment/portone-hosted/repository';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const KEY = '55555555-5555-4555-8555-555555555555';
const PAYMENT = `web_${CONTEXT}`;
const HASH = 'a'.repeat(64);
const BINDING_HASH = 'b'.repeat(64);
const scope = (env: 'TEST' | 'LIVE') => ({ merchant_id: 'merchant', store_id: 'store', channel_id: 'channel', channel_type: env });

type Reply = { data?: unknown; error?: { code: string; message: string }; status?: number };
function rpcClient(replies: Record<string, Reply>) {
  const rpc = vi.fn((name: string, _args: unknown) => ({ retry: (retry: boolean) => { expect(retry).toBe(false); return {
    abortSignal: async () => { const reply = replies[name]; if (!reply) throw new Error('unexpected rpc');
      return { data: reply.data ?? null, error: reply.error ?? null, status: reply.status ?? (reply.error ? 400 : 200) }; },
  }; } }));
  return { rpc };
}

describe('hosted entry gate (web-payment-hosted-entry.v1)', () => {
  const input = { actorUserId: USER, orderId: ORDER, contextId: CONTEXT, createRequestKey: KEY, bindingHash: BINDING_HASH };
  const authorized = (env: 'TEST' | 'LIVE') => ({ contract_version: 'web-payment-hosted-entry.v1', outcome: 'AUTHORIZED', charge_authority: false,
    order_id: ORDER, context_id: CONTEXT, create_request_key: KEY, quote_hash: HASH, binding_hash: BINDING_HASH,
    entry_not_after: '2026-11-25T00:10:00Z', checkout_flow: 'PG_HOSTED_V1', environment: env, scope: scope(env) });
  it.each(['TEST', 'LIVE'] as const)('parses an exact %s authorization from the service RPC', async env => {
    const c = rpcClient({ authorize_web_payment_hosted_entry: { data: authorized(env) } });
    expect(await createHostedEntryGate(c as any).authorizeHostedEntry(input)).toEqual({ kind: 'AUTHORIZED', orderId: ORDER,
      contextId: CONTEXT, createRequestKey: KEY, quoteHash: HASH, bindingHash: BINDING_HASH, entryNotAfter: '2026-11-25T00:10:00Z',
      checkoutFlow: 'PG_HOSTED_V1', environment: env, scope: scope(env) });
    expect(c.rpc.mock.calls).toEqual([['authorize_web_payment_hosted_entry', { p_actor_user_id: USER, p_order_id: ORDER,
      p_context_id: CONTEXT, p_create_request_key: KEY, p_binding_hash: BINDING_HASH }]]);
  });
  it('parses the closed NOT_FOUND and BLOCKED outcomes', async () => {
    const closed = { contract_version: 'web-payment-hosted-entry.v1', outcome: 'NOT_FOUND', charge_authority: false };
    expect(await createHostedEntryGate(rpcClient({ authorize_web_payment_hosted_entry: { data: closed } }) as any)
      .authorizeHostedEntry(input)).toEqual({ kind: 'NOT_FOUND' });
    expect(await createHostedEntryGate(rpcClient({ authorize_web_payment_hosted_entry: { data: { ...closed, outcome: 'BLOCKED',
      safe_reason_code: 'ACTOR_NOT_ALLOWED' } } }) as any).authorizeHostedEntry(input)).toEqual({ kind: 'BLOCKED', reason: 'ACTOR_NOT_ALLOWED' });
  });
  it.each([
    ['ORDER_LINKED', { contract_version: 'web-payment-hosted-entry.v1', outcome: 'ORDER_LINKED', charge_authority: false }],
    ['provider-entry contract', { ...authorized('TEST'), contract_version: 'web-payment-provider-entry.v1' }],
    ['charge authority', { ...authorized('TEST'), charge_authority: true }],
    ['extra key', { ...authorized('TEST'), extra: null }],
    ['other order', { ...authorized('TEST'), order_id: USER }],
    ['other binding hash', { ...authorized('TEST'), binding_hash: HASH }],
    ['other request key', { ...authorized('TEST'), create_request_key: USER }],
    ['scope type differs from environment', { ...authorized('LIVE'), scope: scope('TEST') }],
    ['unknown flow', { ...authorized('TEST'), checkout_flow: 'PAYPAL_V1' }],
    ['unknown environment', { ...authorized('TEST'), environment: 'SANDBOX', scope: { ...scope('TEST'), channel_type: 'SANDBOX' } }],
    ['scope extra key', { ...authorized('TEST'), scope: { ...scope('TEST'), extra: 'x' } }],
    ['bad timestamp', { ...authorized('TEST'), entry_not_after: '2026-02-30T00:00:00Z' }],
    ['unknown blocked reason', { contract_version: 'web-payment-hosted-entry.v1', outcome: 'BLOCKED', charge_authority: false, safe_reason_code: 'x y' }],
  ])('fails closed on %s', async (_label, data) => {
    await expect(createHostedEntryGate(rpcClient({ authorize_web_payment_hosted_entry: { data } }) as any).authorizeHostedEntry(input))
      .rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
  });
  it('fails closed on RPC errors and invalid input without calling the RPC', async () => {
    await expect(createHostedEntryGate(rpcClient({ authorize_web_payment_hosted_entry: { error: { code: 'PGRST202', message: 'x' } } }) as any)
      .authorizeHostedEntry(input)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    const c = rpcClient({});
    await expect(createHostedEntryGate(c as any).authorizeHostedEntry({ ...input, bindingHash: 'x' })).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe('hosted event receipt (web-payment-portone-hosted-event.v1)', () => {
  const webhook = { contract_version: 'web-payment-portone-hosted-event.v1', source: 'WEBHOOK', environment: 'LIVE', store_id: 'store',
    payment_id: PAYMENT, delivery_id: 'delivery-1', event_type: 'TRANSACTION_PAID' } as const;
  const ret = { ...webhook, source: 'RETURN', environment: 'TEST', delivery_id: `return:${'c'.repeat(64)}`, event_type: 'RETURN', actor_user_id: USER } as const;
  const wire = (outcome: string, reason: string | null, order: string | null) => ({ contract_version: 'web-payment-portone-hosted-event-receipt.v1',
    outcome, reason_code: reason, replayed: false, order_id: order, trust: 'UNVERIFIED_HINT', grant_eligible: false });
  it('sends WEBHOOK and RETURN hints unchanged and parses the exact receipt', async () => {
    for (const event of [webhook, ret]) {
      const c = rpcClient({ receive_portone_hosted_event: { data: wire('ACCEPTED', null, ORDER) } });
      expect(await createPortOneHostedRepository(c as any).receiveHostedEvent(event as any))
        .toEqual({ outcome: 'ACCEPTED', reasonCode: null, replayed: false, orderId: ORDER });
      expect(c.rpc.mock.calls).toEqual([['receive_portone_hosted_event', { p_event: event }]]);
    }
    for (const reason of ['UNKNOWN_PAYMENT', 'SCOPE_MISMATCH', 'NOT_OWNER', 'DELIVERY_CONFLICT']) {
      expect(await createPortOneHostedRepository(rpcClient({ receive_portone_hosted_event: { data: wire('IGNORED', reason, null) } }) as any)
        .receiveHostedEvent(webhook as any)).toEqual({ outcome: 'IGNORED', reasonCode: reason, replayed: false, orderId: null });
    }
  });
  it.each([
    ['grant eligibility', { ...wire('ACCEPTED', null, ORDER), grant_eligible: true }],
    ['verified trust', { ...wire('ACCEPTED', null, ORDER), trust: 'SERVER_VERIFIED' }],
    ['extra key', { ...wire('ACCEPTED', null, ORDER), extra: 1 }],
    ['accepted with reason', wire('ACCEPTED', 'NOT_OWNER', ORDER)],
    ['ignored without reason', wire('IGNORED', null, null)],
    ['unknown reason', wire('IGNORED', 'OTHER', null)],
    ['bad order id', wire('ACCEPTED', null, 'x')],
    ['old contract', { ...wire('ACCEPTED', null, ORDER), contract_version: 'web-payment-portone-hosted-event-receipt.v0' }],
  ])('fails closed on a malformed receipt: %s', async (_label, data) => {
    await expect(createPortOneHostedRepository(rpcClient({ receive_portone_hosted_event: { data } }) as any).receiveHostedEvent(webhook as any))
      .rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
  });
  it.each([
    ['legacy payment id', { ...webhook, payment_id: 'PAY_1' }], ['unsafe store', { ...webhook, store_id: 'a b' }],
    ['unknown event', { ...webhook, event_type: 'TRANSACTION_CONFIRM' }], ['RETURN without actor', { ...ret, actor_user_id: undefined }],
    ['WEBHOOK with actor', { ...webhook, actor_user_id: USER }], ['RETURN event on WEBHOOK', { ...webhook, event_type: 'RETURN' }],
    ['sandbox environment', { ...webhook, environment: 'SANDBOX' }], ['long delivery id', { ...webhook, delivery_id: 'd'.repeat(201) }],
  ])('never sends a malformed hint: %s', async (_label, event) => {
    const c = rpcClient({});
    await expect(createPortOneHostedRepository(c as any).receiveHostedEvent(event as any)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe('hosted owned order status (web-payment-portone-hosted-status.v1)', () => {
  const wire = (state: unknown, order = ORDER) => ({ contract_version: 'web-payment-portone-hosted-status.v1', order_id: order, state });
  it('reads the owned status for every contract state and null for a foreign or unrouted order', async () => {
    for (const state of [null, 'AWAITING_DEPOSIT', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED', 'REVIEW']) {
      const c = rpcClient({ get_portone_hosted_order_status: { data: wire(state) } });
      expect(await createPortOneHostedRepository(c as any).getHostedOrderStatus(USER, ORDER)).toEqual({ state });
      expect(c.rpc.mock.calls).toEqual([['get_portone_hosted_order_status', { p_actor_user_id: USER, p_order_id: ORDER }]]);
    }
    expect(await createPortOneHostedRepository(rpcClient({ get_portone_hosted_order_status: { data: null } }) as any)
      .getHostedOrderStatus(USER, ORDER)).toBeNull();
  });
  it.each([['GRANTED state', wire('GRANTED')], ['other order', wire('REFUNDED', USER)], ['extra key', { ...wire('REFUNDED'), extra: 1 }],
    ['old contract', { ...wire('REFUNDED'), contract_version: 'web-payment-portone-hosted-status.v0' }]])('fails closed on %s', async (_label, data) => {
    await expect(createPortOneHostedRepository(rpcClient({ get_portone_hosted_order_status: { data } }) as any)
      .getHostedOrderStatus(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
  });
  it('fails closed on RPC errors and invalid input', async () => {
    await expect(createPortOneHostedRepository(rpcClient({ get_portone_hosted_order_status: { error: { code: 'PGRST202', message: 'x' } } }) as any)
      .getHostedOrderStatus(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    const c = rpcClient({});
    await expect(createPortOneHostedRepository(c as any).getHostedOrderStatus('x', ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe('hosted availability (web-payment-portone-hosted-availability.v1)', () => {
  const wire = (env: string, enabled: boolean) => ({ contract_version: 'web-payment-portone-hosted-availability.v1', environment: env,
    recovery_enabled: enabled, charge_authority: false });
  it.each(['TEST', 'LIVE'] as const)('opens %s only with the local opt-in and recovery_enabled=true', async env => {
    const c = rpcClient({ get_portone_hosted_availability: { data: wire(env, true) } });
    expect(await createHostedAvailability(c as any, { PORTONE_HOSTED_DOWNSTREAM_ENVIRONMENTS: 'TEST,LIVE' }).isOpen(env)).toBe(true);
    expect(c.rpc.mock.calls).toEqual([['get_portone_hosted_availability', { p_environment: env }]]);
    expect(await createHostedAvailability(rpcClient({ get_portone_hosted_availability: { data: wire(env, false) } }) as any,
      { PORTONE_HOSTED_DOWNSTREAM_ENVIRONMENTS: env }).isOpen(env)).toBe(false);
    const closed = rpcClient({ get_portone_hosted_availability: { data: wire(env, true) } });
    expect(await createHostedAvailability(closed as any, {}).isOpen(env)).toBe(false);
    expect(await createHostedAvailability(closed as any, { PORTONE_HOSTED_DOWNSTREAM_ENVIRONMENTS: env === 'TEST' ? 'LIVE' : 'TEST' }).isOpen(env)).toBe(false);
    expect(closed.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on a malformed availability or RPC error', async () => {
    for (const reply of [{ data: { ...wire('LIVE', true), charge_authority: true } }, { data: wire('TEST', true) },
      { data: { ...wire('LIVE', true), extra: 1 } }, { error: { code: 'PGRST202', message: 'missing' } }]) {
      await expect(createHostedAvailability(rpcClient({ get_portone_hosted_availability: reply }) as any,
        { PORTONE_HOSTED_DOWNSTREAM_ENVIRONMENTS: 'LIVE' }).isOpen('LIVE')).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
    }
  });
});

describe('LIVE support in the native charge context and binding readers', () => {
  it('parses a PortOne LIVE charge context through the real adapter', async () => {
    const wire = { contract_version: 'web-payment-charge-context.v1', outcome: 'FOUND', charge_authority: false, order_id: ORDER,
      provider: 'PORTONE', environment: 'LIVE', row_version: '1', payment_state: 'NOT_SUBMITTED', settlement_state: 'NOT_INTAKE',
      actor_deleted: false, quote_id: ORDER, quote_hash: HASH, product_id: 'STAR_100', amount_minor: '1000', currency: 'KRW', quantity: '1',
      quote_expires_at: '2026-11-25T00:10:00Z', context_id: CONTEXT, verification_binding_present: true, provider_order_id: null,
      provider_capture_id: null, payment_id: PAYMENT, attempt_id: null, submission_intent_recorded: false, review_required: false };
    const result = await createWebPaymentChargeRepository(rpcClient({ get_web_payment_charge_context: { data: wire } }) as any, 'CONFIRM')
      .getChargeContext(USER, ORDER);
    expect(result).toMatchObject({ kind: 'FOUND', context: { provider: 'PORTONE', environment: 'LIVE', paymentId: PAYMENT } });
  });
  const v2 = (env: 'TEST' | 'LIVE') => ({ contract_version: 'web-payment-provider-binding.v2', outcome: 'FOUND', charge_authority: false,
    order_id: ORDER, context_id: CONTEXT, quote_id: ORDER, quote_hash: HASH, provider: 'PORTONE', environment: env, billing_country: 'KR',
    scope: scope(env), binding_id: USER, binding_version: '2', binding_hash: BINDING_HASH, credential_ref: 'hosted.live',
    expected_application: null, binding_contract_version: 'web-payment-verification-binding.v2', checkout_flow: 'PG_HOSTED_V1', payment_method: null });
  it('parses a LIVE hosted binding v2 and rejects a LIVE binding with a TEST channel', async () => {
    expect(await createPortOneTestBindings(rpcClient({ get_web_payment_provider_binding_v2: { data: v2('LIVE') } }) as any)
      .getProviderBinding(USER, ORDER)).toMatchObject({ environment: 'LIVE', scope: scope('LIVE'), verification: { contract: 'HOSTED' } });
    await expect(createPortOneTestBindings(rpcClient({ get_web_payment_provider_binding_v2: { data: { ...v2('LIVE'), scope: scope('TEST') } } }) as any)
      .getProviderBinding(USER, ORDER)).rejects.toThrow('WEB_PAYMENT_CHARGE_UNAVAILABLE');
  });
});

describe('hosted channel configuration', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({ credentialRef: 'hosted.live', environment: 'LIVE', bindingVersion: '2',
    merchant_id: 'merchant', store_id: 'store', channel_id: 'channel', channelKey: 'channel-key-live', checkoutFlow: 'PG_HOSTED_V1',
    payMethod: 'CARD', easyPayProvider: null, buyer: 'NAME_EMAIL_PHONE', productType: 'DIGITAL', virtualAccountValidHours: null,
    acceptsCheckout: true, ...overrides });
  const env = (entries: unknown[], secrets: Record<string, string> = { PORTONE_HOSTED_SECRET__HOSTED_LIVE__LIVE: 'live-secret' }) =>
    ({ PORTONE_HOSTED_CHANNELS: JSON.stringify(entries), ...secrets });
  const key = { credentialRef: 'hosted.live', environment: 'LIVE' as const, bindingVersion: '2', checkoutFlow: 'PG_HOSTED_V1' as const };
  it('resolves a channel only by its frozen reference, environment, version and flow', () => {
    const channels = readPortOneHostedChannels(env([entry()]));
    expect(channels.resolve(key)).toMatchObject({ channel_type: 'LIVE', apiSecret: 'live-secret', channelKey: 'channel-key-live' });
    for (const changed of [{ environment: 'TEST' }, { bindingVersion: '3' }, { credentialRef: 'other' }, { checkoutFlow: 'KAKAOPAY_DIRECT_V1' }]) {
      expect(channels.resolve({ ...key, ...changed } as any)).toBeNull();
    }
  });
  it('is unprovisioned by default', () => {
    expect(readPortOneHostedChannels({}).resolve(key)).toBeNull();
  });
  it.each([
    ['missing secret', [entry()], {}],
    ['unknown key', [entry({ extra: 1 })], undefined],
    ['wildcard method', [entry({ payMethod: 'ALL' })], undefined],
    ['KakaoPay direct without EASY_PAY', [entry({ checkoutFlow: 'KAKAOPAY_DIRECT_V1' })], undefined],
    ['KakaoPay direct without its provider', [entry({ checkoutFlow: 'KAKAOPAY_DIRECT_V1', payMethod: 'EASY_PAY' })], undefined],
    ['provider on card', [entry({ easyPayProvider: 'KAKAOPAY' })], undefined],
    ['validity on card', [entry({ virtualAccountValidHours: 24 })], undefined],
    ['duplicate reference', [entry(), entry()], undefined],
    ['sandbox environment', [entry({ environment: 'SANDBOX' })], undefined],
    ['unsafe channel key', [entry({ channelKey: 'key\n' })], undefined],
  ])('closes the whole configuration on %s', (_label, entries, secrets) => {
    expect(readPortOneHostedChannels(env(entries, secrets)).resolve(key)).toBeNull();
  });
  it('accepts every SDK launch category and the dedicated KakaoPay route', () => {
    for (const payMethod of ['CARD', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'MOBILE', 'GIFT_CERTIFICATE', 'EASY_PAY']) {
      const channels = readPortOneHostedChannels(env([entry({ payMethod, virtualAccountValidHours: payMethod === 'VIRTUAL_ACCOUNT' ? 72 : null })]));
      expect(channels.resolve(key)?.payMethod).toBe(payMethod);
    }
    const kakao = readPortOneHostedChannels(env([entry({ checkoutFlow: 'KAKAOPAY_DIRECT_V1', payMethod: 'EASY_PAY', easyPayProvider: 'KAKAOPAY', buyer: 'NONE' })]));
    expect(kakao.resolve({ ...key, checkoutFlow: 'KAKAOPAY_DIRECT_V1' })).toMatchObject({ payMethod: 'EASY_PAY', easyPayProvider: 'KAKAOPAY' });
  });
  it('accepts a merchant-configured wallet on an integrated EASY_PAY route and a KG gift certificate kind', () => {
    expect(readPortOneHostedChannels(env([entry({ payMethod: 'EASY_PAY', easyPayProvider: 'NAVERPAY' })])).resolve(key))
      .toMatchObject({ checkoutFlow: 'PG_HOSTED_V1', payMethod: 'EASY_PAY', easyPayProvider: 'NAVERPAY' });
    for (const giftCertificateType of ['BOOKNLIFE', 'SMART_MUNSANG', 'CULTURELAND']) {
      expect(readPortOneHostedChannels(env([entry({ payMethod: 'GIFT_CERTIFICATE', giftCertificateType })])).resolve(key))
        .toMatchObject({ payMethod: 'GIFT_CERTIFICATE', giftCertificateType });
    }
    expect(readPortOneHostedChannels(env([entry({ payMethod: 'GIFT_CERTIFICATE' })])).resolve(key)).toMatchObject({ giftCertificateType: null });
    expect(readPortOneHostedChannels(env([entry()])).resolve(key)).toMatchObject({ giftCertificateType: null, easyPayProvider: null });
  });
  it.each([
    ['gift kind on card', { giftCertificateType: 'CULTURELAND' }], ['unknown gift kind', { payMethod: 'GIFT_CERTIFICATE', giftCertificateType: 'HAPPY' }],
    ['unclean wallet', { payMethod: 'EASY_PAY', easyPayProvider: 'naver pay' }], ['wallet on transfer', { payMethod: 'TRANSFER', easyPayProvider: 'NAVERPAY' }],
    ['KakaoPay direct with another wallet', { checkoutFlow: 'KAKAOPAY_DIRECT_V1', payMethod: 'EASY_PAY', easyPayProvider: 'NAVERPAY' }],
  ])('closes the configuration on %s', (_label, changed) => {
    expect(readPortOneHostedChannels(env([entry(changed)])).resolve({ ...key, checkoutFlow: (changed as any).checkoutFlow ?? 'PG_HOSTED_V1' })).toBeNull();
  });
});

describe('hosted continuation', () => {
  const SECRET = 'continuation-secret-for-tests-0123456789';
  const bind = { actorUserId: USER, orderId: ORDER, paymentId: PAYMENT };
  const NOW = Date.parse('2026-11-25T00:00:00Z');
  it('binds actor, order and payment until its expiry', () => {
    const token = createHostedContinuation(SECRET, bind, NOW + 60_000);
    expect(verifyHostedContinuation(SECRET, token, bind, NOW)).toBe(true);
    expect(verifyHostedContinuation(SECRET, token, bind, NOW + 60_001)).toBe(false);
    for (const changed of [{ actorUserId: KEY }, { orderId: KEY }, { paymentId: `web_${KEY}` }]) {
      expect(verifyHostedContinuation(SECRET, token, { ...bind, ...changed }, NOW)).toBe(false);
    }
    expect(verifyHostedContinuation('other-secret-for-tests-0123456789abcdef', token, bind, NOW)).toBe(false);
    for (const bad of ['', 'v1', `v2${token.slice(2)}`, `${token}x`, token.replace(/\.(\d+)\./, '.9$1.')]) {
      expect(verifyHostedContinuation(SECRET, bad, bind, NOW)).toBe(false);
    }
  });
});
