// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceChargeRepository, createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';

vi.mock('@supabase/supabase-js', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});

const ACTOR = '00000000-0000-4000-8000-000000000001';
const ORDER = '11111111-1111-4111-8111-111111111111';
const CONTEXT = '22222222-2222-4222-8222-222222222222';
const QUOTE = '77777777-7777-4777-8777-777777777777';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const LEASE = '55555555-5555-4555-8555-555555555555';
const OBSERVATION = '88888888-8888-4888-8888-888888888888';
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// These literals mirror the native seven-RPC DTOs, not a simulated database.
const FOUND_CONTEXT = {
  contract_version: 'web-payment-charge-context.v1', outcome: 'FOUND', charge_authority: false,
  order_id: ORDER, provider: 'PAYPAL', environment: 'SANDBOX', row_version: '9007199254740993',
  payment_state: 'NOT_SUBMITTED', settlement_state: 'NOT_INTAKE', actor_deleted: false,
  quote_id: QUOTE, quote_hash: HASH, product_id: 'STAR100', amount_minor: '9007199254740993',
  currency: 'USD', quantity: '1', quote_expires_at: '2026-11-14T00:15:00.123456+00:00',
  context_id: CONTEXT, verification_binding_present: true, provider_order_id: '5O190127TN364715T',
  provider_capture_id: null, payment_id: null, attempt_id: null, submission_intent_recorded: false, review_required: false,
};
const PREPARED_CONTEXT = { outcome: 'PREPARED', replayed: false, context_id: CONTEXT, order_id: ORDER,
  quote_id: QUOTE, quote_hash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
  scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, settings_version: '9007199254740993',
  create_request_key: '33333333-3333-4333-8333-333333333333', payment_id: null };
const CLAIMED_LEASE = { decision: 'SUBMIT', safe_reason_code: 'LEASE_CLAIMED', attempt_id: ATTEMPT,
  lease_token: LEASE, fencing_version: '9007199254740993', row_version: '9007199254740994',
  provider_request_key: ATTEMPT, submit_not_after: '2026-11-14T00:01:00.123456+00:00', quote_hash: HASH };
const INTENT_RECORDED = { decision: 'SUBMIT', safe_reason_code: 'INTENT_RECORDED', attempt_id: ATTEMPT,
  lease_token: LEASE, fencing_version: '9007199254740993', row_version: '9007199254740995',
  provider_request_key: ATTEMPT, submit_not_after: '2026-11-14T00:01:00.123456+00:00', quote_hash: HASH };
const leaseInput = { attemptId: ATTEMPT, leaseToken: LEASE, fencingVersion: '9007199254740993',
  rowVersion: '9007199254740994', providerRequestKey: ATTEMPT,
  submitNotAfter: '2026-11-14T00:01:00.123456+00:00', quoteHash: HASH };
const RECORDED = { outcome: 'RECORDED', reason_code: null, trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false };
const evidence = { source: 'LOOKUP', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
  payload_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', provider: 'PAYPAL',
  environment: 'SANDBOX', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T',
  order_id: ORDER, user_id: ACTOR, quote_hash: HASH, order_reference: 'v2:11111111-1111-4111-8111-111111111111',
  scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, amount_minor: '999', currency: 'USD', status: 'COMPLETED' };

const rpcFetch = vi.fn();
let wire: unknown;
let status: number;
let expectedRpc: string;

function repository() {
  return createWebPaymentChargeRepository(createClient('https://charge-db.example.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: rpcFetch },
  }));
}

function expectRpc(name: string, args: Record<string, unknown>) {
  expect(rpcFetch).toHaveBeenCalledTimes(1);
  const [url, init] = rpcFetch.mock.calls[0];
  expect(url).toBe(`https://charge-db.example.invalid/rest/v1/rpc/${name}`);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual(args);
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
  expect(new Headers(init.headers).get('x-retry-count')).toBeNull();
}

