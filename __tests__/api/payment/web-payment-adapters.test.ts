// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';
import {
  capturePayPalOrder, closedPayPalCredentialResolver, ensurePayPalProviderOrder,
  getPayPalChargeStatus, reconcilePayPalOrder, toPayPalChargeBrowserDto,
} from '@/lib/payment/paypal-charge/orchestrator';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const ORDER = '11111111-1111-4111-8111-111111111111';
const CONTEXT = '22222222-2222-4222-8222-222222222222';
const CREATE_KEY = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const LEASE = '55555555-5555-4555-8555-555555555555';
const QUOTE = '77777777-7777-4777-8777-777777777777';
const OBSERVATION = '88888888-8888-4888-8888-888888888888';
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROVIDER_ORDER = '5O190127TN364715T';
const NOW = Date.parse('2026-11-14T00:00:00.123Z');
const input = { actorUserId: ACTOR, orderId: ORDER };
const approvedInput = { ...input, approvedProviderOrderId: PROVIDER_ORDER };

const RPC = {
  getter: 'get_web_payment_charge_context', prepare: 'prepare_web_payment_provider_context',
  bind: 'bind_web_payment_provider_identity', observe: 'record_web_payment_observation',
  claim: 'claim_web_payment_charge', intent: 'record_web_payment_submission_intent', receive: 'receive_web_payment_purchase',
} as const;

// Scripted native DTOs authorize only the scenario that explicitly supplies them.
// They do not implement SQL locks, gate decisions, or database state transitions.
const NATIVE_FOUND = { contract_version: 'web-payment-charge-context.v1', outcome: 'FOUND', charge_authority: false,
  order_id: ORDER, provider: 'PAYPAL', environment: 'SANDBOX', row_version: '1',
  payment_state: 'NOT_SUBMITTED', settlement_state: 'NOT_INTAKE', actor_deleted: false,
  quote_id: QUOTE, quote_hash: HASH, product_id: 'STAR100', amount_minor: '999', currency: 'USD', quantity: '1',
  quote_expires_at: '2026-11-14T00:15:00.123456+00:00', context_id: CONTEXT, verification_binding_present: true,
  provider_order_id: PROVIDER_ORDER, provider_capture_id: null, payment_id: null,
  attempt_id: null, submission_intent_recorded: false, review_required: false };
const NATIVE_PREPARED = { outcome: 'PREPARED', replayed: true, context_id: CONTEXT, order_id: ORDER,
  quote_id: QUOTE, quote_hash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
  scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, settings_version: '1',
  create_request_key: CREATE_KEY, payment_id: null };
const NATIVE_CLAIMED = { decision: 'SUBMIT', safe_reason_code: 'LEASE_CLAIMED', attempt_id: ATTEMPT,
  lease_token: LEASE, fencing_version: '1', row_version: '2', provider_request_key: ATTEMPT,
  submit_not_after: '2026-11-14T00:01:00.123456+00:00', quote_hash: HASH };
const NATIVE_INTENT = { decision: 'SUBMIT', safe_reason_code: 'INTENT_RECORDED', attempt_id: ATTEMPT,
  lease_token: LEASE, fencing_version: '1', row_version: '3', provider_request_key: ATTEMPT,
  submit_not_after: '2026-11-14T00:01:00.123456+00:00', quote_hash: HASH };
const NATIVE_RECORDED = { outcome: 'RECORDED', reason_code: null, trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false };
const NATIVE_INTAKE = { outcome: 'INTAKE_PENDING', replayed: false, order_id: ORDER,
  inbox_id: '99999999-9999-4999-8999-999999999999', receipt_id: '9007199254740993', coverage: 'SCOPE_ONLY', grant_eligible: false };
const BINDING = { orderId: ORDER, contextId: CONTEXT, provider: 'PAYPAL' as const, environment: 'SANDBOX' as const,
  billingCountry: 'US', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
  bindingId: '66666666-6666-4666-8666-666666666666', bindingVersion: '1',
  bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  credentialRef: 'Q7pPrivCredential', expectedPayPalClientId: 'synthetic-client' };

function providerOrder(status = 'APPROVED') {
  return { id: PROVIDER_ORDER, intent: 'CAPTURE', status,
    payment_source: { paypal: { address: { country_code: 'US' }, email_address: 'Q7pPriv@example.invalid' } },
    purchase_units: [{ custom_id: 'v2:11111111-1111-4111-8111-111111111111',
      amount: { currency_code: 'USD', value: '9.99' }, payee: { merchant_id: 'MERCHANTA1' },
      payments: { captures: [] as Array<Record<string, unknown>> } }],
    links: [{ href: 'https://evil.example.invalid/Q7pPriv', method: 'POST', rel: 'capture' }],
    update_time: '2026-11-14T00:00:03Z' };
}
function capturedOrder(status = 'COMPLETED') {
  const body = providerOrder('COMPLETED');
  body.purchase_units[0].payments.captures = [{ id: '3C679366HH908993F', status,
    amount: { currency_code: 'USD', value: '9.99' },
    custom_id: 'v2:11111111-1111-4111-8111-111111111111', update_time: '2026-11-14T00:00:02Z' }];
  return body;
}

// Verbatim cached Orders v2 minimal wallet examples (capture 200/201).
// These demonstrate response shape only; sandbox reachability remains unmeasured.
const OFFICIAL_CAPTURE_200 = {
  "id": "5O190127TN364715T",
  "status": "COMPLETED",
  "payment_source": {
    "paypal": {
      "name": {
        "given_name": "John",
        "surname": "Doe"
      },
      "email_address": "customer@example.com",
      "account_id": "QYR5Z8XDVJNXQ",
      "account_status": "VERIFIED"
    }
  },
  "purchase_units": [
    {
      "reference_id": "d9f80740-38f0-11e8-b467-0ed5f89f718b",
      "shipping": {
        "address": {
          "address_line_1": "2211 N First Street",
          "address_line_2": "Building 17",
          "admin_area_2": "San Jose",
          "admin_area_1": "CA",
          "postal_code": "95131",
          "country_code": "US"
        }
      },
      "payments": {
        "captures": [
          {
            "id": "3C679366HH908993F",
            "status": "COMPLETED",
            "amount": {
              "currency_code": "USD",
              "value": "100.00"
            },
            "seller_protection": {
              "status": "ELIGIBLE",
              "dispute_categories": [
                "ITEM_NOT_RECEIVED",
                "UNAUTHORIZED_TRANSACTION"
              ]
            },
            "final_capture": true,
            "disbursement_mode": "INSTANT",
            "seller_receivable_breakdown": {
              "gross_amount": {
                "currency_code": "USD",
                "value": "100.00"
              },
              "paypal_fee": {
                "currency_code": "USD",
                "value": "3.00"
              },
              "net_amount": {
                "currency_code": "USD",
                "value": "97.00"
              }
            },
            "create_time": "2018-04-01T21:20:49Z",
            "update_time": "2018-04-01T21:20:49Z",
            "links": [
              {
                "href": "https://api-m.paypal.com/v2/payments/captures/3C679366HH908993F",
                "rel": "self",
                "method": "GET"
              },
              {
                "href": "https://api-m.paypal.com/v2/payments/captures/3C679366HH908993F/refund",
                "rel": "refund",
                "method": "POST"
              }
            ]
          }
        ]
      }
    }
  ],
  "payer": {
    "name": {
      "given_name": "John",
      "surname": "Doe"
    },
    "email_address": "customer@example.com",
    "payer_id": "QYR5Z8XDVJNXQ"
  },
  "links": [
    {
      "href": "https://api-m.paypal.com/v2/checkout/orders/5O190127TN364715T",
      "rel": "self",
      "method": "GET"
    }
  ]
};
const OFFICIAL_CAPTURE_201 = {
  "id": "5O190127TN364715T",
  "status": "COMPLETED",
  "payment_source": {
    "paypal": {
      "name": {
        "given_name": "John",
        "surname": "Doe"
      },
      "email_address": "customer@example.com",
      "account_id": "QYR5Z8XDVJNXQ"
    }
  },
  "purchase_units": [
    {
      "reference_id": "d9f80740-38f0-11e8-b467-0ed5f89f718b",
      "shipping": {
        "address": {
          "address_line_1": "2211 N First Street",
          "address_line_2": "Building 17",
          "admin_area_2": "San Jose",
          "admin_area_1": "CA",
          "postal_code": "95131",
          "country_code": "US"
        }
      },
      "payments": {
        "captures": [
          {
            "id": "3C679366HH908993F",
            "status": "COMPLETED",
            "amount": {
              "currency_code": "USD",
              "value": "100.00"
            },
            "seller_protection": {
              "status": "ELIGIBLE",
              "dispute_categories": [
                "ITEM_NOT_RECEIVED",
                "UNAUTHORIZED_TRANSACTION"
              ]
            },
            "final_capture": true,
            "disbursement_mode": "INSTANT",
            "seller_receivable_breakdown": {
              "gross_amount": {
                "currency_code": "USD",
                "value": "100.00"
              },
              "paypal_fee": {
                "currency_code": "USD",
                "value": "3.00"
              },
              "net_amount": {
                "currency_code": "USD",
                "value": "97.00"
              }
            },
            "create_time": "2018-04-01T21:20:49Z",
            "update_time": "2018-04-01T21:20:49Z",
            "links": [
              {
                "href": "https://api-m.paypal.com/v2/payments/captures/3C679366HH908993F",
                "rel": "self",
                "method": "GET"
              },
              {
                "href": "https://api-m.paypal.com/v2/payments/captures/3C679366HH908993F/refund",
                "rel": "refund",
                "method": "POST"
              }
            ]
          }
        ]
      }
    }
  ],
  "payer": {
    "name": {
      "given_name": "John",
      "surname": "Doe"
    },
    "email_address": "customer@example.com",
    "payer_id": "QYR5Z8XDVJNXQ"
  },
  "links": [
    {
      "href": "https://api-m.paypal.com/v2/checkout/orders/5O190127TN364715T",
      "rel": "self",
      "method": "GET"
    }
  ]
};

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type RpcReply = { data: unknown; status?: number } | Promise<{ data: unknown; status?: number }>;
function boundaries(overrides: Record<string, RpcReply[]> = {}) {
  const script: Record<string, RpcReply[]> = {
    [RPC.getter]: [{ data: NATIVE_FOUND }], [RPC.prepare]: [{ data: NATIVE_PREPARED }],
    [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.observe]: [{ data: NATIVE_RECORDED }],
    [RPC.claim]: [{ data: NATIVE_CLAIMED }], [RPC.intent]: [{ data: NATIVE_INTENT }],
    [RPC.receive]: [{ data: NATIVE_INTAKE }], ...overrides,
  };
  const trail: string[] = [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpcFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    const prefix = 'https://scripted-db.example.invalid/rest/v1/rpc/';
    if (!String(url).startsWith(prefix) || init.method !== 'POST') throw new Error('Unexpected external operation');
    const name = String(url).slice(prefix.length); calls.push({ name, args: JSON.parse(init.body as string) }); trail.push(name);
    const reply = script[name]?.shift();
    if (!reply) throw new Error('Unscripted RPC');
    const { data, status = 200 } = await reply;
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  });
  const client = createClient('https://scripted-db.example.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: rpcFetch },
  });
  const bindings = { getProviderBinding: vi.fn().mockImplementation(async () => structuredClone(BINDING)) };
  const AUTHORIZED = { kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT, createRequestKey: CREATE_KEY,
    quoteHash: HASH, bindingHash: BINDING.bindingHash, entryNotAfter: '2026-11-14T00:15:00.123456+00:00' };
  const entry = { authorizeProviderEntry: vi.fn().mockImplementation(async () => structuredClone(AUTHORIZED)) };
  const credentials = { resolve: vi.fn().mockImplementation(async () =>
    ({ clientId: 'synthetic-client', clientSecret: 'Q7pPriv-secret' })) };
  const transport = {
    requestToken: vi.fn().mockImplementation(async () => ({ accessToken: 'Q7pPriv-token' })),
    createOrder: vi.fn().mockImplementation(async () => ({ kind: 'RESPONSE', status: 201, body: providerOrder('CREATED') })),
    getOrder: vi.fn().mockImplementation(async () => ({ kind: 'RESPONSE', status: 200, body: providerOrder() })),
    captureOrder: vi.fn().mockImplementation(async () => ({ kind: 'RESPONSE', status: 201, body: capturedOrder() })),
  };
  // Record the actual injected call even when a scenario replaces a mock's implementation.
  function traceCall<Args extends unknown[], Result>(stage: string, boundary: (...args: Args) => Result) {
    return (...args: Args): Result => { trail.push(stage); return boundary(...args); };
  }
  const log = vi.fn();
  const deps = { repository: createWebPaymentChargeRepository(client),
    entry: { authorizeProviderEntry: traceCall('entry', entry.authorizeProviderEntry) },
    bindings: { getProviderBinding: traceCall('binding', bindings.getProviderBinding) },
    credentials: { resolve: traceCall('resolve', credentials.resolve) },
    transport: { requestToken: traceCall('token', transport.requestToken), createOrder: traceCall('create', transport.createOrder),
      getOrder: traceCall('get', transport.getOrder), captureOrder: traceCall('capture', transport.captureOrder) },
    nowMs: () => NOW, log };
  return { deps, script, trail, calls, rpcFetch, bindings, entry, credentials, transport, log };
}

