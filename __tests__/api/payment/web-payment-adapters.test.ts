// @vitest-environment node
import { createHash } from 'node:crypto';
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
  // W2 durable result RPCs S1-S4. No default reply exists; a W2 scenario scripts each one explicitly.
  submission: 'record_web_payment_submission_result', open: 'open_web_payment_read_cycle',
  complete: 'complete_web_payment_read_cycle', preintent: 'record_web_payment_preintent_assertions',
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

type RpcDelivery = { data: unknown; status?: number };
// A function reply derives the scripted ACK from the actual request arguments (W2 S1/S3 echo fields).
type RpcReply = RpcDelivery | Promise<RpcDelivery>
  | ((args: Record<string, any>, script: Record<string, RpcReply[]>) => RpcDelivery);
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
    const { data, status = 200 } = await (typeof reply === 'function' ? reply(calls[calls.length - 1].args, script) : reply);
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
  // W1 transport contract: every RESPONSE double carries bodyStatus. A parsed JSON body is PARSED.
  // A null body uses the non-PARSED status of its scenario (EMPTY, INVALID_JSON or STREAM_ERROR).
  const transport = {
    requestToken: vi.fn().mockImplementation(async () => ({ accessToken: 'Q7pPriv-token' })),
    createOrder: vi.fn().mockImplementation(async () => ({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: providerOrder('CREATED') })),
    getOrder: vi.fn().mockImplementation(async () => ({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })),
    captureOrder: vi.fn().mockImplementation(async () => ({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: capturedOrder() })),
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

// W2 migration fixture for a legacy post-intent case. The S1 or S3 ACK replays the per-fact replies that the
// same case scripted for the old tape. Each sent fact takes, in order, one reply from the bind script (bind=true)
// or from the observe script (bind=false). An effective CLEAN result with a receive index takes one scripted
// receive reply as the intake that the DB made inside the RPC. A native REVIEW result makes the effective kind
// ADVERSE. A fact or an intake with no scripted reply, or with a failed reply, fails the whole RPC.
// The ACK is a delivery fixture. It is not evidence of a DB commit or of the DB effective result.
// hold replaces the default hold snapshot of the ACK. A case passes it when the modelled DB state is not the
// default for the effective kind, for example a sticky hold beside an INTAKE_HELD refusal.
function tapeAck(rpc: 'P1' | 'P2', hold?: Record<string, unknown>) {
  return (args: Record<string, any>, script: Record<string, RpcReply[]>): RpcDelivery => {
    const sent = rpc === 'P1' ? args.p_classification : args.p_completion;
    const take = (name: string) => {
      const reply = script[name]?.shift() as RpcDelivery | undefined;
      if (!reply || typeof reply !== 'object' || !('data' in reply) || (reply.status ?? 200) !== 200) throw new Error('Unscripted legacy reply');
      return reply.data as Record<string, unknown>;
    };
    const results = sent.facts.map((fact: { bind: boolean }) => {
      const native = take(fact.bind ? RPC.bind : RPC.observe);
      return { observation_id: native.observation_id, outcome: native.outcome, reason_code: native.reason_code };
    });
    const effective = sent.kind === 'ADVERSE' || results.some((result: { outcome: unknown }) => result.outcome === 'REVIEW_REQUIRED')
      ? 'ADVERSE' : sent.kind;
    const intake = effective === 'CLEAN' && sent.receive_fact_index !== null ? take(RPC.receive) : null;
    const common = { replayed: false, requested_kind: sent.kind, effective_kind: effective, db_adverse: effective === 'ADVERSE',
      fact_results: results, assertion_ids: [], intake,
      hold: hold ?? (effective === 'CLEAN' ? HOLD_CLEAR : effective === 'ADVERSE' ? HOLD_STICKY : HOLD_GET_ONLY) };
    return { data: rpc === 'P1'
      ? { contract_version: 'web-payment-submission-result.v1', outcome: 'CLASSIFIED', classification_id: CLASSIFICATION,
        effective_category: effective === sent.kind ? sent.category : 'DB_ADVERSE_OVERRIDE', ...common }
      : { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'COMPLETED', cycle_id: args.p_cycle_id, generation: '1', ...common } };
  };
}
// Facts of the one S1 payload (or of the one S3 completion) in the shape of the old per-fact tape, so that a
// migrated case compares them with its original literals. bind=true lists the facts that the old tape sent with
// the bind RPC, bind=false the facts that it sent with the record RPC. The order inside each list is the
// payload order. An S3 completion has no context field, so its p_context_id is the fixture constant.
function sentFacts(h: ReturnType<typeof boundaries>, bind: boolean, rpc: string = RPC.submission) {
  const args = rpcCalls(h, rpc)[0]?.args as Record<string, any> | undefined;
  const sent = args?.p_classification ?? args?.p_completion;
  return ((sent?.facts ?? []) as Array<{ bind: boolean; evidence: unknown }>).filter(fact => fact.bind === bind)
    .map(fact => ({ name: bind ? RPC.bind : RPC.observe, args: { p_context_id: sent.context_id ?? CONTEXT, p_evidence: fact.evidence } }));
}
// Every fact that W delivered to the DB, in call order: by a per-fact RPC outside the barrier (S0, S1, S6), then
// inside the S1 payload, then inside the S3 completion. bind selects the old bind RPC or the old record RPC
// meaning. A case that needs the RPC boundary asserts h.trail and the real RPC counts separately.
function deliveredFacts(h: ReturnType<typeof boundaries>, bind: boolean) {
  return [...rpcCalls(h, bind ? RPC.bind : RPC.observe), ...sentFacts(h, bind), ...sentFacts(h, bind, RPC.complete)];
}
// Script for one capture POST: one S1 ACK and, for an eligible NO_RESPONSE, one OPEN ACK and one S3 ACK.
// A case names this script explicitly. boundaries() itself has no S1, S2 or S3 reply.
function postIntentScript(overrides: Record<string, RpcReply[]> = {}): Record<string, RpcReply[]> {
  return { [RPC.submission]: [tapeAck('P1')], [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2')], ...overrides };
}
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
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: providerOrder('CREATED') })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder('APPROVED') });
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
    h.transport.createOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
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
  // W2 migration (P1): 'runs GET → claim → committed intent → one POST → actual CAPTURE bind → intake'.
  // Reason: the CAPTURE bind and the intake are inside the one S1 RPC. The actual CAPTURE literal is unchanged.
  it('runs GET → claim → committed intent → one POST → one atomic classification with the CAPTURE bind and the intake', async () => {
    const h = boundaries(postIntentScript());
    const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
    expect(rpcCalls(h, RPC.claim)).toEqual([{ name: RPC.claim, args: { p_actor_user_id: ACTOR, p_order_id: ORDER, p_expected_version: '1', p_action: 'CAPTURE' } }]);
    expect(rpcCalls(h, RPC.intent)).toEqual([{ name: RPC.intent, args: { p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_expected_version: '2', p_action: 'CAPTURE', p_attempt_id: ATTEMPT, p_lease_token: LEASE, p_fencing_version: '1' } }]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.captureOrder).toHaveBeenCalledWith(expect.objectContaining({ environment: 'SANDBOX',
      accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }));
    expect(h.transport.captureOrder.mock.calls[0][0].requestKey).not.toBe(CREATE_KEY);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent.context_id).toBe(CONTEXT);
    expect(sent.facts[1]).toMatchObject({ bind: true, evidence: { source: 'SUBMIT_RESPONSE',
      identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, status: 'COMPLETED',
      key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '999', currency: 'USD' } });
    expect(sent.receive_fact_index).toBe(1);
    // The scripted receive reply was taken once as the intake of the S1 ACK. W sent no receive RPC.
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).not.toHaveBeenCalled();
  });
  it.each([
    ['CREATED', 'NOT_APPROVED'], ['SAVED', 'NOT_APPROVED'], ['PAYER_ACTION_REQUIRED', 'NOT_APPROVED'],
    ['VOIDED', 'ORDER_VOIDED'], ['COMPLETED', 'SUBMISSION_UNKNOWN'], ['FUTURE_STATUS', 'REVIEW_REQUIRED'],
  ])('never claims or submits original ORDER %s without an actual completed capture', async (status, kind) => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder(status) });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expectNoSubmission(h); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  });
  it.each([' APPROVED', 'APPROVED ', 'A'.repeat(201), 'Q7pPriv\n'])
    ('does not record an unbounded or malformed provider status %#', async status => {
      const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder(status) });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome.kind).not.toBe('INTAKE_PENDING'); expectNoSubmission(h);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    });
  // W2 S6 migration: 'recovers a completed capture found before claim with no new submission'.
  // Reason: a COMPLETED capture without an intent is EXTERNAL_CAPTURE_WITHOUT_INTENT. W keeps the actual LOOKUP
  // observation and reports REVIEW. W creates no intake.
  it('records a completed capture found before claim as an intent-less observation with REVIEW and no intake', async () => {
    const h = boundaries({ [RPC.open]: [NOT_APPLICABLE_OPEN] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', external_id: '3C679366HH908993F' } });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expectIntentLessRead(h);
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
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expectNoSubmission(h); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
  });
  it('country conflict stays local REVIEW without falsifying evidence to manufacture sticky DB review', async () => {
    const h = boundaries(); const body = providerOrder(); body.payment_source.paypal.address.country_code = 'KR';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  });
  // W1 bodyStatus: a null body here is an empty 404 or an unreadable 200, not a parsed JSON null.
  it.each([
    { kind: 'TRANSPORT_UNKNOWN' }, { kind: 'RESPONSE', bodyStatus: 'EMPTY', status: 404, body: null },
    { kind: 'RESPONSE', bodyStatus: 'PARSED', status: 500, body: { message: 'Q7pPriv' } }, { kind: 'RESPONSE', bodyStatus: 'INVALID_JSON', status: 200, body: null },
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
    // W2 migration (P1): the same case with the S1 ACK in place of the direct bind and receive.
    const h = boundaries(postIntentScript({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '7' } }],
      [RPC.claim]: [{ data: { decision: 'BLOCKED', safe_reason_code: 'VERSION_MISMATCH', row_version: '7' } },
        { data: { ...NATIVE_CLAIMED, row_version: '8' } }],
      [RPC.intent]: [{ data: { ...NATIVE_INTENT, row_version: '9' } }] }));
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
    // W2 migration (P2): LOOKUP_ONLY shows that another sender has an intent, so the recovery read is a protected
    // read: OPEN ACK, one GET, one S3 completion. The preflight GET before the claim is separate.
    const h = boundaries({ [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2')],
      [RPC.claim]: [{ data: { decision: 'LOOKUP_ONLY', safe_reason_code: 'SUBMISSION_UNKNOWN',
        attempt_id: ATTEMPT, provider_request_key: ATTEMPT, fencing_version: '1', row_version: '3', quote_hash: HASH } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() });
    const result = await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.open)[0].args).toEqual({ p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'USER_CAPTURE' });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_ORDER_NO_CAPTURE', get_http_status: 200,
      observed_capture_ids: [], assertions: [], receive_fact_index: null });
    expect(completionSent.facts).toHaveLength(1);
    expect(completionSent.facts[0]).toMatchObject({ bind: false, evidence: { source: 'LOOKUP', identity_kind: 'ORDER',
      external_id: PROVIDER_ORDER, status: 'APPROVED', amount_minor: '999', currency: 'USD' } });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(rpcCalls(h, RPC.submission)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(h.script[RPC.receive]).toHaveLength(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
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
    // W2 control (spec 4/10 section 7): an unknown intent commit is not POST authority and permits no P1 or read cycle.
    expect(rpcCalls(h, RPC.submission)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
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
    // W2 migration (P1): the same provider status rows. The scripted receive reply stays unused.
    const h = boundaries(postIntentScript());
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: capturedOrder(status) });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind });
    expect(rpcCalls(h, RPC.submission)).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
    expect((rpcCalls(h, RPC.submission)[0].args.p_classification as any).facts.map((item: any) => item.evidence.status)).toContain(status);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
  });
  it('does not intake when capture amount differs from the fixed quote', async () => {
    // W2 migration (P1): the actual capture amount 1000 is one fact of the S1 payload.
    const h = boundaries(postIntentScript()); const body: any = capturedOrder(); body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toMatchObject({ kind: 'REVIEW_REQUIRED' });
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent.kind).toBe('ADVERSE');
    expect(sent.facts).toMatchObject([{ bind: false, evidence: { identity_kind: 'CAPTURE', external_id: '3C679366HH908993F',
      amount_minor: '1000', currency: 'USD', status: 'COMPLETED' } }]);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
  });
  it('stops intake after a durable observation REVIEW result', async () => {
    // W2 migration (P1): the native REVIEW of the bound CAPTURE is one fact result of the S1 ACK. W requested CLEAN.
    const h = boundaries(postIntentScript({ [RPC.bind]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_ID_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] }));
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect((rpcCalls(h, RPC.submission)[0].args.p_classification as any).kind).toBe('CLEAN');
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0);
  });
  // W1 bodyStatus: an empty 500 and a 201 whose body stream failed (response loss) are both unreadable.
  // W2 migration: the former HTTP 422 row moved to 'holds an HTTP 422 capture rejection as ADVERSE without a
  // protected recovery GET' (P1). Reason: spec 1/10 section 4 and 4/10 section 4 classify 422 as HTTP_REJECTED_4XX.
  it.each([
    { kind: 'TRANSPORT_UNKNOWN' }, { kind: 'RESPONSE', bodyStatus: 'EMPTY', status: 500, body: null },
    { kind: 'RESPONSE', bodyStatus: 'STREAM_ERROR', status: 201, body: null },
  ])('makes only one recovery GET after ambiguous mutation %#', async response => {
    // W2 migration (P1 then P2): the one recovery GET is now the protected GET after the NO_RESPONSE ACK and
    // the OPEN ACK. The actual LOOKUP CAPTURE is the bound fact of the one S3 completion.
    const h = boundaries(postIntentScript()); h.transport.captureOrder.mockResolvedValue(response);
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect((rpcCalls(h, RPC.submission)[0].args.p_classification as any)).toMatchObject({ kind: 'NO_RESPONSE', facts: [] });
    expect((rpcCalls(h, RPC.complete)[0].args.p_completion as any).facts[1]).toMatchObject({ bind: true,
      evidence: { source: 'LOOKUP', external_id: '3C679366HH908993F' } });
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  // W1 bodyStatus: the 404 recovery has an empty body.
  // W2 migration (P1 then P2): the same four recovery replies, each as one protected GET and one S3 completion.
  // The 404 row changed from SUBMISSION_UNKNOWN to REVIEW. Reason: G8 classifies a GET 404 as READ_HTTP_REJECTED
  // (ADVERSE). The other rows are NO_DATA or a CLEAN read with no capture and stay SUBMISSION_UNKNOWN.
  it.each([
    [{ kind: 'TRANSPORT_UNKNOWN' }, 'NO_DATA', 'READ_TRANSPORT_UNKNOWN', 'SUBMISSION_UNKNOWN'],
    [{ kind: 'RESPONSE', bodyStatus: 'EMPTY', status: 404, body: null }, 'ADVERSE', 'READ_HTTP_REJECTED', 'REVIEW_REQUIRED'],
    [{ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() }, 'CLEAN', 'READ_ORDER_NO_CAPTURE', 'SUBMISSION_UNKNOWN'],
    [{ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder('COMPLETED') }, 'CLEAN', 'READ_ORDER_NO_CAPTURE', 'SUBMISSION_UNKNOWN'],
  ] as const)('keeps unknown after inconclusive recovery %# without a second POST or new-order suggestion', async (response, kind, category, state) => {
    const h = boundaries(postIntentScript()); h.transport.captureOrder.mockResolvedValue({ kind: 'TRANSPORT_UNKNOWN' });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() }).mockResolvedValueOnce(response);
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: state });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state, newOrderAllowed: false });
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.complete)[0].args.p_completion).toMatchObject({ kind, category });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
  });
  // W2 migration: 'preserves intake failure after confirmed capture and never retries POST' became
  // 'atomic classification ACK failure after a confirmed capture never calls receive directly' (P1 ACK failure).
  // Reason: W no longer calls receive. The intake runs inside S1, so a direct receive 503 cannot occur.
});