beforeEach(() => {
  vi.spyOn(AbortSignal, 'timeout');
  status = 200; wire = FOUND_CONTEXT; expectedRpc = 'get_web_payment_charge_context';
  rpcFetch.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
    if (url !== `https://charge-db.example.invalid/rest/v1/rpc/${expectedRpc}` || init.method !== 'POST') {
      throw new Error('Unexpected external operation');
    }
    return new Response(JSON.stringify(wire), { status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('service-only charge context repository', () => {
  it('projects the native getter without granting authority or losing bigint and microseconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const result = await repository().getChargeContext(ACTOR, ORDER);
    expect(result).toMatchObject({ kind: 'FOUND', context: {
      chargeAuthority: false, orderId: ORDER, provider: 'PAYPAL', environment: 'SANDBOX', rowVersion: '9007199254740993',
      paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE', actorDeleted: false,
      quoteId: QUOTE, quoteHash: HASH, productId: 'STAR100', amountMinor: '9007199254740993', currency: 'USD', quantity: '1',
      quoteExpiresAt: '2026-11-14T00:15:00.123456+00:00', contextId: CONTEXT, verificationBindingPresent: true,
      providerOrderId: '5O190127TN364715T', providerCaptureId: null, paymentId: null, attemptId: null,
      submissionIntentRecorded: false, reviewRequired: false,
    } });
    expectRpc('get_web_payment_charge_context', { p_actor_user_id: ACTOR, p_order_id: ORDER });
    expect(timeout).toHaveBeenCalledWith(10_000);
  });
  it('keeps native NOT_FOUND distinct from unavailable', async () => {
    wire = { contract_version: 'web-payment-charge-context.v1', outcome: 'NOT_FOUND', charge_authority: false };
    expect(await repository().getChargeContext(ACTOR, ORDER)).toEqual({ kind: 'NOT_FOUND' });
    expectRpc('get_web_payment_charge_context', { p_actor_user_id: ACTOR, p_order_id: ORDER });
  });
  it.each(['NOT_INTAKE', 'INTAKE_PENDING', 'GRANTED'])('preserves settlement %s on recovery reads', async settlement_state => {
    wire = { ...FOUND_CONTEXT, payment_state: 'SUBMISSION_UNKNOWN', settlement_state, actor_deleted: true,
      submission_intent_recorded: true, attempt_id: ATTEMPT, review_required: true };
    expect(await repository().getChargeContext(ACTOR, ORDER)).toMatchObject({ kind: 'FOUND', context: {
      chargeAuthority: false, paymentState: 'SUBMISSION_UNKNOWN', settlementState: settlement_state,
      actorDeleted: true, submissionIntentRecorded: true, reviewRequired: true,
    } });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    null, [], {}, { ...FOUND_CONTEXT, charge_authority: true }, { ...FOUND_CONTEXT, quantity: 1 },
    { ...FOUND_CONTEXT, quantity: '2' }, { ...FOUND_CONTEXT, row_version: 9007199254740992 },
    { ...FOUND_CONTEXT, amount_minor: 999 }, { ...FOUND_CONTEXT, quote_hash: 'Q7pPriv' },
    { ...FOUND_CONTEXT, contract_version: 'other' }, { ...FOUND_CONTEXT, order_id: CONTEXT },
    { ...FOUND_CONTEXT, environment: 'test' }, { ...FOUND_CONTEXT, payment_state: 'PAID' },
    { ...FOUND_CONTEXT, settlement_state: 'SUCCEEDED' }, { ...FOUND_CONTEXT, quote_expires_at: 'yesterday' },
    { ...FOUND_CONTEXT, verification_binding_present: 'true' },
  ])('closes malformed native getter %# before any second RPC', async data => {
    wire = data;
    const error = await repository().getChargeContext(ACTOR, ORDER).catch(e => e);
    expect(error).toMatchObject({ stage: 'RESPONSE' });
    expect(JSON.stringify(error)).not.toContain('Q7pPriv'); expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
});

describe('exact seven existing charge RPCs', () => {
  it('projects an immutable PREPARED replay scope with one locking prepare RPC and no getter or SELECT', async () => {
    wire = { ...PREPARED_CONTEXT, replayed: true }; expectedRpc = 'prepare_web_payment_provider_context';
    expect(await repository().prepareProviderContext(ACTOR, ORDER)).toEqual({ kind: 'PREPARED', replayed: true,
      contextId: CONTEXT, orderId: ORDER, quoteId: QUOTE, quoteHash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, settingsVersion: '9007199254740993',
      createRequestKey: '33333333-3333-4333-8333-333333333333', paymentId: null });
    expectRpc('prepare_web_payment_provider_context', { p_actor_user_id: ACTOR, p_order_id: ORDER });
  });
  it.each([
    { ...PREPARED_CONTEXT, replayed: 'true' }, { ...PREPARED_CONTEXT, scope: { merchant_id: 'MERCHANTA1' } },
    { ...PREPARED_CONTEXT, scope: { account_id: '', merchant_id: 'MERCHANTA1' } },
    { ...PREPARED_CONTEXT, scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1', credential: 'Q7pPriv' } },
  ])('rejects malformed replay scope %# without a second RPC', async data => {
    wire = data; expectedRpc = 'prepare_web_payment_provider_context';
    const caught = await repository().prepareProviderContext(ACTOR, ORDER).catch(error => error);
    expect(caught).toMatchObject({ stage: 'RESPONSE' });
    expect(String(caught) + JSON.stringify(caught)).not.toContain('Q7pPriv');
    expectRpc('prepare_web_payment_provider_context', { p_actor_user_id: ACTOR, p_order_id: ORDER });
  });
  it('prepares the fixed provider scope and CREATE key with exact actor/order arguments', async () => {
    wire = PREPARED_CONTEXT; expectedRpc = 'prepare_web_payment_provider_context';
    expect(await repository().prepareProviderContext(ACTOR, ORDER)).toEqual({ kind: 'PREPARED', replayed: false,
      contextId: CONTEXT, orderId: ORDER, quoteId: QUOTE, quoteHash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, settingsVersion: '9007199254740993',
      createRequestKey: '33333333-3333-4333-8333-333333333333', paymentId: null });
    expectRpc('prepare_web_payment_provider_context', { p_actor_user_id: ACTOR, p_order_id: ORDER });
  });
  it.each([
    'WEB_PAYMENT_ORDER_NOT_FOUND', 'WEB_PAYMENT_USER_DELETED', 'WEB_PAYMENT_ORDERS_CLOSED',
    'WEB_PAYMENT_QUOTE_EXPIRED', 'WEB_PAYMENT_PROVIDER_SCOPE_CHANGED', 'WEB_PAYMENT_PROVIDER_SCOPE_UNAVAILABLE',
    'WEB_PAYMENT_BINDING_CHANGED', 'WEB_PAYMENT_BINDING_SCOPE_MISMATCH',
  ])('accepts only exact prepare business P0001 %s', async message => {
    expectedRpc = 'prepare_web_payment_provider_context'; status = 400;
    wire = { code: 'P0001', message, details: 'Q7pPriv', hint: 'Q7pPriv' };
    expect(await repository().prepareProviderContext(ACTOR, ORDER)).toEqual({ kind: 'REFUSED', code: message });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { code: '42501', message: 'WEB_PAYMENT_ORDERS_CLOSED' },
    { code: 'P0001', message: ' WEB_PAYMENT_ORDERS_CLOSED' },
    { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED Q7pPriv' },
    { code: 'P0001', message: 'NEW_UNKNOWN_REASON' }, { code: 'PGRST202', message: 'Q7pPriv' },
  ])('sanitizes unknown or mismatched SQL errors %# without retry', async error => {
    expectedRpc = 'prepare_web_payment_provider_context'; status = 400; wire = { ...error, details: 'Q7pPriv' };
    const caught = await repository().prepareProviderContext(ACTOR, ORDER).catch(e => e);
    expect(caught).toMatchObject({ stage: 'RPC' });
    expect(String(caught) + JSON.stringify(caught)).not.toMatch(/Q7pPriv|PGRST|NEW_UNKNOWN/);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['bindProviderIdentity', 'bind_web_payment_provider_identity'],
    ['recordObservation', 'record_web_payment_observation'],
  ] as const)('sends bounded evidence through %s without adding raw payload', async (method, rpc) => {
    expectedRpc = rpc; wire = RECORDED;
    expect(await repository()[method](CONTEXT, evidence as any)).toEqual({ kind: 'RECORDED', observationId: OBSERVATION, replayed: false });
    expectRpc(rpc, { p_context_id: CONTEXT, p_evidence: evidence });
  });
  it('keeps durable observation REVIEW separate from successful binding', async () => {
    expectedRpc = 'bind_web_payment_provider_identity';
    wire = { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_SCOPE_MISMATCH', trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false };
    expect(await repository().bindProviderIdentity(CONTEXT, evidence as any)).toMatchObject({
      kind: 'REVIEW_REQUIRED', reason: 'PROVIDER_SCOPE_MISMATCH', observationId: OBSERVATION, replayed: false,
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it('claims only CAPTURE and returns the exact usable lease', async () => {
    expectedRpc = 'claim_web_payment_charge'; wire = CLAIMED_LEASE;
    expect(await repository().claimCharge(ACTOR, ORDER, '9007199254740993')).toEqual({
      kind: 'SUBMIT', reason: 'LEASE_CLAIMED', lease: leaseInput,
    });
    expectRpc('claim_web_payment_charge', { p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_expected_version: '9007199254740993', p_action: 'CAPTURE' });
  });
  it('records intent using claim rowVersion and fencing strings and preserves the incremented version', async () => {
    expectedRpc = 'record_web_payment_submission_intent'; wire = INTENT_RECORDED;
    expect(await repository().recordSubmissionIntent(ACTOR, ORDER, '9007199254740994', leaseInput)).toEqual({
      kind: 'SUBMIT', reason: 'INTENT_RECORDED', lease: { ...leaseInput, rowVersion: '9007199254740995' },
    });
    expectRpc('record_web_payment_submission_intent', { p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_expected_version: '9007199254740994', p_action: 'CAPTURE', p_attempt_id: ATTEMPT,
      p_lease_token: LEASE, p_fencing_version: '9007199254740993' });
  });
  it('does not turn LOOKUP_ONLY with no attempt into submission authority', async () => {
    expectedRpc = 'claim_web_payment_charge';
    wire = { decision: 'LOOKUP_ONLY', safe_reason_code: 'SUBMISSION_UNKNOWN', row_version: '3', quote_hash: HASH };
    expect(await repository().claimCharge(ACTOR, ORDER, '1')).toEqual({ kind: 'LOOKUP_ONLY',
      attemptId: null, providerRequestKey: null, rowVersion: '3', quoteHash: HASH });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it('discards fencing from LOOKUP_ONLY and never returns a usable lease', async () => {
    expectedRpc = 'claim_web_payment_charge';
    wire = { decision: 'LOOKUP_ONLY', safe_reason_code: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT,
      provider_request_key: ATTEMPT, fencing_version: '9', row_version: '4', quote_hash: HASH };
    expect(await repository().claimCharge(ACTOR, ORDER, '1')).toEqual({ kind: 'LOOKUP_ONLY',
      attemptId: ATTEMPT, providerRequestKey: ATTEMPT, rowVersion: '4', quoteHash: HASH });
  });
  it.each([
    ['VERSION_MISMATCH', '9007199254740993'], ['LEASE_ACTIVE', null], ['ACTOR_DELETED', null],
    ['REVIEW_REQUIRED', null], ['VERIFICATION_BINDING_CHANGED', null], ['PROVIDER_SCOPE_CHANGED', null],
    ['CHARGE_CLOSED', null], ['LEASE_EXPIRED', null], ['LEASE_MISMATCH', null], ['QUOTE_EXPIRED', null],
  ])('preserves exact blocked reason %s and optional version', async (reason, rowVersion) => {
    expectedRpc = 'claim_web_payment_charge';
    wire = { decision: 'BLOCKED', safe_reason_code: reason, ...(rowVersion === null ? {} : { row_version: rowVersion }) };
    expect(await repository().claimCharge(ACTOR, ORDER, '1')).toEqual({ kind: 'BLOCKED', reason, rowVersion });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...CLAIMED_LEASE, lease_token: null }, { ...CLAIMED_LEASE, attempt_id: '' },
    { ...CLAIMED_LEASE, fencing_version: 1 }, { ...CLAIMED_LEASE, row_version: 9007199254740992 },
    { ...CLAIMED_LEASE, provider_request_key: 'not-uuid' }, { ...CLAIMED_LEASE, submit_not_after: 'bad-date' },
    { ...CLAIMED_LEASE, safe_reason_code: 'NEW_SUBMIT_REASON' },
    { decision: 'BLOCKED', safe_reason_code: 'NEW_UNKNOWN_REASON' },
    { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: 3 },
    { decision: 'LOOKUP_ONLY', safe_reason_code: 'OTHER', row_version: '3', quote_hash: HASH },
  ])('closes unknown or lossy charge command %#', async data => {
    expectedRpc = 'claim_web_payment_charge'; wire = data;
    await expect(repository().claimCharge(ACTOR, ORDER, '1')).rejects.toMatchObject({ stage: 'RESPONSE' });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it('receives only the actual observation identity and retains intake-only semantics', async () => {
    expectedRpc = 'receive_web_payment_purchase';
    wire = { outcome: 'INTAKE_PENDING', replayed: false, order_id: ORDER,
      inbox_id: '99999999-9999-4999-8999-999999999999', receipt_id: '9007199254740993', coverage: 'SCOPE_ONLY', grant_eligible: false };
    expect(await repository().receivePurchase(ORDER, OBSERVATION)).toMatchObject({
      kind: 'INTAKE_PENDING', replayed: false, orderId: ORDER, inboxId: '99999999-9999-4999-8999-999999999999',
      receiptId: '9007199254740993', coverage: 'SCOPE_ONLY', grantEligible: false,
    });
    expectRpc('receive_web_payment_purchase', { p_order_id: ORDER, p_observation_id: OBSERVATION });
  });
  it.each([
    { outcome: 'NOT_COMPLETED', grant_eligible: false },
    { outcome: 'REVIEW_REQUIRED', reason_code: 'EXISTING_PURCHASE_IDENTITY', grant_eligible: false },
  ])('keeps intake refusal distinct from receipt of payment %#', async data => {
    expectedRpc = 'receive_web_payment_purchase'; wire = data;
    expect(await repository().receivePurchase(ORDER, OBSERVATION)).toMatchObject({ kind: data.outcome });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['bind_web_payment_provider_identity', { ...RECORDED, trust: 'FULL' }],
    ['record_web_payment_observation', { ...RECORDED, outcome: 'REVIEW_REQUIRED', reason_code: 'NEW_REASON' }],
    ['receive_web_payment_purchase', { outcome: 'INTAKE_PENDING', replayed: false, grant_eligible: true }],
    ['prepare_web_payment_provider_context', { ...PREPARED_CONTEXT, settings_version: 1 }],
  ])('fails closed on malformed %s output', async (rpc, data) => {
    expectedRpc = rpc; wire = data; const r = repository();
    const operation = rpc === 'prepare_web_payment_provider_context' ? r.prepareProviderContext(ACTOR, ORDER)
      : rpc === 'receive_web_payment_purchase' ? r.receivePurchase(ORDER, OBSERVATION)
        : rpc === 'record_web_payment_observation' ? r.recordObservation(CONTEXT, evidence as any)
          : r.bindProviderIdentity(CONTEXT, evidence as any);
    await expect(operation).rejects.toMatchObject({ stage: 'RESPONSE' }); expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it('propagates the actual ten-second RPC signal and sanitizes timeout without retries', async () => {
    const controller = new AbortController(); const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    rpcFetch.mockImplementation(async (_url, init) => {
      controller.abort(new DOMException('Q7pPriv', 'TimeoutError')); init.signal.throwIfAborted();
    });
    const caught = await repository().getChargeContext(ACTOR, ORDER).catch(e => e);
    expect(caught).toMatchObject({ stage: 'RPC' });
    expect(String(caught) + JSON.stringify(caught)).not.toMatch(/Q7pPriv|TimeoutError/);
    expect(timeout).toHaveBeenCalledWith(10_000); expect(rpcFetch).toHaveBeenCalledTimes(1);
    expect(rpcFetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe('future service repository composition with synthetic configuration', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://charge-db.example.invalid');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key'); vi.stubGlobal('fetch', rpcFetch);
  });
  it('creates an isolated service client with no user cookie or authorization forwarding', async () => {
    vi.mocked(createClient).mockClear();
    const r = createServiceChargeRepository();
    await r.getChargeContext(ACTOR, ORDER);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://charge-db.example.invalid', 'synthetic-service-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: expect.any(Function) },
    });
    const [, init] = rpcFetch.mock.calls[0]; const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer synthetic-service-key');
    expect(headers.get('cookie')).toBeNull(); expect(init.cache).toBe('no-store');
    expectRpc('get_web_payment_charge_context', { p_actor_user_id: ACTOR, p_order_id: ORDER });
  });
  it.each(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('fails missing %s before RPC', key => {
    vi.stubEnv(key, ''); vi.mocked(createClient).mockClear();
    let caught: unknown; try { createServiceChargeRepository(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ stage: 'CONFIG' }); expect(createClient).not.toHaveBeenCalled(); expect(rpcFetch).not.toHaveBeenCalled();
  });
});