function rpcCalls(h: ReturnType<typeof boundaries>, name: string) { return h.calls.filter(call => call.name === name); }
function expectNoSubmission(h: ReturnType<typeof boundaries>) {
  expect(h.transport.createOrder).not.toHaveBeenCalled(); expect(h.transport.captureOrder).not.toHaveBeenCalled();
  expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
}
function expectNoProvider(h: ReturnType<typeof boundaries>) {
  expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled();
  expect(h.bindings.getProviderBinding).not.toHaveBeenCalled(); expect(h.credentials.resolve).not.toHaveBeenCalled();
  expect(h.transport.requestToken).not.toHaveBeenCalled(); expect(h.transport.getOrder).not.toHaveBeenCalled();
  expectNoSubmission(h);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('server PayPal CREATE authority', () => {
  it('returns NOT_FOUND from owner getter without binding, credential, provider or mutation RPC', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { contract_version: 'web-payment-charge-context.v1', outcome: 'NOT_FOUND', charge_authority: false } }] });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'NOT_FOUND' });
    expect(h.calls).toEqual([{ name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } }]); expectNoProvider(h);
  });
  it('replays an existing provider ORDER even after quote expiry with zero provider effects', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, quote_expires_at: '2020-01-01T00:00:00.123456Z' } }] });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
    expectNoProvider(h); expect(rpcCalls(h, RPC.prepare)).toHaveLength(0); expect(h.calls).toHaveLength(1);
  });
  it('prepares and verifies binding before token and binds only the actual CREATE response', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry', 'create', RPC.bind]);
    expect(h.bindings.getProviderBinding).toHaveBeenCalledWith(ACTOR, ORDER);
    expect(h.credentials.resolve).toHaveBeenCalledWith({ provider: 'PAYPAL', environment: 'SANDBOX',
      credentialRef: 'Q7pPrivCredential', bindingVersion: '1', bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
    expect(h.transport.requestToken).toHaveBeenCalledWith(expect.objectContaining({ environment: 'SANDBOX',
      credential: { clientId: 'synthetic-client', clientSecret: 'Q7pPriv-secret' } }));
    expect(h.transport.createOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledWith(expect.objectContaining({ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      requestKey: CREATE_KEY, orderId: ORDER, amountMinor: '999' }));
    const bind = rpcCalls(h, RPC.bind); expect(bind).toHaveLength(1);
    expect(bind[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: { source: 'CREATE_RESPONSE', identity_kind: 'ORDER',
      external_id: PROVIDER_ORDER, parent_external_id: null, status: 'CREATED', key: 'ORDER:5O190127TN364715T:CREATED',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, amount_minor: '999', currency: 'USD', order_id: ORDER, user_id: ACTOR } });
    expect(JSON.stringify(bind[0])).not.toMatch(/Q7pPriv|links|update_time|provider_completed_at/);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.transport.captureOrder).not.toHaveBeenCalled(); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it('can prepare the first provider context without pretending the getter supplies a binding', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null, context_id: null,
      verification_binding_present: false } }], [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, replayed: false } }] });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry', 'create', RPC.bind]);
  });
  it('keeps the same create key after response loss and uses different observation keys for latest statuses', async () => {
    const fresh = { ...NATIVE_FOUND, provider_order_id: null };
    const h = boundaries({ [RPC.getter]: [{ data: fresh }, { data: fresh }, { data: fresh }, { data: NATIVE_FOUND }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: { ...NATIVE_PREPARED, replayed: true } }, { data: { ...NATIVE_PREPARED, replayed: true } }],
      [RPC.bind]: [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv' } },
        { data: { ...NATIVE_RECORDED, observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }] });
    h.transport.createOrder.mockResolvedValueOnce({ kind: 'TRANSPORT_UNKNOWN' })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 201, body: providerOrder('CREATED') })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder('APPROVED') });
    const lost = await ensurePayPalProviderOrder(h.deps, input);
    expect(lost.kind).not.toBe('PROVIDER_ORDER_READY'); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    // The CREATED bind failed; only the later APPROVED bind establishes the immutable link.
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage: 'OBSERVE' });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
    expect(rpcCalls(h, RPC.prepare)).toHaveLength(3);
    expect(h.transport.createOrder.mock.calls.map(([arg]) => arg.requestKey)).toEqual([CREATE_KEY, CREATE_KEY, CREATE_KEY]);
    expect(rpcCalls(h, RPC.bind).map(call => (call.args.p_evidence as any).key))
      .toEqual(['ORDER:5O190127TN364715T:CREATED', 'ORDER:5O190127TN364715T:APPROVED']);
    expect(h.transport.captureOrder).not.toHaveBeenCalled();
  });
  it.each([
    ['expired', { quote_expires_at: '2026-11-13T23:59:59.123456Z' }], ['deleted', { actor_deleted: true }],
    ['review', { review_required: true }], ['intent', { submission_intent_recorded: true, payment_state: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT }],
  ])('does not CREATE for %s unlinked order', async (_name, patch) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null, ...patch } }] });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result.kind).not.toBe('PROVIDER_ORDER_READY'); expectNoProvider(h);
    expect(rpcCalls(h, RPC.prepare)).toHaveLength(0);
  });
  it('does not create after prepare business closure', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }],
      [RPC.prepare]: [{ status: 400, data: { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED' } }] });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result.kind).not.toBe('PROVIDER_ORDER_READY'); expectNoProvider(h); expect(rpcCalls(h, RPC.prepare)).toHaveLength(1);
  });
  it.each([
    ['binding-hash', 'BINDING'], ['client-id', 'CREDENTIAL'], ['closed-resolver', 'CREDENTIAL'], ['token', 'TOKEN'],
  ])('never creates when %s cannot be verified', async (boundary, stage) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    if (boundary === 'binding-hash') h.bindings.getProviderBinding.mockResolvedValue({ ...BINDING, bindingHash: 'bad-hash' });
    if (boundary === 'client-id') h.credentials.resolve.mockResolvedValue({ clientId: 'wrong-client', clientSecret: 'Q7pPriv' });
    if (boundary === 'closed-resolver') h.credentials.resolve.mockResolvedValue(null);
    if (boundary === 'token') h.transport.requestToken.mockResolvedValue(null);
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(h.transport.getOrder).not.toHaveBeenCalled();
    if (stage === 'BINDING') expect(h.credentials.resolve).not.toHaveBeenCalled();
    if (stage !== 'TOKEN') expect(h.transport.requestToken).not.toHaveBeenCalled();
  });
  it('rechecks quote expiry after OAuth and sends no CREATE after the deadline', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    let clock = NOW; h.deps.nowMs = () => clock;
    h.transport.requestToken.mockImplementation(async () => { clock = Date.parse('2026-11-14T00:15:01Z'); return { accessToken: 'Q7pPriv-token' }; });
    expect((await ensurePayPalProviderOrder(h.deps, input)).kind).not.toBe('PROVIDER_ORDER_READY');
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
  });
  it.each([
    ['order_id', '99999999-9999-4999-8999-999999999999'], ['quote_id', CONTEXT], ['context_id', QUOTE],
    ['quote_hash', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'], ['environment', 'LIVE'],
  ])('refuses inconsistent prepare %s before binding or OAuth', async (field, value) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }],
      [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, [field]: value } }] });
    expect((await ensurePayPalProviderOrder(h.deps, input)).kind).not.toBe('PROVIDER_ORDER_READY');
    expectNoProvider(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
  });
  it('does not blind-bind a CREATE response naming a different merchant', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    const body = providerOrder('CREATED'); body.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
    h.transport.createOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toMatchObject({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(1);
    const observations = rpcCalls(h, RPC.observe); expect(observations).toHaveLength(1);
    expect(observations[0].args).toMatchObject({ p_evidence: { status: 'CREATED', amount_minor: '999', currency: 'USD',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' } } });
  });
});

describe('binding and credential boundary stays closed', () => {
  it('uses a resolver that returns null by default', async () => {
    expect(await closedPayPalCredentialResolver.resolve({ provider: 'PAYPAL', environment: 'SANDBOX',
      credentialRef: 'Q7pPrivCredential', bindingVersion: '1', bindingHash: BINDING.bindingHash })).toBeNull();
    const h = boundaries(); h.deps.credentials = closedPayPalCredentialResolver as any;
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'UNAVAILABLE', stage: 'CREDENTIAL' });
    expect(h.transport.requestToken).not.toHaveBeenCalled(); expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
  it.each([
    ['orderId', '99999999-9999-4999-8999-999999999999'], ['contextId', QUOTE], ['provider', 'PORTONE'],
    ['environment', 'LIVE'], ['bindingVersion', 1], ['bindingHash', 'not-a-hash'], ['credentialRef', 'https://evil.invalid'],
    ['billingCountry', 'us'], ['expectedPayPalClientId', ''],
    ['scope', { account_id: 'ACCOUNTA1', merchant_id: '' }],
  ])('refuses malformed or mismatched injected binding %s before resolver/token', async (field, value) => {
    const h = boundaries(); h.bindings.getProviderBinding.mockResolvedValue({ ...BINDING, [field]: value });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind: 'UNAVAILABLE', stage: 'BINDING' });
    expect(h.credentials.resolve).not.toHaveBeenCalled(); expect(h.transport.requestToken).not.toHaveBeenCalled();
    expect(h.transport.getOrder).not.toHaveBeenCalled(); expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
  it.each(['NOT_FOUND', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED'])
    ('refuses unavailable binding %s before credentials', async kind => {
      const h = boundaries(); h.bindings.getProviderBinding.mockResolvedValue({ kind });
      expect((await capturePayPalOrder(h.deps, approvedInput)).kind).not.toBe('INTAKE_PENDING');
      expect(h.credentials.resolve).not.toHaveBeenCalled(); expect(h.transport.requestToken).not.toHaveBeenCalled(); expectNoSubmission(h);
    });
  it('compares prepare scope to the injected binding before resolver for CREATE', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.bindings.getProviderBinding.mockResolvedValue({ ...BINDING, scope: { account_id: 'ACCOUNTB2', merchant_id: 'MERCHANTA1' } });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toMatchObject({ kind: 'UNAVAILABLE', stage: 'BINDING' });
    expect(h.credentials.resolve).not.toHaveBeenCalled(); expect(h.transport.requestToken).not.toHaveBeenCalled(); expectNoSubmission(h);
  });
  it.each([null, { clientId: 'wrong-client', clientSecret: 'Q7pPriv' }, { clientId: 'synthetic-client', clientSecret: '' }])
    ('refuses missing or wrong client credential %# before OAuth', async credential => {
      const h = boundaries(); h.credentials.resolve.mockResolvedValue(credential);
      expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind: 'UNAVAILABLE', stage: 'CREDENTIAL' });
      expect(h.transport.requestToken).not.toHaveBeenCalled(); expect(h.transport.getOrder).not.toHaveBeenCalled();
      expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    });
  it('closes null token without provider GET or claim', async () => {
    const h = boundaries(); h.transport.requestToken.mockResolvedValue(null);
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'UNAVAILABLE', stage: 'TOKEN' });
    expect(h.transport.getOrder).not.toHaveBeenCalled(); expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
});

describe('PayPal CAPTURE verifies original ORDER before durable authority', () => {
  it('rejects another ORDER callback for the same actor before GET, credentials or any mutation', async () => {
    const h = boundaries();
    expect((await capturePayPalOrder(h.deps, { ...input, approvedProviderOrderId: '9ANOTHERORDER' })).kind).not.toBe('INTAKE_PENDING');
    expectNoProvider(h); expect(h.calls).toEqual([{ name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } }]);
  });
  it.each([
    { actorUserId: 'invalid', orderId: ORDER, approvedProviderOrderId: PROVIDER_ORDER },
    { actorUserId: ACTOR, orderId: '../bad', approvedProviderOrderId: PROVIDER_ORDER },
  ])('rejects invalid internal actor/order %# before even owner RPC', async invalid => {
    const h = boundaries();
    expect((await capturePayPalOrder(h.deps, invalid)).kind).not.toBe('INTAKE_PENDING');
    expect(h.calls).toHaveLength(0); expectNoProvider(h);
  });
  it.each([{ review_required: true }, { actor_deleted: true }, { quote_expires_at: '2020-01-01T00:00:00.123456Z' }])
    ('refuses a new capture from locally ineligible context %# before resolver', async patch => {
      const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, ...patch } }] });
      expect((await capturePayPalOrder(h.deps, approvedInput)).kind).not.toBe('INTAKE_PENDING');
      expectNoProvider(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    });
  it('runs GET → claim → committed intent → one POST → actual CAPTURE bind → intake', async () => {
    const h = boundaries();
    const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.bind, RPC.receive]);
    expect(rpcCalls(h, RPC.claim)).toEqual([{ name: RPC.claim, args: { p_actor_user_id: ACTOR, p_order_id: ORDER, p_expected_version: '1', p_action: 'CAPTURE' } }]);
    expect(rpcCalls(h, RPC.intent)).toEqual([{ name: RPC.intent, args: { p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_expected_version: '2', p_action: 'CAPTURE', p_attempt_id: ATTEMPT, p_lease_token: LEASE, p_fencing_version: '1' } }]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.captureOrder).toHaveBeenCalledWith(expect.objectContaining({ environment: 'SANDBOX',
      accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }));
    expect(h.transport.captureOrder.mock.calls[0][0].requestKey).not.toBe(CREATE_KEY);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: { source: 'SUBMIT_RESPONSE',
      identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, status: 'COMPLETED',
      key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '999', currency: 'USD' } });
    expect(rpcCalls(h, RPC.receive)).toEqual([{ name: RPC.receive, args: { p_order_id: ORDER, p_observation_id: OBSERVATION } }]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).not.toHaveBeenCalled();
  });
  it.each([
    ['CREATED', 'NOT_APPROVED'], ['SAVED', 'NOT_APPROVED'], ['PAYER_ACTION_REQUIRED', 'NOT_APPROVED'],
    ['VOIDED', 'ORDER_VOIDED'], ['COMPLETED', 'SUBMISSION_UNKNOWN'], ['FUTURE_STATUS', 'REVIEW_REQUIRED'],
  ])('never claims or submits original ORDER %s without an actual completed capture', async (status, kind) => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: providerOrder(status) });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expectNoSubmission(h); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  });
  it.each([' APPROVED', 'APPROVED ', 'A'.repeat(201), 'Q7pPriv\n'])
    ('does not record an unbounded or malformed provider status %#', async status => {
      const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: providerOrder(status) });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome.kind).not.toBe('INTAKE_PENDING'); expectNoSubmission(h);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    });
  it('recovers a completed capture found before claim with no new submission', async () => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.transport.captureOrder).not.toHaveBeenCalled();
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', external_id: '3C679366HH908993F' } });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(1);
  });
  it.each([
    ['amount', (b: any) => { b.purchase_units[0].amount.value = '10.00'; }],
    ['scale3', (b: any) => { b.purchase_units[0].amount.value = '9.990'; }],
    ['scale1', (b: any) => { b.purchase_units[0].amount.value = '9.9'; }],
    ['number', (b: any) => { b.purchase_units[0].amount.value = 9.99; }],
    ['leading-zero', (b: any) => { b.purchase_units[0].amount.value = '09.99'; }],
    ['merchant', (b: any) => { b.purchase_units[0].payee.merchant_id = 'MERCHANTB2'; }],
    ['currency', (b: any) => { b.purchase_units[0].amount.currency_code = 'KRW'; }],
    ['custom-id', (b: any) => { b.purchase_units[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999'; }],
    ['country', (b: any) => { b.payment_source.paypal.address.country_code = 'KR'; }],
    ['country-path-conflict', (b: any) => { b.payer = { address: { country_code: 'KR' } }; }],
    ['shape', (b: any) => { b.purchase_units = []; }],
  ])('refuses original %s mismatch before claim/intent/capture', async (_label, mutate) => {
    const h = boundaries(); const body = providerOrder(); mutate(body);
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
  });
  it('country conflict stays local REVIEW without falsifying evidence to manufacture sticky DB review', async () => {
    const h = boundaries(); const body = providerOrder(); body.payment_source.paypal.address.country_code = 'KR';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  });
  it.each([
    { kind: 'TRANSPORT_UNKNOWN' }, { kind: 'RESPONSE', status: 404, body: null },
    { kind: 'RESPONSE', status: 500, body: { message: 'Q7pPriv' } }, { kind: 'RESPONSE', status: 200, body: null },
  ])('closes uncertain original lookup %# before mutation authority', async response => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue(response);
    expect((await capturePayPalOrder(h.deps, approvedInput)).kind).not.toBe('INTAKE_PENDING');
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expectNoSubmission(h); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  });
});

