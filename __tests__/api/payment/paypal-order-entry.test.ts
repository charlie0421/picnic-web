import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), profile: vi.fn() }));
const getChargeContext = vi.hoisted(() => vi.fn());
vi.mock('@/lib/payment/paypal-charge/repository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/payment/paypal-charge/repository')>()),
  createWebPaymentChargeRepository: () => ({ getChargeContext }),
}));
const checkout = vi.hoisted(() => ({
  createClient: vi.fn(), ensure: vi.fn(), capture: vi.fn(), reconcile: vi.fn(), status: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: auth.create }));
vi.mock('@supabase/supabase-js', async importOriginal => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: checkout.createClient,
}));
vi.mock('@/lib/payment/paypal-charge/orchestrator', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/payment/paypal-charge/orchestrator')>()),
  ensurePayPalProviderOrder: checkout.ensure,
  capturePayPalOrder: checkout.capture,
  reconcilePayPalOrder: checkout.reconcile,
  getPayPalChargeStatus: checkout.status,
}));

const ORIGIN = 'https://www.picnic.fan';
const ORDER = 'decc5ea0-6c2b-4b08-8cd9-a6709a5e217f';
const USER = 'd7267ab1-ebf3-4a90-8abc-52fc608f78ea';
const PROVIDER_ORDER = '1P746844G7552750R';
const param = (orderId = ORDER) => ({ params: Promise.resolve({ orderId }) });

