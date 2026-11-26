// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), from: vi.fn(), profile: vi.fn(), deps: vi.fn(), checkout: vi.fn(), confirm: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.session }));
vi.mock('@/lib/payment/portone-test/runtime', () => ({ createPortOneTestDependencies: mocks.deps }));
vi.mock('@/lib/payment/portone-test/service', () => ({ checkoutPortOneTest: mocks.checkout, confirmPortOneTest: mocks.confirm, getPortOneTestStatus: mocks.status }));
import { createPortOneTestOrderHandler } from '@/lib/payment/portone-test/order-entry';
const ORDER = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const ORIGIN = 'http://localhost:3100';
const params = { params: Promise.resolve({ orderId: ORDER }) };
function request(body?: string, origin = ORIGIN, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/payment/orders/${ORDER}/portone/checkout`, {
    method: body === undefined ? 'GET' : 'POST', body, headers: { origin, 'content-type': 'application/json', ...headers },
  });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mocks.profile.mockResolvedValue({ data: { is_super_admin: true }, error: null });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) });
  mocks.session.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  mocks.deps.mockReturnValue({});
  for (const fn of [mocks.checkout, mocks.confirm, mocks.status]) fn.mockResolvedValue({ state: 'PENDING', orderId: ORDER });
});
afterEach(() => vi.unstubAllEnvs());
describe('PortOne TEST order HTTP boundary', () => {
  it('uses the authenticated user, never a request actor, with a current DB role', async () => {
    const response = await createPortOneTestOrderHandler('confirm')(request('{"txId":"tx-test","paymentToken":"private-token"}'), params);
    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({}, { actorUserId: USER, orderId: ORDER, txId: 'tx-test', paymentToken: 'private-token' });
    expect(await response.text()).not.toContain('private-token');
  });
  it.each(['{}', '{"txId":"tx-test","paymentToken":"x","actorUserId":"x"}',
    '{"txId":"x","txId":"y","paymentToken":"x"}', '{"txId":"x","paymentToken":"x","paymentId":"x"}',
    '{"txId":"x\\n","paymentToken":"x"}', '{"txId":"x","paymentToken":"x\\n"}',
    '{"txId":"x","paymentToken":"x"}\n{}', 'x'.repeat(4097)])('rejects ambiguous or malformed confirmation before auth: %s', async body => {
    expect((await createPortOneTestOrderHandler('confirm')(request(body), params)).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('rejects cross-site and unauthenticated requests before service access', async () => {
    expect((await createPortOneTestOrderHandler('checkout')(request('{}', 'https://other.invalid'), params)).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await createPortOneTestOrderHandler('checkout')(request('{}'), params)).status).toBe(401);
    expect(mocks.deps).not.toHaveBeenCalled();
  });
  it('rejects a remote project URL before even making the authentication request', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xtijtefcycoeqludlngc.supabase.co');
    expect((await createPortOneTestOrderHandler('checkout')(request('{}'), params)).status).toBe(503);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.deps).not.toHaveBeenCalled();
  });
  it('holds revoked admins but preserves owner read-only status recovery', async () => {
    mocks.profile.mockResolvedValue({ data: { is_admin: false, is_super_admin: false }, error: null });
    expect((await createPortOneTestOrderHandler('checkout')(request('{}'), params)).status).toBe(403);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect((await createPortOneTestOrderHandler('status')(request(), params)).status).toBe(200);
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith({}, { actorUserId: USER, orderId: ORDER });
  });
  it('returns a fixed safe response for errors carrying secret provider data', async () => {
    mocks.confirm.mockRejectedValue(new Error('private-token fixture-secret'));
    const response = await createPortOneTestOrderHandler('confirm')(request('{"txId":"tx-test","paymentToken":"private-token"}'), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: 'UNAVAILABLE', orderId: ORDER });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