describe('lease, intent, version and deadline gates', () => {
  it('returns IN_PROGRESS for an active lease without an intent or POST', async () => {
    const h = boundaries({ [RPC.claim]: [{ data: { decision: 'BLOCKED', safe_reason_code: 'LEASE_ACTIVE' } }] });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'IN_PROGRESS' }); expectNoSubmission(h);
  });
  it('refuses a claimed lease bound to another quote before intent', async () => {
    const h = boundaries({ [RPC.claim]: [{ data: { ...NATIVE_CLAIMED,
      quote_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' } }] });
    expect((await capturePayPalOrder(h.deps, approvedInput)).kind).not.toBe('INTAKE_PENDING'); expectNoSubmission(h);
  });
  it.each(['LEASE_ACTIVE', 'ACTOR_DELETED', 'REVIEW_REQUIRED', 'VERIFICATION_BINDING_CHANGED', 'PROVIDER_SCOPE_CHANGED',
    'CHARGE_CLOSED', 'QUOTE_EXPIRED', 'PRODUCT_UNAVAILABLE', 'CONTEXT_REQUIRED'])
    ('does not record intent or POST after native claim %s', async reason => {
      const h = boundaries({ [RPC.claim]: [{ data: { decision: 'BLOCKED', safe_reason_code: reason } }] });
      expect((await capturePayPalOrder(h.deps, approvedInput)).kind).not.toBe('INTAKE_PENDING');
      expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.getter)).toHaveLength(1);
    });
  it('retries a known VERSION_MISMATCH once using the fresh getter version', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '7' } }],
      [RPC.claim]: [{ data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '7' } },
        { data: { ...NATIVE_CLAIMED, row_version: '8' } }],
      [RPC.intent]: [{ data: { ...NATIVE_INTENT, row_version: '9' } }] });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(rpcCalls(h, RPC.claim).map(call => call.args.p_expected_version)).toEqual(['1', '7']);
    expect(rpcCalls(h, RPC.getter)).toHaveLength(2); expect(rpcCalls(h, RPC.intent)[0].args.p_expected_version).toBe('8');
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
  });
  it('never makes a third claim when the one permitted version retry is stale again', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '7' } }],
      [RPC.claim]: [{ data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '7' } },
        { data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '9' } }] });
    await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(2); expect(rpcCalls(h, RPC.getter)).toHaveLength(2); expectNoSubmission(h);
  });
  it.each([
    { review_required: true }, { actor_deleted: true }, { provider_order_id: '9ANOTHERORDER' },
    { submission_intent_recorded: true, payment_state: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT },
  ])('does not reclaim when refreshed owner context loses authority %#', async patch => {
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '7', ...patch } }],
      [RPC.claim]: [{ data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '7' } }] });
    await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expectNoSubmission(h);
  });
  it('does not turn native LOOKUP_ONLY into intent or a second POST', async () => {
    const h = boundaries({ [RPC.claim]: [{ data: { decision: 'LOOKUP_ONLY', safe_reason_code: 'SUBMISSION_UNKNOWN',
      attempt_id: ATTEMPT, provider_request_key: ATTEMPT, fencing_version: '1', row_version: '3', quote_hash: HASH } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: providerOrder() });
    const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result.kind).not.toBe('INTAKE_PENDING'); expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
  });
  it('does not record intent when the claimed lease has less than ten seconds remaining', async () => {
    const h = boundaries({ [RPC.claim]: [{ data: { ...NATIVE_CLAIMED, submit_not_after: '2026-11-14T00:00:10.122456+00:00' } }] });
    await capturePayPalOrder(h.deps, approvedInput); expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
  });
  it.each(['LEASE_EXPIRED', 'LEASE_MISMATCH', 'CHARGE_CLOSED', 'REVIEW_REQUIRED'])
    ('never POSTs after intent refusal %s', async reason => {
      const h = boundaries({ [RPC.intent]: [{ data: { decision: 'BLOCKED', safe_reason_code: reason } }] });
      await capturePayPalOrder(h.deps, approvedInput);
      expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.transport.captureOrder).not.toHaveBeenCalled();
      expect(h.transport.createOrder).not.toHaveBeenCalled(); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    });
  it('treats intent response loss as unknown and never transmits', async () => {
    const h = boundaries({ [RPC.intent]: [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv' } }] });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.transport.captureOrder).not.toHaveBeenCalled(); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it.each([
    ['attempt_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['provider_request_key', CREATE_KEY], ['fencing_version', '2'],
    ['quote_hash', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'],
    ['row_version', '2'], ['row_version', '1'],
  ])('rejects intent %s that no longer matches claimed authority', async (field, value) => {
    const h = boundaries({ [RPC.intent]: [{ data: { ...NATIVE_INTENT, [field]: value } }] });
    const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result.kind).not.toBe('INTAKE_PENDING'); expect(h.transport.captureOrder).not.toHaveBeenCalled();
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
  });
  it.each(['2026-11-14T00:00:58.124Z', '2026-11-14T00:01:00.124Z'])
    ('honors deadline minus two seconds after intent returns at %s', async afterIntent => {
      const gate = deferred<{ data: unknown }>();
      const h = boundaries({ [RPC.intent]: [gate.promise] });
      let clock = NOW; h.deps.nowMs = () => clock;
      const pending = capturePayPalOrder(h.deps, approvedInput);
      // The RPC boundary, not a timer or SQL emulator, controls response delivery.
      const seen = deferred<void>();
      const originalFetch = h.rpcFetch.getMockImplementation()!;
      h.rpcFetch.mockImplementation(async (...args) => { const result = originalFetch(...args);
        if (String(args[0]).endsWith(`/${RPC.intent}`)) seen.resolve(); return result; });
      await seen.promise; clock = Date.parse(afterIntent); gate.resolve({ data: NATIVE_INTENT });
      expect(await pending).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
      expect(h.transport.captureOrder).not.toHaveBeenCalled(); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    });
});

describe('capture outcome and response-loss recovery', () => {
  it.each([
    ['PENDING', 'CAPTURE_PENDING'], ['DECLINED', 'CAPTURE_FAILED'], ['FAILED', 'CAPTURE_FAILED'],
    ['PARTIALLY_REFUNDED', 'REVIEW_REQUIRED'], ['REFUNDED', 'REVIEW_REQUIRED'], ['FUTURE_CAPTURE', 'REVIEW_REQUIRED'],
  ])('does not intake capture %s even when ORDER is COMPLETED', async (status, kind) => {
    const h = boundaries(); h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: capturedOrder(status) });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
  });
  it('does not intake when capture amount differs from the fixed quote', async () => {
    const h = boundaries(); const body: any = capturedOrder(); body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
  });
  it('stops intake after a durable observation REVIEW result', async () => {
    const h = boundaries({ [RPC.bind]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_ID_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
  });
  it.each([
    { kind: 'TRANSPORT_UNKNOWN' }, { kind: 'RESPONSE', status: 500, body: null },
    { kind: 'RESPONSE', status: 201, body: null }, { kind: 'RESPONSE', status: 422, body: { name: 'Q7pPriv' } },
  ])('makes only one recovery GET after ambiguous mutation %#', async response => {
    const h = boundaries(); h.transport.captureOrder.mockResolvedValue(response);
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', external_id: '3C679366HH908993F' } });
  });
  it.each([
    { kind: 'TRANSPORT_UNKNOWN' }, { kind: 'RESPONSE', status: 404, body: null },
    { kind: 'RESPONSE', status: 200, body: providerOrder() }, { kind: 'RESPONSE', status: 200, body: providerOrder('COMPLETED') },
  ])('keeps unknown after inconclusive recovery %# without a second POST or new-order suggestion', async response => {
    const h = boundaries(); h.transport.captureOrder.mockResolvedValue({ kind: 'TRANSPORT_UNKNOWN' });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() }).mockResolvedValueOnce(response);
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'SUBMISSION_UNKNOWN', newOrderAllowed: false });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it('preserves intake failure after confirmed capture and never retries POST', async () => {
    const h = boundaries({ [RPC.receive]: [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv' } }] });
    const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'INTAKE' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, result).newOrderAllowed).toBe(false);
  });
});

describe('RECONCILE observes and STATUS reads without any charge command', () => {
  it('does no external work when a provider ORDER link is absent', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'NO_PROVIDER_ORDER' });
    expectNoProvider(h); expect(h.calls).toHaveLength(1);
  });
  it.each([
    ['COMPLETED', 'INTAKE_PENDING'], ['PENDING', 'CAPTURE_PENDING'], ['DECLINED', 'CAPTURE_FAILED'],
    ['FAILED', 'CAPTURE_FAILED'], ['REFUNDED', 'REVIEW_REQUIRED'], ['PARTIALLY_REFUNDED', 'REVIEW_REQUIRED'],
  ])('reconciles actual capture %s without claim, intent, create or capture POST', async (status, kind) => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder(status) });
    expect(await reconcilePayPalOrder(h.deps, input)).toMatchObject({ kind });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.transport.createOrder).not.toHaveBeenCalled(); expect(h.transport.captureOrder).not.toHaveBeenCalled();
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(status === 'COMPLETED' ? 1 : 0);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', status, external_id: '3C679366HH908993F' } });
  });
  it('recovers existing intent after actor deletion and quote expiry without fresh mutation authority', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, actor_deleted: true, payment_state: 'SUBMISSION_UNKNOWN',
      submission_intent_recorded: true, attempt_id: ATTEMPT, quote_expires_at: '2020-01-01T00:00:00.123456Z' } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.transport.captureOrder).not.toHaveBeenCalled(); expect(rpcCalls(h, RPC.prepare)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(1);
  });
  it('keeps duplicate intake as replay with the same order and capture identity', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, payment_state: 'SUBMISSION_UNKNOWN',
      settlement_state: 'INTAKE_PENDING', provider_capture_id: '3C679366HH908993F' } }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }],
      [RPC.bind]: [{ data: NATIVE_RECORDED }, { data: { ...NATIVE_RECORDED, replayed: true } }],
      [RPC.receive]: [{ data: NATIVE_INTAKE }, { data: { ...NATIVE_INTAKE, replayed: true } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'INTAKE_PENDING', replayed: true });
    expect(rpcCalls(h, RPC.receive).map(call => call.args)).toEqual([
      { p_order_id: ORDER, p_observation_id: OBSERVATION }, { p_order_id: ORDER, p_observation_id: OBSERVATION },
    ]);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(h.transport.captureOrder).not.toHaveBeenCalled();
  });
  it.each([
    { payment_state: 'NOT_SUBMITTED', settlement_state: 'NOT_INTAKE', submission_intent_recorded: false },
    { payment_state: 'SUBMISSION_UNKNOWN', settlement_state: 'NOT_INTAKE', submission_intent_recorded: true },
    { payment_state: 'SUBMISSION_UNKNOWN', settlement_state: 'INTAKE_PENDING', submission_intent_recorded: true },
    { payment_state: 'SUBMISSION_UNKNOWN', settlement_state: 'GRANTED', submission_intent_recorded: true },
    { payment_state: 'SUBMISSION_UNKNOWN', settlement_state: 'INTAKE_PENDING', submission_intent_recorded: true, review_required: true },
  ])('STATUS calls only owner getter and never reports inferred paid/credited %#', async patch => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, ...patch } }] });
    const outcome = await getPayPalChargeStatus(h.deps, input);
    expect(outcome).toEqual({ kind: 'STATUS', paymentState: patch.payment_state, settlementState: patch.settlement_state,
      reviewRequired: patch.review_required ?? false });
    expect(h.calls).toEqual([{ name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } }]);
    expectNoProvider(h); expect(JSON.stringify(outcome)).not.toMatch(/"(?:paid|credited)":true|"(?:PAID|CREDITED)"/);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'STATUS', paymentState: patch.payment_state, settlementState: patch.settlement_state,
      reviewRequired: patch.review_required ?? false, newOrderAllowed: false });
  });
});