describe('RECONCILE observes and STATUS reads without any charge command', () => {
  it('does no external work when a provider ORDER link is absent', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_order_id: null } }] });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'NO_PROVIDER_ORDER' });
    expectNoProvider(h); expect(h.calls).toHaveLength(1);
  });
  // W2 S6 migration: the COMPLETED row changed from INTAKE_PENDING with one direct receive to REVIEW with no receive.
  // Reason: an intent-less COMPLETED capture is EXTERNAL_CAPTURE_WITHOUT_INTENT. The other provider status rows,
  // the actual LOOKUP bind and the no-claim controls are unchanged.
  it.each([
    ['COMPLETED', 'REVIEW_REQUIRED'], ['PENDING', 'CAPTURE_PENDING'], ['DECLINED', 'CAPTURE_FAILED'],
    ['FAILED', 'CAPTURE_FAILED'], ['REFUNDED', 'REVIEW_REQUIRED'], ['PARTIALLY_REFUNDED', 'REVIEW_REQUIRED'],
  ])('reconciles actual capture %s without claim, intent, create or capture POST', async (status, kind) => {
    const h = boundaries({ [RPC.open]: [NOT_APPLICABLE_OPEN] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder(status) });
    expect(await reconcilePayPalOrder(h.deps, input)).toMatchObject({ kind });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.transport.createOrder).not.toHaveBeenCalled(); expect(h.transport.captureOrder).not.toHaveBeenCalled();
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.bind)[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', status, external_id: '3C679366HH908993F' } });
    expectIntentLessRead(h);
  });
  it('recovers existing intent after actor deletion and quote expiry without fresh mutation authority', async () => {
    // W2 migration (P2): the recovery GET of an order with an intent is one protected read cycle. The intake is
    // inside the S3 ACK.
    const h = boundaries({ [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2')],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, actor_deleted: true, payment_state: 'SUBMISSION_UNKNOWN',
        submission_intent_recorded: true, attempt_id: ATTEMPT, quote_expires_at: '2020-01-01T00:00:00.123456Z' } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
    expect(h.transport.captureOrder).not.toHaveBeenCalled(); expect(rpcCalls(h, RPC.prepare)).toHaveLength(1);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.open)[0].args.p_actor_kind).toBe('USER_CAPTURE');
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
  });
  // W2 migration (P2): the order now has a committed intent, and each of the two workflow invocations is one
  // protected read cycle. The duplicate intake is the native replay that the S3 ACK returns.
  // Reason: W never calls receive, and an intent-less first read cannot create an intake.
  it('keeps duplicate intake as replay with the same order and capture identity', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }, { data: { ...INTENT_FOUND,
      settlement_state: 'INTAKE_PENDING', provider_capture_id: '3C679366HH908993F' } }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }],
      [RPC.open]: [OPENED_ACK, { data: { ...(OPENED_ACK.data as object), cycle_id: SECOND_CYCLE,
        cycle_token: SECOND_CYCLE_TOKEN, generation: '2' } }],
      [RPC.complete]: [p2Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR }),
        p2Ack({ intake: { ...NATIVE_INTAKE, replayed: true }, hold: HOLD_CLEAR, generation: '2' })] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.complete)).toHaveLength(1);
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'INTAKE_PENDING', replayed: true });
    expect(rpcCalls(h, RPC.open).map(call => call.args.p_actor_kind)).toEqual(['USER_RECONCILE', 'USER_RECONCILE']);
    expect(rpcCalls(h, RPC.complete).map(call => [call.args.p_cycle_id, call.args.p_cycle_token,
      (call.args.p_completion as any).observed_capture_ids,
      (call.args.p_completion as any).receive_fact_index])).toEqual([
      [CYCLE, CYCLE_TOKEN, ['3C679366HH908993F'], 1],
      [SECOND_CYCLE, SECOND_CYCLE_TOKEN, ['3C679366HH908993F'], 1]]);
    for (const call of rpcCalls(h, RPC.complete)) {
      expect((call.args.p_completion as any).facts).toContainEqual(
        { evidence: fact('LOOKUP', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: true });
    }
    expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
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
    // W2 migration (P1): the one POST has one S1 ACK. The one intake is inside that ACK.
    const h = boundaries(postIntentScript({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: NATIVE_FOUND }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }],
      [RPC.claim]: [{ data: NATIVE_CLAIMED }, { data: { decision: 'BLOCKED', safe_reason_code: 'LEASE_ACTIVE' } }] }));
    h.transport.getOrder.mockImplementation(async () => { lookups++; if (lookups === 2) bothLookup.resolve();
      await bothLookup.promise; return { kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() }; });
    const outcomes = await Promise.all([capturePayPalOrder(h.deps, approvedInput), capturePayPalOrder(h.deps, approvedInput)]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(2);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.submission)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcomes.filter(outcome => outcome.kind === 'INTAKE_PENDING')).toHaveLength(1);
  });
  it('expired holder A cannot POST after delayed stale intent while holder B submits once', async () => {
    const staleIntent = deferred<{ data: unknown }>(); const intentEntered = deferred<void>();
    // W2 migration (P1): holder B sends the one S1 RPC with its own fence 2 and lease. Holder A sends none.
    const h = boundaries(postIntentScript({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, row_version: '2' } }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }],
      [RPC.claim]: [{ data: NATIVE_CLAIMED }, { data: { ...NATIVE_CLAIMED, row_version: '3', fencing_version: '2',
        lease_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', submit_not_after: '2026-11-14T00:02:00.123456+00:00' } }],
      [RPC.intent]: [staleIntent.promise, { data: { ...NATIVE_INTENT, row_version: '4', fencing_version: '2',
        lease_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', submit_not_after: '2026-11-14T00:02:00.123456+00:00' } }] }));
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
    expect(rpcCalls(h, RPC.submission).map(call => [call.args.p_fencing_version, call.args.p_lease_token]))
      .toEqual([['2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']]);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
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
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
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
    // W2 migration (P1): the same check with the S1 ACK.
    const h = boundaries(postIntentScript()); const result = await capturePayPalOrder(h.deps, approvedInput);
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
  // W2 migration (P1 then P2) of the H1 group. Each case keeps its original official or minimal POST fixture and
  // its original recovery GET. The minimal POST is PARTIAL_UNCONTRADICTED (NO_RESPONSE, no fact). The recovery GET
  // is the one protected GET after the S1 ACK and the OPEN ACK. The LOOKUP facts are in the one S3 completion:
  // the actual ORDER fact first, then the CAPTURE fact that the old tape sent with the bind RPC.
  ])('recovers %s without manufacturing merchant, reference or amount', async (_label, status, body) => {
    const h = boundaries(postIntentScript({ [RPC.getter]: [{ data: { ...NATIVE_FOUND, amount_minor: '10000' } }] }));
    const approved = providerOrder(); approved.purchase_units[0].amount.value = '100.00';
    const lookedUp = capturedOrder(); lookedUp.purchase_units[0].amount.value = '100.00';
    lookedUp.purchase_units[0].payments.captures[0].amount = { currency_code: 'USD', value: '100.00' };
    lookedUp.purchase_units[0].payments.captures[0].id = '3C679366HH908993F';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: approved })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookedUp });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ context_id: CONTEXT, kind: 'NO_RESPONSE',
      category: 'PARTIAL_UNCONTRADICTED', http_status: status, body_status: 'PARSED', post_capture_ids: ['3C679366HH908993F'],
      facts: [], assertions: [], receive_fact_index: null });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', get_http_status: 200,
      observed_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: 1 });
    expect(completionSent.facts).toHaveLength(2);
    expect(completionSent.facts[0]).toMatchObject({ bind: false, evidence: {
      source: 'LOOKUP', identity_kind: 'ORDER', external_id: PROVIDER_ORDER, parent_external_id: null,
      amount_minor: '10000', currency: 'USD', status: 'COMPLETED', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(completionSent.facts[1]).toMatchObject({ bind: true, evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      amount_minor: '10000', currency: 'USD', status: 'COMPLETED', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    // No per-fact RPC and no direct receive. The S3 ACK took the one scripted reply for each fact and the intake.
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
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
      // The POST capture IDs that W sends to the DB. A missing unit gives an unknown set (null). A capture
      // entry without an id gives an empty set. Every other row, including the row without the parent ORDER id,
      // gives the one actual POST capture ID.
      const postIds = _field === 'units' ? null : _field === 'capture-id' ? [] : ['3C679366HH908993F'];
      const lookupId = ['id', 'units', 'capture-id'].includes(_field) ? '9LOOKUPCAP' : '3C679366HH908993F';
      // Row 'id': W sent POST ID 3C679366HH908993F and the GET reports 9LOOKUPCAP. The DB owns that comparison.
      // The S3 ACK of this row is therefore scripted as the DB downgrade to ADVERSE, and the outcome is REVIEW.
      // Before W2 this row ended with an intake, because W dropped a POST capture ID that had no parent ORDER id.
      const divergent = _field === 'id';
      const h = boundaries(postIntentScript(divergent ? { [RPC.complete]: [p2Ack({ effectiveKind: 'ADVERSE' })] } : {}));
      const body = capturedOrder(); remove(body);
      const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = lookupId;
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: httpStatus, body });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
      expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual(divergent ? { kind: 'REVIEW_REQUIRED' }
        : { kind: 'INTAKE_PENDING', replayed: false });
      expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
      expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ context_id: CONTEXT, kind: 'NO_RESPONSE',
        category: 'PARTIAL_UNCONTRADICTED', http_status: httpStatus, body_status: 'PARSED', post_capture_ids: postIds,
        facts: [], assertions: [], receive_fact_index: null });
      const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
      expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', get_http_status: 200,
        observed_capture_ids: [lookupId], assertions: [], receive_fact_index: 1 });
      expect(completionSent.facts).toHaveLength(2);
      expect(completionSent.facts[0]).toMatchObject({ bind: false, evidence: {
        source: 'LOOKUP', identity_kind: 'ORDER', external_id: PROVIDER_ORDER, parent_external_id: null,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      } });
      expect(completionSent.facts[1]).toMatchObject({ bind: true, evidence: {
        source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: lookupId, parent_external_id: PROVIDER_ORDER,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      } });
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      // Every row except the divergent one takes the scripted receive reply once as the intake of the S3 ACK.
      expect(h.script[RPC.receive]).toHaveLength(divergent ? 1 : 0);
    });
  });

  it.each(['transport', 'incomplete', 'merchant-conflict', 'no-capture'])
    ('keeps an incomplete POST closed after %s recovery without another POST', async mode => {
      // Row 'no-capture': W sent POST ID 3C679366HH908993F and the GET reports no capture. The DB owns that
      // comparison (G9: E={X} with an empty observed set is a divergence). The S3 ACK of this row is therefore
      // scripted as the DB downgrade to ADVERSE, and the outcome changed from SUBMISSION_UNKNOWN to REVIEW.
      const h = boundaries(postIntentScript(mode === 'no-capture' ? { [RPC.complete]: [p2Ack({ effectiveKind: 'ADVERSE' })] } : {}));
      const post: any = capturedOrder(); delete post.intent;
      const recovery: any = mode === 'no-capture' ? providerOrder('COMPLETED') : capturedOrder();
      if (mode === 'incomplete') delete recovery.purchase_units[0].payee.merchant_id;
      if (mode === 'merchant-conflict') recovery.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
        .mockResolvedValueOnce(mode === 'transport' ? { kind: 'TRANSPORT_UNKNOWN' } : { kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: recovery });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: mode === 'transport' ? 'SUBMISSION_UNKNOWN' : 'REVIEW_REQUIRED' });
      expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
      expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
      expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
      expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
      expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
        category: 'PARTIAL_UNCONTRADICTED', http_status: 201, post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [] });
      const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
      expect(completionSent.receive_fact_index).toBeNull();
      if (mode === 'transport') {
        expect(completionSent).toMatchObject({ kind: 'NO_DATA', category: 'READ_TRANSPORT_UNKNOWN', observed_capture_ids: null,
          facts: [], assertions: [] });
      }
      if (mode === 'incomplete') {
        // The GET has no merchant, so no ORDER or CAPTURE fact can be built. The judgment is a caller assertion.
        expect(completionSent).toMatchObject({ kind: 'ADVERSE', category: 'READ_PARTIAL_INDETERMINATE',
          observed_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [{ code: 'UNREPRESENTABLE_CONTRADICTION', detail: {} }] });
      }
      if (mode === 'merchant-conflict') {
        expect(completionSent).toMatchObject({ kind: 'ADVERSE', category: 'READ_ADVERSE_FACT',
          observed_capture_ids: ['3C679366HH908993F'], assertions: [] });
        expect(completionSent.facts).toHaveLength(1);
        expect(completionSent.facts[0]).toMatchObject({ bind: false, evidence: { identity_kind: 'ORDER', external_id: PROVIDER_ORDER,
          source: 'LOOKUP', status: 'COMPLETED', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' },
        } });
        expect(h.script[RPC.observe]).toHaveLength(0);
      }
      if (mode === 'no-capture') {
        expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_ORDER_NO_CAPTURE', observed_capture_ids: [], assertions: [] });
        expect(completionSent.facts).toHaveLength(1);
        expect(completionSent.facts[0]).toMatchObject({ bind: false, evidence: { identity_kind: 'ORDER', external_id: PROVIDER_ORDER,
          source: 'LOOKUP', status: 'COMPLETED', amount_minor: '999', currency: 'USD',
          scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' } } });
      }
    });

  it.each([
    ['id', (b: any) => { b.id = '9OTHERORDER'; }],
    ['amount', (b: any) => { b.purchase_units[0].amount.value = '10.00'; }],
    ['merchant', (b: any) => { b.purchase_units[0].payee.merchant_id = 'MERCHANTB2'; }],
    ['reference', (b: any) => { b.purchase_units[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999'; }],
    ['capture-amount', (b: any) => { b.purchase_units[0].payments.captures[0].amount.value = '10.00'; }],
  ])('does not use a corrective GET to overwrite a real post-response %s conflict', async (_field, mutate) => {
    // W2 migration (P1): the one actual contradictory fact of the old record RPC is the one fact of the S1
    // payload with bind=false. The ADVERSE result sends no protected GET.
    const h = boundaries(postIntentScript()); const body = capturedOrder(); mutate(body);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    expect(sent.facts).toHaveLength(1);
    expect(sent.facts[0]).toMatchObject({ bind: false, evidence: { source: 'SUBMIT_RESPONSE', status: 'COMPLETED',
      identity_kind: _field === 'capture-amount' ? 'CAPTURE' : 'ORDER' } });
    // The S1 ACK took the one scripted record reply for this fact. The scripted receive reply stays unused.
    expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    const e = sent.facts[0].evidence;
    if (_field === 'id') expect(e.external_id).toBe('9OTHERORDER');
    if (_field === 'amount' || _field === 'capture-amount') expect(e.amount_minor).toBe('1000');
    if (_field === 'merchant') expect(e.scope).toEqual({ account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' });
    if (_field === 'reference') expect(e.order_reference).toBe('v2:99999999-9999-4999-8999-999999999999');
  });
});

describe('M2 post-intent conflicts preserve actual attributable capture evidence without intake', () => {
  it.each(['country', 'multiple', 'malformed-first', 'malformed-second'])
    ('binds the valid actual capture and preserves %s conflict without synthetic evidence', async mode => {
      // W2 migration (P1): the bound CAPTURE and, for the multiple row, the second CAPTURE are the facts of the
      // one S1 payload in the old order. The W judgment (country or shape) is a caller assertion beside them.
      const h = boundaries(postIntentScript({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND',
        trust: 'SERVER_REPORTED', observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } }] }));
      const body: any = capturedOrder();
      const second = { id: '9SECOND', status: 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
        custom_id: 'v2:11111111-1111-4111-8111-111111111111' };
      if (mode === 'country') body.payment_source.paypal.address.country_code = 'KR';
      if (mode === 'multiple') body.purchase_units[0].payments.captures.push(second);
      if (mode === 'malformed-first') body.purchase_units[0].payments.captures.unshift({ id: '../bad' });
      if (mode === 'malformed-second') body.purchase_units[0].payments.captures.push({ id: '../bad' });
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
      expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
      expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission]);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
      expect(sent).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null,
        post_capture_ids: mode === 'multiple' ? ['3C679366HH908993F', '9SECOND'] : ['3C679366HH908993F'],
        unparseable_capture_count: mode === 'malformed-first' || mode === 'malformed-second' ? 1 : 0,
        assertions: [{ code: mode === 'country' ? 'COUNTRY_MISMATCH' : 'SHAPE_CONTRADICTION', detail: {} }] });
      expect(sent.facts.map((item: any) => item.bind)).toEqual(mode === 'multiple' ? [true, false] : [true]);
      // The S1 ACK took the default bind reply. Only the multiple row took the scripted record REVIEW reply.
      expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(mode === 'multiple' ? 0 : 1);
      const bound = sentFacts(h, true); expect(bound).toHaveLength(1);
      const expectedEvidence = { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        key: 'CAPTURE:3C679366HH908993F:COMPLETED' };
      expect(bound[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: expectedEvidence });
      expect((bound[0].args.p_evidence as any).payload_hash).toMatch(/^[0-9a-f]{64}$/);
      const recorded = sentFacts(h, false); expect(recorded).toHaveLength(mode === 'multiple' ? 1 : 0);
      if (mode === 'multiple') {
        expect(recorded[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: { ...expectedEvidence,
          external_id: '9SECOND', status: 'PENDING', key: 'CAPTURE:9SECOND:PENDING' } });
      }
      // A real second ID can yield sticky identity REVIEW. Country is only local REVIEW.
      // No status, scope, amount, or order reference is altered to force DB REVIEW.
      expect(JSON.stringify([...bound, ...recorded])).not.toMatch(/COUNTRY_MISMATCH|Q7pPriv|\.\.\/bad|update_time|links/);
    });

  it.each(['invalid-id', 'invalid-status', 'invalid-amount', 'missing-reference', 'missing-merchant', 'foreign-parent'])
    ('refuses %s without inventing attributable CAPTURE evidence', async mode => {
      // W2 migration (P1, and P1 then P2 for the two missing-field rows): no row sends a CAPTURE fact. A missing
      // binding field is a partial POST, so its one recovery GET is the protected GET.
      const h = boundaries(postIntentScript()); const body: any = capturedOrder();
      if (mode !== 'missing-reference' && mode !== 'missing-merchant') body.payment_source.paypal.address.country_code = 'KR';
      if (mode === 'invalid-id') body.purchase_units[0].payments.captures[0].id = '../bad';
      if (mode === 'invalid-status') body.purchase_units[0].payments.captures[0].status = 'bad status';
      if (mode === 'invalid-amount') body.purchase_units[0].payments.captures[0].amount.value = '9.990';
      if (mode === 'missing-reference') delete body.purchase_units[0].custom_id;
      if (mode === 'missing-merchant') delete body.purchase_units[0].payee.merchant_id;
      if (mode === 'foreign-parent') body.id = '9OTHERORDER';
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
      // A missing binding field may trigger one strict recovery lookup; it must not authorize receipt.
      if (mode === 'missing-reference' || mode === 'missing-merchant') {
        h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
          .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
      }
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(mode === 'missing-reference' || mode === 'missing-merchant' ? 2 : 1);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      const recovered = mode === 'missing-reference' || mode === 'missing-merchant';
      expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual(recovered ? [RPC.submission, RPC.open, 'get', RPC.complete] : [RPC.submission]);
      expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
      const completionSent = rpcCalls(h, RPC.complete)[0]?.args.p_completion as any;
      const captureEvidence = [...sent.facts, ...(completionSent?.facts ?? [])].filter((item: any) => item.evidence.identity_kind === 'CAPTURE');
      expect(captureEvidence).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
      if (recovered) {
        expect(sent).toMatchObject({ kind: 'NO_RESPONSE', category: 'PARTIAL_UNCONTRADICTED', post_capture_ids: ['3C679366HH908993F'],
          facts: [], assertions: [] });
        // The GET repeats the same partial body. No ORDER tuple of this order can be confirmed from it.
        expect(completionSent).toMatchObject({ kind: 'ADVERSE', category: 'READ_PARTIAL_INDETERMINATE',
          observed_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [{ code: 'UNREPRESENTABLE_CONTRADICTION', detail: {} }],
          receive_fact_index: null });
      } else {
        expect(sent).toMatchObject({ kind: 'ADVERSE', receive_fact_index: null,
          post_capture_ids: mode === 'invalid-id' ? [] : ['3C679366HH908993F'], unparseable_capture_count: mode === 'invalid-id' ? 1 : 0 });
        expect(sent.assertions).toContainEqual({ code: 'COUNTRY_MISMATCH', detail: {} });
        // Only the foreign-parent row has a representable fact: the actual ORDER with the other provider ID.
        expect(sent.facts.map((item: any) => [item.bind, item.evidence.identity_kind, item.evidence.external_id]))
          .toEqual(mode === 'foreign-parent' ? [[false, 'ORDER', '9OTHERORDER']] : []);
      }
      expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
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
    // W2 S6 migration: this intent-less read ended with INTAKE_PENDING and one direct receive. It now ends with
    // REVIEW and no receive. The prepare, binding, resolver, token and one-GET order and the LOOKUP bind are unchanged.
    const h = boundaries({ [RPC.open]: [NOT_APPLICABLE_OPEN] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput) : await reconcilePayPalOrder(h.deps, input);
    expect(result).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(withoutOpen(h)).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.bind]);
    expect(rpcCalls(h, RPC.prepare)).toEqual([{ name: RPC.prepare, args: { p_actor_user_id: ACTOR, p_order_id: ORDER } }]);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(1); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expectIntentLessRead(h);
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
    // W2 migration (P2): the order has an intent, so the one GET is a protected read. The actual LOOKUP CAPTURE
    // is the bound fact of the one S3 completion. The sticky REVIEW outcome is unchanged.
    const h = boundaries({ [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2')],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true, actor_deleted: true,
        submission_intent_recorded: true, payment_state: 'SUBMISSION_UNKNOWN', attempt_id: ATTEMPT,
        quote_expires_at: '2020-01-01T00:00:00.123456Z' } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder(status) });
    const outcome = operation === 'reconcile' ? await reconcilePayPalOrder(h.deps, input) : await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    const boundFacts = (rpcCalls(h, RPC.complete)[0].args.p_completion as any).facts.filter((item: any) => item.bind);
    expect(boundFacts).toHaveLength(1);
    expect({ p_evidence: boundFacts[0].evidence }).toMatchObject({ p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status, amount_minor: '999', currency: 'USD', order_reference: 'v2:11111111-1111-4111-8111-111111111111',
      scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
  });
  it('can reconcile a review-only context without requiring a new submission intent', async () => {
    // W2 S6 migration: the getter shows no intent, and S2 OPEN gives the authoritative NOT_APPLICABLE.
    const h = boundaries({ [RPC.open]: [NOT_APPLICABLE_OPEN], [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true } }] });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.bind)).toHaveLength(1);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
  it('keeps review-only recovery closed when GET fails, while still attempting exactly one GET', async () => {
    // W2 S6 migration: the getter shows no intent, and S2 OPEN gives the authoritative NOT_APPLICABLE.
    const h = boundaries({ [RPC.open]: [NOT_APPLICABLE_OPEN], [RPC.getter]: [{ data: { ...NATIVE_FOUND, review_required: true } }] });
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
    h.transport.createOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: providerOrder('FUTURE_STATUS') });
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
    // W2 migration (P1): the intake refusal now arrives inside the S1 ACK and is logged as a held intake.
    ['intake-review', 'HELD', 'warn', 'payment.paypal.charge.intake.held', { kind: 'REVIEW_REQUIRED' }],
  ])('logs %s with exact safe stage, severity and fields', async (scenario, stage, level, code, outcome) => {
    const h = boundaries();
    // W2 migration (P1, and P2 for post-unknown): only the three rows that send the capture POST get the S1,
    // OPEN and S3 ACK fixtures.
    if (['refund', 'post-unknown', 'intake-review'].includes(scenario as string)) Object.assign(h.script, postIntentScript());
    if (scenario === 'context-error') h.script[RPC.getter] = [{ status: 503, data: { code: 'XX000', message: 'Q7pPriv token secret' } }];
    if (scenario === 'prepare-refused' || scenario === 'create-unknown' || scenario === 'bind-review') {
      h.script[RPC.getter] = [{ data: { ...NATIVE_FOUND, provider_order_id: null } }];
    }
    if (scenario === 'prepare-refused') h.script[RPC.prepare] = [{ status: 400, data: { code: 'P0001', message: 'WEB_PAYMENT_ORDERS_CLOSED' } }];
    if (scenario === 'create-unknown' || scenario === 'lookup-unknown') h.script[RPC.observe] = [{ data: {
      outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false,
    } }];
    if (scenario === 'create-unknown') h.transport.createOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: providerOrder('FUTURE_STATUS') });
    if (scenario === 'bind-review') h.script[RPC.bind] = [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_ID_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }];
    if (scenario === 'refund') h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: capturedOrder('REFUNDED') });
    if (scenario === 'lookup-unknown') h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder('FUTURE_STATUS') });
    if (scenario === 'lease-short') h.script[RPC.claim] = [{ data: { ...NATIVE_CLAIMED, submit_not_after: '2026-11-14T00:00:10.122456+00:00' } }];
    if (scenario === 'post-unknown') {
      h.transport.captureOrder.mockRejectedValue(new Error('Q7pPriv token secret'));
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder('COMPLETED') });
    }
    if (scenario === 'intake-review') h.script[RPC.receive] = [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'EXISTING_PURCHASE_IDENTITY', grant_eligible: false } }];
    const result = ['prepare-refused', 'create-unknown', 'bind-review'].includes(scenario as string)
      ? await ensurePayPalProviderOrder(h.deps, input) : await capturePayPalOrder(h.deps, approvedInput);
    expect(result).toEqual(outcome);
    expect(h.log.mock.calls).toEqual([[{ stage, level, code, orderId: ORDER }]]);
    expect(JSON.stringify({ result, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|3C679366HH908993F|ACCOUNTA1|MERCHANTA1|55555555|44444444|credential|email/);
    const submitted = ['refund', 'post-unknown', 'intake-review'].includes(scenario as string);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(submitted ? 1 : 0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)).toHaveLength(submitted ? 1 : 0);
    // The intake-review row takes its scripted receive refusal once as the intake of the S1 ACK.
    expect(h.script[RPC.receive]).toHaveLength(scenario === 'intake-review' ? 0 : 1);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(submitted || scenario === 'lease-short' ? 1 : 0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(submitted ? 1 : 0);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(scenario === 'create-unknown' || scenario === 'bind-review' ? 1 : 0);
  });
  it('logs only the bounded HTTP status for original lookup failure', async () => {
    const h = boundaries(); h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 503, body: { message: 'Q7pPriv' } });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'UNAVAILABLE', stage: 'LOOKUP' });
    expect(h.log.mock.calls).toEqual([[{ stage: 'LOOKUP', level: 'warn', code: 'payment.paypal.charge.lookup.failed', orderId: ORDER, httpStatus: 503 }]]);
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  });
  it('continues the same closed outcome when the logger throws a secret-bearing exception', async () => {
    // W2 migration (P1 then P2): the lost POST response has an S1 ACK, an OPEN ACK and one protected GET.
    const h = boundaries(postIntentScript()); h.log.mockImplementation(() => { throw new Error('Q7pPriv logger secret'); });
    h.transport.captureOrder.mockRejectedValue(new Error('Q7pPriv provider secret'));
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder('COMPLETED') });
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
    // W2 migration (P1): at the bound, the CAPTURE that the old tape bound and the 31 CAPTURE facts that it
    // recorded are the 32 facts of the one S1 payload in the same order. Above the bound the payload has no fact.
    const h = boundaries({ ...postIntentScript(), [RPC.observe]: Array.from({ length: 31 }, (_unused, index) => ({ data: {
      outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
      observation_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, replayed: false,
    } })) });
    const body = capturedOrder();
    body.purchase_units[0].payments.captures = Array.from({ length: count }, (_unused, index) => ({
      id: `CAP${index}`, status: index === 0 ? 'COMPLETED' : 'PENDING', amount: { currency_code: 'USD', value: '9.99' },
      custom_id: 'v2:11111111-1111-4111-8111-111111111111',
    }));
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    const bound = sentFacts(h, true); const recorded = sentFacts(h, false);
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
      expect(sent.facts.map((item: any) => item.bind)).toEqual([true, ...Array(31).fill(false)]);
      expect(sent.capture_count_exceeded).toBe(false); expect(sent.post_capture_ids).toHaveLength(32);
      expect(sent.post_capture_ids.slice(0, 2)).toEqual(['CAP0', 'CAP1']); expect(sent.post_capture_ids[31]).toBe('CAP31');
      // The S1 ACK took the default bind reply and each of the 31 scripted record replies once.
      expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    } else {
      // 32 is a local work bound. The 33-entry response is not partially persisted.
      expect(sent).toMatchObject({ category: 'WORK_BOUND_EXCEEDED', capture_count_exceeded: true, post_capture_ids: null,
        facts: [], assertions: [] });
      expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(31);
    }
  });
  it('does not invent a competing identity for an identical repeated capture ID', async () => {
    // W2 migration (P1): the repeated ID is one fact of the one S1 payload, with bind=true as on the old tape.
    const h = boundaries(postIntentScript()); const body = capturedOrder();
    body.purchase_units[0].payments.captures.push(structuredClone(body.purchase_units[0].payments.captures[0]));
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE',
      post_capture_ids: ['3C679366HH908993F'], assertions: [{ code: 'SHAPE_CONTRADICTION', detail: {} }], receive_fact_index: null });
    expect(sentFacts(h, true)).toHaveLength(1); expect(sentFacts(h, false)).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(sentFacts(h, true)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
    } });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  it('prefers the existing linked capture even when another valid actual ID appears first', async () => {
    // W2 migration (P2): the order has an intent, so the GET is a protected read. The linked CAPTURE 9SECOND
    // that the old tape bound is the first fact with bind=true. The other actual CAPTURE follows with bind=false.
    const h = boundaries({ [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2')],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_capture_id: '9SECOND',
      payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true, attempt_id: ATTEMPT } }],
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } }] });
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push({ id: '9SECOND', status: 'PENDING',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'ADVERSE', get_http_status: 200, receive_fact_index: null,
      observed_capture_ids: ['3C679366HH908993F', '9SECOND'], assertions: [{ code: 'SHAPE_CONTRADICTION', detail: {} }] });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.external_id]))
      .toEqual([[true, '9SECOND'], [false, '3C679366HH908993F']]);
    // The S3 ACK took the default bind reply and the scripted record REVIEW reply once each.
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(sentFacts(h, true, RPC.complete)).toHaveLength(1); expect(sentFacts(h, false, RPC.complete)).toHaveLength(1);
    expect(sentFacts(h, true, RPC.complete)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '9SECOND', parent_external_id: PROVIDER_ORDER,
      status: 'PENDING', key: 'CAPTURE:9SECOND:PENDING', amount_minor: '999', currency: 'USD',
    } });
    expect(sentFacts(h, false, RPC.complete)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '999', currency: 'USD',
    } });
    expectNoSubmission(h); expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  });
});

