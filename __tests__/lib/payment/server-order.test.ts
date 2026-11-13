// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mapServerOrder, parseServerOrderRequest } from '@/lib/payment/server-order';

const request = { productId: 'STAR100', provider: 'paypal', billingCountry: 'US',
  requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', acceptedPolicyVersion: 'policy-v1' };
// Synthetic RPC JSON mirrors the order migration, including private fields to strip.
function rpc() {
  return { order_id: '11111111-1111-4111-8111-111111111111',
    quote_id: '22222222-2222-4222-8222-222222222222', replayed: false,
    quote: { contract_version: 'web-payment-quote.v1', product_id: 'STAR100', product_name: '별사탕',
      provider: 'PAYPAL', environment: 'SANDBOX', billing_country: 'US', currency: 'USD',
      amount_minor: '9223372036854775807', base_star: '9007199254740993', product_bonus: '0', quantity: '1',
      issued_at: '2026-11-13T00:00:00.123456+00:00', expires_at: '2026-11-13T00:15:00.123456+00:00',
      accepted_policy_version: 'policy-v1', product_policy_version: 'product-v1', bonus_policy_version: 'bonus-v1',
      bonus_expiry_policy_version: 'expiry-v1', refund_policy_version: 'refund-v1', terms_policy_version: 'terms-v1',
      settings_version: '9', settings_hash: 'PRIVATE_SETTINGS_HASH', product_inputs: { product_type: 'consumable' },
      bonus_expiry_policy: { source: 'PRIVATE_SQL', source_hash: 'PRIVATE_SOURCE_HASH' },
      promotion_policy_hash: 'PRIVATE_PROMOTION_HASH', promotion_policy: {
        contract_version: 'web-payment-promotion.v1', campaign_code: 'CANDY_BOOST_DAY', state: 'CONDITIONAL',
        evaluation_time_basis: 'VERIFIED_PROVIDER_COMPLETED_AT', channel: 'WEB', schedule_v2_enabled: true,
        v1: { rollout_policy: { seed: 'PRIVATE_SEED' } }, v2: null,
        audience: { eligible: true, is_admin: true }, runtime_inputs: { secret: 'PRIVATE_RUNTIME' },
      } }, credential_ref: 'PRIVATE_CREDENTIAL', row_version: '999', payment_state: 'PAID' };
}

describe('server order request boundary', () => {
  it('canonicalizes ASCII identifiers and UUID without changing provider authority', () => {
    expect(parseServerOrderRequest({ ...request, productId: ' star100 ', billingCountry: ' us ',
      requestId: request.requestId.toUpperCase(), acceptedPolicyVersion: ' policy-v1 ' })).toEqual(request);
  });
  // This API deliberately accepts an ASCII subset, not every Unicode identifier
  // PostgreSQL may accept under a particular database collation.
  it.each(['\u00a0STAR100', 'STAR100\u00a0', '\u3000STAR100', 'STAR100\u3000',
    '\ufeffSTAR100', 'STAR100\ufeff', 'ſtar100', 'ı', 'ﬀ', '별', 'STAR\t100', 'STAR\u007f'])
    ('rejects non-ASCII or non-printable product identifiers %j', productId => {
      expect(parseServerOrderRequest({ ...request, productId })).toBeNull();
    });
  it.each(['\u00a0US', 'US\u00a0', '\u3000US', 'US\u3000', '\ufeffUS', 'US\ufeff', 'ıS', 'Uſ', 'ﬀ', 'U S'])
    ('rejects countries outside two ASCII letters %j', billingCountry => {
      expect(parseServerOrderRequest({ ...request, billingCountry })).toBeNull();
    });
  it.each([[' star 100 ', 'STAR 100'], [' !az~09 ', '!AZ~09'], [' abcdefghij ', 'ABCDEFGHIJ']])
    ('trims only outer ASCII spaces and preserves the printable product domain %j', (productId, expected) => {
      expect(parseServerOrderRequest({ ...request, productId })).toMatchObject({ productId: expected });
    });
  it.each(['   ', ' abcdefghijk '])('rejects empty or over-ten-character ASCII products %j', productId => {
    expect(parseServerOrderRequest({ ...request, productId })).toBeNull();
  });
  it('preserves the existing Unicode trim contract for accepted policy versions', () => {
    expect(parseServerOrderRequest({ ...request, acceptedPolicyVersion: '\u00a0\u3000\ufeffpolicy-v1\ufeff\u3000\u00a0' }))
      .toEqual(request);
  });
  it.each(['userId', 'actorUserId', 'amount', 'amountMinor', 'quantity', 'baseStar', 'environment', 'settings', 'quote', '__proto__'])
    ('rejects an untrusted extra field %s', key => {
      expect(parseServerOrderRequest({ ...request, [key]: { price: 1 } })).toBeNull();
    });
  it.each([null, [], 'text', 1, {}, { ...request, provider: 'PAYPAL' }, { ...request, provider: 'apple' },
    { ...request, productId: '' }, { ...request, productId: '12345678901' }, { ...request, productId: { id: 'STAR100' } },
    { ...request, billingCountry: 'USA' }, { ...request, billingCountry: '' },
    { ...request, requestId: 'not-a-uuid' }, { ...request, acceptedPolicyVersion: ' ' },
    { ...request, acceptedPolicyVersion: null }, { ...request, acceptedPolicyVersion: 'v1\nsecret' }])
    ('rejects malformed request %#', value => expect(parseServerOrderRequest(value)).toBeNull());
  it('leaves syntactically valid country eligibility to the authoritative RPC', () => {
    expect(parseServerOrderRequest({ ...request, billingCountry: 'ZZ' })).toMatchObject({ billingCountry: 'ZZ' });
  });
});

describe('safe order DTO', () => {
  it('preserves bigint precision and projects only the agreed public fields', () => {
    expect(mapServerOrder(rpc(), request)).toEqual({ contractVersion: 'web-payment-order.v1',
      orderId: '11111111-1111-4111-8111-111111111111', quoteId: '22222222-2222-4222-8222-222222222222', replayed: false,
      quote: { productId: 'STAR100', productName: '별사탕', provider: 'paypal', environment: 'SANDBOX', billingCountry: 'US',
        currency: 'USD', amountMinor: '9223372036854775807', baseStar: '9007199254740993', productBonus: '0', quantity: '1',
        issuedAt: '2026-11-13T00:00:00.123456+00:00', expiresAt: '2026-11-13T00:15:00.123456+00:00',
        acceptedPolicyVersion: 'policy-v1', productPolicyVersion: 'product-v1', bonusPolicyVersion: 'bonus-v1',
        bonusExpiryPolicyVersion: 'expiry-v1', refundPolicyVersion: 'refund-v1', termsPolicyVersion: 'terms-v1',
        promotion: { state: 'CONDITIONAL', campaignCode: 'CANDY_BOOST_DAY', evaluationTimeBasis: 'VERIFIED_PROVIDER_COMPLETED_AT' } } });
  });
  it('returns the immutable expired replay without declaring payment or settlement success', () => {
    const data = rpc(); data.replayed = true;
    data.quote.issued_at = '2000-01-01T00:00:00Z'; data.quote.expires_at = '2000-01-01T00:15:00Z';
    const dto = mapServerOrder(data, request);
    expect(dto).toMatchObject({ replayed: true, quote: { expiresAt: '2000-01-01T00:15:00Z' } });
    expect(JSON.stringify(dto)).not.toMatch(/PRIVATE|paymentState|settlementState|rowVersion|quoteHash|net|eligible/);
  });
  it.each([
    ['PAYPAL', 'LIVE', 'USD', 'paypal', 'US'], ['PAYPAL', 'SANDBOX', 'USD', 'paypal', 'US'],
    ['PORTONE', 'LIVE', 'KRW', 'portone', 'KR'], ['PORTONE', 'TEST', 'KRW', 'portone', 'KR'],
  ])('preserves server environment for %s/%s', (provider, environment, currency, inputProvider, country) => {
    const data = rpc(); Object.assign(data.quote, { provider, environment, currency, billing_country: country });
    expect(mapServerOrder(data, { ...request, provider: inputProvider as 'paypal' | 'portone', billingCountry: country }))
      .toMatchObject({ quote: { provider: inputProvider, environment, currency } });
  });
  it.each([
    ['contract_version', 'wrong'], ['product_id', 'OTHER'], ['provider', 'PORTONE'], ['environment', 'TEST'],
    ['environment', 'PRODUCTION'], ['currency', 'KRW'], ['billing_country', 'KR'], ['accepted_policy_version', 'other'],
    ['quantity', 1], ['quantity', '2'], ['product_name', null], ['product_name', {}], ['product_name', 'x'.repeat(256)],
    ['product_policy_version', null], ['bonus_policy_version', ''], ['bonus_expiry_policy_version', '\n'],
    ['refund_policy_version', 'private\u0000text'], ['terms_policy_version', 1], ['promotion_policy', null],
  ])('fails closed on invalid quote %s=%j', (key, value) => {
    const data = rpc(); Object.assign(data.quote, { [key]: value });
    expect(mapServerOrder(data, request)).toBeNull();
  });
  it.each(['amount_minor', 'base_star', 'product_bonus'])('rejects noncanonical or overflowing %s', key => {
    for (const value of [1, '01', '+1', '-1', '1.0', '1e2', '9223372036854775808', '', null]) {
      const data = rpc(); Object.assign(data.quote, { [key]: value });
      expect(mapServerOrder(data, request), `${key}=${value}`).toBeNull();
    }
  });
  it.each(['amount_minor', 'base_star'])('requires positive %s', key => {
    const data = rpc(); Object.assign(data.quote, { [key]: '0' }); expect(mapServerOrder(data, request)).toBeNull();
  });
  it.each([null, [], {}, { ...rpc(), replayed: 'false' }, { ...rpc(), quote: null },
    { ...rpc(), order_id: 'invalid' }, { ...rpc(), quote_id: 'invalid' }])
    ('rejects malformed envelope %#', value => expect(mapServerOrder(value, request)).toBeNull());
  it.each([
    ['state', 'GRANTED'], ['campaign_code', 'OTHER'], ['evaluation_time_basis', 'SERVER_NOW'], ['contract_version', 'unknown'],
  ])('does not invent promotion eligibility from %s', (key, value) => {
    const data = rpc(); Object.assign(data.quote.promotion_policy, { [key]: value });
    expect(mapServerOrder(data, request)).toBeNull();
  });
  it('accepts a 255-codepoint product name without treating surrogate pairs as two DB characters', () => {
    const data = rpc(); data.quote.product_name = '🌟'.repeat(255);
    expect(mapServerOrder(data, request)).toMatchObject({ quote: { productName: '🌟'.repeat(255) } });
  });
  it.each([
    ['2026-11-13T00:00:00.123456+00:00', '2026-11-13T00:15:00.123455+00:00'],
    ['2026-11-13T00:00:00.123456+00:00', '2026-11-13T00:15:00.123457+00:00'],
    ['2026-02-30T00:00:00Z', '2026-02-30T00:15:00Z'],
    ['2025-02-29T00:00:00Z', '2025-02-29T00:15:00Z'],
    ['2026-13-01T00:00:00Z', '2026-13-01T00:15:00Z'],
    ['2026-11-13T24:00:00Z', '2026-11-14T00:15:00Z'],
    ['2026-11-13T00:00:00', '2026-11-13T00:15:00'],
    ['2026-11-13T00:00:00+25:00', '2026-11-13T00:15:00+25:00'],
    ['infinity', 'infinity'], ['2026-11-13T00:00:00Z', '2026-11-13T00:14:59Z'],
  ])('rejects invalid timestamp interval %s → %s', (issued, expires) => {
    const data = rpc(); data.quote.issued_at = issued; data.quote.expires_at = expires;
    expect(mapServerOrder(data, request)).toBeNull();
  });
  it.each([
    ['2026-11-13T09:00:00.123456+09:00', '2026-11-13T00:15:00.123456Z'],
    ['2024-02-29T23:50:00.000001Z', '2024-03-01T00:05:00.000001+00:00'],
    ['2026-11-13T00:00:00.1Z', '2026-11-13T00:15:00.100000+00:00'],
  ])('compares offsets and fractional seconds exactly while preserving raw timestamps', (issued, expires) => {
    const data = rpc(); data.quote.issued_at = issued; data.quote.expires_at = expires;
    expect(mapServerOrder(data, request)).toMatchObject({ quote: { issuedAt: issued, expiresAt: expires } });
  });
});