describe('scripted authority concurrency, without claiming actual DB locking', () => {
  it('two simultaneous approved callers produce at most one POST under scripted LEASE_ACTIVE authority', async () => {
    const bothLookup = deferred<void>(); let lookups = 0;
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: NATIVE_FOUND }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }],
      [RPC.claim]: [{ data: NATIVE_CLAIMED }, { data: { decision: 'BLOCKED', safe_reason_code: 'LEASE_ACTIVE' } }] });
    h.transport.getOrder.mockImplementation(async () => { lookups++; if (lookups === 2) bothLookup.resolve();
      await bothLookup.promise; return { kind: 'RESPONSE', status: 200, body: providerOrder() }; });
    const outcomes = await Promise.all([capturePayPalOrder(h.deps, approvedInput), capturePayPalOrder(h.deps, approvedInput)]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(2);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.kind === 'INTAKE_PENDING')).toHaveLength(1);
  });
  it('expired holder A cannot POST after delayed stale intent while holder B submits once', async () => {
    const staleIntent = deferred<{ data: unknown }>(); const intentEntered = deferred<void>();
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '2' } }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }],
      [RPC.claim]: [{ data: NATIVE_CLAIMED }, { data: { ...NATIVE_CLAIMED, row_version: '3', fencing_version: '2',
        lease_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', submit_not_after: '2026-11-14T00:02:00.123456+00:00' } }],
      [RPC.intent]: [staleIntent.promise, { data: { ...NATIVE_INTENT, row_version: '4', fencing_version: '2',
        lease_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', submit_not_after: '2026-11-14T00:02:00.123456+00:00' } }] });
    const originalFetch = h.rpcFetch.getMockImplementation()!;
    h.rpcFetch.mockImplementation(async (...args) => { const result = originalFetch(...args);
      if (String(args[0]).endsWith(`/${RPC.intent}`)) intentEntered.resolve(); return result; });
    let clock = NOW; h.deps.nowMs = () => clock;
    const a = capturePayPalOrder(h.deps, approvedInput); await intentEntered.promise;
    clock = Date.parse('2026-11-14T00:01:01.123Z');
    const b = await capturePayPalOrder(h.deps, approvedInput);
    // The stale command was evaluated after B's unused claim (version 3), before B's intent.
    // Its delayed response arrives here; native version refusal precedes lease comparison.
    staleIntent.resolve({ data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '3' } });
    const aOutcome = await a;
    expect(b).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(aOutcome).toEqual({ kind: 'BLOCKED', reason: 'VERSION_MISMATCH' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.intent).map(call => call.args.p_fencing_version)).toEqual(['1', '2']);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(1);
  });
});

describe('safe outcomes, logs and browser projection', () => {
  it.each([
    { kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true },
    { kind: 'SUBMISSION_UNKNOWN' }, { kind: 'REVIEW_REQUIRED' }, { kind: 'INTAKE_PENDING', replayed: true },
    { kind: 'CAPTURE_PENDING' }, { kind: 'CAPTURE_FAILED' }, { kind: 'UNAVAILABLE', stage: 'TOKEN' },
    { kind: 'BLOCKED', reason: 'CHARGE_CLOSED' }, { kind: 'NOT_FOUND' },
  ])('browser DTO allows provider ORDER only for READY and never exposes internals %#', outcome => {
    const dto = toPayPalChargeBrowserDto(ORDER, { ...outcome, providerOrderId: PROVIDER_ORDER, accessToken: 'Q7pPriv-token', clientSecret: 'Q7pPriv-secret',
      credentialRef: 'Q7pPrivCredential', leaseToken: LEASE, providerRequestKey: ATTEMPT, rawBody: 'Q7pPriv',
      inboxId: '99999999-9999-4999-8999-999999999999', receiptId: '9007199254740993', captureId: '3C679366HH908993F',
      scope: { account_id: 'ACCOUNTA1' } } as any);
    expect(dto).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER, state: outcome.kind, newOrderAllowed: false,
      ...(outcome.kind === 'PROVIDER_ORDER_READY' ? { providerOrderId: PROVIDER_ORDER } : {}) });
    expect(JSON.stringify(dto)).not.toMatch(/Q7pPriv|ACCOUNTA1|3C679366HH908993F|9007199254740993|55555555/);
  });
  it.each(['binding', 'credential', 'token', 'lookup', 'submit'])('sanitizes thrown %s boundary errors in logs and outcomes', async boundary => {
    const h = boundaries(); const failure = new Error('Q7pPriv token secret email=Q7pPriv@example.invalid');
    if (boundary === 'binding') h.bindings.getProviderBinding.mockRejectedValue(failure);
    if (boundary === 'credential') h.credentials.resolve.mockRejectedValue(failure);
    if (boundary === 'token') h.transport.requestToken.mockRejectedValue(failure);
    if (boundary === 'lookup') h.transport.getOrder.mockRejectedValue(failure);
    if (boundary === 'submit') {
      h.transport.captureOrder.mockRejectedValue(failure);
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'TRANSPORT_UNKNOWN' });
    }
    const result = await capturePayPalOrder(h.deps, approvedInput);
    const serialized = JSON.stringify({ result, logs: h.log.mock.calls, browser: toPayPalChargeBrowserDto(ORDER, result) });
    expect(serialized).not.toMatch(/Q7pPriv|email|clientSecret|credentialRef|leaseToken|rawBody/);
    expect(h.transport.captureOrder.mock.calls.length).toBeLessThanOrEqual(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    for (const [entry] of h.log.mock.calls) {
      expect(Object.keys(entry).every(key => ['stage', 'level', 'code', 'orderId', 'httpStatus'].includes(key))).toBe(true);
    }
  });
  it('successful capture outcome and logs contain no credential, private evidence or lease', async () => {
    const h = boundaries(); const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|ACCOUNTA1|MERCHANTA1|3C679366HH908993F|55555555|44444444|quoteHash/);
  });
});

// Each regression below calls the existing public orchestrator and real repository.
// Only external provider, binding, credentials, clock and RPC delivery are scripted.
describe('H1 minimal post-capture representations recover through one actual lookup', () => {
  it.each([
    ['official-200', 200, OFFICIAL_CAPTURE_200], ['official-201', 201, OFFICIAL_CAPTURE_201],
    ['synthetic-202-minimal-shape', 202, OFFICIAL_CAPTURE_201],
  ])('recovers %s without manufacturing merchant, reference or amount', async (_label, status, body) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, amount_minor: '10000' } }] });
    const approved = providerOrder(); approved.purchase_units[0].amount.value = '100.00';
    const lookedUp = capturedOrder(); lookedUp.purchase_units[0].amount.value = '100.00';
    lookedUp.purchase_units[0].payments.captures[0].amount = { currency_code: 'USD', value: '100.00' };
    lookedUp.purchase_units[0].payments.captures[0].id = '3C679366HH908993F';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: approved })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookedUp });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.bind, RPC.receive]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      amount_minor: '10000', currency: 'USD', status: 'COMPLETED', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(rpcCalls(h, RPC.receive)).toEqual([{ name: RPC.receive, args: { p_order_id: ORDER, p_observation_id: OBSERVATION } }]);
  });

  describe.each([200, 201, 202])('individual missing post-response fields with HTTP %s', httpStatus => {
    it.each([
      ['id', (b: any) => { delete b.id; }], ['status', (b: any) => { delete b.status; }],
      ['intent', (b: any) => { delete b.intent; }], ['units', (b: any) => { delete b.purchase_units; }],
      ['reference', (b: any) => { delete b.purchase_units[0].custom_id; }],
      ['amount', (b: any) => { delete b.purchase_units[0].amount; }],
      ['currency', (b: any) => { delete b.purchase_units[0].amount.currency_code; }],
      ['merchant', (b: any) => { delete b.purchase_units[0].payee.merchant_id; }],
      ['capture-id', (b: any) => { delete b.purchase_units[0].payments.captures[0].id; }],
      ['capture-status', (b: any) => { delete b.purchase_units[0].payments.captures[0].status; }],
      ['capture-amount', (b: any) => { delete b.purchase_units[0].payments.captures[0].amount; }],
    ])('uses LOOKUP evidence after missing %s, never expected-data repair', async (_field, remove) => {
      const h = boundaries(); const body = capturedOrder(); remove(body);
      // No attributable POST ID exists when the parent, unit, or capture ID is absent.
      const lookupId = ['id', 'units', 'capture-id'].includes(_field) ? '9LOOKUPCAP' : '3C679366HH908993F';
      const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = lookupId;
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: httpStatus, body });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
      expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: lookupId, parent_external_id: PROVIDER_ORDER,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      } });
      expect(rpcCalls(h, RPC.receive)).toEqual([{ name: RPC.receive, args: { p_order_id: ORDER, p_observation_id: OBSERVATION } }]);
      expect(h.trail.indexOf('capture')).toBeLessThan(h.trail.lastIndexOf('get'));
      expect(h.trail.lastIndexOf('get')).toBeLessThan(h.trail.indexOf(RPC.bind));
    });
  });

  it.each(['transport', 'incomplete', 'merchant-conflict', 'no-capture'])
    ('keeps an incomplete POST closed after %s recovery without another POST', async mode => {
      const h = boundaries(); const post: any = capturedOrder(); delete post.intent;
      const recovery: any = mode === 'no-capture' ? providerOrder('COMPLETED') : capturedOrder();
      if (mode === 'incomplete') delete recovery.purchase_units[0].payee.merchant_id;
      if (mode === 'merchant-conflict') recovery.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
        .mockResolvedValueOnce(mode === 'transport' ? { kind: 'TRANSPORT_UNKNOWN' } : { kind: 'RESPONSE', status: 200, body: recovery });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: mode === 'incomplete' || mode === 'merchant-conflict' ? 'REVIEW_REQUIRED' : 'SUBMISSION_UNKNOWN' });
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
      expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
      expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
      if (mode === 'transport' || mode === 'incomplete' || mode === 'no-capture') expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      if (mode === 'merchant-conflict') {
        const recorded = rpcCalls(h, RPC.observe); expect(recorded.length).toBeGreaterThan(0);
        for (const { args } of recorded) expect(args).toMatchObject({ p_evidence: {
          source: 'LOOKUP', status: 'COMPLETED', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' },
        } });
      }
    });

  it.each([
    ['id', (b: any) => { b.id = '9OTHERORDER'; }],
    ['amount', (b: any) => { b.purchase_units[0].amount.value = '10.00'; }],
    ['merchant', (b: any) => { b.purchase_units[0].payee.merchant_id = 'MERCHANTB2'; }],
    ['reference', (b: any) => { b.purchase_units[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999'; }],
    ['capture-amount', (b: any) => { b.purchase_units[0].payments.captures[0].amount.value = '10.00'; }],
  ])('does not use a corrective GET to overwrite a real post-response %s conflict', async (_field, mutate) => {
    const h = boundaries(); const body = capturedOrder(); mutate(body);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    const observed = rpcCalls(h, RPC.observe); expect(observed).toHaveLength(1);
    expect(observed[0].args).toMatchObject({ p_evidence: { source: 'SUBMIT_RESPONSE', status: 'COMPLETED' } });
    const e = observed[0].args.p_evidence as any;
    if (_field === 'id') expect(e.external_id).toBe('9OTHERORDER');
    if (_field === 'amount' || _field === 'capture-amount') expect(e.amount_minor).toBe('1000');
    if (_field === 'merchant') expect(e.scope).toEqual({ account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' });
    if (_field === 'reference') expect(e.order_reference).toBe('v2:99999999-9999-4999-8999-999999999999');
  });
});

describe('M2 post-intent conflicts preserve actual attributable capture evidence without intake', () => {
  it.each(['country', 'multiple', 'malformed-first', 'malformed-second'])
    ('binds the valid actual capture and preserves %s conflict without synthetic evidence', async mode => {
      const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND',
        trust: 'SERVER_REPORTED', observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } }] });
      const body: any = capturedOrder();
      const second = { id: '9SECOND', status: 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' };
      if (mode === 'country') body.payment_source.paypal.address.country_code = 'KR';
      if (mode === 'multiple') body.purchase_units[0].payments.captures.push(second);
      if (mode === 'malformed-first') body.purchase_units[0].payments.captures.unshift({ id: '../bad' });
      if (mode === 'malformed-second') body.purchase_units[0].payments.captures.push({ id: '../bad' });
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
      expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
      expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      const bound = rpcCalls(h, RPC.bind); expect(bound).toHaveLength(1);
      const expectedEvidence = { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        key: 'CAPTURE:3C679366HH908993F:COMPLETED' };
      expect(bound[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: expectedEvidence });
      expect((bound[0].args.p_evidence as any).payload_hash).toMatch(/^[0-9a-f]{64}$/);
      const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(mode === 'multiple' ? 1 : 0);
      if (mode === 'multiple') {
        expect(recorded[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: { ...expectedEvidence,
          external_id: '9SECOND', status: 'PENDING', key: 'CAPTURE:9SECOND:PENDING' } });
        expect(h.trail.slice(-2)).toEqual([RPC.bind, RPC.observe]);
      }
      // A real second ID can yield sticky identity REVIEW. Country is only local REVIEW.
      // No status, scope, amount, or order reference is altered to force DB REVIEW.
      expect(JSON.stringify([...bound, ...recorded])).not.toMatch(/COUNTRY_MISMATCH|Q7pPriv|\.\.\/bad|update_time|links/);
    });

  it.each(['invalid-id', 'invalid-status', 'invalid-amount', 'missing-reference', 'missing-merchant', 'foreign-parent'])
    ('refuses %s without inventing attributable CAPTURE evidence', async mode => {
      const h = boundaries(); const body: any = capturedOrder();
      if (mode !== 'missing-reference' && mode !== 'missing-merchant') body.payment_source.paypal.address.country_code = 'KR';
      if (mode === 'invalid-id') body.purchase_units[0].payments.captures[0].id = '../bad';
      if (mode === 'invalid-status') body.purchase_units[0].payments.captures[0].status = 'bad status';
      if (mode === 'invalid-amount') body.purchase_units[0].payments.captures[0].amount.value = '9.990';
      if (mode === 'missing-reference') delete body.purchase_units[0].custom_id;
      if (mode === 'missing-merchant') delete body.purchase_units[0].payee.merchant_id;
      if (mode === 'foreign-parent') body.id = '9OTHERORDER';
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
      // A missing binding field may trigger one strict recovery lookup; it must not authorize receipt.
      if (mode === 'missing-reference' || mode === 'missing-merchant') {
        h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
          .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body });
      }
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(mode === 'missing-reference' || mode === 'missing-merchant' ? 2 : 1);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      const captureEvidence = rpcCalls(h, RPC.observe).filter(call => (call.args.p_evidence as any).identity_kind === 'CAPTURE');
      expect(captureEvidence).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    });
});