describe('M2 observation faults preserve actual candidates without another bind or intake', () => {
  it('records remaining actual candidates after the selected bind returns REVIEW', async () => {
    // W2 migration (P1): the selected CAPTURE (bind=true) and the remaining CAPTURE (bind=false) are the two
    // facts of the one S1 payload. The two scripted native REVIEW replies are the two fact results of the S1 ACK.
    const h = boundaries({ ...postIntentScript(), [RPC.bind]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'PROVIDER_ID_CONFLICT',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }],
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } }] });
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push({ id: '9SECOND', status: 'PENDING',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE',
      post_capture_ids: ['3C679366HH908993F', '9SECOND'], assertions: [{ code: 'SHAPE_CONTRADICTION', detail: {} }], receive_fact_index: null });
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(sentFacts(h, true)).toHaveLength(1); expect(sentFacts(h, false)).toHaveLength(1);
    expect(sentFacts(h, true)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(sentFacts(h, false)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '9SECOND', parent_external_id: PROVIDER_ORDER,
      status: 'PENDING', amount_minor: '999', currency: 'USD', key: 'CAPTURE:9SECOND:PENDING',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect((rpcCalls(h, RPC.submission)[0].args.p_classification as any).facts.map((item: any) => item.bind)).toEqual([true, false]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
  });
  // W2 migration: 'records the same selected evidence once after bind response loss and then the remaining actual
  // candidate' became 'atomic mixed-capture classification ACK loss does not replay facts one by one' (P1 ACK loss).
  // W2 migration: 'attempts the next remaining actual ID in response order after the first record returns 503' became
  // 'atomic multi-capture POST failure does not continue per-fact delivery' (P1 failure).
  // Reason: one S1 RPC carries the same actual facts in response order. No per-fact RPC follows a failed delivery.
  it('preserves different actual statuses of the same ID as separate observations without renaming it', async () => {
    // W2 migration (P1): the two statuses of the one ID are two facts of the one S1 payload. The first
    // (PENDING) has bind=true as on the old tape. The ID appears once in post_capture_ids.
    const h = boundaries(postIntentScript()); const body = capturedOrder('PENDING');
    body.purchase_units[0].payments.captures.push({ id: '3C679366HH908993F', status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail.slice(h.trail.indexOf('capture') + 1)).toEqual([RPC.submission]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE',
      post_capture_ids: ['3C679366HH908993F'], assertions: [{ code: 'SHAPE_CONTRADICTION', detail: {} }], receive_fact_index: null });
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(sentFacts(h, true)).toHaveLength(1); expect(sentFacts(h, false)).toHaveLength(1);
    expect(sentFacts(h, true)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'PENDING', key: 'CAPTURE:3C679366HH908993F:PENDING', amount_minor: '999', currency: 'USD',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect(sentFacts(h, false)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED', amount_minor: '999', currency: 'USD',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
    } });
    expect((rpcCalls(h, RPC.submission)[0].args.p_classification as any).facts.map((item: any) => item.bind)).toEqual([true, false]);
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
  ])('sends the actual GET Y when %s POST names X and the DB reports ADVERSE without intake', async (_label, status, minor, post) => {
    // W2 migration (P1 then P2). W sends the POST ID set {X} in S1 and the observed set {Y} in S3. W states what
    // the GET shows (requested CLEAN, the one actual CAPTURE Y) and does not compare it with its own POST memory.
    // The DB owns the X/Y comparison, so the S3 ACK is scripted as the DB downgrade to ADVERSE. The ACK is a
    // delivery model. It is not a re-run of the DB derivation. Changed meaning: the old tape recorded Y with the
    // record RPC. The completion now carries Y with bind=true, as every requested CLEAN capture does.
    const h = boundaries(postIntentScript({
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, amount_minor: minor } }],
      [RPC.complete]: [p2Ack({ effectiveKind: 'ADVERSE' })],
    }));
    const approved = providerOrder(); const lookup = capturedOrder();
    approved.purchase_units[0].amount.value = minor === '10000' ? '100.00' : '9.99';
    lookup.purchase_units[0].amount.value = minor === '10000' ? '100.00' : '9.99';
    lookup.purchase_units[0].payments.captures[0].amount = { currency_code: 'USD', value: minor === '10000' ? '100.00' : '9.99' };
    lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: approved })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
      category: 'PARTIAL_UNCONTRADICTED', http_status: status, post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [] });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', observed_capture_ids: ['9LOOKUPCAP'],
      assertions: [], receive_fact_index: 1 });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind, item.evidence.external_id]))
      .toEqual([[false, 'ORDER', PROVIDER_ORDER], [true, 'CAPTURE', '9LOOKUPCAP']]);
    expect(sentFacts(h, true, RPC.complete).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
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
    expect(JSON.stringify(completionSent)).not.toMatch(/Q7pPriv|customer@example|John|shipping|links|update_time|provider_completed_at|3C679366HH908993F/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9LOOKUPCAP|3C679366HH908993F|ACCOUNTA1|MERCHANTA1|55555555|44444444/);
  });

  // W2 migration (P1 then P2). The GET shows POST X and a competing Y, so W requests ADVERSE with a shape
  // judgment. Both actual CAPTURE literals are facts of the one S3 completion in response order.
  // With no existing CAPTURE link, neither competing candidate can supply a bind.
  it('does not bind any recovery candidate when LOOKUP contains both POST X and a competing Y', async () => {
    const h = boundaries({ ...postIntentScript(), [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures.push({ id: '9LOOKUPCAP', status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '9.99' }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
      category: 'PARTIAL_UNCONTRADICTED', post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [] });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'ADVERSE', observed_capture_ids: ['3C679366HH908993F', '9LOOKUPCAP'],
      assertions: [{ code: 'SHAPE_CONTRADICTION', detail: {} }], receive_fact_index: null });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.external_id]))
      .toEqual([[false, '3C679366HH908993F'], [false, '9LOOKUPCAP']]);
    // The S3 ACK took both scripted record replies without consuming the default bind reply.
    expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(sentFacts(h, false, RPC.complete).map(call => call.args)).toEqual([
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
    // W2 migration (P1 then P2): the POST ID set and the observed set are the same one ID, so the modelled S3 ACK
    // stays CLEAN and carries the intake. The original LOOKUP CAPTURE literal is the bound fact of the completion.
    const h = boundaries(postIntentScript()); const post: any = capturedOrder('PENDING'); delete post.intent;
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
      category: 'PARTIAL_UNCONTRADICTED', post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [] });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED',
      observed_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: 1 });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind, item.evidence.status]))
      .toEqual([[false, 'ORDER', 'COMPLETED'], [true, 'CAPTURE', 'COMPLETED']]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(sentFacts(h, true, RPC.complete).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'a9738a6aefe680c1f0ec24e5a8e9ba7dd4416dc7e78c49394d5890036ea7ac5b',
    } }]);
    // W sent no receive RPC. The S3 ACK took the scripted receive reply once as its intake.
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.requestToken).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
  });

  it.each(['missing-parent', 'missing-capture-id', 'missing-units'])
    ('does not invent a POST identity constraint for %s', async mode => {
      // W2 migration (P1 then P2). W sends the actual POST capture IDs of the one unit: an unknown set (null) when
      // the unit is missing, an empty set when the capture has no id, and the one ID when only the parent ORDER id
      // is missing (ruling: keeping an actual ID is not a bind and not an attributable fact). In the missing-parent
      // row the POST set {3C679366HH908993F} and the observed set {9LOOKUPCAP} differ, so its S3 ACK is scripted
      // as the DB downgrade to ADVERSE and its outcome changed from INTAKE_PENDING to REVIEW.
      const divergent = mode === 'missing-parent';
      const postIds = mode === 'missing-units' ? null : mode === 'missing-capture-id' ? [] : ['3C679366HH908993F'];
      const h = boundaries(postIntentScript(divergent ? { [RPC.complete]: [p2Ack({ effectiveKind: 'ADVERSE' })] } : {}));
      const post: any = capturedOrder(); delete post.intent;
      if (mode === 'missing-parent') delete post.id;
      if (mode === 'missing-capture-id') delete post.purchase_units[0].payments.captures[0].id;
      if (mode === 'missing-units') delete post.purchase_units;
      const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
      expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual(divergent ? { kind: 'REVIEW_REQUIRED' }
        : { kind: 'INTAKE_PENDING', replayed: false });
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
        'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
        category: 'PARTIAL_UNCONTRADICTED', post_capture_ids: postIds, facts: [], assertions: [] });
      const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
      expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', observed_capture_ids: ['9LOOKUPCAP'],
        assertions: [], receive_fact_index: 1 });
      expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind]))
        .toEqual([[false, 'ORDER'], [true, 'CAPTURE']]);
      expect(sentFacts(h, true, RPC.complete)).toHaveLength(1);
      expect(sentFacts(h, true, RPC.complete)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '9LOOKUPCAP', parent_external_id: PROVIDER_ORDER,
        status: 'COMPLETED', amount_minor: '999', currency: 'USD', key: 'CAPTURE:9LOOKUPCAP:COMPLETED',
        payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8',
      } });
      // W sent no receive RPC. Only a row with a CLEAN S3 ACK took the scripted receive reply as its intake.
      expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(divergent ? 1 : 0);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(2); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    });
});