function request(path: string, input?: unknown, origin = ORIGIN) {
  const url = ORIGIN + '/api/payment/orders/' + ORDER + '/paypal/' + path;
  if (input === undefined) return new NextRequest(url);
  return new NextRequest(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
}

const load = {
  'provider-order': async () => (await import('@/app/api/payment/orders/[orderId]/paypal/provider-order/route')).POST,
  capture: async () => (await import('@/app/api/payment/orders/[orderId]/paypal/capture/route')).POST,
  reconcile: async () => (await import('@/app/api/payment/orders/[orderId]/paypal/reconcile/route')).POST,
  status: async () => (await import('@/app/api/payment/orders/[orderId]/paypal/status/route')).GET,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key');
  auth.create.mockResolvedValue({ auth: { getUser: auth.getUser }, from: auth.from });
  auth.from.mockReturnValue({ select: auth.select });
  auth.select.mockReturnValue({ eq: auth.eq });
  auth.eq.mockReturnValue({ maybeSingle: auth.profile });
  auth.profile.mockResolvedValue({ data: { is_super_admin: true }, error: null });
  getChargeContext.mockResolvedValue({ kind: 'FOUND', context: { provider: 'PAYPAL', environment: 'SANDBOX' } });
  auth.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  checkout.createClient.mockReturnValue({});
  checkout.ensure.mockResolvedValue({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
  checkout.capture.mockResolvedValue({ kind: 'INTAKE_PENDING', replayed: false });
  checkout.reconcile.mockResolvedValue({ kind: 'SUBMISSION_UNKNOWN' });
  checkout.status.mockResolvedValue({ kind: 'STATUS', paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE',
    reviewRequired: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('server-order PayPal routes', () => {
  it.each(['capture', 'provider-order'] as const)('refuses non-admin sandbox %s before checkout', async path => {
    auth.profile.mockResolvedValue({ data: { is_admin: false, is_super_admin: false }, error: null });
    const response = await (await load[path]())(request(path, path === 'capture' ? { approvedProviderOrderId: PROVIDER_ORDER } : {}), param());
    expect(response.status).toBe(403);
    expect(getChargeContext).toHaveBeenCalledWith(USER, ORDER);
    expect(auth.from).toHaveBeenCalledWith('user_profiles');
    expect(auth.eq).toHaveBeenCalledWith('id', USER);
    expect(checkout.capture).not.toHaveBeenCalled();
    expect(checkout.ensure).not.toHaveBeenCalled();
  });

  it('keeps LIVE checkout independent of the sandbox role', async () => {
    getChargeContext.mockResolvedValue({ kind: 'FOUND', context: { provider: 'PAYPAL', environment: 'LIVE' } });
    const response = await (await load['provider-order']())(request('provider-order', {}), param());
    expect(response.status).toBe(200);
    expect(auth.from).not.toHaveBeenCalled();
  });

  it('fails closed on a sandbox profile lookup error', async () => {
    auth.profile.mockResolvedValue({ data: null, error: { code: 'timeout' } });
    const response = await (await load.capture())(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }), param());
    expect(response.status).toBe(503);
    expect(checkout.capture).not.toHaveBeenCalled();
  });
  it.each([
    ['provider-order', {}, 'ensure', 'PROVIDER_ORDER_READY'],
    ['capture', { approvedProviderOrderId: PROVIDER_ORDER }, 'capture', 'INTAKE_PENDING'],
    ['reconcile', {}, 'reconcile', 'SUBMISSION_UNKNOWN'],
    ['status', undefined, 'status', 'STATUS'],
  ] as const)('passes only session actor and order input to %s', async (path, input, called, state) => {
    const handler = await load[path]();
    const result = await handler(request(path, input), param());
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(result.headers.get('vary')).toContain('Authorization');
    const args = path === 'capture' ? { actorUserId: USER, orderId: ORDER, ...input } : { actorUserId: USER, orderId: ORDER };
    expect(checkout[called]).toHaveBeenCalledExactlyOnceWith(expect.any(Object), args);
    const expected = { contractVersion: 'web-payment-charge.v1', orderId: ORDER, state, newOrderAllowed: false };
    if (path === 'provider-order') {
      expect(await result.json()).toEqual({ ...expected, providerOrderId: PROVIDER_ORDER });
    } else if (path === 'status') {
      expect(await result.json()).toEqual({ ...expected, paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE',
        reviewRequired: false });
    } else {
      expect(await result.json()).toEqual(expected);
    }
  });

  it.each([
    [{ approvedProviderOrderId: PROVIDER_ORDER, actorUserId: USER }],
    [{ approvedProviderOrderId: PROVIDER_ORDER, amountMinor: '1' }],
    [{ approvedProviderOrderId: '../bad' }],
    [{ approvedProviderOrderId: PROVIDER_ORDER + '\n' }],
    [[]],
  ])('rejects malformed capture input before authentication or service client', async (body) => {
    const handler = await load.capture();
    const result = await handler(request('capture', body), param());
    expect(result.status).toBe(400);
    expect(auth.create).not.toHaveBeenCalled();
    expect(checkout.createClient).not.toHaveBeenCalled();
    expect(checkout.capture).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin POST before authentication', async () => {
    const handler = await load.capture();
    expect((await handler(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }, 'https://other.invalid'), param())).status).toBe(403);
    expect(auth.create).not.toHaveBeenCalled();
    expect(checkout.createClient).not.toHaveBeenCalled();
  });

  it('rejects missing authentication before creating the service client', async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const handler = await load.capture();
    expect((await handler(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }), param())).status).toBe(401);
    expect(checkout.createClient).not.toHaveBeenCalled();
    expect(checkout.capture).not.toHaveBeenCalled();
  });

  it('rejects invalid path parameters before authentication', async () => {
    const handler = await load.status();
    expect((await handler(request('status'), param('not-an-order'))).status).toBe(400);
    expect(auth.create).not.toHaveBeenCalled();
    expect(checkout.createClient).not.toHaveBeenCalled();
  });

  it('keeps a non-owner response indistinguishable from a missing order', async () => {
    checkout.capture.mockResolvedValueOnce({ kind: 'NOT_FOUND' });
    const handler = await load.capture();
    const result = await handler(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }), param());
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'NOT_FOUND', newOrderAllowed: false });
  });

  it('does not expose the internal reason of an unavailable workflow', async () => {
    checkout.capture.mockResolvedValueOnce({ kind: 'UNAVAILABLE', stage: 'CREDENTIAL', secret: 'fixture-never-disclose' });
    const handler = await load.capture();
    const result = await handler(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }), param());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'UNAVAILABLE', newOrderAllowed: false });
  });

  it('keeps the credential resolver closed even when legacy env values are present', async () => {
    vi.stubEnv('PAYPAL_CLIENT_ID', 'legacy-fixture-id');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'legacy-fixture-secret');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const handler = await load.capture();
    await handler(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }), param());
    const deps = checkout.capture.mock.calls[0][0];
    const { closedPayPalCredentialResolver } = await import('@/lib/payment/paypal-charge/orchestrator');
    expect(deps.credentials).toBe(closedPayPalCredentialResolver);
    await expect(deps.credentials.resolve({ provider: 'PAYPAL', environment: 'LIVE',
      credentialRef: 'fixture', bindingVersion: '1', bindingHash: 'a'.repeat(64) })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps unexpected errors after route validation in the same safe 503 DTO', async () => {
    checkout.capture.mockRejectedValueOnce(new Error('fixture-never-disclose'));
    const handler = await load.capture();
    const result = await handler(request('capture', { approvedProviderOrderId: PROVIDER_ORDER }), param());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'UNAVAILABLE', newOrderAllowed: false });
  });

  it.each([
    '{"approvedProviderOrderId":"X","approvedProviderOrderId":"1P746844G7552750R"}',
    '\uFEFF{"approvedProviderOrderId":"1P746844G7552750R"}',
  ])('refuses ambiguous JSON body %s', async body => {
    const handler = await load.capture();
    const result = await handler(new NextRequest(ORIGIN + '/capture', { method: 'POST', body,
      headers: { origin: ORIGIN, 'content-type': 'application/json' } }), param());
    expect(result.status).toBe(400);
    expect(auth.create).not.toHaveBeenCalled();
  });
});