describe.each(['capture', 'reconcile'] as const)('M3 immutable scope replay before %s credentials', operation => {
  it.each([
    ['account', { ...BINDING, scope: { account_id: 'ACCOUNTB2', merchant_id: 'MERCHANTA1' } }],
    ['merchant', { ...BINDING, scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' } }],
    ['context', { ...BINDING, contextId: QUOTE }],
  ])('rejects independent binding %s conflict before resolver/token/GET/claim', async (_field, binding) => {
    const h = boundaries(); h.bindings.getProviderBinding.mockResolvedValue(binding);
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput) : await reconcilePayPalOrder(h.deps, input);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'BINDING' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding']);
    expect(rpcCalls(h, RPC.prepare)).toEqual([{ name: RPC.prepare, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } }]);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(0); expectNoSubmission(h);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  });
  it.each([
    ['not-replayed', { replayed: false }], ['context', { context_id: QUOTE }], ['order', { order_id: CONTEXT }],
    ['quote', { quote_id: CONTEXT }], ['hash', { quote_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }],
    ['environment', { environment: 'LIVE' }], ['payment', { payment_id: `web_${CONTEXT}` }],
    ['provider', { provider: 'PORTONE', environment: 'TEST', payment_id: `web_${CONTEXT}`,
      scope: { merchant_id: 'MERCHANTA1', store_id: 'STORE1', channel_id: 'CHANNEL1', channel_type: 'TEST' } }],
  ])('rejects invalid immutable replay %s before binding and provider effects', async (_field, patch) => {
    const h = boundaries({ [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, ...patch } }] });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput) : await reconcilePayPalOrder(h.deps, input);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'PREPARE' });
    expect(h.calls.map(call => call.name)).toEqual([RPC.getter, RPC.prepare]);
    expectNoProvider(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  });
  it.each(['error', 'business-refusal', 'malformed'])('closes %s prepare replay without falling back to binding', async mode => {
    const reply = mode === 'error' ? { status: 503, data: { code: 'XX000', message: 'Q7pPriv' } }
      : mode === 'business-refusal' ? { status: 400, data: { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED' } }
        : { data: {} };
    const h = boundaries({ [RPC.prepare]: [reply] });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput) : await reconcilePayPalOrder(h.deps, input);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'PREPARE' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare]); expectNoProvider(h);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
  });
  it('uses the valid locking replay before binding, resolver and token exactly once', async () => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput) : await reconcilePayPalOrder(h.deps, input);
    expect(result).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind, RPC.receive]);
    expect(rpcCalls(h, RPC.prepare)).toEqual([{ name: RPC.prepare, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } }]);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(1); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.captureOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(1);
  });
  it('refuses an existing context without verification binding before the locking prepare replay', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, verification_binding_present: false } }] });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput) : await reconcilePayPalOrder(h.deps, input);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'BINDING' });
    expect(h.calls.map(call => call.name)).toEqual([RPC.getter]); expectNoProvider(h);
    expect(rpcCalls(h, RPC.prepare)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
});

describe('L3 sticky review recovery collects evidence with zero submission and intake', () => {
  it.each([
    ['reconcile', 'COMPLETED'], ['reconcile', 'PENDING'], ['capture-recovery', 'COMPLETED'], ['capture-recovery', 'PENDING'],
  ])('preserves REVIEW after %s observes actual %s capture for a deleted actor', async (operation, status) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true, actor_deleted: true,
      submission_intent_recorded: true, payment_state: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT,
      quote_expires_at: '2020-01-01T00:00:00.123456Z' } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder(status) });
    const outcome = operation === 'reconcile' ? await reconcilePayPalOrder(h.deps, input) : await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status, amount_minor: '999', currency: 'USD', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
  });
  it('can reconcile a review-only context without requiring a new submission intent', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
  it('keeps review-only recovery closed when GET fails, while still attempting exactly one GET', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'TRANSPORT_UNKNOWN' });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  });
  it('does no external work for sticky review with no provider ORDER', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true, provider_order_id: null } }] });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'NO_PROVIDER_ORDER' });
    expect(h.calls.map(call => call.name)).toEqual([RPC.getter]); expectNoProvider(h);
  });
});

describe('L4 existing unbound CREATE context and L2 unknown CREATE observation', () => {
  it('refuses an existing immutable unbound context before prepare, resolver, token and CREATE', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null, verification_binding_present: false } }] });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage: 'BINDING' });
    expect(h.calls.map(call => call.name)).toEqual([RPC.getter]); expectNoProvider(h);
    expect(rpcCalls(h, RPC.prepare)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
  });
  it('rejects non-replayed preparation for an already existing CREATE context', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }],
      [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, replayed: false } }] });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage: 'PREPARE' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare]); expectNoProvider(h);
  });
  it('records the actual bounded unknown CREATE status without inventing UNRECOGNIZED as provider status', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }],
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS',
        trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    h.transport.createOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: providerOrder('FUTURE_STATUS') });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.createOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.prepare)).toHaveLength(1);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'CREATE_RESPONSE', identity_kind: 'ORDER', external_id: PROVIDER_ORDER, parent_external_id: null,
      status: 'FUTURE_STATUS', key: 'ORDER:5O190127TN364715T:FUTURE_STATUS', amount_minor: '999', currency: 'USD',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/UNRECOGNIZED|Q7pPriv|update_time|links/);
  });
});

describe('L1 exact safe logs cover previously silent refusals and uncertain submission', () => {
  it.each([
    ['context-error', 'CONTEXT', 'error', 'payment.paypal.charge.context.failed', { kind: 'UNAVAILABLE', stage: 'CONTEXT' }],
    ['prepare-refused', 'PREPARE', 'warn', 'payment.paypal.charge.context.failed', { kind: 'BLOCKED', reason: 'WEB_PAYMENT_ORDERS_CLOSED' }],
    ['create-unknown', 'OBSERVE', 'warn', 'payment.paypal.charge.observe.review', { kind: 'REVIEW_REQUIRED' }],
    ['bind-review', 'OBSERVE', 'warn', 'payment.paypal.charge.observe.review', { kind: 'REVIEW_REQUIRED' }],
    ['refund', 'OBSERVE', 'warn', 'payment.paypal.charge.observe.review', { kind: 'REVIEW_REQUIRED' }],
    ['lookup-unknown', 'OBSERVE', 'warn', 'payment.paypal.charge.observe.review', { kind: 'REVIEW_REQUIRED' }],
    ['lease-short', 'CLAIM', 'warn', 'payment.paypal.charge.claim.blocked', { kind: 'IN_PROGRESS' }],
    ['post-unknown', 'SUBMIT', 'error', 'payment.paypal.charge.submit.unknown', { kind: 'SUBMISSION_UNKNOWN' }],
    ['intake-review', 'INTAKE', 'error', 'payment.paypal.charge.intake.failed', { kind: 'REVIEW_REQUIRED' }],
  ])('logs %s with exact safe stage, severity and fields', async (scenario, stage, level, code, outcome) => {
    const h = boundaries();
    if (scenario === 'context-error') h.script[RPC.getter] = [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv token secret' } }];
    if (scenario === 'prepare-refused' || scenario === 'create-unknown' || scenario === 'bind-review') {
      h.script[RPC.getter] = [{ data: { ...NATIVE_FOUND, provider_order_id: null } }];
    }
    if (scenario === 'prepare-refused') h.script[RPC.prepare] = [{ status: 400, data: { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED' } }];
    if (scenario === 'create-unknown' || scenario === 'lookup-unknown') h.script[RPC.observe] = [{ data: {
      outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false,
    } }];
    if (scenario === 'create-unknown') h.transport.createOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: providerOrder('FUTURE_STATUS') });
    if (scenario === 'bind-review') h.script[RPC.bind] = [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_ID_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }];
    if (scenario === 'refund') h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: capturedOrder('REFUNDED') });
    if (scenario === 'lookup-unknown') h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: providerOrder('FUTURE_STATUS') });
    if (scenario === 'lease-short') h.script[RPC.claim] = [{ data: { ...NATIVE_CLAIMED, submit_not_after: '2026-11-14T00:00:10.122456+00:00' } }];
    if (scenario === 'post-unknown') {
      h.transport.captureOrder.mockRejectedValue(new Error('Q7pPriv token secret'));
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder('COMPLETED') });
    }
    if (scenario === 'intake-review') h.script[RPC.receive] = [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'EXISTING_PURCHASE_IDENTITY', grant_eligible: false } }];
    const result = ['prepare-refused', 'create-unknown', 'bind-review'].includes(scenario as string)
      ? await ensurePayPalProviderOrder(h.deps, input) : await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual(outcome);
    expect(h.log.mock.calls).toEqual([[{ stage, level, code, orderId: ORDER }]]);
    expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|3C679366HH908993F|ACCOUNTA1|MERCHANTA1|55555555|44444444|credential|email/);
    const submitted = ['refund', 'post-unknown', 'intake-review'].includes(scenario as string);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(submitted ? 1 : 0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(scenario === 'intake-review' ? 1 : 0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(submitted || scenario === 'lease-short' ? 1 : 0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(submitted ? 1 : 0);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(scenario === 'create-unknown' || scenario === 'bind-review' ? 1 : 0);
  });
  it('logs only the bounded HTTP status for original lookup failure', async () => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 503, body: { message: 'Q7pPriv' } });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'UNAVAILABLE', stage: 'LOOKUP' });
    expect(h.log.mock.calls).toEqual([[{ stage: 'LOOKUP', level: 'warn', code: 'payment.paypal.charge.lookup.failed', orderId: ORDER, httpStatus: 503 }]]);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
  it('continues the same closed outcome when the logger throws a secret-bearing exception', async () => {
    const h = boundaries(); h.log.mockImplementation(() => { throw new Error('Q7pPriv logger secret'); });
    h.transport.captureOrder.mockRejectedValue(new Error('Q7pPriv provider secret'));
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder('COMPLETED') });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.log.mock.calls).toEqual([[{ stage: 'SUBMIT', level: 'error', code: 'payment.paypal.charge.submit.unknown', orderId: ORDER }]]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(JSON.stringify(toPayPalChargeBrowserDto(ORDER, outcome))).not.toContain('Q7pPriv');
  });
});

describe('M2 local capture work bound and existing capture identity preference', () => {
  it.each([32, 33])('refuses %s captures with exact bounded preservation and zero intake', async count => {
    const h = boundaries({ [RPC.observe]: Array.from({ length: 31 }, (_unused, index) => ({ data: {
      outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
      observation_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, replayed: false,
    } })) });
    const body = capturedOrder();
    body.purchase_units[0].payments.captures = Array.from({ length: count }, (_unused, index) => ({
      id: `CAP${index}`, status: index === 0 ? 'COMPLETED' : 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
      custom_id: 'v2:11111111-1111-4111-8111-111111111111',
    }));
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    const bound = rpcCalls(h, RPC.bind); const recorded = rpcCalls(h, RPC.observe);
    expect(bound).toHaveLength(count === 32 ? 1 : 0); expect(recorded).toHaveLength(count === 32 ? 31 : 0);
    if (count === 32) {
      expect(bound[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: 'CAP0', parent_external_id: PROVIDER_ORDER,
        status: 'COMPLETED', key: 'CAPTURE:CAP0:COMPLETED', amount_minor: '999', currency: 'USD',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      } });
      expect(recorded.map(call => call.args)).toEqual(Array.from({ length: 31 }, (_unused, index) => ({
        p_context_id: CONTEXT, p_evidence: { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX',
          identity_kind: 'CAPTURE', external_id: `CAP${index + 1}`, parent_external_id: PROVIDER_ORDER,
          order_id: ORDER, user_id: ACTOR, quote_hash: HASH, status: 'PENDING', key: `CAPTURE:CAP${index + 1}:PENDING`,
          amount_minor: '999', currency: 'USD', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
          scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      })));
      expect(h.trail.slice(-32)).toEqual([RPC.bind, ...Array(31).fill(RPC.observe)]);
    } else {
      // 32 is a local work bound. The 33-entry response is not partially persisted.
      expect(h.trail.at(-1)).toBe('capture');
    }
  });
  it('does not invent a competing identity for an identical repeated capture ID', async () => {
    const h = boundaries(); const body = capturedOrder();
    body.purchase_units[0].payments.captures.push(structuredClone(body.purchase_units[0].payments.captures[0]));
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
    } });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it('prefers the existing linked capture even when another valid actual ID appears first', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_capture_id: '9SECOND',
      payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true, attempt_id: ATTEMPT } }],
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } }] });
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push({ id: '9SECOND', status: 'PENDING',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind, RPC.observe]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '9SECOND', parent_external_id: PROVIDER_ORDER,
      status: 'PENDING', key: 'CAPTURE:9SECOND:PENDING', amount_minor: '999', currency: 'USD',
    } });
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '999', currency: 'USD',
    } });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  });
});

