// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerOrder } from '@/lib/payment/server-order-repository';

const actorUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input = { actorUserId, productId: 'STAR100', provider: 'paypal' as const, billingCountry: 'US',
  requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', acceptedPolicyVersion: 'policy-v1' };
const fetchMock = vi.fn();
function responseData() {
  return { order_id: '11111111-1111-4111-8111-111111111111', quote_id: '22222222-2222-4222-8222-222222222222', replayed: false,
    quote: { contract_version: 'web-payment-quote.v1', product_id: 'STAR100', product_name: 'Star',
      provider: 'PAYPAL', environment: 'LIVE', billing_country: 'US', currency: 'USD',
      amount_minor: '9007199254740993', base_star: '100', product_bonus: '5', quantity: '1',
      issued_at: '2026-11-13T00:00:00.123456Z', expires_at: '2026-11-13T00:15:00.123456Z',
      accepted_policy_version: 'policy-v1', product_policy_version: 'product-v1', bonus_policy_version: 'bonus-v1',
      bonus_expiry_policy_version: 'expiry-v1', refund_policy_version: 'refund-v1', terms_policy_version: 'terms-v1',
      settings_version: '1', settings_hash: 'PRIVATE_HASH', product_inputs: {}, bonus_expiry_policy: { source: 'PRIVATE_SQL' },
      promotion_policy_hash: 'PRIVATE_HASH', promotion_policy: { contract_version: 'web-payment-promotion.v1',
        campaign_code: 'CANDY_BOOST_DAY', state: 'CONDITIONAL', evaluation_time_basis: 'VERIFIED_PROVIDER_COMPLETED_AT',
        v1: { rollout_policy: { seed: 'PRIVATE_SEED' } }, v2: null, audience: {}, runtime_inputs: {} } } };
}
let wireData: unknown;
let wireStatus: number;
beforeEach(() => {
  wireData = responseData(); wireStatus = 200;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key');
  fetchMock.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
    // Any table DML, charge/wallet RPC or provider request is an unexpected external operation.
    if (String(url) !== 'https://db.example.invalid/rest/v1/rpc/create_web_payment_order' || init.method !== 'POST') {
      throw Error('Unexpected external operation');
    }
    return new Response(JSON.stringify(wireData), { status: wireStatus, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('service-only order RPC repository', () => {
  it('sends exactly six authoritative arguments in one POST with an isolated service token', async () => {
    const dto = await createServerOrder(input);
    expect(dto).toMatchObject({ replayed: false, quote: { amountMinor: '9007199254740993' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://db.example.invalid/rest/v1/rpc/create_web_payment_order');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ p_actor_user_id: actorUserId, p_product_id: 'STAR100',
      p_provider: 'PAYPAL', p_billing_country: 'US', p_request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_accepted_policy_version: 'policy-v1' });
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer fixture-service-key');
    expect(headers.get('cookie')).toBeNull();
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(dto)).not.toContain('PRIVATE_');
  });
  it('applies the ten-second abort deadline to the RPC without making another request', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await createServerOrder(input);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('propagates the deadline signal through real RPC serialization and safely closes TimeoutError without retry', async () => {
    const controller = new AbortController();
    const reason = new DOMException('PRIVATE_TIMEOUT credential=secret', 'TimeoutError');
    controller.abort(reason);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let observedReason: unknown;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      // Observe the actual signal passed by supabase-js/PostgREST, not a synthetic
      // repository rejection. No real-time sleep or fake clock is necessary.
      observedReason = init.signal?.reason;
      init.signal?.throwIfAborted();
      return new Response(JSON.stringify(responseData()), { status: 200 });
    });
    const caught = await createServerOrder(input).catch((error: unknown) => error);
    expect(caught).toMatchObject({ status: 503, code: 'WEB_PAYMENT_ORDER_UNAVAILABLE', eventCode: 'payment.order.rpc.failed' });
    expect(String(caught)).not.toMatch(/PRIVATE_|TimeoutError|credential/);
    expect(JSON.stringify(caught)).not.toMatch(/PRIVATE_|TimeoutError|credential/);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(observedReason).toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe('https://db.example.invalid/rest/v1/rpc/create_web_payment_order');
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get('x-retry-count')).toBeNull();
    expect(JSON.parse(init.body)).toEqual({ p_actor_user_id: actorUserId, p_product_id: 'STAR100',
      p_provider: 'PAYPAL', p_billing_country: 'US', p_request_id: input.requestId, p_accepted_policy_version: 'policy-v1' });
  });
  it.each(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('closes missing %s before I/O', async key => {
    vi.stubEnv(key, '');
    await expect(createServerOrder(input)).rejects.toMatchObject({ status: 503, code: 'WEB_PAYMENT_ORDER_UNAVAILABLE',
      eventCode: 'payment.order.config.failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves an expired replay and the same request key across invocations', async () => {
    await createServerOrder(input);
    const replay = responseData(); replay.replayed = true;
    replay.quote.issued_at = '2000-01-01T00:00:00Z'; replay.quote.expires_at = '2000-01-01T00:15:00Z'; wireData = replay;
    expect(await createServerOrder(input)).toMatchObject({ orderId: replay.order_id, replayed: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });
  it.each([
    ['WEB_PAYMENT_USER_DELETED', 403, 'ACCOUNT_UNAVAILABLE'],
    ['WEB_PAYMENT_COUNTRY_NOT_ALLOWED', 403, 'WEB_PAYMENT_NOT_AVAILABLE'],
    ['WEB_PAYMENT_USER_NOT_ALLOWED', 403, 'WEB_PAYMENT_NOT_AVAILABLE'],
    ['WEB_PAYMENT_POLICY_NOT_ACCEPTED', 409, 'WEB_PAYMENT_POLICY_CHANGED'],
    ['WEB_PAYMENT_PRODUCT_INVALID', 400, 'INVALID_WEB_PAYMENT_ORDER'],
    ['WEB_PAYMENT_PRODUCT_NOT_ON_SALE', 400, 'INVALID_WEB_PAYMENT_ORDER'],
    ['WEB_PAYMENT_IDEMPOTENCY_CONFLICT', 409, 'WEB_PAYMENT_REQUEST_CONFLICT'],
    ['WEB_PAYMENT_ORDERS_CLOSED', 503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
    ['WEB_PAYMENT_POLICY_UNAVAILABLE', 503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
    ['WEB_PAYMENT_PROMOTION_POLICY_UNAVAILABLE', 503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
  ])('maps exact P0001 %s safely', async (message, status, code) => {
    wireStatus = 400; wireData = { code: 'P0001', message, details: 'PRIVATE_DETAIL', hint: 'PRIVATE_HINT' };
    // Only the three exact business 503s get a business stage. Other public
    // mappings remain unchanged; unknown SQL must still be an RPC failure.
    await expect(createServerOrder(input)).rejects.toMatchObject({ status, code,
      eventCode: status === 503 ? 'payment.order.business.unavailable' : 'payment.order.rpc.failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { code: '22023', message: 'WEB_PAYMENT_INPUT_INVALID' },
    { code: '42501', message: 'WEB_PAYMENT_USER_DELETED' },
    { code: 'XX000', message: 'WEB_PAYMENT_IDEMPOTENCY_CONFLICT' },
    { code: 'P0001', message: 'WEB_PAYMENT_IDEMPOTENCY_CONFLICT PRIVATE_SECRET' },
    { code: 'P0001', message: ' WEB_PAYMENT_USER_DELETED' },
    { code: 'P0001', message: 'WEB_PAYMENT_BINDING_SCOPE_MISMATCH' },
    { message: 'WEB_PAYMENT_USER_DELETED' },
    { code: 'PGRST202', message: 'PRIVATE_SQL' },
    { code: '42501', message: 'WEB_PAYMENT_ORDERS_CLOSED' },
    { code: 'P0001', message: 'WEB_PAYMENT_POLICY_UNAVAILABLE PRIVATE_SECRET' },
    { code: 'P0001', message: ' WEB_PAYMENT_PROMOTION_POLICY_UNAVAILABLE' },
  ])('keeps unknown/mismatched SQL errors unavailable %#', async error => {
    wireStatus = 400; wireData = { ...error, details: 'PRIVATE_DETAIL' };
    const caught = await createServerOrder(input).catch((e: unknown) => e);
    expect(caught).toMatchObject({ status: 503, code: 'WEB_PAYMENT_ORDER_UNAVAILABLE', eventCode: 'payment.order.rpc.failed' });
    expect(JSON.stringify(caught)).not.toMatch(/PRIVATE_|PGRST202|42501|BINDING/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sanitizes a rejected network operation without application retries', async () => {
    fetchMock.mockRejectedValue(new Error('PRIVATE_URL credential=secret'));
    const caught = await createServerOrder(input).catch((e: unknown) => e);
    expect(caught).toMatchObject({ status: 503, code: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(String(caught)).not.toContain('PRIVATE_');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], {}, { ...responseData(), replayed: null },
    { ...responseData(), quote: { ...responseData().quote, amount_minor: 9007199254740992 } }])
    ('closes malformed RPC JSON %# without leaking it', async data => {
      wireData = data;
      await expect(createServerOrder(input)).rejects.toMatchObject({ status: 503, code: 'WEB_PAYMENT_ORDER_UNAVAILABLE',
        eventCode: 'payment.order.response.failed' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