describe('L-new1 partial POST contradictions permit observation only and remain REVIEW', () => {
  it.each([32, 33])('respects the local bound for a minimal POST with %s capture identities', async count => {
    // W2 migration (P1). A minimal POST with several captures is a contradiction that no fact can express: the
    // merchant is absent, so no ORDER or CAPTURE evidence can be built. W classifies it ADVERSE with a caller
    // assertion. Changed behavior: an ADVERSE classification sends no protected GET, so the old evidence GET and
    // its LOOKUP bind (literal hash a9738a6a...) are no longer part of this call. Above the bound the payload is
    // WORK_BOUND_EXCEEDED with unknown IDs.
    const h = boundaries(postIntentScript()); const post: any = structuredClone(OFFICIAL_CAPTURE_201);
    post.purchase_units[0].payments.captures = Array.from({ length: count }, (_unused, index) => ({
      id: index === 0 ? '3C679366HH908993F' : `CAP${index}`, status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' },
    }));
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture',
      RPC.submission]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', facts: [], receive_fact_index: null,
      unparseable_capture_count: 0 });
    if (count === 32) {
      expect(sent).toMatchObject({ category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE', capture_count_exceeded: false,
        assertions: [{ code: 'UNREPRESENTABLE_CONTRADICTION', detail: {} }] });
      expect(sent.post_capture_ids).toHaveLength(32);
      expect([sent.post_capture_ids[0], sent.post_capture_ids[1], sent.post_capture_ids[31]]).toEqual(['3C679366HH908993F', 'CAP1', 'CAP31']);
    } else {
      expect(sent).toMatchObject({ category: 'WORK_BOUND_EXCEEDED', capture_count_exceeded: true, post_capture_ids: null, assertions: [] });
    }
    expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(h.transport.requestToken).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
  });

  it.each(['country', 'deprecated-country', 'multiple', 'unknown-order-status', 'unknown-capture-status', 'partial-country'])
    // W2 migration (P1). Old name: 'preserves actual GET evidence after %s without erasing the POST contradiction'.
    // The partial POST carries a contradiction that no evidence field can express, so W classifies it ADVERSE with
    // one caller assertion and no fact. Changed behavior: an ADVERSE classification sends no protected GET, so
    // this call no longer collects the LOOKUP CAPTURE (literal hash a9738a6a...). The POST contradiction is kept
    // as the assertion and cannot be erased by a later GET of this call.
    ('holds the %s POST contradiction as an ADVERSE classification without a protected GET', async mode => {
      const h = boundaries(postIntentScript()); const post: any = structuredClone(OFFICIAL_CAPTURE_201);
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
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
        .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
        'capture', RPC.submission]);
      const country = mode === 'country' || mode === 'deprecated-country' || mode === 'partial-country';
      const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
      expect(sent).toMatchObject({ context_id: CONTEXT, kind: 'ADVERSE', category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE',
        http_status: 201, body_status: 'PARSED', facts: [], receive_fact_index: null, unparseable_capture_count: 0,
        capture_count_exceeded: false,
        post_capture_ids: mode === 'multiple' ? ['3C679366HH908993F', '9SECOND'] : ['3C679366HH908993F'],
        assertions: [{ code: country ? 'COUNTRY_MISMATCH' : 'UNREPRESENTABLE_CONTRADICTION', detail: {} }] });
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
      expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
      expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
      // Only the S1 preflight GET was sent.
      expect(h.transport.getOrder.mock.calls).toEqual([
        [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      ]);
      expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
        providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
      expect(h.credentials.resolve).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.prepare)).toHaveLength(1);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
      expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
        state: 'REVIEW_REQUIRED', newOrderAllowed: false });
      // No provider value of the minimal POST other than the capture IDs is sent: no status, payer, shipping or link.
      expect(JSON.stringify(sent)).not.toMatch(/FUTURE_|Q7pPriv|customer@example|shipping|links|update_time|John|"KR"/);
      expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|3C679366HH908993F|9SECOND|ACCOUNTA1|MERCHANTA1|55555555|44444444/);
    });

  it.each(['transport', 'throw', 'http-failure', 'empty-captures'])
    // W2 migration (P1). Old name: 'keeps country contradiction REVIEW after %s recovery without a second POST'.
    // The country contradiction is an ADVERSE classification, so no recovery GET is sent. Each row still scripts
    // its old recovery reply as a second GET reply, and the case checks that this reply is never requested.
    ('keeps country contradiction REVIEW with no recovery GET (%s reply unused) and no second POST', async mode => {
      const h = boundaries(postIntentScript()); const post: any = structuredClone(OFFICIAL_CAPTURE_201);
      post.purchase_units[0].payments.captures[0].amount.value = '9.99';
      post.payment_source.paypal.address = { country_code: 'KR' };
      h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
      h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() });
      if (mode === 'throw') h.transport.getOrder.mockRejectedValueOnce(new Error('Q7pPriv lookup failure'));
      else h.transport.getOrder.mockResolvedValueOnce(mode === 'transport' ? { kind: 'TRANSPORT_UNKNOWN' }
        : mode === 'http-failure' ? { kind: 'RESPONSE', bodyStatus: 'PARSED', status: 503, body: { message: 'Q7pPriv' } }
          : { kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder('COMPLETED') });
      const outcome = await capturePayPalOrder(h.deps, approvedInput);
      expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
      expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
      expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE',
        category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE', http_status: 201, post_capture_ids: ['3C679366HH908993F'], facts: [],
        assertions: [{ code: 'COUNTRY_MISMATCH', detail: {} }], receive_fact_index: null });
      expect(rpcCalls(h, RPC.open)).toHaveLength(0); expect(rpcCalls(h, RPC.complete)).toHaveLength(0);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
      expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(1);
      expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
      expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
      expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
      expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|3C679366HH908993F|55555555|44444444/);
    });

  // W2 migration (P1). Old name: 'keeps mixed minimal country and capture-ID conflicts record-only when GET reports Y'.
  // The country contradiction is an ADVERSE classification with POST ID set {X}. No GET is sent, so the GET that
  // would report Y and the scripted record reply for Y are never used in this call. Changed behavior: the old
  // call recorded the LOOKUP CAPTURE Y (literal hash 5a81857f...). That observation now needs a later read.
  it('holds mixed minimal country and capture-ID conflicts as ADVERSE and sends no GET for Y', async () => {
    const h = boundaries({ ...postIntentScript(), [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post: any = structuredClone(OFFICIAL_CAPTURE_201);
    post.purchase_units[0].payments.captures[0].amount.value = '9.99';
    post.payment_source.paypal.address = { country_code: 'KR' };
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.submission]);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(1);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expect(rpcCalls(h, RPC.complete)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE', http_status: 201,
      post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [{ code: 'COUNTRY_MISMATCH', detail: {} }],
      receive_fact_index: null });
    expect(JSON.stringify(sent)).not.toMatch(/9LOOKUPCAP|Q7pPriv|customer@example|links|update_time|"KR"/);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(h.transport.captureOrder).toHaveBeenCalledTimes(1);
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
    // W2 migration (P1): the one representable contradictory fact of the old record RPC is the one fact of the S1
    // payload with bind=false. W requests ADVERSE with no caller assertion. The scripted native REVIEW reply is the
    // fact result of the S1 ACK. The second GET reply stays unused: an ADVERSE classification sends no GET.
    const h = boundaries({ ...postIntentScript(), [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: reason,
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post = capturedOrder(); (mutate as (body: any) => void)(post);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    // A normal later GET must never replace the contradictory POST fact.
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT',
      http_status: 201, body_status: 'PARSED', assertions: [], receive_fact_index: null,
      post_capture_ids: _label === 'order-amount/missing-capture-id' ? [] : ['3C679366HH908993F'] });
    expect(sentFacts(h, true)).toHaveLength(0); expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(sentFacts(h, false).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
      external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
      ...fact as Record<string, unknown>, payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 미지 ORDER status 때문에 귀속 가능한 CAPTURE를 버리는 조기 반환을 검출한다.
  it('records actual SUBMIT_RESPONSE for unknown-order-status/missing-intent with no corrective GET, bind or receipt', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    // W2 migration (P1): the ORDER fact and the CAPTURE fact of the two old record RPCs are the two facts of the
    // S1 payload in the same order, both with bind=false. The two scripted native REVIEW replies are the two fact
    // results of the S1 ACK. No GET follows the ADVERSE result.
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT',
      http_status: 201, post_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: null });
    expect((rpcCalls(h, RPC.submission)[0].args.p_classification as any).facts.map((item: any) => [item.bind, item.evidence.identity_kind]))
      .toEqual([[false, 'ORDER'], [false, 'CAPTURE']]);
    const recorded = sentFacts(h, false); expect(recorded).toHaveLength(2);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // W2 migration: 'keeps the current call REVIEW after actual contradictory POST record returns 503' became
  // 'atomic contradictory POST failure returns submission unknown' (P1 failure).
  // Reason: an unacknowledged classification gives no durable REVIEW. The current call reports SUBMISSION_UNKNOWN.

  it('honors a literal getter REVIEW on reconcile after first recording the actual POST amount conflict', async () => {
    // W2 migration (P1, then P2 on reconcile). First call: the actual POST amount conflict is the one fact of the
    // S1 payload, and its scripted native REVIEW reply is the S1 fact result. Second call: the order has an intent,
    // so the reconcile GET is a protected read. Its completion carries the ORDER fact (second scripted record
    // reply, RECORDED) and the LOOKUP CAPTURE with bind=true (default bind reply). The scripted intake of the S3
    // ACK is the INTAKE_HELD refusal, because the order already has the sticky POST conflict. The same S3 ACK
    // therefore carries the sticky hold snapshot. This models the native admission refusal. The getter REVIEW
    // guard has its own control in the L3 cases.
    const h = boundaries({ ...postIntentScript(), [RPC.complete]: [tapeAck('P2', HOLD_STICKY)], [RPC.receive]: [{ data: INTAKE_HELD }],
      [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH',
        trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }, { data: NATIVE_RECORDED }] });
    const post: any = capturedOrder(); delete post.intent; post.purchase_units[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(1);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT',
      post_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: null });
    expect(sentFacts(h, true)).toHaveLength(0); expect(sentFacts(h, false)).toHaveLength(1);
    expect(sentFacts(h, false)[0].args).toMatchObject({ p_context_id: CONTEXT, p_evidence: {
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
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    expect(await reconcilePayPalOrder(h.deps, input)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission,
      RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.open)[0].args.p_actor_kind).toBe('USER_RECONCILE');
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED',
      observed_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: 1 });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind])).toEqual([[false, 'ORDER'], [true, 'CAPTURE']]);
    // The S3 ACK took the second record reply, the default bind reply and the scripted INTAKE_HELD refusal.
    expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(sentFacts(h, true, RPC.complete)).toHaveLength(1);
    expect(sentFacts(h, true, RPC.complete)[0].args).toMatchObject({ p_evidence: {
      source: 'LOOKUP', identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER,
      amount_minor: '999', currency: 'USD', status: 'COMPLETED',
    } });
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)).toHaveLength(1); expect(rpcCalls(h, RPC.complete)).toHaveLength(1);
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
    // W2 migration (P1 then P2): the partial POST is NO_RESPONSE with POST ID set {X}. The one actual LOOKUP ORDER
    // conflict fact of the old record RPC is the one fact of the S3 completion with bind=false. W requests ADVERSE
    // itself, and the scripted native REVIEW reply is the fact result of the S3 ACK. No CAPTURE fact is sent.
    const h = boundaries({ ...postIntentScript(), [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: reason,
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    (mutate as (body: any) => void)(lookup);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
      category: 'PARTIAL_UNCONTRADICTED', post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [] });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'ADVERSE', category: 'READ_ADVERSE_FACT', get_http_status: 200,
      observed_capture_ids: ['9LOOKUPCAP'], assertions: [], receive_fact_index: null });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind])).toEqual([[false, 'ORDER']]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(sentFacts(h, false, RPC.complete).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER', external_id: '5O190127TN364715T',
      parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
      ...fact as Record<string, unknown>, payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent,
      'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
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
    expect(JSON.stringify(completionSent.facts)).not.toMatch(/3C679366HH908993F|9LOOKUPCAP|Q7pPriv|email_address|links|update_time|provider_completed_at/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/9OTHERORDER|9LOOKUPCAP|Q7pPriv|ACCOUNTA1|MERCHANTB2/);
  });
});

describe('R1-b complete POST preserves actual capture facts hidden by INTENT refusal', () => {
  // Catch the single-ORDER fallback losing a complete, contradictory CAPTURE tuple.
  it('records actual CAPTURE amount 1000 from complete AUTHORIZE POST without recovery or intake', async () => {
    const h = boundaries({ [RPC.observe]: [{ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH',
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }], ...postIntentScript() });
    // W2 migration (P1): the one actual contradictory CAPTURE of the old record RPC is the one fact of the S1
    // payload with bind=false. The INTENT judgment is a caller assertion. The scripted native REVIEW reply is the
    // fact result of the S1 ACK. No protected GET follows the ADVERSE result.
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures[0].amount = { currency_code: 'USD', value: '10.00' };
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(sentFacts(h, false).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'd8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6',
    } }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', http_status: 201,
      post_capture_ids: ['3C679366HH908993F'], assertions: [{ code: 'INTENT_MISMATCH', detail: {} }], receive_fact_index: null });
    expect(sentFacts(h, true)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }], ...postIntentScript() });
    // W2 migration (P1): the one actual contradictory CAPTURE of the old record RPC is the one fact of the S1
    // payload with bind=false. The INTENT judgment is a caller assertion. The scripted native REVIEW reply is the
    // fact result of the S1 ACK. No protected GET follows the ADVERSE result.
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures[0].amount = { currency_code: 'EUR', value: '9.99' };
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(sentFacts(h, false).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'EUR', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: '4389180c2a2a3aa6ec0f9c009b5c503b7e1308a5c76bc4bbc40cb86d1c3b1109',
    } }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', http_status: 201,
      post_capture_ids: ['3C679366HH908993F'], assertions: [{ code: 'INTENT_MISMATCH', detail: {} }], receive_fact_index: null });
    expect(sentFacts(h, true)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }], ...postIntentScript() });
    // W2 migration (P1): the one actual contradictory CAPTURE of the old record RPC is the one fact of the S1
    // payload with bind=false. The INTENT judgment is a caller assertion. The scripted native REVIEW reply is the
    // fact result of the S1 ACK. No protected GET follows the ADVERSE result.
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures[0].custom_id = 'v2:99999999-9999-4999-8999-999999999999';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(sentFacts(h, false).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:99999999-9999-4999-8999-999999999999', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: '898f46e1da86834cabca6beef5247e4edf023cb368e240e0fafdb49c8d3d4239',
    } }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', http_status: 201,
      post_capture_ids: ['3C679366HH908993F'], assertions: [{ code: 'INTENT_MISMATCH', detail: {} }], receive_fact_index: null });
    expect(sentFacts(h, true)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
      trust: 'SERVER_REPORTED', observation_id: OBSERVATION, replayed: false } }], ...postIntentScript() });
    // W2 migration (P1): the same boundary as the three cases above, for the actual unknown capture status.
    const post = capturedOrder('FUTURE_CAPTURE'); post.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(sentFacts(h, false).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'FUTURE_CAPTURE', key: 'CAPTURE:3C679366HH908993F:FUTURE_CAPTURE',
      payload_hash: '7aafa97936bfc454b24952be33763a3c875e8497130c64a396518354cad35ae4',
    } }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'ADVERSE', http_status: 201,
      post_capture_ids: ['3C679366HH908993F'], assertions: [{ code: 'INTENT_MISMATCH', detail: {} }], receive_fact_index: null });
    expect(sentFacts(h, true)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  // W2 migration: 'records deduplicated actual A then B after complete AUTHORIZE POST even when A record returns 503'
  // became 'atomic AUTHORIZE A-B payload is preserved when classification fails' (P1 failure).
  // Reason: the deduplicated A then B facts and their literal hashes move unchanged into one S1 payload.
});