describe('M2 observation faults preserve actual candidates without another bind or intake', () => {
  it('records remaining actual candidates after the selected bind returns REVIEW', async () => {
    const h = boundaries({ [RPC.bind]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_ID_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }],
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } }] });
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push({ id: '9SECOND', status: 'PENDING',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '9SECOND', parent_external_id: PROVIDER_ORDER,
      status: 'PENDING', amount_minor: '999', currency: 'USD', key: 'CAPTURE:9SECOND:PENDING',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(h.trail.slice(-2)).toEqual([RPC.bind, RPC.observe]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it('records the same selected evidence once after bind response loss and then the remaining actual candidate', async () => {
    const h = boundaries({ [RPC.bind]: [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv response lost' } }],
      [RPC.observe]: [
        { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
          observation_id: OBSERVATION, replayed: false } },
        { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
          observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
      ] });
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push({ id: '9SECOND', status: 'PENDING',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    const bound = rpcCalls(h, RPC.bind); const recorded = rpcCalls(h, RPC.observe);
    expect(bound).toHaveLength(1); expect(recorded).toHaveLength(2);
    const expectedSelected = { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/) };
    expect(bound[0].args).toEqual({ p_context_id: CONTEXT, p_evidence: expectedSelected });
    expect(recorded[0].args).toEqual({ p_context_id: CONTEXT, p_evidence: expectedSelected });
    expect(recorded[0].args).toEqual(bound[0].args);
    expect(recorded[1].args).toEqual({ p_context_id: CONTEXT, p_evidence: { ...expectedSelected,
      external_id: '9SECOND', status: 'PENDING', key: 'CAPTURE:9SECOND:PENDING' } });
    expect(h.trail.slice(-3)).toEqual([RPC.bind, RPC.observe, RPC.observe]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
    // This external delivery script does not establish whether the failed bind committed.
    // Native same-key replay and IDENTITY_NOT_BOUND semantics are separate SQL evidence.
  });
  it('attempts the next remaining actual ID in response order after the first record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [
      { status: 503, data: { code: 'XX000', message: 'Q7pPriv record lost' } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push(
      { id: '9SECOND', status: 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' },
      { id: '9THIRD', status: 'DECLINED', amount: { currency_code: 'USD', value: '9.99' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(2);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD',
    } });
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX',
        identity_kind: 'CAPTURE', external_id: '9SECOND', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR,
        quote_hash: HASH, status: 'PENDING', amount_minor: '999', currency: 'USD', key: 'CAPTURE:9SECOND:PENDING',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/) } },
      { p_context_id: CONTEXT, p_evidence: { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX',
        identity_kind: 'CAPTURE', external_id: '9THIRD', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR,
        quote_hash: HASH, status: 'DECLINED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:9THIRD:DECLINED',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/) } },
    ]);
    expect(h.trail.slice(-3)).toEqual([RPC.bind, RPC.observe, RPC.observe]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it('preserves different actual statuses of the same ID as separate observations without renaming it', async () => {
    const h = boundaries(); const body = capturedOrder('PENDING');
    body.purchase_units[0].payments.captures.push({ id: '3C679366HH908993F', status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'PENDING', key: 'CAPTURE:3C679366HH908993F:PENDING', amount_minor: '999', currency: 'USD',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '999', currency: 'USD',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(h.trail.slice(-2)).toEqual([RPC.bind, RPC.observe]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
});

describe('N1 recovery preserves the actual capture identity reported by a matching POST ORDER', () => {
  it.each([
    ['official-200', 200, '10000', OFFICIAL_CAPTURE_200],
    ['official-201', 201, '10000', OFFICIAL_CAPTURE_201],
    ['missing-intent', 201, '999', (() => { const b: any = capturedOrder(); delete b.intent; return b; })()],
    ['missing-capture-amount', 202, '999', (() => {
      const b: any = capturedOrder(); delete b.purchase_units[0].payments.captures[0].amount; return b;
    })()],
  ])('records only actual GET Y when %s POST names X, with no bind or receipt', async (_label, status, minor, post) => {
    const h = boundaries({
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, amount_minor: minor } }],
      // There is no CAPTURE link. Native record-only semantics cannot return RECORDED.
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND',
        trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }],
    });
    const approved = providerOrder(); const lookup = capturedOrder();
    approved.purchase_units[0].amount.value = minor === '10000' ? '100.00' : '9.99';
    lookup.purchase_units[0].amount.value = minor === '10000' ? '100.00' : '9.99';
    lookup.purchase_units[0].payments.captures[0].amount = { currency_code: 'USD', value: minor === '10000' ? '100.00' : '9.99' };
    lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: approved })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.observe]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: minor, currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
      payload_hash: minor === '10000' ? '9c6be2391e70aec8d3f23119b424a1644bb51b0f6d615220f8e825bd5aebdc16'
        : '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8',
    } }]);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(1); expect(h.bindings.getProviderBinding).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.prepare)).toHaveLength(1); expect(rpcCalls(h, RPC.getter)).toHaveLength(1);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|customer@example|John|shipping|links|update_time|provider_completed_at|3C679366HH908993F/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9LOOKUPCAP|3C679366HH908993F|ACCOUNTA1|MERCHANTA1|55555555|44444444/);
  });

  it('does not bind any recovery candidate when LOOKUP contains both POST X and a competing Y', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures.push({ id: '9LOOKUPCAP', status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.observe, RPC.observe]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: { source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: 'a9738a6aefe680c1f0ec24e5a8e9ba7dd4416dc7e78c49394d5890036ea7ac5b' } },
      { p_context_id: CONTEXT, p_evidence: { source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
        payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8' } },
    ]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
  });

  it('allows the same actual ID to progress from partial POST PENDING to LOOKUP COMPLETED', async () => {
    const h = boundaries(); const post: any = capturedOrder('PENDING'); delete post.intent;
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.bind, RPC.receive]);
    expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'a9738a6aefe680c1f0ec24e5a8e9ba7dd4416dc7e78c49394d5890036ea7ac5b',
    } }]);
    expect(rpcCalls(h, RPC.receive)).toEqual([{ name: RPC.receive, args: { p_order_id: ORDER, p_observation_id: OBSERVATION } }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.requestToken).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
  });

  it.each(['missing-parent', 'missing-capture-id', 'missing-units'])
    ('does not invent a POST identity constraint for %s', async mode => {
      const h = boundaries(); const post: any = capturedOrder(); delete post.intent;
      if (mode === 'missing-parent') delete post.id;
      if (mode === 'missing-capture-id') delete post.purchase_units[0].payments.captures[0].id;
      if (mode === 'missing-units') delete post.purchase_units;
      const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
      expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
        'capture', 'get', RPC.bind, RPC.receive]);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
        payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8',
      } });
      expect(rpcCalls(h, RPC.receive)).toEqual([{ name: RPC.receive, args: { p_order_id: ORDER, p_observation_id: OBSERVATION } }]);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    });
});

describe('L-new1 partial POST contradictions permit observation only and remain REVIEW', () => {
  it.each([32, 33])('respects the local bound for a minimal POST with %s capture identities', async count => {
    const h = boundaries(); const post: any = structuredClone(OFFICIAL_CAPTURE_201);
    post.purchase_units[0].payments.captures = Array.from({ length: count }, (_unused, index) => ({
      id: index === 0 ? '3C679366HH908993F' : `CAP${index}`, status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' },
    }));
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture',
      ...(count === 32 ? ['get', RPC.bind] : [])]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(count === 32 ? 2 : 1);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(count === 32 ? 1 : 0);
    if (count === 32) expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'a9738a6aefe680c1f0ec24e5a8e9ba7dd4416dc7e78c49394d5890036ea7ac5b',
    } });
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.requestToken).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
  });

  it.each(['country', 'deprecated-country', 'multiple', 'unknown-order-status', 'unknown-capture-status', 'partial-country'])
    ('preserves actual GET evidence after %s without erasing the POST contradiction', async mode => {
      const h = boundaries(); const post: any = structuredClone(OFFICIAL_CAPTURE_201);
      post.purchase_units[0].payments.captures[0].amount.value = '9.99';
      if (mode === 'country') post.payment_source.paypal.address = { country_code: 'KR' };
      if (mode === 'deprecated-country') post.payer.address = { country_code: 'KR' };
      if (mode === 'multiple') post.purchase_units[0].payments.captures.push({ id: '9SECOND', status: 'PENDING',
        amount: { currency_code: 'USD', value: '9.99' } });
      if (mode === 'unknown-order-status') post.status = 'FUTURE_ORDER';
      if (mode === 'unknown-capture-status') post.purchase_units[0].payments.captures[0].status = 'FUTURE_CAPTURE';
      if (mode === 'partial-country') {
        Object.assign(post, capturedOrder()); delete post.purchase_units[0].payee.merchant_id;
        post.payment_source.paypal.address.country_code = 'KR';
      }
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
        'capture', 'get', RPC.bind]);
      expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: 'a9738a6aefe680c1f0ec24e5a8e9ba7dd4416dc7e78c49394d5890036ea7ac5b',
      } }]);
      expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      expect(h.transport.getOrder.mock.calls).toEqual([
        [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
        [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      ]);
      expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
        providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
      expect(h.credentials.resolve).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.prepare)).toHaveLength(1);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
      expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
        state: 'REVIEW_REQUIRED', newOrderAllowed: false });
      expect(JSON.stringify(rpcCalls(h, RPC.bind))).not.toMatch(/COUNTRY_MISMATCH|FUTURE_|9SECOND|Q7pPriv|customer@example|shipping|links|update_time/);
      expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|3C679366HH908993F|9SECOND|ACCOUNTA1|MERCHANTA1|55555555|44444444/);
    });

  it.each(['transport', 'throw', 'http-failure', 'empty-captures'])
    ('keeps country contradiction REVIEW after %s recovery without a second POST', async mode => {
      const h = boundaries(); const post: any = structuredClone(OFFICIAL_CAPTURE_201);
      post.purchase_units[0].payments.captures[0].amount.value = '9.99';
      post.payment_source.paypal.address = { country_code: 'KR' };
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() });
      if (mode === 'throw') h.transport.getOrder.mockRejectedValueOnce(new Error('Q7pPriv lookup failure'));
      else h.transport.getOrder.mockResolvedValueOnce(mode === 'transport' ? { kind: 'TRANSPORT_UNKNOWN' }
        : mode === 'http-failure' ? { kind: 'RESPONSE', status: 503, body: { message: 'Q7pPriv' } }
          : { kind: 'RESPONSE', status: 200, body: providerOrder('COMPLETED') });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', 'get']);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
      expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|3C679366HH908993F|55555555|44444444/);
    });

  it('keeps mixed minimal country and capture-ID conflicts record-only when GET reports Y', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post: any = structuredClone(OFFICIAL_CAPTURE_201);
    post.purchase_units[0].payments.captures[0].amount.value = '9.99';
    post.payment_source.paypal.address = { country_code: 'KR' };
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.observe]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER,
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8',
    } });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/3C679366HH908993F|COUNTRY_MISMATCH|Q7pPriv|customer@example|links|update_time/);
  });
});

describe('L-new2 safe warning logs accompany identity and authority mismatch exits', () => {
  it.each([
    ['callback', 'CLAIM', 'payment.paypal.charge.claim.blocked', { kind: 'BLOCKED', reason: 'PROVIDER_ORDER_MISMATCH' }],
    ['version-context', 'OBSERVE', 'payment.paypal.charge.observe.review', { kind: 'REVIEW_REQUIRED' }],
    ['lookup-quote', 'OBSERVE', 'payment.paypal.charge.observe.review', { kind: 'REVIEW_REQUIRED' }],
  ])('logs %s with exact safe fields and zero forbidden effects', async (mode, stage, code, expectedOutcome) => {
    const h = boundaries();
    if (mode === 'version-context') {
      h.script[RPC.getter] = [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '7', provider_order_id: '9OTHERORDER' } }];
      h.script[RPC.claim] = [{ data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '7' } }];
    }
    if (mode === 'lookup-quote') h.script[RPC.claim] = [{ data: {
      decision: 'LOOKUP_ONLY', safe_reason_code: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT, provider_request_key: ATTEMPT,
      fencing_version: '1', row_version: '3', quote_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    } }];
    const outcome = await capturePayPalOrder(h.deps, mode === 'callback'
      ? { ...input, approvedProviderOrderId: '9CALLBACKPRIVATE' } : approvedInput);
    expect(outcome).toEqual(expectedOutcome);
    expect(h.log.mock.calls).toEqual([[{ stage, level: 'warn', code, orderId: ORDER }]]);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(mode === 'callback' ? 0 : 1);
    expect(rpcCalls(h, RPC.getter)).toHaveLength(mode === 'version-context' ? 2 : 1);
    expect(rpcCalls(h, RPC.prepare)).toHaveLength(mode === 'callback' ? 0 : 1);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(mode === 'callback' ? 0 : 1);
    expect(h.transport.requestToken).toHaveBeenCalledTimes(mode === 'callback' ? 0 : 1);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(mode === 'callback' ? 0 : 1);
    expect(h.bindings.getProviderBinding).toHaveBeenCalledTimes(mode === 'callback' ? 0 : 1);
    expect(h.trail).toEqual(mode === 'callback' ? [RPC.getter]
      : [RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, ...(mode === 'version-context' ? [RPC.getter] : [])]);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls, dto: toPayPalChargeBrowserDto(ORDER, outcome) }))
      .not.toMatch(/Q7pPriv|9CALLBACKPRIVATE|9OTHERORDER|5O190127TN364715T|3C679366HH908993F|ACCOUNTA1|MERCHANTA1|55555555|44444444|33333333|credential|lease|quote_hash/);
  });
});

