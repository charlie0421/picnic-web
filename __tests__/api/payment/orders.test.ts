// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', authError: null as unknown,
  authThrow: false, fetch: vi.fn(), logs: vi.fn(), warns: vi.fn(), getUser: vi.fn() }));
// Only authentication and external transport are substituted. Route, parser, mapper,
// repository and supabase-js RPC serialization remain real.
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/utils/log-safe-error', () => ({ logSafeError: mocks.logs, logSafeWarn: mocks.warns }));
import { POST } from '@/app/api/payment/orders/route';

const input = { productId: 'STAR100', provider: 'paypal', billingCountry: 'US',
  requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', acceptedPolicyVersion: 'policy-v1' };
const url = 'https://www.picnic.fan/api/payment/orders';
function rpcData() {
  return { order_id: '11111111-1111-4111-8111-111111111111', quote_id: '22222222-2222-4222-8222-222222222222', replayed: false,
    quote: { contract_version: 'web-payment-quote.v1', product_id: 'STAR100', product_name: '별사탕',
      provider: 'PAYPAL', environment: 'SANDBOX', billing_country: 'US', currency: 'USD',
      amount_minor: '9007199254740993', base_star: '100', product_bonus: '5', quantity: '1',
      issued_at: '2026-11-13T00:00:00.123456Z', expires_at: '2026-11-13T00:15:00.123456Z',
      accepted_policy_version: 'policy-v1', product_policy_version: 'product-v1', bonus_policy_version: 'bonus-v1',
      bonus_expiry_policy_version: 'expiry-v1', refund_policy_version: 'refund-v1', terms_policy_version: 'terms-v1',
      settings_version: '1', settings_hash: 'PRIVATE_SETTINGS', product_inputs: {},
      bonus_expiry_policy: { source: 'PRIVATE_SQL' }, promotion_policy_hash: 'PRIVATE_HASH',
      promotion_policy: { contract_version: 'web-payment-promotion.v1', campaign_code: 'CANDY_BOOST_DAY',
        state: 'CONDITIONAL', evaluation_time_basis: 'VERIFIED_PROVIDER_COMPLETED_AT',
        v1: { rollout_policy: { seed: 'PRIVATE_SEED' } }, v2: null,
        audience: { allowed_user_ids: ['PRIVATE_USER'] }, runtime_inputs: { key: 'PRIVATE_KEY' } } } };
}
let data: unknown;
let status: number;
function request(body: BodyInit = JSON.stringify(input), overrides: Record<string, string | null> = {}) {
  const headers = new Headers({ origin: 'https://www.picnic.fan', 'content-type': 'application/json',
    'sec-fetch-site': 'same-origin', cookie: 'user-session=PRIVATE_COOKIE', authorization: 'Bearer PRIVATE_USER_TOKEN' });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(key); else headers.set(key, value);
  }
  // Node requires duplex for a streaming request; this is transport setup, not product logic.
  const init: RequestInit & { duplex?: 'half' } = { method: 'POST', headers, body, duplex: 'half' };
  return POST(new NextRequest(url, init));
}
function chunks(...values: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (const value of values) controller.enqueue(value);
    controller.close();
  } });
}
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, Authorization');
}
function safeLog(severity: 'error' | 'warn', event: string) {
  const selected = severity === 'error' ? mocks.logs : mocks.warns;
  const other = severity === 'error' ? mocks.warns : mocks.logs;
  expect(selected).toHaveBeenCalledTimes(1);
  expect(other).not.toHaveBeenCalled();
  // Exact arguments forbid raw context, while checking the Error separately
  // also inspects its non-enumerable message rather than just JSON.stringify.
  expect(selected.mock.calls[0]).toEqual([event, expect.any(Error)]);
  expect(selected.mock.calls[0][1].message).toBe('WEB_PAYMENT_ORDER_UNAVAILABLE');
  expect(String(selected.mock.calls[0][1])).not.toMatch(/PRIVATE_|TimeoutError|credential|P0001|WEB_PAYMENT_(ORDERS_CLOSED|POLICY_UNAVAILABLE|PROMOTION_POLICY_UNAVAILABLE)/);
  expect(JSON.stringify(selected.mock.calls)).not.toMatch(/PRIVATE_|details|hint/);
}
beforeEach(() => {
  data = rpcData(); status = 200; mocks.authError = null; mocks.authThrow = false;
  mocks.user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; mocks.logs.mockReset(); mocks.warns.mockReset(); mocks.getUser.mockReset();
  mocks.getUser.mockImplementation(async () => {
    if (mocks.authThrow) throw Error('PRIVATE_AUTH_ERROR');
    return { data: { user: mocks.user ? { id: mocks.user, user_metadata: { userId: 'FORGED_ACTOR', is_admin: true } } : null }, error: mocks.authError };
  });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key');
  mocks.fetch.mockReset().mockImplementation(async (target: string, init: RequestInit) => {
    if (String(target) !== 'https://db.example.invalid/rest/v1/rpc/create_web_payment_order' || init.method !== 'POST') {
      throw Error('Unexpected provider, wallet or table operation');
    }
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('POST /api/payment/orders', () => {
  it('creates through the verified actor and returns only the safe DTO with no browser credential forwarding', async () => {
    const response = await request();
    expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(body).toMatchObject({ contractVersion: 'web-payment-order.v1', replayed: false,
      quote: { amountMinor: '9007199254740993', environment: 'SANDBOX', promotion: { state: 'CONDITIONAL' } } });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_|userId|paymentState|settlementState|quoteHash|rowVersion/);
    expect(mocks.getUser).toHaveBeenCalledTimes(1); expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const init = mocks.fetch.mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual({ p_actor_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_product_id: 'STAR100', p_provider: 'PAYPAL', p_billing_country: 'US',
      p_request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_accepted_policy_version: 'policy-v1' });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer fixture-service-key');
    expect(new Headers(init.headers).get('cookie')).toBeNull();
  });
  it.each([['', null, 401], ['owner', { status: 401 }, 401], ['owner', { status: 403 }, 401],
    ['owner', { status: 500 }, 503], ['owner', { message: 'PRIVATE_AUTH' }, 503], ['not-a-uuid', null, 503]])
    ('keeps unauthenticated or malformed actors out of service RPC %#', async (user, error, expected) => {
      mocks.user = user as string; mocks.authError = error;
      const response = await request(); expect(response.status).toBe(expected); privateResponse(response);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({ error: expected === 401 ? 'AUTHENTICATION_REQUIRED' : 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
      if (expected === 503) safeLog('error', 'payment.order.failed');
      else { expect(mocks.logs).not.toHaveBeenCalled(); expect(mocks.warns).not.toHaveBeenCalled(); }
    });
  it('maps the actual auth-js status-400 missing-session error to 401 without RPC or server-error logging', async () => {
    mocks.authError = new AuthSessionMissingError();
    const response = await request();
    expect(response.status).toBe(401); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'AUTHENTICATION_REQUIRED' });
    expect(mocks.getUser).toHaveBeenCalledTimes(1); expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.logs).not.toHaveBeenCalled(); expect(mocks.warns).not.toHaveBeenCalled();
  });
  it.each([0, 429, 503])('maps auth-js retryable status %s to a safe pre-RPC error stage', async status => {
    mocks.authError = new AuthRetryableFetchError('PRIVATE_AUTH credential=secret', status);
    const response = await request();
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(mocks.getUser).toHaveBeenCalledTimes(1); expect(mocks.fetch).not.toHaveBeenCalled();
    safeLog('error', 'payment.order.failed');
  });
  it('maps thrown authentication transport errors to unavailable', async () => {
    mocks.authThrow = true;
    const response = await request(); expect(response.status).toBe(503); privateResponse(response);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain('PRIVATE_');
    safeLog('error', 'payment.order.failed');
  });
  it.each([null, 'null', 'garbage', 'https://evil.example', 'https://picnic.fan',
    'https://www.picnic.fan.evil.example', 'https://www.picnic.fan/path', 'https://www.picnic.fan/',
    'https://www.picnic.fan https://evil.example'])('requires exact origin %s', async origin => {
    const response = await request(undefined, { origin, 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' });
    expect(response.status).toBe(403); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(['cross-site', 'same-site', 'none', 'invalid'])('rejects Sec-Fetch-Site %s', async site => {
    const response = await request(undefined, { 'sec-fetch-site': site });
    expect(response.status).toBe(403); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('permits absent fetch metadata only with the exact Origin', async () => {
    expect((await request(undefined, { 'sec-fetch-site': null })).status).toBe(200);
  });
  it.each([null, 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', 'application/problem+json',
    'application/json; charset=iso-8859-1', 'application/json; boundary=x', 'application/json; charset=utf-8; charset=utf-8'])
    ('rejects media type %s before service RPC', async media => {
      const response = await request(undefined, { 'content-type': media });
      expect(response.status).toBe(400); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
    });
  it('accepts application/json with UTF-8 charset', async () => {
    expect((await request(undefined, { 'content-type': 'application/json; charset=utf-8' })).status).toBe(200);
  });
  it.each(['gzip', 'br', 'identity'])('rejects explicit Content-Encoding %s', async encoding => {
    const response = await request(undefined, { 'content-encoding': encoding });
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(['', '{', 'null', '[]', '"text"'])('rejects malformed JSON body %s', async body => {
    const response = await request(body);
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(['userId', 'actorUserId', 'amount', 'amountMinor', 'quantity', 'baseStar', 'environment', 'settings', 'quote'])
    ('rejects forged %s and nested substitutes without an RPC', async key => {
      const response = await request(JSON.stringify({ ...input, [key]: { value: 'FORGED' } }));
      expect(response.status).toBe(400); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
    });
  // The public API has an ASCII identifier boundary. It does not promise to
  // accept all Unicode identifiers accepted by a database collation.
  it.each([
    ['productId', '\u00a0STAR100'], ['productId', 'STAR100\u00a0'],
    ['productId', '\u3000STAR100'], ['productId', 'STAR100\u3000'],
    ['productId', '\ufeffSTAR100'], ['productId', 'STAR100\ufeff'],
    ['productId', 'ſtar100'], ['productId', 'ı'], ['productId', 'ﬀ'],
    ['billingCountry', '\u00a0US'], ['billingCountry', 'US\u00a0'],
    ['billingCountry', '\u3000US'], ['billingCountry', 'US\u3000'],
    ['billingCountry', '\ufeffUS'], ['billingCountry', 'US\ufeff'],
    ['billingCountry', 'ıS'], ['billingCountry', 'Uſ'], ['billingCountry', 'ﬀ'],
  ])('rejects non-ASCII %s=%j before service RPC', async (key, value) => {
    const response = await request(JSON.stringify({ ...input, [key]: value }));
    expect(response.status).toBe(400); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'INVALID_WEB_PAYMENT_ORDER' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.logs).not.toHaveBeenCalled(); expect(mocks.warns).not.toHaveBeenCalled();
  });
  it('preserves internal ASCII product spaces and leaves product eligibility to the RPC', async () => {
    const reply = rpcData(); reply.quote.product_id = 'STAR 100'; data = reply;
    const response = await request(JSON.stringify({ ...input, productId: ' star 100 ', billingCountry: ' us ' }));
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toMatchObject({ quote: { productId: 'STAR 100', billingCountry: 'US' } });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ p_product_id: 'STAR 100', p_billing_country: 'US' });
  });
  it('enforces actual chunk byte length even if declared Content-Length is small', async () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ ...input, acceptedPolicyVersion: '가'.repeat(1500) }));
    const response = await request(chunks(encoded.slice(0, 2500), encoded.slice(2500)), { 'content-length': '1' });
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('accepts exactly 4096 UTF-8 body bytes and refuses one extra byte', async () => {
    const base = JSON.stringify(input);
    const exact = base + ' '.repeat(4096 - new TextEncoder().encode(base).length);
    expect((await request(exact)).status).toBe(200);
    mocks.fetch.mockClear();
    const response = await request(exact + ' ');
    expect(response.status).toBe(400); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('does not replace a truncated UTF-8 sequence with a policy character', async () => {
    const prefix = new TextEncoder().encode(JSON.stringify(input).replace('policy-v1', ''));
    const marker = new TextEncoder().encode('"acceptedPolicyVersion":"');
    const index = new TextDecoder().decode(prefix).indexOf('"acceptedPolicyVersion":"') + marker.length;
    const response = await request(chunks(prefix.slice(0, index), new Uint8Array([0xe3, 0x81]), prefix.slice(index)));
    expect(response.status).toBe(400); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('decodes a valid multibyte policy split across stream chunks', async () => {
    const content = JSON.stringify({ ...input, acceptedPolicyVersion: '정책-v1' });
    const bytes = new TextEncoder().encode(content);
    const first = bytes.indexOf(0xec);
    const reply = rpcData(); reply.quote.accepted_policy_version = '정책-v1'; data = reply;
    expect((await request(chunks(bytes.slice(0, first + 1), bytes.slice(first + 1)))).status).toBe(200);
  });
  it('closes body read errors without service RPC or diagnostic exposure', async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(Error('PRIVATE_STREAM')); } });
    const response = await request(stream);
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['WEB_PAYMENT_USER_DELETED', 403, 'ACCOUNT_UNAVAILABLE'],
    ['WEB_PAYMENT_COUNTRY_NOT_ALLOWED', 403, 'WEB_PAYMENT_NOT_AVAILABLE'],
    ['WEB_PAYMENT_USER_NOT_ALLOWED', 403, 'WEB_PAYMENT_NOT_AVAILABLE'],
    ['WEB_PAYMENT_TEST_ADMIN_REQUIRED', 403, 'WEB_PAYMENT_NOT_AVAILABLE'],
    ['WEB_PAYMENT_POLICY_NOT_ACCEPTED', 409, 'WEB_PAYMENT_POLICY_CHANGED'],
    ['WEB_PAYMENT_PRODUCT_INVALID', 400, 'INVALID_WEB_PAYMENT_ORDER'],
    ['WEB_PAYMENT_PRODUCT_NOT_ON_SALE', 400, 'INVALID_WEB_PAYMENT_ORDER'],
    ['WEB_PAYMENT_IDEMPOTENCY_CONFLICT', 409, 'WEB_PAYMENT_REQUEST_CONFLICT'],
    ['WEB_PAYMENT_ORDERS_CLOSED', 503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
    ['WEB_PAYMENT_POLICY_UNAVAILABLE', 503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
    ['WEB_PAYMENT_PROMOTION_POLICY_UNAVAILABLE', 503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
  ])('returns safe business error for %s', async (message, expectedStatus, code) => {
    status = 400; data = { code: 'P0001', message, details: 'PRIVATE_SQL', hint: 'PRIVATE_HINT' };
    const response = await request();
    expect(response.status).toBe(expectedStatus); privateResponse(response);
    expect(await response.json()).toEqual({ error: code }); expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.logs.mock.calls)).not.toMatch(/PRIVATE_|details|hint/);
    // Intentional L1 change: business closure must warn, not send a Sentry error.
    if (expectedStatus === 503) safeLog('warn', 'payment.order.business.unavailable');
    else { expect(mocks.logs).not.toHaveBeenCalled(); expect(mocks.warns).not.toHaveBeenCalled(); }
  });
  it('does not infer business status from a message with the wrong SQLSTATE', async () => {
    status = 400; data = { code: '42501', message: 'WEB_PAYMENT_USER_DELETED', details: 'PRIVATE_SQL' };
    const response = await request();
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(mocks.logs.mock.calls[0][0]).toBe('payment.order.rpc.failed');
    expect(JSON.stringify(mocks.logs.mock.calls)).not.toMatch(/PRIVATE_|42501|USER_DELETED/);
    expect(mocks.fetch).toHaveBeenCalledTimes(1); safeLog('error', 'payment.order.rpc.failed');
  });
  it.each([
    { code: '42501', message: 'WEB_PAYMENT_ORDERS_CLOSED' },
    { code: 'XX000', message: 'WEB_PAYMENT_POLICY_UNAVAILABLE' },
    { code: 'P0001', message: ' WEB_PAYMENT_PROMOTION_POLICY_UNAVAILABLE' },
    { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED PRIVATE_SQL' },
    { code: 'P0001', message: 'PRIVATE_UNKNOWN' },
  ])('keeps unknown or inexact business errors at error severity %#', async error => {
    status = 400; data = { ...error, details: 'PRIVATE_SQL', hint: 'PRIVATE_HINT' };
    const response = await request();
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1); safeLog('error', 'payment.order.rpc.failed');
  });
  it('keeps network rejection at error severity with exactly one RPC attempt', async () => {
    mocks.fetch.mockRejectedValue(new Error('PRIVATE_NETWORK credential=secret'));
    const response = await request();
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1); safeLog('error', 'payment.order.rpc.failed');
  });
  it('returns safe 503 when the real PostgREST transport observes TimeoutError, without a new attempt', async () => {
    const controller = new AbortController();
    const reason = new DOMException('PRIVATE_TIMEOUT credential=secret', 'TimeoutError');
    controller.abort(reason);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let observedReason: unknown;
    mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
      observedReason = init.signal?.reason;
      init.signal?.throwIfAborted();
      return new Response(JSON.stringify(rpcData()), { status: 200 });
    });
    const response = await request();
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(timeout).toHaveBeenCalledWith(10_000); expect(observedReason).toBe(reason);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [target, init] = mocks.fetch.mock.calls[0];
    expect(target).toBe('https://db.example.invalid/rest/v1/rpc/create_web_payment_order');
    expect(init.method).toBe('POST'); expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get('x-retry-count')).toBeNull();
    safeLog('error', 'payment.order.rpc.failed');
  });
  it('keeps missing service config and malformed responses closed', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const config = await request(); expect(config.status).toBe(503); privateResponse(config);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(await config.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    safeLog('error', 'payment.order.config.failed'); mocks.logs.mockClear();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key');
    data = { PRIVATE_DATA: 'secret' };
    const malformed = await request(); expect(malformed.status).toBe(503); privateResponse(malformed);
    expect(await malformed.json()).toEqual({ error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1); safeLog('error', 'payment.order.response.failed');
    expect(JSON.stringify(mocks.logs.mock.calls)).not.toContain('PRIVATE_');
  });
  it('preserves same-key replay as 200 and sends changed input to server conflict enforcement', async () => {
    const first = await request(); expect(first.status).toBe(200);
    const replay = rpcData(); replay.replayed = true; data = replay;
    const second = await request(); expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ orderId: replay.order_id, replayed: true });
    status = 400; data = { code: 'P0001', message: 'WEB_PAYMENT_IDEMPOTENCY_CONFLICT' };
    const conflict = await request(JSON.stringify({ ...input, productId: 'STAR200' }));
    expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: 'WEB_PAYMENT_REQUEST_CONFLICT' });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    const args = mocks.fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(args[0].p_request_id).toBe(args[2].p_request_id); expect(args[2].p_product_id).toBe('STAR200');
  });
});