describe('N1 status-only ORDER recovery preserves the actual competing capture', () => {
  // Catch the ORDER-status fallback returning before the record-only CAPTURE loop.
  // W2 migration (P1 then P2): the FUTURE_ORDER fact and the GET Y fact are the two facts of the one S3 completion,
  // in the old order and both with bind=false. W requests ADVERSE for the unknown ORDER status. The two scripted
  // native REVIEW replies are the two fact results of the S3 ACK.
  it('records matching FUTURE_ORDER then actual GET Y after partial POST X without binding or intake', async () => {
    const h = boundaries({ ...postIntentScript(), [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replayed: false } },
    ] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.status = 'FUTURE_ORDER';
    lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body: post });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: lookup });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.submission)[0].args.p_classification).toMatchObject({ kind: 'NO_RESPONSE',
      category: 'PARTIAL_UNCONTRADICTED', post_capture_ids: ['3C679366HH908993F'], facts: [], assertions: [] });
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'ADVERSE', category: 'READ_ADVERSE_FACT', get_http_status: 200,
      observed_capture_ids: ['9LOOKUPCAP'], assertions: [], receive_fact_index: null });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind]))
      .toEqual([[false, 'ORDER'], [false, 'CAPTURE']]);
    expect(h.script[RPC.observe]).toHaveLength(0); expect(h.script[RPC.bind]).toHaveLength(1); expect(h.script[RPC.receive]).toHaveLength(1);
    expect(sentFacts(h, false, RPC.complete).map(call => call.args)).toEqual([
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
      'capture', RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(h.transport.getOrder.mock.calls).toEqual([
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
      [{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }],
    ]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token',
      providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.claim)).toHaveLength(1); expect(rpcCalls(h, RPC.intent)).toHaveLength(1);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });

  // W2 migration: 'still records actual GET Y after matching FUTURE_ORDER record returns 503' became
  // 'atomic FUTURE_ORDER GET failure leaves read completion unknown' (P2 failure).
  // Reason: the FUTURE_ORDER and GET Y facts move unchanged into one S3 completion. Its failure is one boundary.
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
    // W2 migration: capture is one POST and then P1 (the intake is in the S1 ACK). reconcile is an intent-less S6
    // read (REVIEW, no intake). status is the unchanged getter read. No row calls receive directly or uses entry.
    const h = boundaries({ [RPC.submission]: [p1Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR })], [RPC.open]: [NOT_APPLICABLE_OPEN] });
    h.entry.authorizeProviderEntry.mockRejectedValue(new Error('Q7pPriv entry must stay unused'));
    if (operation === 'reconcile') h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const result = operation === 'capture' ? await capturePayPalOrder(h.deps, approvedInput)
      : operation === 'reconcile' ? await reconcilePayPalOrder(h.deps, input) : await getPayPalChargeStatus(h.deps, input);
    expect(h.entry.authorizeProviderEntry).not.toHaveBeenCalled();
    expect(result).toEqual(operation === 'status'
      ? { kind: 'STATUS', paymentState: 'NOT_SUBMITTED', settlementState: 'NOT_INTAKE', reviewRequired: false }
      : operation === 'capture' ? { kind: 'INTAKE_PENDING', replayed: false } : { kind: 'REVIEW_REQUIRED' });
    expect(h.transport.createOrder).not.toHaveBeenCalled();
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(operation === 'capture' ? 1 : 0);
    expect(rpcCalls(h, RPC.submission)).toHaveLength(operation === 'capture' ? 1 : 0);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.complete)).toHaveLength(0);
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
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(2);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('records FUTURE_ORDER and the actual matching CAPTURE from a complete AUTHORIZE POST once each', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(2);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 기록 실패 뒤 다음 사실을 생략하거나 같은 사실을 재시도하는 회귀를 검출한다.
  // W2 migration: 'still records the actual CAPTURE once after the FUTURE_ORDER record returns 503' became
  // 'atomic FUTURE_ORDER classification failure does not recover or intake' (P1 failure).
  // Reason: the ORDER then CAPTURE facts are one S1 payload. A failed delivery has no second per-fact RPC.

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
    ] : [], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
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
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    // W2 migration (P1): the duplicate row sends the ORDER fact and the two different CAPTURE facts in one S1
    // payload, all with bind=false, and the S1 ACK takes the three scripted record replies in order. A raw count of
    // 33 is closed before deduplication as WORK_BOUND_EXCEEDED with unknown IDs and no fact.
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject(mode === 'duplicate'
      ? { kind: 'ADVERSE', http_status: 201, capture_count_exceeded: false, post_capture_ids: ['3C679366HH908993F', '9SECOND'],
        receive_fact_index: null }
      : { kind: 'ADVERSE', http_status: 201, category: 'WORK_BOUND_EXCEEDED', capture_count_exceeded: true, post_capture_ids: null,
        facts: [], assertions: [], receive_fact_index: null });
    expect(sent.facts.map((item: any) => [item.bind, item.evidence.identity_kind]))
      .toEqual(mode === 'duplicate' ? [[false, 'ORDER'], [false, 'CAPTURE'], [false, 'CAPTURE']] : []);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(mode === 'duplicate' ? 3 : 0);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('keeps only the ORDER fact when an unknown-status POST names another merchant', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    body.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTB2' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // ORDER1과 CAPTURE32를 모두 응답 순서로 기록하며 잘린 반복을 검출한다.
  it('records the ORDER then all 32 actual unknown-status CAPTURE facts at the raw bound', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      ...Array.from({ length: 32 }, () => ({ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } })),
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body = capturedOrder(); body.status = 'FUTURE_ORDER'; delete (body as any).intent;
    body.purchase_units[0].payments.captures = capturesAt(32);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(33);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 완전 CAPTURE_SHAPE 경로에 ORDER 기록을 잘못 추가하는 변경을 검출한다.
  it('keeps a complete unknown-status POST with a conflicting CAPTURE on the record-only CAPTURE_SHAPE path', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'AMOUNT_MISMATCH', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
        external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // INTENT fallback에서 일치 CAPTURE가 빠지거나 bind로 바뀌는 회귀를 검출한다.
  it('records the actual matching AUTHORIZE CAPTURE as record-only after the ORDER fact', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: NATIVE_RECORDED },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(2);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // literal getter REVIEW가 정상 GET 후 intake로 풀리는 회귀를 검출하며 SQL 영속성은 주장하지 않는다.
  it('keeps REVIEW and zero intake when a later normal GET binds the AUTHORIZE capture', async () => {
    // W2 migration (P2): the getter confirms an intent, so the one GET is a protected read: OPEN ACK, GET, S3.
    // The completion is requested CLEAN with the actual ORDER fact (one scripted RECORDED record reply) and the
    // original LOOKUP CAPTURE with bind=true (the scripted bind reply). The S3 ACK models the native admission
    // refusal of an order under REVIEW: intake INTAKE_HELD with the sticky hold snapshot.
    const h = boundaries({ [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2', HOLD_STICKY)],
      [RPC.observe]: [{ data: NATIVE_RECORDED }], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [{ data: INTAKE_HELD }],
      [RPC.claim]: [], [RPC.intent]: [],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, row_version: '3', payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true,
        attempt_id: ATTEMPT, review_required: true } }] });
    const body: any = capturedOrder();
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    // No per-fact RPC and no direct receive. The completion carries the ORDER fact first, then the CAPTURE.
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.open)).toHaveLength(1); expect(rpcCalls(h, RPC.complete)).toHaveLength(1);
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', get_http_status: 200,
      observed_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: 1 });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind, item.evidence.status]))
      .toEqual([[false, 'ORDER', 'COMPLETED'], [true, 'CAPTURE', 'COMPLETED']]);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', identity_kind: 'ORDER',
      external_id: '5O190127TN364715T', amount_minor: '999', currency: 'USD', status: 'COMPLETED' } });
    expect(deliveredFacts(h, true).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(deliveredFacts(h, true)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    // The refusal arrives as the intake of the S3 ACK, so the one safe log is the held-intake warning.
    expect(h.log.mock.calls).toEqual([[{ stage: 'HELD', level: 'warn', code: 'payment.paypal.charge.intake.held', orderId: ORDER }]]);
    expect(JSON.stringify([...deliveredFacts(h, true), ...deliveredFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 동시 같은 ID link의 RECORDED 응답이 로컬 REVIEW를 풀지 못한다.
  it('returns local REVIEW without intake when the AUTHORIZE CAPTURE record returns RECORDED', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: NATIVE_RECORDED },
      { data: NATIVE_RECORDED }
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(2);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // W2 migration: 'still records the AUTHORIZE CAPTURE once after the ORDER record returns 503' became
  // 'atomic AUTHORIZE classification failure does not recover or intake' (P1 failure).
  // Reason: the ORDER then CAPTURE facts are one S1 payload. A failed delivery has no second per-fact RPC.

  // AUTHORIZE 외 intent, CAPTURE 부재, 외부 merchant에 기록 범위를 넓히는 회귀를 검출한다.
  it.each(['no-capture', 'sale-intent', 'foreign-merchant'])
    ('does not add a CAPTURE fact for excluded %s POST', async mode => {
    // W2 migration (P1): the one ORDER fact of the old record RPC is the one fact of the S1 payload with
    // bind=false. No CAPTURE fact is added. The INTENT judgment is a caller assertion. The S1 ACK takes the one
    // scripted RECORDED reply.
    const h = boundaries({ [RPC.observe]: [{ data: NATIVE_RECORDED }], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body = capturedOrder(); body.intent = mode === 'sale-intent' ? 'SALE' : 'AUTHORIZE';
    if (mode === 'no-capture') body.purchase_units[0].payments.captures = [];
    if (mode === 'foreign-merchant') body.purchase_units[0].payee.merchant_id = 'MERCHANTB2';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null,
      post_capture_ids: mode === 'no-capture' ? [] : ['3C679366HH908993F'], assertions: [{ code: 'INTENT_MISMATCH', detail: {} }] });
    expect(sent.facts.map((item: any) => [item.bind, item.evidence.identity_kind])).toEqual([[false, 'ORDER']]);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: mode === 'foreign-merchant' ? 'MERCHANTB2' : 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
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
    ] : [], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
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
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    // W2 migration (P1): the duplicate row sends the ORDER fact and the two different CAPTURE facts in one S1
    // payload, all with bind=false, and the S1 ACK takes the three scripted record replies in order. A raw count of
    // 33 is closed before deduplication as WORK_BOUND_EXCEEDED with unknown IDs and no fact.
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    const sent = rpcCalls(h, RPC.submission)[0].args.p_classification as any;
    expect(sent).toMatchObject(mode === 'duplicate'
      ? { kind: 'ADVERSE', http_status: 201, capture_count_exceeded: false, post_capture_ids: ['3C679366HH908993F', '9SECOND'],
        receive_fact_index: null }
      : { kind: 'ADVERSE', http_status: 201, category: 'WORK_BOUND_EXCEEDED', capture_count_exceeded: true, post_capture_ids: null,
        facts: [], assertions: [], receive_fact_index: null });
    expect(sent.facts.map((item: any) => [item.bind, item.evidence.identity_kind]))
      .toEqual(mode === 'duplicate' ? [[false, 'ORDER'], [false, 'CAPTURE'], [false, 'CAPTURE']] : []);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(mode === 'duplicate' ? 3 : 0);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // ORDER1과 CAPTURE32를 모두 응답 순서로 기록하며 잘린 반복을 검출한다.
  it('records the ORDER then all 32 actual AUTHORIZE CAPTURE facts at the raw bound', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: NATIVE_RECORDED },
      ...Array.from({ length: 32 }, () => ({ data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_NOT_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } })),
    ], [RPC.bind]: [], [RPC.receive]: [], ...postIntentScript() });
    const body = capturedOrder(); body.intent = 'AUTHORIZE';
    body.purchase_units[0].payments.captures = capturesAt(32);
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(33);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // 미지 ORDER 기록 누락과 bind 뒤로 옮긴 기록 순서를 검출한다.
  it('records the actual unknown ORDER status before binding the matching SUBMIT capture', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [], ...postIntentScript() });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    h.transport.getOrder.mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: providerOrder() })
      .mockResolvedValueOnce({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body: capturedOrder() });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(deliveredFacts(h, true).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER, requestKey: ATTEMPT }]]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(deliveredFacts(h, true)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(1); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('records the actual unknown ORDER status before binding a capture found by the first GET', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(deliveredFacts(h, true).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.observe, RPC.bind]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(deliveredFacts(h, true)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    expect(h.log.mock.calls).toEqual([[{ stage: 'OBSERVE', level: 'warn', code: 'payment.paypal.charge.observe.review', orderId: ORDER }]]);
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  // W2 migration: 'still binds the actual capture once after the unknown-status ORDER record returns 503' became
  // 'atomic unknown-status classification failure does not recover or intake' (P1 failure).
  // Reason: the ORDER fact and the bind=true CAPTURE fact are one S1 payload. No bind follows a failed delivery.

  it('records the unknown ORDER status before refusing a different existing capture link', async () => {
    const h = boundaries({ [RPC.observe]: [
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'UNRECOGNIZED_STATUS', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } },
      { data: { outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND', trust: 'SERVER_REPORTED',
        observation_id: OBSERVATION, replayed: false } }
    ], [RPC.bind]: [], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [],
      // W2 S6 migration: the getter has a CAPTURE link and no intent. S2 OPEN gives the authoritative
      // NOT_APPLICABLE, and the read keeps the existing ORDER then CAPTURE record RPCs. No cycle is opened.
      [RPC.open]: [NOT_APPLICABLE_OPEN],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_capture_id: '9EXISTINGCAP' } }] });
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(2);
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
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.observe, RPC.observe]);
    expect(rpcCalls(h, RPC.open).map(call => call.args)).toEqual([{ p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'USER_CAPTURE' }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(2); expect(rpcCalls(h, RPC.complete)).toHaveLength(0);
    expect(rpcCalls(h, RPC.submission)).toHaveLength(0);
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
    expect(JSON.stringify([...rpcCalls(h, RPC.observe), ...sentFacts(h, true), ...sentFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

  it('does not record a CAPTURE from an AUTHORIZE POST with a malformed ORDER amount', async () => {
    // W2 migration (P1): the ORDER amount is malformed, so neither the ORDER fact nor the CAPTURE fact can be
    // built. The S1 payload has no fact and carries the INTENT judgment as the one caller assertion. The explicit
    // S1 ACK echoes the requested ADVERSE result. No per-fact reply is scripted or taken.
    const h = boundaries({ [RPC.observe]: [], [RPC.bind]: [], [RPC.receive]: [], [RPC.submission]: [tapeAck('P1')] });
    const body = capturedOrder(); body.intent = 'AUTHORIZE'; body.purchase_units[0].amount.value = '9.9';
    h.transport.captureOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 201, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
    expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.claim, RPC.intent, 'capture', RPC.submission]);
    expect(rpcCalls(h, RPC.submission).map(call => call.args.p_classification)).toMatchObject([{ kind: 'ADVERSE',
      category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE', http_status: 201, body_status: 'PARSED',
      post_capture_ids: ['3C679366HH908993F'], unparseable_capture_count: 0, capture_count_exceeded: false, facts: [],
      assertions: [{ code: 'INTENT_MISMATCH', detail: {} }], receive_fact_index: null }]);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expect(h.script[RPC.submission]).toHaveLength(0);
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
    // W2 R-PRE addition: this is the S1 preflight GET of an order with no intent. No read cycle is opened. After
    // the one ORDER record RPC, W stores the INTENT judgment once with P3. The explicit P3 ACK is scripted.
    const h = boundaries({ [RPC.observe]: [{ data: NATIVE_RECORDED }], [RPC.bind]: [], [RPC.receive]: [], [RPC.claim]: [], [RPC.intent]: [],
      [RPC.preintent]: [{ data: { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: false,
        assertion_ids: [CLASSIFICATION] } }] });
    const body = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded.map(call => call.args)).toEqual([
      { p_context_id: CONTEXT, p_evidence: {
        source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
        external_id: '5O190127TN364715T', parent_external_id: null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'ORDER:5O190127TN364715T:COMPLETED',
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      } }
    ]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', 'get', RPC.observe, RPC.preintent]);
    expect(rpcCalls(h, RPC.preintent).map(call => call.args)).toEqual([{ p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_assertions: [{ code: 'INTENT_MISMATCH', detail: {} }] }]);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(1); expect(h.script[RPC.preintent]).toHaveLength(0);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expect(rpcCalls(h, RPC.submission)).toHaveLength(0);
    expect(rpcCalls(h, RPC.complete)).toHaveLength(0);
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
    // W2 migration (P2): the getter confirms an intent, so the one GET is a protected read: OPEN ACK, GET, S3.
    // The completion is requested CLEAN with the actual ORDER fact (one scripted RECORDED record reply) and the
    // original LOOKUP CAPTURE with bind=true (the scripted bind reply). The S3 ACK models the native admission
    // refusal of an order under REVIEW: intake INTAKE_HELD with the sticky hold snapshot.
    const h = boundaries({ [RPC.open]: [OPENED_ACK], [RPC.complete]: [tapeAck('P2', HOLD_STICKY)],
      [RPC.observe]: [{ data: NATIVE_RECORDED }], [RPC.bind]: [{ data: NATIVE_RECORDED }], [RPC.receive]: [{ data: INTAKE_HELD }],
      [RPC.claim]: [], [RPC.intent]: [],
      [RPC.getter]: [{ data: { ...NATIVE_FOUND, provider_capture_id: '3C679366HH908993F', review_required: true,
        payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true, attempt_id: ATTEMPT, row_version: '3' } }] });
    const body: any = capturedOrder();
    h.transport.getOrder.mockResolvedValue({ kind: 'RESPONSE', bodyStatus: 'PARSED', status: 200, body });
    const outcome = await reconcilePayPalOrder(h.deps, input);
    // No per-fact RPC and no direct receive. The completion carries the ORDER fact first, then the CAPTURE.
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.open)).toHaveLength(1); expect(rpcCalls(h, RPC.complete)).toHaveLength(1);
    const completionSent = rpcCalls(h, RPC.complete)[0].args.p_completion as any;
    expect(completionSent).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', get_http_status: 200,
      observed_capture_ids: ['3C679366HH908993F'], assertions: [], receive_fact_index: 1 });
    expect(completionSent.facts.map((item: any) => [item.bind, item.evidence.identity_kind, item.evidence.status]))
      .toEqual([[false, 'ORDER', 'COMPLETED'], [true, 'CAPTURE', 'COMPLETED']]);
    const recorded = deliveredFacts(h, false); expect(recorded).toHaveLength(1);
    expect(recorded[0].args).toMatchObject({ p_evidence: { source: 'LOOKUP', identity_kind: 'ORDER',
      external_id: '5O190127TN364715T', amount_minor: '999', currency: 'USD', status: 'COMPLETED' } });
    expect(deliveredFacts(h, true).map(call => call.args)).toEqual([{ p_context_id: CONTEXT, p_evidence: {
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T', order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    } }]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(h.transport.getOrder.mock.calls).toEqual([[{ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER }]]);
    expect(h.transport.captureOrder.mock.calls).toEqual([]);
    expect(h.transport.createOrder).toHaveBeenCalledTimes(0); expect(deliveredFacts(h, true)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    expect(rpcCalls(h, RPC.intent)).toHaveLength(0); expect(h.script[RPC.observe]).toHaveLength(0);
    expect(h.script[RPC.getter]).toHaveLength(0); expect(h.script[RPC.prepare]).toHaveLength(0);
    expect(h.script[RPC.claim]).toHaveLength(0); expect(h.script[RPC.intent]).toHaveLength(0);
    expect(h.script[RPC.bind]).toHaveLength(0); expect(h.script[RPC.receive]).toHaveLength(0);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
    // The refusal arrives as the intake of the S3 ACK, so the one safe log is the held-intake warning.
    expect(h.log.mock.calls).toEqual([[{ stage: 'HELD', level: 'warn', code: 'payment.paypal.charge.intake.held', orderId: ORDER }]]);
    expect(JSON.stringify([...deliveredFacts(h, true), ...deliveredFacts(h, false)])).not.toMatch(/Q7pPriv|email_address|links|update_time|provider_completed_at|COUNTRY_MISMATCH/);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|9OTHERORDER|FUTURE_|ACCOUNTA1|MERCHANTB2|3C679366HH908993F/);
  });

});

// ---------------------------------------------------------------------------------------------
// W2: atomic POST classification (P1), protected read cycle (P2), pre-intent assertion (P3).
// Source: plan section W2; spec G3, G5, G8, G9, 4/10 (P1), 5/10 (P2), 1/10 section 4 (R-PRE).
// Each case calls the existing public orchestrator with the real W1 repository. Only provider,
// binding, credential, clock and RPC delivery are scripted. A scripted ACK is a delivery fixture.
// It does not show a DB commit, the DB effective result or the DB ID comparison. D2 and H1 own those.
type Harness = ReturnType<typeof boundaries>;
const CLASSIFICATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CYCLE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CYCLE_TOKEN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REFERENCE = 'v2:11111111-1111-4111-8111-111111111111';
const HOLD_CLEAR = { grant_blocked: false, admission_possible: true, get_eligible: true, version: 'f'.repeat(64) };
const HOLD_GET_ONLY = { grant_blocked: true, admission_possible: false, get_eligible: true, version: 'e'.repeat(64) };
const HOLD_STICKY = { grant_blocked: true, admission_possible: false, get_eligible: false, version: 'd'.repeat(64) };
const INTAKE_HELD = { outcome: 'REVIEW_REQUIRED', reason_code: 'INTAKE_HELD', grant_eligible: false };
const LOST_ACK: RpcDelivery = { status: 503, data: { code: 'XX000', message: 'Q7pPriv ACK lost' } };
// Getter state after a committed intent. S3-S5 reads of this order are protected reads.
const INTENT_FOUND = { ...NATIVE_FOUND, payment_state: 'SUBMISSION_UNKNOWN', submission_intent_recorded: true,
  attempt_id: ATTEMPT, row_version: '3' };
const OPENED_ACK: RpcDelivery = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'OPENED', cycle_id: CYCLE,
  cycle_token: CYCLE_TOKEN, generation: '1', deadline_at: '2026-11-14T00:00:45.123456+00:00', superseded_cycle_id: null } };