describe('R1 partial POST preserves representable contradictory facts before recovery', () => {
  // These cases catch a recovery branch that discards an actual contradiction,
  // including CAPTURE amount hidden behind the parser's earlier INTENT refusal.
  // Native reasons follow observation_command's priority, not a test SQL engine.
  it.each([
    ['foreign-order/missing-intent', 'IDENTITY_ALREADY_BOUND', (b: any) => { b.id = '9OTHERORDER'; delete b.intent; },
      { external_id: '9OTHERORDER', key: 'ORDER:9OTHERORDER:COMPLETED' }],
    ['order-amount/missing-intent', 'AMOUNT_MISMATCH', (b: any) => { b.purchase_units[0].amount.value = '10.00'; delete b.intent; },
      { amount_minor: '1000' }],
    ['currency/missing-intent', 'CURRENCY_MISMATCH', (b: any) => { b.purchase_units[0].amount.currency_code = 'EUR'; delete b.intent; },
      { currency: 'EUR' }],
    ['merchant/missing-intent', 'PROVIDER_SCOPE_MISMATCH', (b: any) => { b.purchase_units[0].payee.merchant_id = 'MERCHANTB2'; delete b.intent; },
      { scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' } }],
    ['reference/missing-capture-status', 'ORDER_REFERENCE_MISMATCH', (b: any) => {
      b.purchase_units[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999';
      delete b.purchase_units[0].payments.captures[0].status;
    }, { order_reference: 'v2:99999999-9999-4999-8999-999999999999' }],
    ['order-amount/missing-capture-id', 'AMOUNT_MISMATCH', (b: any) => {
      b.purchase_units[0].amount.value = '10.00'; delete b.purchase_units[0].payments.captures[0].id;
    }, { amount_minor: '1000' }],
    ['capture-amount/missing-intent', 'AMOUNT_MISMATCH', (b: any) => {
      b.purchase_units[0].payments.captures[0].amount.value = '10.00'; delete b.intent;
    }, { identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T',
      key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '1000' }],
    ['unknown-capture-status/missing-intent', 'UNRECOGNIZED_STATUS', (b: any) => {
      b.purchase_units[0].payments.captures[0].status = 'FUTURE_CAPTURE'; delete b.intent;
    }, { identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T',
      status: 'FUTURE_CAPTURE', key: 'CAPTURE:3C679366HH908993F:FUTURE_CAPTURE' }],
  ])('records actual SUBMIT_RESPONSE for %s with no corrective GET, bind or receipt', async (_label, reason, mutate, fact) => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: reason,
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post = capturedOrder(); (mutate as (body: any) => void)(post);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    // A normal later GET must never replace the contradictory POST fact.
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
      external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
      ...fact as Record<string, unknown>, payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 미지 ORDER status 때문에 귀속 가능한 CAPTURE를 버리는 조기 반환을 검출한다.
  it('records actual SUBMIT_RESPONSE for unknown-order-status/missing-intent with no corrective GET, bind or receipt', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('keeps the current call REVIEW after actual contradictory POST record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv record unavailable' } }] });
    const post: any = capturedOrder(); delete post.intent; post.purchase_units[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'ORDER', external_id: PROVIDER_ORDER, parent_external_id: null,
      amount_minor: '1000', currency: 'USD', status: 'COMPLETED', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
    // A failed RPC gives no durability evidence. A later process may lack REVIEW;
    // this case proves only that the current call never recovers, binds or receives.
  });

  it('honors a literal getter REVIEW on reconcile after first recording the actual POST amount conflict', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post: any = capturedOrder(); delete post.intent; post.purchase_units[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(rpcCalls(h, RPC.observe)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'ORDER', external_id: PROVIDER_ORDER, amount_minor: '1000', currency: 'USD',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, status: 'COMPLETED',
    } });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    // The SQL review_exists/getter supplies this flag in production. This literal
    // response checks the controller guard; it does not prove that SQL committed.
    h.script[RPC.getter].push({ data: { ...NATIVE_FOUND, review_required: true, row_version: '3',
      submission_intent_recorded: true, payment_state: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT } });
    h.script[RPC.prepare].push({ data: NATIVE_PREPARED });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe,
      RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      amount_minor: '999', currency: 'USD', status: 'COMPLETED',
    } });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(1);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
  });
});

