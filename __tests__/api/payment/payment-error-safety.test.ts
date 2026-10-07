import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  initError: null as unknown,
  authError: null as unknown,
  payment: {} as Record<string, unknown>,
  rpc: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  isWithdrawnUser: async () => false,
  createServerSupabaseClient: async () => ({
    auth: { getUser: state.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
vi.mock('@/app/api/payment/portone/webhook/webhook-helpers', async (original) => ({
  ...await original<typeof import('@/app/api/payment/portone/webhook/webhook-helpers')>(),
  createServiceRoleSupabaseClient: () => {
    if (state.initError) throw state.initError;
    return { rpc: state.rpc };
  },
  verifyWebhookSignature: () => true,
  verifyPortOnePayment: async () => state.payment,
}));
vi.mock('@/app/api/payment/portone/verify/verify-helpers', async (original) => ({
  ...await original<typeof import('@/app/api/payment/portone/verify/verify-helpers')>(),
  verifyPortOnePayment: async () => state.payment,
}));
import { POST as webhook } from '@/app/api/payment/portone/webhook/route';
import { POST as verify } from '@/app/api/payment/portone/verify/route';

const PRIVATE = 'Q7pPriv buyer-private@example.invalid token=private-payment-canary';
const request = (route: string, body: string) => new NextRequest(`https://www.picnic.fan/api/payment/portone/${route}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body,
});
const paidRequest = () => request('webhook', JSON.stringify({ status: 'PAID', paymentId: 'pay_1' }));
const verifyRequest = () => request('verify', JSON.stringify({ paymentId: 'pay_1' }));

describe('payment failures hide provider and customer details', () => {
  beforeEach(() => {
    state.initError = null;
    state.authError = null;
    state.payment = { status: 'PAID', customer: { email: PRIVATE }, customData: '{}' };
    state.rpc.mockReset();
    state.getUser.mockReset().mockResolvedValue({ data: { user: { id: '00000000-0000-0000-0000-000000000001' } }, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('webhook initialization keeps retryable 500 without exposing exceptions', async () => {
    state.initError = new Error(PRIVATE);
    const response = await webhook(paidRequest());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(PRIVATE);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('webhook missing customData keeps 400 without exposing customer or key names', async () => {
    state.payment[PRIVATE] = 'private';
    const response = await webhook(paidRequest());
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(PRIVATE);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('webhook malformed JSON keeps retryable 500 without raw parser text', async () => {
    const response = await webhook(request('webhook', PRIVATE));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Q7pPriv');
  });
  it('verify auth failure keeps 401 without the provider message', async () => {
    state.getUser.mockResolvedValue({ data: { user: null }, error: new Error(PRIVATE) });
    const response = await verify(verifyRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(PRIVATE);
  });
  it('verify unexpected failure keeps 500 without the provider message', async () => {
    state.getUser.mockRejectedValue(new Error(PRIVATE));
    const response = await verify(verifyRequest());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(PRIVATE);
  });
  it('verify missing anonymous session remains 401 without an error event', async () => {
    const { AuthSessionMissingError } = await import('@supabase/supabase-js');
    state.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const response = await verify(verifyRequest());
    expect(response.status).toBe(401);
    expect(console.error).not.toHaveBeenCalled();
  });
  it('verify hostile thrown object remains a safe 500 when property access throws', async () => {
    const trap = vi.fn(() => { throw new Error(PRIVATE); });
    state.getUser.mockRejectedValue(new Proxy({}, { get: trap, getPrototypeOf: trap }));
    const response = await verify(verifyRequest());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Q7pPriv');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Q7pPriv');
  });
  it('verify nonpaid provider status keeps 400 without reflecting arbitrary status text', async () => {
    state.payment.status = PRIVATE;
    const response = await verify(verifyRequest());
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(PRIVATE);
  });
  it('webhook records failures without printing exception text', async () => {
    state.initError = new Error(PRIVATE);
    await webhook(paidRequest());
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(output).not.toContain(PRIVATE);
    expect(output).toContain('payment.portone.webhook');
  });
});