const SECOND_CYCLE = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const SECOND_CYCLE_TOKEN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
const NOT_APPLICABLE_OPEN: RpcDelivery = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_APPLICABLE' } };
const parsed = (body: unknown, status = 200) => ({ kind: 'RESPONSE', bodyStatus: 'PARSED', status, body });
// S6 control (spec 1/10 section 4, 5/10 section 10). An intent-less read may ask S2 once and receive the
// authoritative NOT_APPLICABLE. It opens no cycle and creates no P1, direct receive, claim, intent or POST.
function expectIntentLessRead(h: Harness) {
  expect(rpcCalls(h, RPC.open).length).toBeLessThanOrEqual(1);
  expect(rpcCalls(h, RPC.complete)).toHaveLength(0); expect(rpcCalls(h, RPC.submission)).toHaveLength(0);
  expect(rpcCalls(h, RPC.receive)).toHaveLength(0); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
  expect(rpcCalls(h, RPC.intent)).toHaveLength(0);
  expect(h.transport.captureOrder).not.toHaveBeenCalled(); expect(h.transport.createOrder).not.toHaveBeenCalled();
}
const withoutOpen = (h: Harness) => h.trail.filter(step => step !== RPC.open);
const factResults = (facts: unknown[]) => facts.map((_fact, index) => ({
  observation_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, outcome: 'RECORDED', reason_code: null }));
type AckOptions = { effectiveKind?: string; intake?: unknown; hold?: unknown };
// S1 ACK. It echoes the requested kind and category and returns one result for each sent fact.
function p1Ack({ effectiveKind, intake = null, hold = HOLD_STICKY }: AckOptions = {}) {
  return (args: Record<string, any>): RpcDelivery => {
    const sent = args.p_classification; const effective = effectiveKind ?? sent.kind;
    return { data: { contract_version: 'web-payment-submission-result.v1', outcome: 'CLASSIFIED', replayed: false,
      classification_id: CLASSIFICATION, requested_kind: sent.kind, effective_kind: effective,
      effective_category: effective === sent.kind ? sent.category : 'DB_ADVERSE_OVERRIDE', db_adverse: effective === 'ADVERSE',
      fact_results: factResults(sent.facts), assertion_ids: [], intake, hold } };
  };
}
// S3 ACK with the same echo rule.
function p2Ack({ effectiveKind, intake = null, hold = HOLD_STICKY, generation = '1' }: AckOptions & { generation?: string } = {}) {
  return (args: Record<string, any>): RpcDelivery => {
    const sent = args.p_completion; const effective = effectiveKind ?? sent.kind;
    return { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'COMPLETED', replayed: false,
      cycle_id: args.p_cycle_id, generation, requested_kind: sent.kind, effective_kind: effective,
      db_adverse: effective === 'ADVERSE', fact_results: factResults(sent.facts), assertion_ids: [], intake, hold } };
  };
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
}
// Test-owned evidence fixture for the default order, actor and scope. It does not call the product
// builder. The first W2 case compares it with complete literals and hashes recorded before W2.
function fact(source: 'SUBMIT_RESPONSE' | 'LOOKUP', kind: 'ORDER' | 'CAPTURE', externalId: string, status: string, amountMinor = '999') {
  const evidence = { source, provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: kind, external_id: externalId,
    parent_external_id: kind === 'CAPTURE' ? PROVIDER_ORDER : null, order_id: ORDER, user_id: ACTOR, quote_hash: HASH,
    order_reference: REFERENCE, scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, amount_minor: amountMinor,
    currency: 'USD', status, key: `${kind}:${externalId}:${status}` };
  return { ...evidence, payload_hash: createHash('sha256').update(canonicalJson(evidence), 'utf8').digest('hex') };
}
const classification = (h: Harness) => rpcCalls(h, RPC.submission)[0]?.args.p_classification as any;
const completion = (h: Harness) => rpcCalls(h, RPC.complete)[0]?.args.p_completion as any;
// Boundary calls after the one capture POST. The S1 preflight GET is before the POST and is not in this list.
const afterPost = (h: Harness) => h.trail.slice(h.trail.indexOf('capture') + 1);
function expectNoPerFactWrite(h: Harness) {
  expect(rpcCalls(h, RPC.bind)).toHaveLength(0); expect(rpcCalls(h, RPC.observe)).toHaveLength(0);
  expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
}
// Plan W2 literal for a P1 failure or lost ACK: one POST, only the S1 RPC after it, no protected GET.
function expectP1Failure(h: Harness, outcome: Awaited<ReturnType<typeof capturePayPalOrder>>) {
  expect(afterPost(h)).toEqual([RPC.submission]);
  expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
  expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.createOrder).toHaveBeenCalledTimes(0);
  expect(rpcCalls(h, RPC.submission)).toHaveLength(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
  expectNoPerFactWrite(h);
  expect(toPayPalChargeBrowserDto(ORDER, outcome).newOrderAllowed).toBe(false);
  expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
}
// A lost capture response with a clean preflight GET. The second GET reply exists only for a protected read.
function lostCaptureResponse(h: Harness, recovery: unknown = parsed(capturedOrder())) {
  h.transport.captureOrder.mockResolvedValue({ kind: 'TRANSPORT_UNKNOWN' });
  h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(recovery);
}

describe('W2 P1 classifies the one capture POST in one atomic RPC', () => {
  it('keeps the test-owned evidence fixture equal to complete literals recorded before W2', () => {
    expect(fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED', '1000')).toEqual({
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE',
      external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T',
      order_id: '11111111-1111-4111-8111-111111111111', user_id: '00000000-0000-4000-8000-000000000001',
      quote_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '1000', currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'd8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6' });
    expect(fact('LOOKUP', 'ORDER', '5O190127TN364715T', 'FUTURE_ORDER')).toEqual({
      source: 'LOOKUP', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'ORDER',
      external_id: '5O190127TN364715T', parent_external_id: null,
      order_id: '11111111-1111-4111-8111-111111111111', user_id: '00000000-0000-4000-8000-000000000001',
      quote_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
      amount_minor: '999', currency: 'USD', status: 'FUTURE_ORDER', key: 'ORDER:5O190127TN364715T:FUTURE_ORDER',
      payload_hash: '1d165fb6a9737ded31e6eaadf25908468acafb8f59ff5659f0f371f5bffdb555' });
  });

  it('sends one atomic classification for a complete COMPLETED capture and never calls receive directly', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR })] });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(rpcCalls(h, RPC.submission)).toEqual([{ name: RPC.submission, args: { p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_attempt_id: ATTEMPT, p_lease_token: LEASE, p_fencing_version: '1', p_classification: {
        contract_version: 'web-payment-submission-classification.v2', context_id: CONTEXT, quote_hash: HASH,
        provider_request_key: ATTEMPT, provider_order_id: PROVIDER_ORDER, environment: 'SANDBOX', kind: 'CLEAN',
        category: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', http_status: 201, body_status: 'PARSED',
        post_capture_ids: ['3C679366HH908993F'], unparseable_capture_count: 0, capture_count_exceeded: false,
        facts: [{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
          { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: true }],
        assertions: [], receive_fact_index: 1 } } }]);
    expect(outcome).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expectNoPerFactWrite(h);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|55555555|44444444|3C679366HH908993F/);
  });

  it.each([
    ['INTAKE_HELD refusal', p1Ack({ intake: INTAKE_HELD })],
    ['DB ADVERSE override of the requested CLEAN', p1Ack({ effectiveKind: 'ADVERSE' })],
    ['CONFLICT_RECORDED result', { data: { contract_version: 'web-payment-submission-result.v1', outcome: 'CONFLICT_RECORDED',
      replayed: false, conflict_id: CYCLE, original_classification_id: CLASSIFICATION } }],
    ['BLOCKED SENDER_TUPLE_MISMATCH result', { data: { contract_version: 'web-payment-submission-result.v1', outcome: 'BLOCKED',
      safe_reason_code: 'SENDER_TUPLE_MISMATCH' } }],
  ])('returns REVIEW after an acknowledged %s with no protected GET and no direct receive', async (_label, reply) => {
    const h = boundaries({ [RPC.submission]: [reply as RpcReply] });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0); expectNoPerFactWrite(h);
  });

  it.each(['DECLINED', 'FAILED'])('classifies a %s capture as ADVERSE and reports CAPTURE_FAILED', async status => {
    const h = boundaries({ [RPC.submission]: [p1Ack()] });
    h.transport.captureOrder.mockResolvedValue(parsed(capturedOrder(status), 201));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT', http_status: 201,
      body_status: 'PARSED', post_capture_ids: ['3C679366HH908993F'], receive_fact_index: null });
    expect(classification(h).facts.map((item: any) => item.evidence))
      .toContainEqual(fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', status));
    expect(outcome).toEqual({ kind: 'CAPTURE_FAILED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expectNoPerFactWrite(h);
  });

  it('holds an HTTP 422 capture rejection as ADVERSE without a protected recovery GET', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack()] });
    h.transport.captureOrder.mockResolvedValue(parsed({ name: 'Q7pPriv' }, 422));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(capturedOrder()));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', category: 'HTTP_REJECTED_4XX', http_status: 422, body_status: 'PARSED',
      unparseable_capture_count: 0, capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null });
    expect(JSON.stringify(rpcCalls(h, RPC.submission))).not.toContain('Q7pPriv');
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expectNoPerFactWrite(h);
  });

  it('commits a partial VOIDED response that has no ORDER fact as the exact caller assertion', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack()] });
    const post: any = providerOrder('VOIDED'); delete post.purchase_units[0].payee;
    h.transport.captureOrder.mockResolvedValue(parsed(post, 201));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(capturedOrder()));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ORDER_VOIDED', http_status: 201,
      body_status: 'PARSED', post_capture_ids: [], facts: [], receive_fact_index: null });
    expect(classification(h).assertions).toContainEqual({ code: 'UNRECORDABLE_PROVIDER_FACT',
      detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } });
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0); expectNoPerFactWrite(h);
  });

  // Same input and the same two actual facts as the legacy case 'returns local REVIEW without intake when the
  // AUTHORIZE CAPTURE record returns RECORDED'. The S1 ACK reports RECORDED for both facts, as the old tape did.
  // Native RECORDED is not CLEAN evidence (spec 5/10 section 9). W keeps its own REVIEW as a caller assertion.
  it('sends the same-ID race judgment as the exact SAME_ID_RACE_UNCONFIRMED assertion and never requests CLEAN', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack()] });
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    h.transport.captureOrder.mockResolvedValue(parsed(body, 201));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(capturedOrder()));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED',
      post_capture_ids: ['3C679366HH908993F'], receive_fact_index: null });
    expect(['RESPONSE_ADVERSE_FACT', 'RESPONSE_CONTRADICTION_UNREPRESENTABLE']).toContain(classification(h).category);
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: false }]);
    expect(classification(h).assertions).toContainEqual({ code: 'SAME_ID_RACE_UNCONFIRMED', detail: {} });
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expect(rpcCalls(h, RPC.preintent)).toHaveLength(0); expectNoPerFactWrite(h);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'REVIEW_REQUIRED', newOrderAllowed: false });
  });
});

