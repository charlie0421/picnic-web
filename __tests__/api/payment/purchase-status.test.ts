// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import type { Database } from '@/types/supabase';

const mocks = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null, user: 'owner-a',
  authError: null as unknown, withdrawn: false, fetch: vi.fn(), logs: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => mocks.client,
  isWithdrawnUser: async (_id: string, opts: { failClosed: boolean }) => {
    if (!opts.failClosed) throw Error('withdrawal must fail closed');
    return mocks.withdrawn;
  },
}));
vi.mock('@/utils/log-safe-error', () => ({ logSafeError: mocks.logs }));
import { GET } from '@/app/api/payment/receipts/[receiptId]/status/route';

const INBOX = '77777777-7777-4777-8777-777777777777';
const receipt = { id: '7', user_id: 'owner-a', platform: 'paypal', environment: 'live',
  status: 'pending_verification', verification_data: { provider: 'PAYPAL', inbox_id: INBOX } };
let rows: Record<string, unknown>[];
let outcome: unknown;
let result: unknown;
let failurePath: string | null;
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
function request(id = '7', query = 'provider=paypal&environment=LIVE') {
  return GET(new NextRequest(`https://www.picnic.fan/api/payment/receipts/${id}/status?${query}`),
    { params: Promise.resolve({ receiptId: id }) });
}
function seenPaths() { return mocks.fetch.mock.calls.map(([url]) => new URL(String(url)).pathname); }

beforeEach(() => {
  mocks.user = 'owner-a'; mocks.authError = null; mocks.withdrawn = false; mocks.logs.mockReset();
  rows = [{ ...receipt }]; outcome = [{ status: 'PENDING', last_error_code: null,
    last_error_retryable: null, attempt_count: 0, next_retry_at: null, lease_active: false }];
  result = null; failurePath = null;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key');
  mocks.fetch.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
    const u = new URL(String(url));
    if (failurePath && u.pathname.includes(failurePath)) return respond({ code: 'XX000', message: 'PRIVATE_SECRET payer@example.test' }, 400);
    if (u.pathname === '/rest/v1/receipts') {
      const filtered = rows.filter(row => ['id', 'user_id', 'platform', 'environment']
        .every(key => u.searchParams.get(key) === `eq.${row[key]}`));
      return respond(filtered);
    }
    if (u.pathname.endsWith('/get_purchase_inbox_outcome')) return respond(outcome);
    if (u.pathname.endsWith('/get_purchase_result_for_inbox')) return respond(result);
    throw Error(`Unexpected external call ${u.pathname} ${init.method}`);
  });
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.client = createClient<Database>('https://db.example.invalid', 'fixture-user-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: mocks.fetch },
  });
  vi.spyOn(mocks.client.auth, 'getUser').mockImplementation(async () => ({ data: { user: mocks.user ? { id: mocks.user } : null }, error: mocks.authError }) as never);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('owned purchase status GET', () => {
  it('requires verified authentication and keeps errors out of shared caches', async () => {
    mocks.user = '';
    const response = await request();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(seenPaths()).toEqual([]);
  });

  it('fails closed for a withdrawn account without reading receipts or privileged results', async () => {
    mocks.withdrawn = true;
    expect((await request()).status).toBe(403);
    expect(seenPaths()).toEqual([]);
  });

  it.each(['owner-b', 'administrator'])('does not grant %s access to another user receipt', async user => {
    mocks.user = user;
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'PURCHASE_NOT_FOUND' });
    expect(seenPaths()).toEqual(['/rest/v1/receipts']);
  });

  it.each([
    ['7', 'provider=apple&environment=LIVE'],
    ['7', 'provider=portone&environment=TEST'],
    ['7', 'provider=paypal&environment=PRODUCTION'],
    ['7', 'provider=paypal&environment=LIVE&inbox_id='+INBOX],
    ['7', 'provider=paypal&provider=portone&environment=LIVE'],
    ['7', 'provider=paypal'], ['0', 'provider=paypal&environment=LIVE'],
    ['9223372036854775808', 'provider=paypal&environment=LIVE'],
    ['1e2', 'provider=paypal&environment=LIVE'],
  ])('rejects invalid lookup %s %s before DB access', async (id, query) => {
    expect((await request(id, query)).status).toBe(400);
    expect(seenPaths()).toEqual([]);
  });

  it.each(['provider=paypal&environment=SANDBOX', 'provider=portone&environment=LIVE'])('does not cross provider/environment for %s', async query => {
    expect((await request('7', query)).status).toBe(404);
    expect(seenPaths()).toEqual(['/rest/v1/receipts']);
  });

  it('reads only the owned receipt inbox with two read-only RPCs and no provider or intake call', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(await response.json()).toMatchObject({ receiptId: '7', settlementState: 'QUEUED', refundState: 'UNKNOWN' });
    expect(seenPaths()).toEqual(['/rest/v1/receipts', '/rest/v1/rpc/get_purchase_inbox_outcome']);
    const [receiptUrl] = mocks.fetch.mock.calls[0];
    expect(new URL(receiptUrl).searchParams.get('select')).toContain('id::text');
    const [rpcUrl, rpcInit] = mocks.fetch.mock.calls[1];
    expect(rpcInit.method).toBe('GET');
    expect(new URL(rpcUrl).searchParams.get('p_inbox_id')).toBe(INBOX);
    expect(new Headers(rpcInit.headers).get('authorization')).toBe('Bearer fixture-service-key');
  });

  it('preserves large receipt IDs without numeric conversion', async () => {
    rows = [{ ...receipt, id: '9223372036854775807' }];
    const response = await request('9223372036854775807');
    expect(response.status).toBe(200);
    expect((await response.json()).receiptId).toBe('9223372036854775807');
  });

  it.each([null, { inbox_id: 'bad' }, { provider: 'PORTONE', inbox_id: INBOX }])('does not use unbound legacy metadata for privileged lookup', async verification_data => {
    rows = [{ ...receipt, status: 'completed', verification_data }];
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).settlementState).toBe('UNKNOWN');
    expect(seenPaths()).toEqual(['/rest/v1/receipts']);
  });

  it.each(['receipts', 'get_purchase_inbox_outcome', 'get_purchase_result_for_inbox'])('reports %s lookup failure as unavailable, not unpaid or successful', async path => {
    failurePath = path;
    rows = [{ ...receipt, status: 'completed' }];
    outcome = [{ status: 'SUCCEEDED', last_error_code: null, last_error_retryable: false,
      attempt_count: 1, next_retry_at: null, lease_active: false }];
    const response = await request();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ error: 'PURCHASE_STATUS_UNAVAILABLE' });
  });

  it('returns a safe inconsistency when successful inbox has no purchase result', async () => {
    rows = [{ ...receipt, status: 'completed' }];
    outcome = [{ status: 'SUCCEEDED', last_error_code: null, last_error_retryable: false,
      attempt_count: 1, next_retry_at: null, lease_active: false }];
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ settlementState: 'REVIEW_REQUIRED', safeReasonCode: 'PURCHASE_RESULT_UNAVAILABLE' });
    expect(seenPaths()).toEqual(['/rest/v1/receipts', '/rest/v1/rpc/get_purchase_inbox_outcome', '/rest/v1/rpc/get_purchase_result_for_inbox']);
    expect(mocks.fetch.mock.calls.every(([,init]) => init.method === 'GET')).toBe(true);
  });
});
