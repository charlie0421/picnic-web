// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assessPayPalOrder, buildPayPalEvidence, minorToPayPalValue, payPalValueToMinor,
} from '@/lib/payment/paypal-charge/protocol';
import { createPayPalFetchTransport } from '@/lib/payment/paypal-charge/transport';

const ORDER = '11111111-1111-4111-8111-111111111111';
const PROVIDER_ORDER = '5O190127TN364715T';
const CREATE_KEY = '33333333-3333-4333-8333-333333333333';
const CAPTURE_KEY = '44444444-4444-4444-8444-444444444444';
const expectedOrder = { orderId: ORDER, providerOrderId: PROVIDER_ORDER, amountMinor: '999',
  currency: 'USD' as const, merchantId: 'MERCHANTA1', billingCountry: 'US' };

function approvedOrder() {
  return { id: PROVIDER_ORDER, status: 'APPROVED', intent: 'CAPTURE',
    payment_source: { paypal: { address: { country_code: 'US' }, email_address: 'Q7pPriv@example.invalid' } },
    purchase_units: [{ custom_id: 'v2:11111111-1111-4111-8111-111111111111',
      amount: { currency_code: 'USD', value: '9.99' }, payee: { merchant_id: 'MERCHANTA1' },
      payments: { captures: [] as Array<Record<string, unknown>> } }],
    links: [{ rel: 'capture', method: 'POST', href: 'https://evil.example.invalid/Q7pPriv' }],
    update_time: '2026-11-14T00:00:01Z' };
}

const evidenceInput = { source: 'CREATE_RESPONSE' as const, provider: 'PAYPAL' as const,
  environment: 'SANDBOX' as const, identity_kind: 'ORDER' as const, external_id: PROVIDER_ORDER,
  parent_external_id: null, order_id: ORDER, user_id: '00000000-0000-4000-8000-000000000001',
  quote_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  order_reference: 'v2:11111111-1111-4111-8111-111111111111',
  scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, amount_minor: '999', currency: 'USD', status: 'CREATED' };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PayPal strict USD amounts', () => {
  it.each([
    ['999', '9.99'], ['1', '0.01'], ['100', '1.00'], ['9999999999', '99999999.99'],
    ['9007199254740993', '90071992547409.93'],
  ])('converts minor %s without losing precision', (minor, decimal) => {
    expect(minorToPayPalValue(minor)).toBe(decimal);
    expect(payPalValueToMinor(decimal)).toBe(minor);
  });
  it.each(['0', '-1', '01', '00', '1.0', ' 1', '1 ', '+1', '1e2', '１', '', '1\n', 999, null])
    ('rejects noncanonical minor input %#', value => {
      expect(minorToPayPalValue(value as string)).toBeNull();
    });
  it.each(['0.00', '-9.99', '09.99', '9.990', '9.9', '9', '.99', '+9.99', ' 9.99', '9.99 ',
    '9.99\n', '9,99', '9e0', '９.９９', 9.99, null, {}, ''])
    ('rejects lossy or noncanonical decimal %#', value => {
      expect(payPalValueToMinor(value)).toBeNull();
    });
});