describe('W2 P2 protected GET runs only after an eligible NO_RESPONSE ACK and an OPEN ACK', () => {
  it('runs P1 ACK, OPEN ACK, one GET and one atomic completion after a lost capture response', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack({ hold: HOLD_GET_ONLY })], [RPC.open]: [OPENED_ACK],
      [RPC.complete]: [p2Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR })] });
    lostCaptureResponse(h);
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    // Plan eligibleTrail: P1_ACK, OPEN_ACK, GET, COMPLETE_ACK.
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(classification(h)).toEqual({ contract_version: 'web-payment-submission-classification.v2', context_id: CONTEXT,
      quote_hash: HASH, provider_request_key: ATTEMPT, provider_order_id: PROVIDER_ORDER, environment: 'SANDBOX',
      kind: 'NO_RESPONSE', category: 'TRANSPORT_UNKNOWN', http_status: null, body_status: null, post_capture_ids: null,
      unparseable_capture_count: 0, capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null });
    expect(rpcCalls(h, RPC.open)).toEqual([{ name: RPC.open,
      args: { p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'USER_CAPTURE' } }]);
    expect(rpcCalls(h, RPC.complete)).toEqual([{ name: RPC.complete, args: { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED',
        get_http_status: 200, get_body_status: 'PARSED', observed_capture_ids: ['3C679366HH908993F'],
        unparseable_capture_count: 0, capture_count_exceeded: false,
        facts: [{ evidence: fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
          { evidence: fact('LOOKUP', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: true }],
        assertions: [], receive_fact_index: 1 } } }]);
    expect(outcome).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expectNoPerFactWrite(h);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|eeeeeeee|55555555/);
  });

  it.each([
    ['a NO_RESPONSE ACK whose hold is not GET-eligible', p1Ack({ hold: HOLD_STICKY }), null, null],
    ['an OPEN reply READ_IN_PROGRESS', p1Ack({ hold: HOLD_GET_ONLY }), { data: { contract_version: 'web-payment-read-cycle-open.v1',
      outcome: 'READ_IN_PROGRESS', deadline_at: '2026-11-14T00:00:45.123456+00:00' } }, 'IN_PROGRESS'],
    ['an OPEN reply NOT_APPLICABLE', p1Ack({ hold: HOLD_GET_ONLY }),
      { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_APPLICABLE' } }, null],
    ['a lost OPEN ACK', p1Ack({ hold: HOLD_GET_ONLY }), LOST_ACK, 'SUBMISSION_UNKNOWN'],
  ])('sends no protected GET after %s', async (_label, p1, open, kind) => {
    const h = boundaries({ [RPC.submission]: [p1 as RpcReply], [RPC.open]: open ? [open as RpcReply] : [] });
    lostCaptureResponse(h);
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual(open ? [RPC.submission, RPC.open] : [RPC.submission]);
    if (kind) expect(outcome).toEqual({ kind });
    expect(outcome.kind).not.toBe('INTAKE_PENDING');
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.complete)).toHaveLength(0); expectNoPerFactWrite(h);
  });

  it('completes the opened cycle with explicit NO_DATA when the protected GET has no response', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack({ hold: HOLD_GET_ONLY })], [RPC.open]: [OPENED_ACK],
      [RPC.complete]: [p2Ack({ hold: HOLD_GET_ONLY })] });
    lostCaptureResponse(h, { kind: 'TRANSPORT_UNKNOWN' });
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(completion(h)).toEqual({ contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA',
      category: 'READ_TRANSPORT_UNKNOWN', get_http_status: null, get_body_status: null, observed_capture_ids: null,
      unparseable_capture_count: 0, capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null });
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expectNoPerFactWrite(h);
  });

  it('reports SUBMISSION_UNKNOWN after a lost completion ACK with one protected GET and no retry', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack({ hold: HOLD_GET_ONLY })], [RPC.open]: [OPENED_ACK], [RPC.complete]: [LOST_ACK] });
    lostCaptureResponse(h);
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.complete)).toHaveLength(1); expectNoPerFactWrite(h);
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|eeeeeeee/);
  });

  it('records a partial POST capture X unchanged and leaves the X/Y comparison to the DB', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack({ hold: HOLD_GET_ONLY })], [RPC.open]: [OPENED_ACK],
      [RPC.complete]: [p2Ack({ effectiveKind: 'ADVERSE' })] });
    const post: any = capturedOrder(); delete post.intent; post.purchase_units[0].payments.captures[0].id = 'X';
    const lookup = capturedOrder(); lookup.purchase_units[0].payments.captures[0].id = 'Y';
    h.transport.captureOrder.mockResolvedValue(parsed(post, 201));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(lookup));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(classification(h)).toMatchObject({ kind: 'NO_RESPONSE', category: 'PARTIAL_UNCONTRADICTED', http_status: 201,
      body_status: 'PARSED', post_capture_ids: ['X'], facts: [], assertions: [], receive_fact_index: null });
    expect(completion(h).observed_capture_ids).toEqual(['Y']);
    expect(completion(h).facts.map((item: any) => item.evidence).filter((e: any) => e.identity_kind === 'CAPTURE'))
      .toEqual([fact('LOOKUP', 'CAPTURE', 'Y', 'COMPLETED')]);
    // The scripted S3 ACK reports effective ADVERSE. The DB, not W memory, owns the E={X} and O={Y} comparison.
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' }); expectNoPerFactWrite(h);
  });

  it('sends literal observed IDs X and Y when only the fact for X can be built', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }], [RPC.open]: [OPENED_ACK],
      [RPC.complete]: [p2Ack({ effectiveKind: 'ADVERSE' })] });
    const body: any = capturedOrder();
    body.purchase_units[0].payments.captures = [
      { id: 'X', status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' }, custom_id: REFERENCE }, { id: 'Y' }];
    h.transport.getOrder.mockResolvedValue(parsed(body));
    const outcome = await reconcilePayPalOrder(h.deps, input);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, 'binding', 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.open)[0].args).toEqual({ p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'USER_RECONCILE' });
    const completionSent = completion(h);
    expect(completionSent.observed_capture_ids).toEqual(['X', 'Y']);
    expect(completionSent.facts.filter((f: any) => f.evidence.identity_kind === 'CAPTURE')
      .map((f: any) => f.evidence.external_id)).toEqual(['X']);
    expect(completionSent.facts.map((f: any) => f.evidence)).toContainEqual(fact('LOOKUP', 'CAPTURE', 'X', 'COMPLETED'));
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    // DB effective ADVERSE and intake 0 are D2/H1 observer evidence. This case shows only what W sends and omits.
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expectNoPerFactWrite(h);
  });

  it('uses the OPEN acknowledgment when an intent appeared after the reconcile getter', async () => {
    // The getter saw no intent. The scripted OPEN reply models an intent committed before the database lock.
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }], [RPC.open]: [OPENED_ACK],
      [RPC.complete]: [p2Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR })] });
    h.transport.getOrder.mockResolvedValue(parsed(capturedOrder()));
    const outcome = await reconcilePayPalOrder(h.deps, input);
    expect(h.trail.slice(h.trail.indexOf('token') + 1)).toEqual([RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.complete)[0].args).toMatchObject({ p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { kind: 'CLEAN', observed_capture_ids: ['3C679366HH908993F'], receive_fact_index: 1 } });
    expect(outcome).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expectNoPerFactWrite(h);
  });

  it('does not use NOT_APPLICABLE to send an unprotected GET for an order whose intent the getter confirmed', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }], [RPC.open]: [NOT_APPLICABLE_OPEN] });
    h.transport.getOrder.mockResolvedValue(parsed(capturedOrder()));
    const outcome = await reconcilePayPalOrder(h.deps, input);
    expect(h.trail.slice(h.trail.indexOf('token') + 1)).toEqual([RPC.open]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(0);
    expect(outcome.kind).not.toBe('INTAKE_PENDING');
    expect(rpcCalls(h, RPC.complete)).toHaveLength(0); expectNoPerFactWrite(h);
  });

  // The S3 reply here is the parsed SDK response only. The late or conflict row, its commit and the native replay
  // are D and H1 evidence. A late CLEAN result does not release the abandoned cycle and is not an intake.
  it.each([
    ['LATE_RECORDED', { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'LATE_RECORDED', replayed: false,
      late_id: CLASSIFICATION, effective_kind: 'CLEAN' } }, 'LATE'],
    ['CONFLICT_RECORDED', { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'CONFLICT_RECORDED',
      replayed: false, conflict_id: CLASSIFICATION } }, 'CONFLICT'],
  ])('gives no intake and no retry after the S3 reply %s and reports it to the trusted runtime', async (_label, reply, kind) => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }], [RPC.open]: [OPENED_ACK], [RPC.complete]: [reply as RpcReply] });
    h.transport.getOrder.mockResolvedValue(parsed(capturedOrder()));
    const reports: any[] = [];
    const runtime = { actorKind: 'SCANNER' as const,
      window: { deadlineAtMs: NOW + 20_000, signal: new AbortController().signal, nowMs: () => NOW },
      onReadResult: (report: unknown) => { reports.push(report); } };
    const outcome = await reconcilePayPalOrder({ ...h.deps, runtime }, input);
    expect(h.trail.slice(h.trail.indexOf('token') + 1)).toEqual([RPC.open, 'get', RPC.complete]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ kind, opened: true, readCancelled: false });
    expect(reports[0].intake ?? null).toBeNull();
    expect(outcome.kind).not.toBe('INTAKE_PENDING');
    expect(h.transport.getOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.complete)).toHaveLength(1);
    expectNoPerFactWrite(h);
    expect(JSON.stringify({ outcome, reports, logs: h.log.mock.calls })).not.toContain(CYCLE_TOKEN);
  });
});

describe('W2 P1 failure or lost ACK sends no protected GET', () => {
  it.each([
    ['a complete capture and a truncated ACK', null,
      { data: { contract_version: 'web-payment-submission-result.v1', outcome: 'CLASSIFIED' } }],
    ['a lost capture response and HTTP 503', { kind: 'TRANSPORT_UNKNOWN' }, LOST_ACK],
    ['an unreadable 201 body and HTTP 503', { kind: 'RESPONSE', bodyStatus: 'STREAM_ERROR', status: 201, body: null }, LOST_ACK],
  ])('reports SUBMISSION_UNKNOWN after %s', async (_label, response, reply) => {
    const h = boundaries({ [RPC.submission]: [reply as RpcReply] });
    if (response) h.transport.captureOrder.mockResolvedValue(response);
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(capturedOrder()));
    expectP1Failure(h, await capturePayPalOrder(h.deps, approvedInput));
  });
});

// Migration of the legacy post-intent per-fact continuation cases (plan W2 table and two verified extra cases).
// Each case keeps the original response fixture. The facts of the old per-fact RPC tape are the facts of the
// one atomic payload in the same order. A fact that the old tape sent with the bind RPC has bind=true.
describe('W2 migrated per-fact continuation cases keep the actual facts in one atomic payload', () => {
  async function failedClassification(post?: unknown) {
    const h = boundaries({ [RPC.submission]: [LOST_ACK] });
    if (post) h.transport.captureOrder.mockResolvedValue(parsed(post, 201));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(capturedOrder()));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    return { h, outcome };
  }
  const second = (id: string, status: string, value = '9.99') =>
    ({ id, status, amount: { currency_code: 'USD', value }, custom_id: 'v2:11111111-1111-4111-8111-111111111111' });

  // Was 'preserves intake failure after confirmed capture and never retries POST'. P1 ACK failure.
  it('atomic classification ACK failure after a confirmed capture never calls receive directly', async () => {
    const { h, outcome } = await failedClassification();
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'CLEAN', category: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', receive_fact_index: 1 });
  });

  // Was 'records the same selected evidence once after bind response loss and then the remaining actual candidate'. P1 ACK loss.
  it('atomic mixed-capture classification ACK loss does not replay facts one by one', async () => {
    const body = capturedOrder(); body.purchase_units[0].payments.captures.push(second('9SECOND', 'PENDING'));
    const { h, outcome } = await failedClassification(body);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', context_id: CONTEXT, http_status: 201, body_status: 'PARSED',
      post_capture_ids: ['3C679366HH908993F', '9SECOND'], receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: true },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '9SECOND', 'PENDING'), bind: false }]);
  });

  // Was 'attempts the next remaining actual ID in response order after the first record returns 503'. P1 failure.
  it('atomic multi-capture POST failure does not continue per-fact delivery', async () => {
    const body = capturedOrder();
    body.purchase_units[0].payments.captures.push(second('9SECOND', 'PENDING'), second('9THIRD', 'DECLINED'));
    const { h, outcome } = await failedClassification(body);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', context_id: CONTEXT, http_status: 201, body_status: 'PARSED',
      post_capture_ids: ['3C679366HH908993F', '9SECOND', '9THIRD'], receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: true },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '9SECOND', 'PENDING'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '9THIRD', 'DECLINED'), bind: false }]);
  });

  // Was 'keeps the current call REVIEW after actual contradictory POST record returns 503'. P1 failure.
  it('atomic contradictory POST failure returns submission unknown', async () => {
    const post: any = capturedOrder(); delete post.intent; post.purchase_units[0].amount.value = '10.00';
    const { h, outcome } = await failedClassification(post);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED', '1000'), bind: false }]);
  });

  // Was 'records deduplicated actual A then B after complete AUTHORIZE POST even when A record returns 503'. P1 failure.
  // The two literal hashes are the values recorded by the old case.
  it('atomic AUTHORIZE A-B payload is preserved when classification fails', async () => {
    const post = capturedOrder(); post.intent = 'AUTHORIZE';
    post.purchase_units[0].payments.captures = [second('3C679366HH908993F', 'COMPLETED', '10.00'),
      second('3C679366HH908993F', 'COMPLETED', '10.00'), second('9SECOND', 'COMPLETED', '11.00')];
    const { h, outcome } = await failedClassification(post);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: { ...fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED', '1000'),
        payload_hash: 'd8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6' }, bind: false },
      { evidence: { ...fact('SUBMIT_RESPONSE', 'CAPTURE', '9SECOND', 'COMPLETED', '1100'),
        payload_hash: 'dec8efa9c73e43c46e70c5fb94f981a21758c06d465a4ed29ee87767067721cc' }, bind: false }]);
    expect([...new Set(classification(h).post_capture_ids as string[])].sort()).toEqual(['3C679366HH908993F', '9SECOND']);
  });

  // Was 'still records the actual CAPTURE once after the FUTURE_ORDER record returns 503'. P1 failure.
  it('atomic FUTURE_ORDER classification failure does not recover or intake', async () => {
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER'; delete body.intent;
    body.purchase_units[0].payments.captures[0].amount.value = '10.00';
    const { h, outcome } = await failedClassification(body);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'FUTURE_ORDER'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED', '1000'), bind: false }]);
  });

  // Was 'still records the AUTHORIZE CAPTURE once after the ORDER record returns 503'. P1 failure.
  it('atomic AUTHORIZE classification failure does not recover or intake', async () => {
    const body: any = capturedOrder(); body.intent = 'AUTHORIZE';
    const { h, outcome } = await failedClassification(body);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: false }]);
  });

  // Was 'still binds the actual capture once after the unknown-status ORDER record returns 503'. P1 failure.
  it('atomic unknown-status classification failure does not recover or intake', async () => {
    const body: any = capturedOrder(); body.status = 'FUTURE_ORDER';
    const { h, outcome } = await failedClassification(body);
    expectP1Failure(h, outcome);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', http_status: 201, body_status: 'PARSED', receive_fact_index: null });
    expect(classification(h).facts).toEqual([
      { evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'FUTURE_ORDER'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: true }]);
  });

  // Was 'still records actual GET Y after matching FUTURE_ORDER record returns 503'. P2 failure.
  // The two literal hashes are the values recorded by the old case.
  it('atomic FUTURE_ORDER GET failure leaves read completion unknown', async () => {
    const h = boundaries({ [RPC.submission]: [p1Ack({ hold: HOLD_GET_ONLY })], [RPC.open]: [OPENED_ACK], [RPC.complete]: [LOST_ACK] });
    const post: any = capturedOrder(); delete post.intent;
    const lookup = capturedOrder(); lookup.status = 'FUTURE_ORDER';
    lookup.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    h.transport.captureOrder.mockResolvedValue(parsed(post, 201));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(lookup));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    // P2 failure boundary: the one protected GET was sent, the completion is unknown, no further GET or intake follows.
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.complete)).toHaveLength(1); expectNoPerFactWrite(h);
    expect(classification(h)).toMatchObject({ kind: 'NO_RESPONSE', category: 'PARTIAL_UNCONTRADICTED',
      post_capture_ids: ['3C679366HH908993F'], facts: [] });
    expect(completion(h)).toMatchObject({ kind: 'ADVERSE', get_http_status: 200, get_body_status: 'PARSED',
      observed_capture_ids: ['9LOOKUPCAP'], receive_fact_index: null });
    expect(completion(h).facts).toEqual([
      { evidence: { ...fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'FUTURE_ORDER'),
        payload_hash: '1d165fb6a9737ded31e6eaadf25908468acafb8f59ff5659f0f371f5bffdb555' }, bind: false },
      { evidence: { ...fact('LOOKUP', 'CAPTURE', '9LOOKUPCAP', 'COMPLETED'),
        payload_hash: '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8' }, bind: false }]);
    expect(toPayPalChargeBrowserDto(ORDER, outcome)).toEqual({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
      state: 'SUBMISSION_UNKNOWN', newOrderAllowed: false });
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
  });
});

describe('W2 P3 pre-intent assertion and the R-PRE residual', () => {
  const countryConflict = () => { const body = providerOrder(); body.payment_source.paypal.address.country_code = 'KR'; return parsed(body); };

  it('stores the pre-intent COUNTRY judgment as a caller assertion and a stored assertion blocks the new claim', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: { ...NATIVE_FOUND, review_required: true } }],
      [RPC.preintent]: [{ data: { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: false,
        assertion_ids: [CLASSIFICATION] } }] });
    h.transport.getOrder.mockResolvedValue(countryConflict());
    const first = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.preintent)).toEqual([{ name: RPC.preintent, args: { p_actor_user_id: ACTOR, p_order_id: ORDER,
      p_assertions: [{ code: 'COUNTRY_MISMATCH', detail: {} }] } }]);
    expect(first).toEqual({ kind: 'REVIEW_REQUIRED' });
    // S4 does not accept the post-intent code SAME_ID_RACE_UNCONFIRMED.
    expect(JSON.stringify(rpcCalls(h, RPC.preintent))).not.toContain('SAME_ID_RACE_UNCONFIRMED');
    // The second getter reply is the scripted sticky projection of the stored assertion.
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(rpcCalls(h, RPC.claim)).toHaveLength(0); expectNoSubmission(h);
    expect(rpcCalls(h, RPC.submission)).toHaveLength(0); expect(rpcCalls(h, RPC.bind)).toHaveLength(0);
    expect(rpcCalls(h, RPC.observe)).toHaveLength(0); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps the R-PRE residual explicit: a failed P3 store does not block a later clean claim and POST', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: NATIVE_FOUND }, { data: NATIVE_FOUND }],
      [RPC.prepare]: [{ data: NATIVE_PREPARED }, { data: NATIVE_PREPARED }], [RPC.preintent]: [LOST_ACK],
      [RPC.submission]: [p1Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR })] });
    h.transport.getOrder.mockResolvedValueOnce(countryConflict()).mockResolvedValueOnce(parsed(providerOrder()));
    const first = await capturePayPalOrder(h.deps, approvedInput);
    expect(rpcCalls(h, RPC.preintent)).toHaveLength(1);
    expect(first).toEqual({ kind: 'REVIEW_REQUIRED' }); expect(rpcCalls(h, RPC.claim)).toHaveLength(0);
    // The failed store left no sticky assertion, so the second getter reply has review_required=false.
    expect(await capturePayPalOrder(h.deps, approvedInput)).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(rpcCalls(h, RPC.preintent)).toHaveLength(1); expect(rpcCalls(h, RPC.claim)).toHaveLength(1);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(rpcCalls(h, RPC.submission)).toHaveLength(1);
    expect(rpcCalls(h, RPC.receive)).toHaveLength(0);
    expect(JSON.stringify({ first, logs: h.log.mock.calls })).not.toContain('Q7pPriv');
  });
});