describe('N1-a recovery preserves actual ORDER conflict before the capture-ID refusal', () => {
  it.each([
    ['amount', 'AMOUNT_MISMATCH', (b: any) => { b.purchase_units[0].amount.value = '10.00'; }, { amount_minor: '1000' }],
    ['payee', 'PROVIDER_SCOPE_MISMATCH', (b: any) => { b.purchase_units[0].payee.merchant_id = 'MERCHANTB2'; },
      { scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' } }],
    ['order-id', 'IDENTITY_ALREADY_BOUND', (b: any) => { b.id = '9OTHERORDER'; },
      { external_id: '9OTHERORDER', key: 'ORDER:9OTHERORDER:COMPLETED' }],
  ])('records actual LOOKUP ORDER %s when partial POST X is followed by GET Y', async (_label, reason, mutate, fact) => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: reason,
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    (mutate as (body: any) => void)(lookup);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER', external_id: '5O190127TN364715T',
      parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
      ...fact as Record<string, unknown>, payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', 'get', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(rpcCalls(h, RPC.getter)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/3C679366HH908993F|9LOOKUPCAP|Q7pPriv|email_address|links|update_time|provider_completed_at/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/9OTHERORDER|9LOOKUPCAP|Q7pPriv|ACCOUNTA1|MERCHANTB2/);
  });
});

describe('R1-b complete POST preserves actual capture facts hidden by INTENT refusal', () => {
  // Catch the single-ORDER fallback losing a complete, contradictory CAPTURE tuple.
  it('records actual CAPTURE amount 1000 from complete AUTHORIZE POST without recovery or intake', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures[0].amount = { currency_code: 'USD', value: '10.00' };
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'd8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6',
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  it('records actual CAPTURE EUR from complete AUTHORIZE POST without recovery or intake', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'CURRENCY_MISMATCH',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures[0].amount = { currency_code: 'EUR', value: '9.99' };
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'EUR', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: '4389180c2a2a3aa6ec0f9c009b5c503b7e1308a5c76bc4bbc40cb86d1c3b1109',
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  it('records actual foreign CAPTURE reference from complete AUTHORIZE POST without recovery or intake', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'ORDER_REFERENCE_MISMATCH',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:99999999-9999-4999-8999-999999999999', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: '898f46e1da86834cabca6beef5247e4edf023cb368e240e0fafdb49c8d3d4239',
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  it('records actual FUTURE_CAPTURE from complete AUTHORIZE POST without recovery or intake', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post = capturedOrder('FUTURE_CAPTURE'); post.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'FUTURE_CAPTURE', key: 'CAPTURE:3C679366HH908993F:FUTURE_CAPTURE',
      payload_hash: '7aafa97936bfc454b24952be33763a3c875e8497130c64a396518354cad35ae4',
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  // Catch either an early stop on record failure or deduplication by the wrong tuple.
  it('records deduplicated actual A then B after complete AUTHORIZE POST even when A record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [
      { status: 503, data: { code: 'XX000', message: 'Q7pPriv record unavailable' } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures = [
      { id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '10.00' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' },
      { id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '10.00' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' },
      { id: '9SECOND', status: 'COMPLETED', amount: { currency_code: 'USD', value: '11.00' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' },
    ];
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX',
        identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
        order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: 'd8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6' } },
      { p_context_id: CONTEXT, p_evidence: { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX',
        identity_kind: 'CAPTURE', external_id: '9SECOND', parent_external_id: PROVIDER_ORDER,
        order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1100', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9SECOND:COMPLETED',
        payload_hash: 'dec8efa9c73e43c46e70c5fb94f981a21758c06d465a4ed29ee87767067721cc' } },
    ]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(2); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
    // Delivery failure does not establish whether A persisted.
  });
});

describe('N1 status-only ORDER recovery preserves the actual competing capture', () => {
  // Catch the ORDER-status fallback returning before the record-only CAPTURE loop.
  it('records matching FUTURE_ORDER then actual GET Y after partial POST X without binding or intake', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.status = 'FUTURE_ORDER';
    lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: { source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: PROVIDER_ORDER, parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: '1d165fb6a9737ded31e6eaadf25908468acafb8f59ff5659f0f371f5bffdb555' } },
      { p_context_id: CONTEXT, p_evidence: { source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
        payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8' } },
    ]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(2); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  it('still records actual GET Y after matching FUTURE_ORDER record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [
      { status: 503, data: { code: 'XX000', message: 'Q7pPriv ORDER record unavailable' } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.status = 'FUTURE_ORDER';
    lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe).map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: { source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: PROVIDER_ORDER, parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: '1d165fb6a9737ded31e6eaadf25908468acafb8f59ff5659f0f371f5bffdb555' } },
      { p_context_id: CONTEXT, p_evidence: { source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
        payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8' } },
    ]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', 'get', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(2); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
    // The failed ORDER delivery proves neither persistence nor a durable REVIEW flag.
  });
});

describe('U2-C live provider entry before CREATE', () => {
  const authorized = { kind: 'AUTHORIZED', orderId: ORDER, contextId: CONTEXT, createRequestKey: CREATE_KEY,
    quoteHash: HASH, bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    entryNotAfter: '2026-11-14T00:15:00.123456+00:00' };

  it.each([
    'INPUT_INVALID', 'PROVIDER_UNSUPPORTED', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED',
    'CONTEXT_MISMATCH', 'BINDING_MISMATCH', 'ORDER_STATE_INVALID', 'ACTOR_DELETED',
    'SETTINGS_UNAVAILABLE', 'ENVIRONMENT_MISMATCH', 'ORDERS_CLOSED', 'CHARGE_CLOSED',
    'COUNTRY_NOT_ALLOWED', 'ACTOR_NOT_ALLOWED', 'POLICY_UNAVAILABLE', 'POLICY_NOT_ACCEPTED',
    'QUOTE_EXPIRED', 'PRODUCT_UNAVAILABLE', 'VERIFICATION_BINDING_CHANGED', 'PROVIDER_SCOPE_CHANGED',
  ])('C2 blocks CREATE, bind and observation after entry refuses %s', async reason => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'BLOCKED', reason });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'BLOCKED', reason });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry']);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
  });

  it('C3 maps entry REVIEW_REQUIRED to review without CREATE', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'BLOCKED', reason: 'REVIEW_REQUIRED' });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
  });

  it('C4 closes a thrown entry error without leaking its synthetic secret or creating', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockRejectedValue(new Error('Q7pPriv secret'));
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'ENTRY' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
    expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
  });

  it.each([
    ['orderId', '99999999-9999-4999-8999-999999999999'], ['contextId', QUOTE], ['createRequestKey', ATTEMPT],
    ['quoteHash', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'],
    ['bindingHash', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'],
    ['entryNotAfter', '2026-11-14T00:15:00.124456+00:00'],
  ])('C5 independently refuses entry %s echo mismatch before CREATE', async (field, value) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ ...authorized, [field]: value });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage: 'ENTRY' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
  });

  it('C7 rechecks the returned entry deadline after entry advances the injected clock', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    let clock = NOW; h.deps.nowMs = () => clock;
    h.entry.authorizeProviderEntry.mockImplementation(async () => {
      clock = Date.parse('2026-11-14T00:15:00.124Z'); return structuredClone(authorized);
    });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'BLOCKED', reason: 'QUOTE_EXPIRED' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry']);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'PREPARE', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
  });

  it('C7 blocks CREATE at parsed millisecond equality with the returned entry deadline', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    let clock = NOW; h.deps.nowMs = () => clock;
    h.entry.authorizeProviderEntry.mockImplementation(async () => {
      clock = Date.parse('2026-11-14T00:15:00.123Z'); return structuredClone(authorized);
    });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'BLOCKED', reason: 'QUOTE_EXPIRED' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry']);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'PREPARE', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
  });

  it.each([
    ['unlinked', { data: { ...NATIVE_FOUND, provider_order_id: null } }],
    ['different context', { data: { ...NATIVE_FOUND, context_id: QUOTE } }],
    ['getter 503', { status: 503, data: { code: 'XX000', message: 'Q7pPriv getter secret' } }],
    ['not found', { data: { contract_version: 'web-payment-charge-context.v1', outcome: 'NOT_FOUND', charge_authority: false } }],
  ])('C8 closes ORDER_LINKED after %s owner reread with only an ENTRY log', async (_mode, reply) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null, context_id: null,
      verification_binding_present: false } }, reply], [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, replayed: false } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'ORDER_LINKED' });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result).toEqual({ kind: 'UNAVAILABLE', stage: 'ENTRY' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.getter)).toEqual([
      { name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } },
      { name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } },
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry', RPC.getter]);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
    expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
  });

  it('C9 closes entry NOT_FOUND after an existing owner context without CREATE', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'NOT_FOUND' });
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage: 'ENTRY' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.getter)).toHaveLength(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
  });

  it('C10 keeps entry refusal closed when the logger throws without authorizing or repeating CREATE', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'BLOCKED', reason: 'CHARGE_CLOSED' });
    h.log.mockImplementation(() => { throw new Error('Q7pPriv logger secret'); });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result).toEqual({ kind: 'BLOCKED', reason: 'CHARGE_CLOSED' });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry']);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([[{ stage: 'ENTRY', level: 'warn', code: 'payment.paypal.charge.context.failed', orderId: ORDER }]]);
    expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
  });

  it('C1 calls entry once with the prepared tuple after token and before create', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null, context_id: null,
      verification_binding_present: false } }], [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, replayed: false } }] });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(h.entry.authorizeProviderEntry.mock.calls).toEqual([[{ actorUserId: ACTOR, orderId: ORDER,
      contextId: CONTEXT, createRequestKey: CREATE_KEY,
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }]]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry', 'create', RPC.bind]);
    expect(result).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: false });
    expect(h.transport.createOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      requestKey: CREATE_KEY, orderId: ORDER, amountMinor: '999' }]]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([]);
  });

  it.each(['2026-11-14T09:15:00.123456+09:00', '2026-11-14T00:15:00.123456Z'])
    ('C6 accepts the same entry deadline instant in %s after calling entry before CREATE', async entryNotAfter => {
      const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
      h.entry.authorizeProviderEntry.mockResolvedValue({ ...authorized, entryNotAfter });
      h.deps.nowMs = () => Date.parse('2026-11-14T00:15:00.122Z');
      const result = await ensurePayPalProviderOrder(h.deps, input);
      expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry', 'create', RPC.bind]);
      expect(result).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
      expect(h.transport.createOrder).toHaveBeenCalledTimes(1);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(1); expect(h.log.mock.calls).toEqual([]);
    });

  it('C8 replays ORDER_LINKED only after one owner reread matches the prepared context and linked ID', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null, context_id: null,
      verification_binding_present: false } }, { data: NATIVE_FOUND }],
      [RPC.prepare]: [{ data: { ...NATIVE_PREPARED, replayed: false } }] });
    h.entry.authorizeProviderEntry.mockResolvedValue({ kind: 'ORDER_LINKED' });
    const result = await ensurePayPalProviderOrder(h.deps, input);
    expect(result).toEqual({ kind: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER_ORDER, replayed: true });
    expect(h.entry.authorizeProviderEntry).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.getter)).toEqual([
      { name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } },
      { name: RPC.getter, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } },
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'entry', RPC.getter]);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.log.mock.calls).toEqual([]);
  });

  it.each(['capture', 'reconcile', 'status'])('C11 leaves entry unused for successful %s', async operation => {
    const h = boundaries();
    h.entry.authorizeProviderEntry.mockRejectedValue(new Error('Q7pPriv entry must stay unused'));
    if (operation === 'reconcile') h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput)
      : operation === 'reconcile' ? await reconcilePayPalOrder(h.deps, input) : await getPayPalChargeStatus(h.deps, input);
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled();
    expect(result).toEqual(operation === 'status'
      ? { kind: 'STATUS', paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE', reviewRequired: false }
      : { kind: 'INTAKE_PENDING', replayed: false });
    expect(h.transport.createOrder).not.toHaveBeenCalled();
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(operation === 'capture' ? 1 : 0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(operation === 'status' ? 0 : 1);
  });

  it.each([
    ['prepare REFUSED', { kind: 'BLOCKED', reason: 'WEB_PAYMENT_ORDERS_CLOSED' }],
    ['BINDING failure', { kind: 'UNAVAILABLE', stage: 'BINDING' }],
    ['CREDENTIAL failure', { kind: 'UNAVAILABLE', stage: 'CREDENTIAL' }],
    ['TOKEN failure', { kind: 'UNAVAILABLE', stage: 'TOKEN' }],
    ['fresh review', { kind: 'REVIEW_REQUIRED' }], ['fresh deleted actor', { kind: 'BLOCKED', reason: 'ACTOR_DELETED' }],
    ['fresh expired quote', { kind: 'BLOCKED', reason: 'QUOTE_EXPIRED' }], ['fresh recovery', { kind: 'SUBMISSION_UNKNOWN' }],
  ])('C12 leaves entry unused after %s', async (scenario, outcome) => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    h.entry.authorizeProviderEntry.mockRejectedValue(new Error('Q7pPriv entry must stay unused'));
    if (scenario === 'prepare REFUSED') h.script[RPC.prepare] = [{ status: 400,
      data: { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED' } }];
    if (scenario === 'BINDING failure') h.bindings.getProviderBinding.mockResolvedValue({ ...BINDING, bindingHash: 'bad-hash' });
    if (scenario === 'CREDENTIAL failure') h.credentials.resolve.mockResolvedValue(null);
    if (scenario === 'TOKEN failure') h.transport.requestToken.mockResolvedValue(null);
    if (scenario === 'fresh review') h.script[RPC.getter] = [{ data: { ...NATIVE_FOUND, provider_order_id: null, review_required: true } }];
    if (scenario === 'fresh deleted actor') h.script[RPC.getter] = [{ data: { ...NATIVE_FOUND, provider_order_id: null, actor_deleted: true } }];
    if (scenario === 'fresh expired quote') h.script[RPC.getter] = [{ data: { ...NATIVE_FOUND, provider_order_id: null,
      quote_expires_at: '2026-11-13T23:59:59.123456Z' } }];
    if (scenario === 'fresh recovery') h.script[RPC.getter] = [{ data: { ...NATIVE_FOUND, provider_order_id: null,
      submission_intent_recorded: true, payment_state: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT } }];
    expect(await ensurePayPalProviderOrder(h.deps, input)).toEqual(outcome);
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled();
    expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  });
});

describe('U2-E bounded provider fact preservation', () => {
  const capturesAt = (n: number) => Array.from({ length: n }, (_u, k) => ({
    id: k === 0 ? '3C679366HH908993F' : `CAP${k}`, status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111',
  }));

  it('records FUTURE_ORDER and the actual conflicting CAPTURE amount from a partial POST without recovery', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('records FUTURE_ORDER and the actual matching CAPTURE from a complete AUTHORIZE POST once each', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 기록 실패 뒤 다음 사실을 생략하거나 같은 사실을 재시도하는 회귀를 검출한다.
  it('still records the actual CAPTURE once after the FUTURE_ORDER record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [
      { status: 503, data: { code: 'XX000', message: 'Q7pPriv record unavailable' } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 중복 제거 전 raw 33개를 닫고, raw 3개에서는 서로 다른 두 사실만 보낸다.
  it.each(['duplicate', 'raw-33-unique', 'raw-33-with-duplicate'])
    ('bounds unknown-status CAPTURE facts for %s raw captures', async mode => {
    const h = boundaries({ [RPC.observe]: mode === 'duplicate' ? [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ] : [], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    if (mode === 'duplicate') {
      const first = { id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '10.00' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' };
      body.purchase_units[0].payments.captures = [first, structuredClone(first), { id: '9SECOND', status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '11.00' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' }];
    } else {
      body.purchase_units[0].payments.captures = mode === 'raw-33-unique' ? capturesAt(33)
        : [...capturesAt(32), structuredClone(capturesAt(32)[0])];
    }
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(mode === 'duplicate' ? 3 : 0);
    expect(recorded.map(call => call.args)).toEqual(mode === 'duplicate' ? [
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '9SECOND', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1100', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9SECOND:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ] : []);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', ...(mode === 'duplicate' ? [RPC.observe, RPC.observe, RPC.observe] : [])]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('keeps only the ORDER fact when an unknown-status POST names another merchant', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    body.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // ORDER1과 CAPTURE32를 모두 응답 순서로 기록하며 잘린 반복을 검출한다.
  it('records the ORDER then all 32 actual unknown-status CAPTURE facts at the raw bound', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      ...Array.from({ length: 32 }, () => ({ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } })),
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body = capturedOrder(); body.status = 'FUTURE_ORDER'; delete (body as any).intent;
    body.purchase_units[0].payments.captures = capturesAt(32);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(33);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      ...capturesAt(32).map(c => ({ p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: c.id, parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: `CAPTURE:${c.id}:COMPLETED`,
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } })),
    ]);
    expect(new Set(recorded.map(call => (call.args.p_evidence as any).payload_hash)).size).toBe(33);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', ...Array(33).fill(RPC.observe)]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 완전 CAPTURE_SHAPE 경로에 ORDER 기록을 잘못 추가하는 변경을 검출한다.
  it('keeps a complete unknown-status POST with a conflicting CAPTURE on the record-only CAPTURE_SHAPE path', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // INTENT fallback에서 일치 CAPTURE가 빠지거나 bind로 바뀌는 회귀를 검출한다.
  it('records the actual matching AUTHORIZE CAPTURE as record-only after the ORDER fact', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: NATIVE_RECORDED },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // literal getter REVIEW가 정상 GET 후 intake로 풀리는 회귀를 검출하며 SQL 영속성은 주장하지 않는다.
  it('keeps REVIEW and zero intake when a later normal GET binds the AUTHORIZE capture', async () => {
    const h = boundaries({ [RPC.observe]: [], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, row_version: '3', payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true,
        attempt_id: ATTEMPT, review_required: true } }] });
    const body: any = capturedOrder();
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(0);
    expect(recorded.map(call => call.args)).toEqual([]);
    expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 동시 같은 ID link의 RECORDED 응답이 로컬 REVIEW를 풀지 못한다.
  it('returns local REVIEW without intake when the AUTHORIZE CAPTURE record returns RECORDED', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: NATIVE_RECORDED },
      { data: NATIVE_RECORDED }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('still records the AUTHORIZE CAPTURE once after the ORDER record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [
      { status: 503, data: { code: 'XX000', message: 'Q7pPriv record unavailable' } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // AUTHORIZE 외 intent, CAPTURE 부재, 외부 merchant에 기록 범위를 넓히는 회귀를 검출한다.
  it.each(['no-capture', 'sale-intent', 'foreign-merchant'])
    ('does not add a CAPTURE fact for excluded %s POST', async mode => {
    const h = boundaries({ [RPC.observe]: [{ data: NATIVE_RECORDED }], [RPC.bind]: [], [RPC.receive]: [] });
    const body = capturedOrder(); body.intent = mode === 'sale-intent' ? 'SALE' : 'AUTHORIZE';
    if (mode === 'no-capture') body.purchase_units[0].payments.captures = [];
    if (mode === 'foreign-merchant') body.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: mode === 'foreign-merchant' ? 'MERCHANTB2' : 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 중복 제거 전 raw 33개를 닫고, raw 3개에서는 서로 다른 두 사실만 보낸다.
  it.each(['duplicate', 'raw-33-unique', 'raw-33-with-duplicate'])
    ('bounds AUTHORIZE CAPTURE facts for %s raw captures', async mode => {
    const h = boundaries({ [RPC.observe]: mode === 'duplicate' ? [
      { data: NATIVE_RECORDED },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ] : [], [RPC.bind]: [], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    if (mode === 'duplicate') {
      const first = { id: '3C679366HH908993F', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' };
      body.purchase_units[0].payments.captures = [first, structuredClone(first), { id: '9SECOND', status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' }];
    } else {
      body.purchase_units[0].payments.captures = mode === 'raw-33-unique' ? capturesAt(33)
        : [...capturesAt(32), structuredClone(capturesAt(32)[0])];
    }
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(mode === 'duplicate' ? 3 : 0);
    expect(recorded.map(call => call.args)).toEqual(mode === 'duplicate' ? [
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '9SECOND', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:9SECOND:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ] : []);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', ...(mode === 'duplicate' ? [RPC.observe, RPC.observe, RPC.observe] : [])]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // ORDER1과 CAPTURE32를 모두 응답 순서로 기록하며 잘린 반복을 검출한다.
  it('records the ORDER then all 32 actual AUTHORIZE CAPTURE facts at the raw bound', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: NATIVE_RECORDED },
      ...Array.from({ length: 32 }, () => ({ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } })),
    ], [RPC.bind]: [], [RPC.receive]: [] });
    const body = capturedOrder(); body.intent = 'AUTHORIZE';
    body.purchase_units[0].payments.captures = capturesAt(32);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(33);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      ...capturesAt(32).map(c => ({ p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: c.id, parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: `CAPTURE:${c.id}:COMPLETED`,
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } })),
    ]);
    expect(new Set(recorded.map(call => (call.args.p_evidence as any).payload_hash)).size).toBe(33);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', ...Array(33).fill(RPC.observe)]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 미지 ORDER 기록 누락과 bind 뒤로 옮긴 기록 순서를 검출한다.
  it('records the actual unknown ORDER status before binding the matching SUBMIT capture', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.bind]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('records the actual unknown ORDER status before binding a capture found by the first GET', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.observe, RPC.bind]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('still binds the actual capture once after the unknown-status ORDER record returns 503', async () => {
    const h = boundaries({ [RPC.observe]: [
      { status: 503, data: { code: 'XX000', message: 'Q7pPriv record unavailable' } }
    ], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.observe, RPC.bind]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('records the unknown ORDER status before refusing a different existing capture link', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_capture_id: '9EXISTINGCAP' } }] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(2);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } },
      { p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.observe, RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('does not record a CAPTURE from an AUTHORIZE POST with a malformed ORDER amount', async () => {
    const h = boundaries({ [RPC.observe]: [], [RPC.bind]: [], [RPC.receive]: [] });
    const body = capturedOrder(); body.intent = 'AUTHORIZE'; body.purchase_units[0].amount.value = '9.9';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture']);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls, dto: toPayPalChargeBrowserDto(ORDER, outcome) }))
      .not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTA1|MERCHANTB2|3C679366HH908993F|lease_token|quote_hash|credentialRef/);
  });

  it('keeps an AUTHORIZE LOOKUP at ORDER-only evidence without recording its CAPTURE', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: NATIVE_RECORDED }], [RPC.bind]: [], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [] });
    const body = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.observe]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.getter]).toHaveLength(0);
    expect(h.script[RPC.prepare]).toHaveLength(0); expect(h.script[RPC.claim]).toHaveLength(0);
    expect(h.script[RPC.intent]).toHaveLength(0); expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(recorded)).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls, dto: toPayPalChargeBrowserDto(ORDER, outcome) }))
      .not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTA1|MERCHANTB2|3C679366HH908993F|lease_token|quote_hash|credentialRef/);
  });

  it('keeps REVIEW and zero intake when reconcile rebinds the same capture after unknown status', async () => {
    const h = boundaries({ [RPC.observe]: [], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_capture_id: '3C679366HH908993F', review_required: true,
        payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true, attempt_id: ATTEMPT, row_version: '3' } }] });
    const body: any = capturedOrder();
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', status: 200, body });
    const outcome = await reconcilePayPalOrder(h.deps, input);
    const recorded = rpcCalls(h, RPC.observe); expect(recorded).toHaveLength(0);
    expect(recorded.map(call => call.args)).toEqual([]);
    expect(rpcCalls(h, RPC.bind).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify(rpcCalls(h, RPC.observe))).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

});