describe('PayPal original ORDER assessment', () => {
  it('accepts one bound purchase unit and does not retain payer PII or links', () => {
    const result = assessPayPalOrder(approvedOrder(), expectedOrder);
    expect(result).toMatchObject({ kind: 'OK', providerOrderId: PROVIDER_ORDER, status: 'APPROVED', rawStatus: 'APPROVED', captures: [] });
    expect(JSON.stringify(result)).not.toMatch(/Q7pPriv|email_address|update_time|https:/);
  });
  it.each(['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'])
    ('keeps the exact ORDER status %s', status => {
      expect(assessPayPalOrder({ ...approvedOrder(), status }, expectedOrder)).toMatchObject({ kind: 'OK', status, rawStatus: status });
    });
  it.each(['FUTURE_STATUS', 'approved', 'UNKNOWN'])('preserves bounded unknown ORDER status %s', rawStatus => {
    expect(assessPayPalOrder({ ...approvedOrder(), status: rawStatus }, expectedOrder))
      .toMatchObject({ kind: 'OK', status: 'UNRECOGNIZED', rawStatus });
  });
  it.each([
    ['SHAPE', (o: any) => { o.status = null; }],
    ['ID', (o: any) => { o.id = 'OTHERORDER'; }],
    ['ID', (o: any) => { o.id = '../capture'; }],
    ['INTENT', (o: any) => { o.intent = 'AUTHORIZE'; }],
    ['PURCHASE_UNITS', (o: any) => { o.purchase_units = []; }],
    ['PURCHASE_UNITS', (o: any) => { o.purchase_units.push(structuredClone(o.purchase_units[0])); }],
    ['CUSTOM_ID', (o: any) => { o.purchase_units[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999'; }],
    ['AMOUNT', (o: any) => { o.purchase_units[0].amount.value = '10.00'; }],
    ['AMOUNT', (o: any) => { o.purchase_units[0].amount.value = '9.990'; }],
    ['AMOUNT', (o: any) => { o.purchase_units[0].amount.value = '9.9'; }],
    ['AMOUNT', (o: any) => { o.purchase_units[0].amount.value = 9.99; }],
    ['AMOUNT', (o: any) => { o.purchase_units[0].amount.value = '09.99'; }],
    ['CURRENCY', (o: any) => { o.purchase_units[0].amount.currency_code = 'KRW'; }],
    ['PAYEE', (o: any) => { o.purchase_units[0].payee.merchant_id = 'MERCHANTB2'; }],
    ['PAYEE', (o: any) => { delete o.purchase_units[0].payee.merchant_id; }],
    ['COUNTRY', (o: any) => { o.payment_source.paypal.address.country_code = 'KR'; }],
    ['COUNTRY', (o: any) => { o.payment_source.paypal.address.country_code = 'us'; }],
  ])('closes %s mismatch %#', (reason, mutate) => {
    const body = approvedOrder(); mutate(body);
    expect(assessPayPalOrder(body, expectedOrder)).toMatchObject({ kind: 'MISMATCH', reason });
  });
  it.each([null, [], 'APPROVED', {}, { ...approvedOrder(), purchase_units: null }])
    ('never accepts malformed original ORDER %#', body => {
      expect(assessPayPalOrder(body, expectedOrder).kind).toBe('MISMATCH');
    });
  it('checks deprecated payer country even when payment_source country matches', () => {
    const body = { ...approvedOrder(), payer: { address: { country_code: 'KR' } } };
    expect(assessPayPalOrder(body, expectedOrder)).toMatchObject({ kind: 'MISMATCH', reason: 'COUNTRY' });
  });
  it('checks deprecated payer country when payment_source country is absent', () => {
    const body: any = approvedOrder(); delete body.payment_source;
    body.payer = { address: { country_code: 'KR' } };
    expect(assessPayPalOrder(body, expectedOrder)).toMatchObject({ kind: 'MISMATCH', reason: 'COUNTRY' });
  });
  it('does not infer payer country from shipping when both official country paths are absent', () => {
    const body: any = approvedOrder(); delete body.payment_source;
    body.purchase_units[0].shipping = { address: { country_code: 'KR' } };
    expect(assessPayPalOrder(body, expectedOrder)).toMatchObject({ kind: 'OK', status: 'APPROVED' });
    expect(JSON.stringify(assessPayPalOrder(body, expectedOrder))).not.toContain('countryVerified');
  });
  it.each(['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'FAILED', 'FUTURE_CAPTURE'])
    ('keeps one actual capture and its raw status %s', status => {
      const body = approvedOrder(); body.status = 'COMPLETED';
      body.purchase_units[0].payments.captures = [{ id: '3C679366HH908993F', status,
        amount: { currency_code: 'USD', value: '9.99' } }];
      const result = assessPayPalOrder(body, expectedOrder);
      expect(result).toMatchObject({ kind: 'OK', status: 'COMPLETED' });
      if (result.kind === 'OK') {
        expect(result.captures).toHaveLength(1);
        expect(JSON.stringify(result.captures)).toContain('3C679366HH908993F');
        expect(JSON.stringify(result.captures)).toContain(status);
      }
    });
  it.each([
    [{ id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.98' } }],
    [{ id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'KRW', value: '9.99' } }],
    [{ id: '../bad', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' } }],
    [{ id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:99999999-9999-4999-8999-999999999999' }],
    [{ id: '3C679366HH908993F' }],
    [{ id: '3C679366HH908993F' }, { id: '9SECOND' }],
  ])('closes malformed, multiple or mismatched captures %#', (...captures) => {
    const body = approvedOrder(); body.purchase_units[0].payments.captures = captures;
    expect(assessPayPalOrder(body, expectedOrder).kind).toBe('MISMATCH');
  });
});

describe('review counterexamples preserve observed captures while strict assessment stays closed', () => {
  it('preserves exactly 32 nullable capture observations while refusing multiple captures', () => {
    const body = approvedOrder(); body.status = 'COMPLETED';
    body.purchase_units[0].payments.captures = Array.from({ length: 32 }, (_unused, index) => index === 31 ? {} : {
      id: `CAP${index}`, status: 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
    });
    const result = assessPayPalOrder(body, expectedOrder);
    expect(result).toMatchObject({ kind: 'MISMATCH', reason: 'CAPTURE_SHAPE' });
    expect(result.observed.captures).toHaveLength(32);
    expect(result.observed.captures.slice(0, 31)).toEqual(Array.from({ length: 31 }, (_unused, index) => ({
      providerCaptureId: `CAP${index}`, rawStatus: 'PENDING', status: 'PENDING', amountMinor: '999', currency: 'USD', orderReference: null,
    })));
    expect(result.observed.captures[31]).toEqual({ providerCaptureId: null, rawStatus: null, status: 'UNRECOGNIZED',
      amountMinor: null, currency: null, orderReference: null });
  });
  it('refuses 33 captures without retaining a partial observation array', () => {
    const body = approvedOrder(); body.status = 'COMPLETED';
    body.purchase_units[0].payments.captures = Array.from({ length: 33 }, (_unused, index) => ({
      id: `CAP${index}`, status: 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
    }));
    const result = assessPayPalOrder(body, expectedOrder);
    expect(result).toMatchObject({ kind: 'MISMATCH', reason: 'CAPTURE_SHAPE' });
    expect(result.observed.captures).toEqual([]);
  });
  it.each(['valid-second', 'malformed-first', 'malformed-second'])
    ('retains the actual capture tuples with a %s counterpart', scenario => {
      const body = approvedOrder(); body.status = 'COMPLETED';
      const first = { id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' } };
      const second = { id: '9SECOND', status: 'PENDING', amount: { currency_code: 'USD', value: '9.99' } };
      body.purchase_units[0].payments.captures = scenario === 'valid-second' ? [first, second]
        : scenario === 'malformed-first' ? [{ id: '../bad' }, first] : [first, { id: '../bad' }];
      const result = assessPayPalOrder(body, expectedOrder);
      expect(result).toMatchObject({ kind: 'MISMATCH', reason: 'CAPTURE_SHAPE' });
      expect(result.observed.captures.filter(c => c.providerCaptureId !== null)).toEqual(scenario === 'valid-second' ? [
        { providerCaptureId: '3C679366HH908993F', rawStatus: 'COMPLETED', status: 'COMPLETED', amountMinor: '999', currency: 'USD', orderReference: null },
        { providerCaptureId: '9SECOND', rawStatus: 'PENDING', status: 'PENDING', amountMinor: '999', currency: 'USD', orderReference: null },
      ] : [{ providerCaptureId: '3C679366HH908993F', rawStatus: 'COMPLETED', status: 'COMPLETED', amountMinor: '999', currency: 'USD', orderReference: null }]);
      expect(JSON.stringify(result)).not.toMatch(/Q7pPriv|email_address|update_time|https:/);
    });
  it('retains an actual capture under country conflict without inventing a country status', () => {
    const body = approvedOrder(); body.status = 'COMPLETED';
    body.payment_source.paypal.address.country_code = 'KR';
    body.purchase_units[0].payments.captures = [{ id: '3C679366HH908993F', status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '9.99' } }];
    expect(assessPayPalOrder(body, expectedOrder)).toMatchObject({ kind: 'MISMATCH', reason: 'COUNTRY', observed: {
      providerOrderId: PROVIDER_ORDER, merchantId: 'MERCHANTA1', orderReference: 'v2:11111111-1111-4111-8111-111111111111',
      captures: [{ providerCaptureId: '3C679366HH908993F', rawStatus: 'COMPLETED', amountMinor: '999', currency: 'USD' }],
    } });
  });
});

describe('bounded PayPal observation evidence', () => {
  it('uses a hand-checked canonical hash and changes key when the same ORDER advances', () => {
    const created = buildPayPalEvidence(evidenceInput);
    const approved = buildPayPalEvidence({ ...evidenceInput, status: 'APPROVED' });
    expect(created).toEqual({ ...evidenceInput, key: 'ORDER:5O190127TN364715T:CREATED',
      payload_hash: 'e6eec7f6ec1b6f2ad7f252871505dbb43d2c0d1a93353cd232734e6e87fb59b2' });
    expect(approved.key).toBe('ORDER:5O190127TN364715T:APPROVED');
    expect(approved.payload_hash).toBe('3ae45dd32128b28ffa3071571b3dc296edb5150783e0a6ace816aec672cd6381');
  });
  it('does not store an injected raw response, payer, credential, or provider completion time', () => {
    const evidence = buildPayPalEvidence({ ...evidenceInput, rawBody: 'Q7pPriv',
      accessToken: 'Q7pPriv', payer: { email: 'Q7pPriv' }, update_time: 'Q7pPriv',
      provider_completed_at: '2026-11-14T00:00:00Z' } as any);
    expect(Object.keys(evidence).sort()).toEqual(['amount_minor', 'currency', 'environment', 'external_id',
      'identity_kind', 'key', 'order_id', 'order_reference', 'parent_external_id', 'payload_hash',
      'provider', 'quote_hash', 'scope', 'source', 'status', 'user_id']);
    expect(JSON.stringify(evidence)).not.toMatch(/Q7pPriv|update_time|provider_completed_at/);
  });
});

describe('PayPal fetch transport with synthetic responses only', () => {
  const tokenInput = { environment: 'SANDBOX' as const,
    credential: { clientId: 'synthetic-client', clientSecret: 'Q7pPriv-secret' } };
  const createInput = { environment: 'SANDBOX' as const, accessToken: 'Q7pPriv-token',
    requestKey: CREATE_KEY, orderId: ORDER, amountMinor: '999' };
  const getInput = { environment: 'SANDBOX' as const, accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER };
  const captureInput = { ...getInput, requestKey: CAPTURE_KEY };

  it('requires explicit fetch injection and never falls back to global fetch', () => {
    const globalFetch = vi.fn(); vi.stubGlobal('fetch', globalFetch);
    expect(() => createPayPalFetchTransport(undefined as any)).toThrow();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  it('sends OAuth client_credentials only to the fixed token endpoint with a ten-second signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'Q7pPriv-token', token_type: 'Bearer' })));
    const result = await createPayPalFetchTransport(fetchImpl).requestToken(tokenInput);
    expect(result).toEqual({ accessToken: 'Q7pPriv-token' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) });
    expect(new Headers(init.headers).get('authorization')).toBe('Basic c3ludGhldGljLWNsaWVudDpRN3BQcml2LXNlY3JldA==');
    expect(new Headers(init.headers).get('content-type')).toContain('application/x-www-form-urlencoded');
    expect(String(init.body)).toBe('grant_type=client_credentials');
    expect(timeout).toHaveBeenCalledWith(10_000);
  });
  it.each([
    ['SANDBOX', 'https://api-m.sandbox.paypal.com'], ['LIVE', 'https://api-m.paypal.com'],
  ] as const)('builds exact create/get/capture requests for %s and ignores response hrefs', async (environment, host) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify(approvedOrder()), { status: 201 }));
    const t = createPayPalFetchTransport(fetchImpl);
    expect(await t.createOrder({ ...createInput, environment })).toMatchObject({ kind: 'RESPONSE', status: 201, bodyStatus: 'PARSED' });
    await t.getOrder({ ...getInput, environment });
    await t.captureOrder({ ...captureInput, environment });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [create, get, capture] = fetchImpl.mock.calls;
    expect(create[0]).toBe(`${host}/v2/checkout/orders`);
    expect(get[0]).toBe(`${host}/v2/checkout/orders/5O190127TN364715T`);
    expect(capture[0]).toBe(`${host}/v2/checkout/orders/5O190127TN364715T/capture`);
    expect(create[1].method).toBe('POST'); expect(get[1].method).toBe('GET'); expect(capture[1].method).toBe('POST');
    expect(JSON.parse(create[1].body)).toEqual({ intent: 'CAPTURE', purchase_units: [{
      custom_id: 'v2:11111111-1111-4111-8111-111111111111', amount: { currency_code: 'USD', value: '9.99' } }] });
    expect(get[1].body).toBeUndefined(); expect(JSON.parse(capture[1].body)).toEqual({});
    for (const [, init] of [create, get, capture]) {
      expect(init).toMatchObject({ cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) });
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer Q7pPriv-token');
      expect(new Headers(init.headers).get('cookie')).toBeNull();
    }
    expect(new Headers(create[1].headers).get('paypal-request-id')).toBe(CREATE_KEY);
    expect(new Headers(capture[1].headers).get('paypal-request-id')).toBe(CAPTURE_KEY);
    expect(new Headers(get[1].headers).get('paypal-request-id')).toBeNull();
    expect(new Headers(create[1].headers).get('prefer')).toBe('return=representation');
    expect(new Headers(capture[1].headers).get('prefer')).toBe('return=representation');
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([15_000, 10_000, 20_000]);
  });
  it.each([undefined, null, '', 'live', 'TEST', 'SANDBOX ', 'https://evil.example.invalid'])
    ('refuses invalid runtime environment %# before all four fetch operations', async environment => {
      const fetchImpl = vi.fn(); const t = createPayPalFetchTransport(fetchImpl);
      expect(await t.requestToken({ ...tokenInput, environment } as any)).toBeNull();
      expect(await t.createOrder({ ...createInput, environment } as any)).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(await t.getOrder({ ...getInput, environment } as any)).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(await t.captureOrder({ ...captureInput, environment } as any)).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  it.each(['../escape', 'abc', 'A?x=1', 'A/B', '', 'A'.repeat(37)])
    ('rejects provider ID %# before GET and capture', async providerOrderId => {
      const fetchImpl = vi.fn(); const t = createPayPalFetchTransport(fetchImpl);
      expect(await t.getOrder({ ...getInput, providerOrderId })).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(await t.captureOrder({ ...captureInput, providerOrderId })).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  it.each(['', 'not-a-uuid', '33333333-3333-4333-8333-333333333333\r\nx: y'])
    ('rejects request key %# before either mutation', async requestKey => {
      const fetchImpl = vi.fn(); const t = createPayPalFetchTransport(fetchImpl);
      expect(await t.createOrder({ ...createInput, requestKey })).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(await t.captureOrder({ ...captureInput, requestKey })).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  it.each([429, 500, 503])('does not retry mutation HTTP %s', async status => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('{"name":"Q7pPriv"}', { status }));
    const t = createPayPalFetchTransport(fetchImpl);
    expect(await t.captureOrder(captureInput)).toEqual({ kind: 'RESPONSE', status, body: { name: 'Q7pPriv' }, bodyStatus: 'PARSED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('does not retry or expose a thrown transport error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Q7pPriv clientSecret=Q7pPriv'));
    expect(await createPayPalFetchTransport(fetchImpl).captureOrder(captureInput)).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('propagates caller abort through the actual fetch signal without retry', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      controller.abort(new Error('Q7pPriv'));
      expect(init.signal.aborted).toBe(true); init.signal.throwIfAborted();
    });
    expect(await createPayPalFetchTransport(fetchImpl).captureOrder({ ...captureInput, signal: controller.signal }))
      .toEqual({ kind: 'TRANSPORT_UNKNOWN' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('uses a live deadline signal at fetch and sanitizes deadline rejection', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      deadline.abort(new DOMException('Q7pPriv', 'TimeoutError'));
      expect(init.signal.aborted).toBe(true); init.signal.throwIfAborted();
    });
    expect(await createPayPalFetchTransport(fetchImpl).getOrder(getInput)).toEqual({ kind: 'TRANSPORT_UNKNOWN' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  // W1: each null body keeps its actual reason. An empty body is EMPTY, not INVALID_JSON or PARSED.
  it.each([
    ['<html>Q7pPriv</html>', 'INVALID_JSON'], ['{', 'INVALID_JSON'], ['', 'EMPTY'],
  ] as const)('returns null body for malformed JSON %#', async (body, bodyStatus) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const result = await createPayPalFetchTransport(fetchImpl).getOrder(getInput);
    expect(result).toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('stops and cancels a chunked response at 256 KiB even without Content-Length', async () => {
    let pulls = 0; const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(65_536).fill(32)); }, cancel,
    }, { highWaterMark: 0 }));
    const text = vi.spyOn(response, 'text');
    const fetchImpl = vi.fn().mockResolvedValue(response);
    expect(await createPayPalFetchTransport(fetchImpl).getOrder(getInput)).toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus: 'OVERSIZE' });
    expect(pulls).toBeLessThanOrEqual(5); expect(cancel).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled(); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('counts UTF-8 bytes cumulatively instead of JavaScript string length', async () => {
    let pulls = 0; const cancel = vi.fn();
    const chunk = new TextEncoder().encode('€'.repeat(32_768));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(chunk); }, cancel,
    }, { highWaterMark: 0 })));
    expect(await createPayPalFetchTransport(fetchImpl).getOrder(getInput)).toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus: 'OVERSIZE' });
    expect(pulls).toBeLessThanOrEqual(3); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('cancels an oversized token stream instead of reading arbitrary credential-bearing JSON', async () => {
    let pulls = 0; const cancel = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(65_536).fill(32)); }, cancel,
    }, { highWaterMark: 0 })));
    expect(await createPayPalFetchTransport(fetchImpl).requestToken(tokenInput)).toBeNull();
    expect(pulls).toBeLessThanOrEqual(5); expect(cancel).toHaveBeenCalledTimes(1); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([{ access_token: '' }, { access_token: 123 }, {}, { access_token: 'Q7pPriv', token_type: 'Unknown' }])
    ('closes malformed token response %#', async body => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
      expect(await createPayPalFetchTransport(fetchImpl).requestToken(tokenInput)).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});

// W1 transport contract (spec 4/10 section 8, plan W1). RESPONSE adds bodyStatus:
// PARSED | EMPTY | OVERSIZE | INVALID_UTF8 | INVALID_JSON | STREAM_ERROR.
// Every non-PARSED arm keeps body:null. TRANSPORT_UNKNOWN keeps its single key.
// The streams below are real ReadableStream bodies read by the actual transport.
describe('PayPal fetch transport bodyStatus discriminator', () => {
  const getInput = { environment: 'SANDBOX' as const, accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER };
  const captureInput = { ...getInput, requestKey: CAPTURE_KEY };
  const encoder = new TextEncoder();
  const KIB256 = 256 * 1024;

  function chunked(chunks: Uint8Array[], cancel = vi.fn()) {
    let index = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close();
      }, cancel,
    }, { highWaterMark: 0 });
  }
  function split(bytes: Uint8Array, size: number): Uint8Array[] {
    const parts: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += size) parts.push(bytes.slice(offset, offset + size));
    return parts;
  }
  async function getWith(response: Response) {
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const result = await createPayPalFetchTransport(fetchImpl).getOrder(getInput);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    return result;
  }

  it('returns PARSED with the parsed body for a complete JSON response', async () => {
    const result = await getWith(new Response(JSON.stringify({ id: PROVIDER_ORDER, status: 'APPROVED' }), { status: 200 }));
    expect(result).toEqual({ kind: 'RESPONSE', status: 200, body: { id: PROVIDER_ORDER, status: 'APPROVED' }, bodyStatus: 'PARSED' });
  });
  it('keeps a parsed JSON null literal as PARSED with body null', async () => {
    expect(await getWith(new Response('null', { status: 200 })))
      .toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus: 'PARSED' });
  });
  it('parses a multi-byte character split across real stream chunks', async () => {
    const bytes = encoder.encode('{"note":"€"}');
    const euroStart = bytes.indexOf(0xe2);
    const result = await getWith(new Response(chunked([bytes.slice(0, euroStart + 2), bytes.slice(euroStart + 2)]), { status: 200 }));
    expect(result).toEqual({ kind: 'RESPONSE', status: 200, body: { note: '€' }, bodyStatus: 'PARSED' });
  });
  it.each([
    ['empty string body', () => new Response('', { status: 200 }), 200],
    ['null body', () => new Response(null, { status: 200 }), 200],
    ['204 without body', () => new Response(null, { status: 204 }), 204],
    ['stream closed before any chunk', () => new Response(chunked([]), { status: 200 }), 200],
    ['stream with one zero-length chunk', () => new Response(chunked([new Uint8Array(0)]), { status: 200 }), 200],
  ] as const)('returns EMPTY with body null for %s', async (_label, build, status) => {
    expect(await getWith(build())).toEqual({ kind: 'RESPONSE', status, body: null, bodyStatus: 'EMPTY' });
  });
  it('accepts exactly 256 KiB of valid JSON and marks one more byte OVERSIZE', async () => {
    const exact = encoder.encode(`"${'a'.repeat(KIB256 - 2)}"`);
    const over = encoder.encode(`"${'a'.repeat(KIB256 - 1)}"`);
    expect(exact.byteLength).toBe(KIB256); expect(over.byteLength).toBe(KIB256 + 1);
    expect(await getWith(new Response(chunked(split(exact, 65_536)), { status: 200 })))
      .toEqual({ kind: 'RESPONSE', status: 200, body: 'a'.repeat(KIB256 - 2), bodyStatus: 'PARSED' });
    const cancel = vi.fn();
    expect(await getWith(new Response(chunked(split(over, 65_536), cancel), { status: 200 })))
      .toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus: 'OVERSIZE' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['invalid byte inside a string', [0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]],
    ['truncated multi-byte sequence at end', [0x22, 0xe2, 0x82]],
  ])('returns INVALID_UTF8 with body null for %s', async (_label, bytes) => {
    expect(await getWith(new Response(new Uint8Array(bytes), { status: 200 })))
      .toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus: 'INVALID_UTF8' });
  });
  it.each(['{"id":', '<html>Q7pPriv</html>', 'undefined'])('returns INVALID_JSON with body null for valid UTF-8 %#', async text => {
    const result = await getWith(new Response(text, { status: 200 }));
    expect(result).toEqual({ kind: 'RESPONSE', status: 200, body: null, bodyStatus: 'INVALID_JSON' });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });
  it.each([
    ['after one chunk', 200, () => {
      let pulls = 0;
      return new ReadableStream<Uint8Array>({ pull(controller) {
        if (pulls++ === 0) controller.enqueue(encoder.encode('{"id":"5O190127')); else controller.error(new Error('Q7pPriv stream'));
      } }, { highWaterMark: 0 });
    }],
    ['before any chunk', 200, () => new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('Q7pPriv stream')); } })],
    ['on a non-2xx response', 503, () => new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('Q7pPriv stream')); } })],
  ] as const)('returns STREAM_ERROR with body null when the reader fails %s', async (_label, status, stream) => {
    const result = await getWith(new Response(stream(), { status }));
    expect(result).toEqual({ kind: 'RESPONSE', status, body: null, bodyStatus: 'STREAM_ERROR' });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });
  it('keeps TRANSPORT_UNKNOWN as the only key when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Q7pPriv fetch failed'));
    const result = await createPayPalFetchTransport(fetchImpl).captureOrder(captureInput);
    expect(result).toStrictEqual({ kind: 'TRANSPORT_UNKNOWN' });
    expect(Object.keys(result)).toEqual(['kind']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('keeps redirect refusal as TRANSPORT_UNKNOWN and never exposes a redirect status', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('error');
      throw new TypeError('fetch failed: unexpected redirect to https://evil.example.invalid/Q7pPriv');
    });
    const result = await createPayPalFetchTransport(fetchImpl).getOrder(getInput);
    expect(result).toStrictEqual({ kind: 'TRANSPORT_UNKNOWN' });
    expect(JSON.stringify(result)).not.toMatch(/Q7pPriv|302|redirect/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('keeps the deadline signal and per-operation timeouts while adding bodyStatus', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }));
    const t = createPayPalFetchTransport(fetchImpl);
    const created = await t.createOrder({ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', requestKey: CREATE_KEY, orderId: ORDER, amountMinor: '999' });
    const read = await t.getOrder(getInput);
    const captured = await t.captureOrder(captureInput);
    for (const result of [created, read, captured]) expect(result).toEqual({ kind: 'RESPONSE', status: 204, body: null, bodyStatus: 'EMPTY' });
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([15_000, 10_000, 20_000]);
    for (const [, init] of fetchImpl.mock.calls) expect(init).toMatchObject({ redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) });
  });
  it('keeps a deadline abort before the response as TRANSPORT_UNKNOWN without bodyStatus', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      deadline.abort(new DOMException('Q7pPriv', 'TimeoutError')); init.signal!.throwIfAborted();
    });
    expect(await createPayPalFetchTransport(fetchImpl).getOrder(getInput)).toStrictEqual({ kind: 'TRANSPORT_UNKNOWN' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