// provider_read_window_wiring (plan W2, spec G5). The trusted runtime is an in-memory value from the executor.
// AbortSignal.timeout is replaced by a recorded controller. The spy is evidence of two things only: the timeout
// argument that the product passes, and that a fired deadline or a parent cancellation reaches the read signal.
// It is not evidence of real elapsed time or of a platform timeout.
describe('W2 provider_read_window_wiring through the orchestrator', () => {
  function fakeDeadlines() {
    const timers: Array<{ ms: number; controller: AbortController }> = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController(); timers.push({ ms, controller }); return controller.signal; });
    // Fires the recorded deadlines in creation order. Returns the duration of the one that aborts the signal.
    const firedBy = (signal: unknown) => {
      if (!(signal instanceof AbortSignal) || signal.aborted) return null;
      for (const timer of timers) { timer.controller.abort(); if (signal.aborted) return timer.ms; }
      return null;
    };
    return { timers, firedBy };
  }
  function scanner(h: Harness, remainingMs: number) {
    const controller = new AbortController(); const reports: any[] = []; let clock = NOW;
    const runtime = { actorKind: 'SCANNER' as const,
      window: { deadlineAtMs: NOW + remainingMs, signal: controller.signal, nowMs: () => clock },
      onReadResult: (report: unknown) => { reports.push(report); } };
    return { deps: { ...h.deps, runtime }, controller, reports, advance: (ms: number) => { clock += ms; } };
  }
  const scannerScript = () => ({ [RPC.getter]: [{ data: INTENT_FOUND }], [RPC.open]: [OPENED_ACK],
    [RPC.complete]: [p2Ack({ hold: HOLD_GET_ONLY })] });
  const READS = ['resolver', 'requestToken', 'getOrder'] as const;
  const signalOf = (h: Harness, read: typeof READS[number]): unknown => (read === 'resolver' ? h.credentials.resolve
    : read === 'requestToken' ? h.transport.requestToken : h.transport.getOrder).mock.calls[0]?.[0]?.signal;
  const DEFERRED = (readCancelled: boolean) => ({ kind: 'NOT_OPENED', reason: 'DEFERRED', opened: false, readCancelled });

  it.each(READS)('gives the %s read a deadline at the remaining 500 ms', async read => {
    const deadlines = fakeDeadlines(); const h = boundaries(scannerScript()); const s = scanner(h, 500);
    await reconcilePayPalOrder(s.deps, input);
    expect(signalOf(h, read)).toBeInstanceOf(AbortSignal);
    expect(deadlines.firedBy(signalOf(h, read))).toBe(500);
  });

  it.each(READS)('propagates the parent window cancellation to the %s read signal', async read => {
    fakeDeadlines(); const h = boundaries(scannerScript()); const s = scanner(h, 500);
    await reconcilePayPalOrder(s.deps, input);
    const signal = signalOf(h, read) as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal); expect(signal.aborted).toBe(false);
    s.controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it.each(READS)('caps the %s read deadline at 10 s when 20 s remain', async read => {
    const deadlines = fakeDeadlines(); const h = boundaries(scannerScript()); const s = scanner(h, 20_000);
    await reconcilePayPalOrder(s.deps, input);
    expect(signalOf(h, read)).toBeInstanceOf(AbortSignal);
    expect(deadlines.timers.map(timer => timer.ms)).not.toContain(20_000);
    expect(deadlines.firedBy(signalOf(h, read))).toBe(10_000);
  });

  it.each([['zero remaining budget', 0, false], ['a window cancelled before the start', 20_000, true]] as const)
    ('makes no resolver, token or GET call and opens no cycle with %s', async (_label, remainingMs, cancelled) => {
      const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }] }); const s = scanner(h, remainingMs);
      if (cancelled) s.controller.abort();
      const outcome = await reconcilePayPalOrder(s.deps, input);
      expect(h.credentials.resolve).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(0);
      expect(h.transport.getOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
      expect(s.reports).toEqual([DEFERRED(cancelled)]);
      expect(outcome).toEqual({ kind: 'IN_PROGRESS' });
    });

  it('defers before the token read when the resolver used the remaining budget', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }] }); const s = scanner(h, 500);
    h.credentials.resolve.mockImplementation(async () => { s.advance(500);
      return { clientId: 'synthetic-client', clientSecret: 'Q7pPriv-secret' }; });
    const outcome = await reconcilePayPalOrder(s.deps, input);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(1); expect(h.transport.requestToken).toHaveBeenCalledTimes(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(s.reports).toEqual([DEFERRED(false)]);
    expect(outcome).toEqual({ kind: 'IN_PROGRESS' });
  });

  // Control: a credential failure inside the budget is not a DEFERRED report.
  it('does not report DEFERRED for a credential failure inside the budget', async () => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }] }); const s = scanner(h, 20_000);
    h.credentials.resolve.mockResolvedValue(null);
    expect(await reconcilePayPalOrder(s.deps, input)).toEqual({ kind: 'UNAVAILABLE', stage: 'CREDENTIAL' });
    expect(s.reports).toEqual([]); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
  });

  it('awaits a slow prepare and recalculates the remaining time before the resolver read', async () => {
    const deadlines = fakeDeadlines(); const prepare = deferred<RpcDelivery>();
    const h = boundaries({ ...scannerScript(), [RPC.prepare]: [prepare.promise] }); const s = scanner(h, 20_000);
    const pending = reconcilePayPalOrder(s.deps, input);
    await vi.waitFor(() => expect(rpcCalls(h, RPC.prepare)).toHaveLength(1));
    s.advance(19_500);
    expect(h.credentials.resolve).toHaveBeenCalledTimes(0);
    prepare.resolve({ data: NATIVE_PREPARED }); await pending;
    expect(h.credentials.resolve).toHaveBeenCalledTimes(1);
    expect(deadlines.firedBy(signalOf(h, 'resolver'))).toBe(500);
  });

  it('finishes a started prepare after the window is cancelled and then defers the reads', async () => {
    const prepare = deferred<RpcDelivery>();
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }], [RPC.prepare]: [prepare.promise] }); const s = scanner(h, 20_000);
    const pending = reconcilePayPalOrder(s.deps, input);
    await vi.waitFor(() => expect(rpcCalls(h, RPC.prepare)).toHaveLength(1));
    s.controller.abort();
    // The prepare RPC keeps its own client deadline. The read signal is not its signal.
    const prepareInit = h.rpcFetch.mock.calls.find(([url]) => String(url).endsWith(`/${RPC.prepare}`))![1] as RequestInit;
    expect(prepareInit.signal?.aborted ?? false).toBe(false);
    prepare.resolve({ data: NATIVE_PREPARED });
    const outcome = await pending;
    expect(h.credentials.resolve).toHaveBeenCalledTimes(0); expect(h.transport.requestToken).toHaveBeenCalledTimes(0);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(0); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(s.reports).toEqual([DEFERRED(true)]);
    expect(outcome).toEqual({ kind: 'IN_PROGRESS' });
  });

  it.each([
    ['the budget ended during OPEN', 'READ_LOCAL_BUDGET_EXHAUSTED', false],
    ['the window was cancelled during OPEN', 'READ_LOCAL_CANCELLED', true],
  ] as const)('completes an opened cycle with explicit NO_DATA and no GET when %s', async (_label, category, cancelled) => {
    const h = boundaries({ [RPC.getter]: [{ data: INTENT_FOUND }], [RPC.complete]: [p2Ack({ hold: HOLD_GET_ONLY })] });
    const s = scanner(h, 20_000);
    h.script[RPC.open] = [() => { if (cancelled) s.controller.abort(); else s.advance(20_000); return OPENED_ACK; }];
    const outcome = await reconcilePayPalOrder(s.deps, input);
    expect(h.trail.slice(h.trail.indexOf('token') + 1)).toEqual([RPC.open, RPC.complete]);
    expect(h.transport.getOrder).toHaveBeenCalledTimes(0);
    expect(rpcCalls(h, RPC.open)[0].args).toEqual({ p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'SCANNER' });
    // The completion write is awaited after the read window ended (G5: a started write is not raced away).
    expect(rpcCalls(h, RPC.complete)[0].args).toEqual({ p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN, p_completion: {
      contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category, get_http_status: null,
      get_body_status: null, observed_capture_ids: null, unparseable_capture_count: 0, capture_count_exceeded: false,
      facts: [], assertions: [], receive_fact_index: null } });
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]).toMatchObject({ kind: 'COMPLETED', effectiveKind: 'NO_DATA', opened: true, readCancelled: cancelled, cycleId: CYCLE });
    expect(JSON.stringify({ outcome, reports: s.reports, logs: h.log.mock.calls })).not.toContain(CYCLE_TOKEN);
    expect(outcome.kind).not.toBe('INTAKE_PENDING'); expectNoPerFactWrite(h);
  });
});

// ---------------------------------------------------------------------------------------------
// W2 correction after the independent review: S-H1 (P1) and S-H2 (P2).
// Each case calls the public orchestrator with the real W1 repository. Only provider, binding, credential, clock
// and RPC delivery are scripted. A scripted ACK is a delivery fixture. It is not evidence of a DB commit, of the
// DB effective result or of the hold that the DB keeps. D2 and H1 own those.

// S-H1. The capture POST returns a 2xx PARSED response with the matching ORDER and no intent key, so the response
// is partial. A recognised adverse capture status in it is an actual provider fact. W sends it as ADVERSE and
// sends no protected recovery GET, also when a later GET would report COMPLETED for the same capture ID.
describe('W2 correction S-H1: a known adverse CAPTURE in a partial POST sends no protected GET', () => {
  // S1 ACK. It echoes the sent kind. A NO_RESPONSE request receives the GET-eligible hold. Every other request
  // receives the sticky hold. The OPEN reply, the S3 reply and the second GET reply exist so that a NO_RESPONSE
  // request reaches a COMPLETED capture of the same ID and an intake. An ADVERSE request leaves them unused.
  const ackByKind = (args: Record<string, any>): RpcDelivery =>
    p1Ack({ hold: args.p_classification.kind === 'NO_RESPONSE' ? HOLD_GET_ONLY : HOLD_STICKY })(args);
  function partialPost(post: unknown) {
    const h = boundaries({ [RPC.submission]: [ackByKind], [RPC.open]: [OPENED_ACK],
      [RPC.complete]: [p2Ack({ intake: NATIVE_INTAKE, hold: HOLD_CLEAR })] });
    h.transport.captureOrder.mockResolvedValue(parsed(post, 201));
    h.transport.getOrder.mockResolvedValueOnce(parsed(providerOrder())).mockResolvedValueOnce(parsed(capturedOrder()));
    return h;
  }
  const withoutIntent = (status: string) => { const post: any = capturedOrder(status); delete post.intent; return post; };
  const captureFactsOf = (h: Harness) => (classification(h).facts as Array<{ evidence: { identity_kind: string } }>)
    .filter(item => item.evidence.identity_kind === 'CAPTURE');

  // The outcome follows the existing orchestrator rule for an acknowledged ADVERSE result: one actual DECLINED or
  // FAILED capture with no W judgment is CAPTURE_FAILED, and every other ADVERSE result is REVIEW_REQUIRED.
  it.each([
    ['DECLINED', 'CAPTURE_FAILED'], ['FAILED', 'CAPTURE_FAILED'],
    ['REFUNDED', 'REVIEW_REQUIRED'], ['PARTIALLY_REFUNDED', 'REVIEW_REQUIRED'],
  ] as const)('sends the actual %s CAPTURE fact as ADVERSE, sends no protected GET and reports %s', async (status, kind) => {
    const h = partialPost(withoutIntent(status));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.submission)).toHaveLength(1); expect(rpcCalls(h, RPC.open)).toHaveLength(0);
    expect(rpcCalls(h, RPC.complete)).toHaveLength(0); expectNoPerFactWrite(h);
    expect(classification(h)).toMatchObject({ contract_version: 'web-payment-submission-classification.v2', context_id: CONTEXT,
      quote_hash: HASH, provider_request_key: ATTEMPT, provider_order_id: PROVIDER_ORDER, environment: 'SANDBOX',
      kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT', http_status: 201, body_status: 'PARSED',
      post_capture_ids: ['3C679366HH908993F'], unparseable_capture_count: 0, capture_count_exceeded: false,
      assertions: [], receive_fact_index: null });
    const actualCapture = { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', '3C679366HH908993F', status), bind: false };
    expect(captureFactsOf(h)).toEqual([actualCapture]);
    // The actual ORDER fact may come before the capture. No other fact is allowed.
    expect([[actualCapture], [{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false }, actualCapture]])
      .toContainEqual(classification(h).facts);
    expect(outcome).toEqual({ kind });
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|55555555|44444444|3C679366HH908993F/);
  });

  // No external_id exists, so no CAPTURE evidence can be built. W keeps the judgment as the exact assertion.
  it('sends a FAILED capture that has no ID as the exact UNRECORDABLE_PROVIDER_FACT assertion and sends no protected GET', async () => {
    const post = withoutIntent('FAILED'); delete post.purchase_units[0].payments.captures[0].id;
    const h = partialPost(post);
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(1);
    expect(rpcCalls(h, RPC.open)).toHaveLength(0); expect(rpcCalls(h, RPC.complete)).toHaveLength(0); expectNoPerFactWrite(h);
    expect(classification(h)).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE',
      http_status: 201, body_status: 'PARSED', post_capture_ids: [], unparseable_capture_count: 0,
      capture_count_exceeded: false, receive_fact_index: null });
    expect(classification(h).assertions).toEqual([{ code: 'UNRECORDABLE_PROVIDER_FACT',
      detail: { fact_kind: 'CAPTURE', reason: 'ADVERSE_STATUS_PARTIAL' } }]);
    expect(captureFactsOf(h)).toEqual([]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
  });

  // Control. It passes before and after the correction. It shows that the same script permits the protected GET.
  it.each(['PENDING', 'COMPLETED'])('control: an otherwise identical partial %s POST stays NO_RESPONSE and reaches the one protected GET', async status => {
    const h = partialPost(withoutIntent(status));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(classification(h)).toMatchObject({ kind: 'NO_RESPONSE', category: 'PARTIAL_UNCONTRADICTED', http_status: 201,
      body_status: 'PARSED', post_capture_ids: ['3C679366HH908993F'], unparseable_capture_count: 0,
      capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null });
    expect(completion(h)).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED',
      observed_capture_ids: ['3C679366HH908993F'], receive_fact_index: 1 });
    expect(outcome).toEqual({ kind: 'INTAKE_PENDING', replayed: false });
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expectNoPerFactWrite(h);
  });
});

// S-H2. The protected recovery GET returns a non-2xx response with a PARSED body. W evaluates a bounded parsed
// judgment before the status-only NO_DATA fallback and completes the cycle as ADVERSE with the exact payload.
describe('W2 correction S-H2: a non-2xx protected GET completes its parsed judgment as ADVERSE', () => {
  // A lost capture response, an acknowledged GET-eligible NO_RESPONSE, one OPEN ACK and one S3 ACK that echoes
  // the sent kind. recovery is the result of the one protected GET.
  function recoveryRead(recovery: unknown) {
    const h = boundaries({ [RPC.submission]: [p1Ack({ hold: HOLD_GET_ONLY })], [RPC.open]: [OPENED_ACK], [RPC.complete]: [p2Ack()] });
    lostCaptureResponse(h, recovery);
    return h;
  }
  function expectOneProtectedRead(h: Harness) {
    expect(afterPost(h)).toEqual([RPC.submission, RPC.open, 'get', RPC.complete]);
    expect(rpcCalls(h, RPC.open)).toEqual([{ name: RPC.open,
      args: { p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'USER_CAPTURE' } }]);
    expect(h.transport.captureOrder).toHaveBeenCalledTimes(1); expect(h.transport.getOrder).toHaveBeenCalledTimes(2);
    expect(rpcCalls(h, RPC.complete)).toHaveLength(1); expectNoPerFactWrite(h);
  }

  it('completes a 503 VOIDED ORDER that has no merchant as READ_ADVERSE_UNSPECIFIED with the exact assertion', async () => {
    const lookup: any = providerOrder('VOIDED'); delete lookup.purchase_units[0].payee;
    const h = recoveryRead(parsed(lookup, 503));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expectOneProtectedRead(h);
    expect(rpcCalls(h, RPC.complete)).toEqual([{ name: RPC.complete, args: { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'ADVERSE',
        category: 'READ_ADVERSE_UNSPECIFIED', get_http_status: 503, get_body_status: 'PARSED', observed_capture_ids: [],
        unparseable_capture_count: 0, capture_count_exceeded: false, facts: [],
        assertions: [{ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } }],
        receive_fact_index: null } } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|eeeeeeee|55555555/);
  });

  it('completes a 503 response with 33 raw captures as READ_WORK_BOUND_EXCEEDED with no fact and unknown IDs', async () => {
    const lookup: any = capturedOrder();
    lookup.purchase_units[0].payments.captures = Array.from({ length: 33 }, (_unused, index) =>
      ({ id: `CAP${index}`, status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.99' }, custom_id: REFERENCE }));
    const h = recoveryRead(parsed(lookup, 503));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expectOneProtectedRead(h);
    expect(rpcCalls(h, RPC.complete)).toEqual([{ name: RPC.complete, args: { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'ADVERSE',
        category: 'READ_WORK_BOUND_EXCEEDED', get_http_status: 503, get_body_status: 'PARSED', observed_capture_ids: null,
        unparseable_capture_count: 0, capture_count_exceeded: true, facts: [], assertions: [], receive_fact_index: null } } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(JSON.stringify({ outcome, logs: h.log.mock.calls })).not.toMatch(/Q7pPriv|eeeeeeee|55555555/);
  });

  // Controls. These pass before and after the correction.
  it('control: an ordinary 503 with no provider fact and no judgment completes as NO_DATA', async () => {
    const h = recoveryRead(parsed({ name: 'INTERNAL_SERVICE_ERROR', message: 'Q7pPriv temporary' }, 503));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expectOneProtectedRead(h);
    expect(rpcCalls(h, RPC.complete)).toEqual([{ name: RPC.complete, args: { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category: 'READ_HTTP_5XX',
        get_http_status: 503, get_body_status: 'PARSED', observed_capture_ids: null, unparseable_capture_count: 0,
        capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null } } }]);
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
  });

  // A fact that can be built on a non-2xx response uses the existing READ_NON_SUCCESS_FACT arm. The actual
  // evidence is kept, no receive index is requested and the call is not an intake.
  it('control: a 503 response with representable facts completes as READ_NON_SUCCESS_FACT without an intake', async () => {
    const h = recoveryRead(parsed(capturedOrder(), 503));
    const outcome = await capturePayPalOrder(h.deps, approvedInput);
    expectOneProtectedRead(h);
    expect(rpcCalls(h, RPC.complete)).toEqual([{ name: RPC.complete, args: { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'ADVERSE',
        category: 'READ_NON_SUCCESS_FACT', get_http_status: 503, get_body_status: 'PARSED',
        observed_capture_ids: ['3C679366HH908993F'], unparseable_capture_count: 0, capture_count_exceeded: false,
        facts: [{ evidence: fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
          { evidence: fact('LOOKUP', 'CAPTURE', '3C679366HH908993F', 'COMPLETED'), bind: false }],
        assertions: [], receive_fact_index: null } } }]);
    expect(outcome).toEqual({ kind: 'REVIEW_REQUIRED' });
  });
});
