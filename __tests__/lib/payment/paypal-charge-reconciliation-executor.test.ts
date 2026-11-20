// @vitest-environment node
import { inspect } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRpcChargeBindingSource } from '@/lib/payment/paypal-charge/binding-source';
import { reconcilePayPalOrder } from '@/lib/payment/paypal-charge/orchestrator';
import { createRpcProviderEntryGate } from '@/lib/payment/paypal-charge/provider-entry';
import { createReconciliationRepository } from '@/lib/payment/paypal-charge/reconciliation-repository';
import { createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';
import { createPayPalFetchTransport } from '@/lib/payment/paypal-charge/transport';

// W3 bounded GET executor (plan section W3; spec G5, 7/10 sections 4 and 5, 8/10 S5-S7).
//
// What is real: the supabase-js client, the W1 charge and queue repositories, the RPC binding source, the RPC
// provider-entry gate, the W1 fetch transport and the W2 orchestrator. What is scripted: RPC delivery, provider HTTP
// replies, the credential resolver and the clock. A scripted ACK is a delivery fixture. It is not evidence of a
// native commit, of the DB effective result or of the hold that the DB keeps. D4 and H1 own that evidence.
//
// The executor module is loaded inside each case through a lazy Vite glob with an exact relative path. The glob
// has no entry for a source file that does not exist, so this file loads before the executor exists.
//   W3_IMPLEMENTATION_MISSING  the product file does not exist. This is the expected RED before the product gate.
//   W3_EXPORT_MISSING          the file exists and does not export the public function.
// Every other failure is an assertion, or a setup defect that the control block at the top of this file isolates.
//
// Test contract for the dependency shape, which the plan leaves to the implementation (coordinator accepted):
//   runPayPalReconciliationBatch(deps, input): Promise<{ resultCode, metrics, ... }>
//   deps  = { queue: ReconciliationRepository, chargeDeps(item: { orderId, userId, window: ReadWindow }) =>
//             PayPalChargeDeps without runtime, nowMs, log }
//   input = { executorId, runId, instanceId, maxItems, signal }
// @ts-ignore -- import.meta.glob is replaced by Vite when the test file is transformed.
const W3_MODULES: Record<string, () => Promise<unknown>> = import.meta.glob(
  ['../../../lib/payment/paypal-charge/reconciliation-executor.ts']);
type Executor = (deps: unknown, input: unknown) => Promise<any>;
async function loadExecutor(): Promise<Executor> {
  const loader = W3_MODULES['../../../lib/payment/paypal-charge/reconciliation-executor.ts'];
  if (!loader) throw new Error('W3_IMPLEMENTATION_MISSING: lib/payment/paypal-charge/reconciliation-executor.ts does not exist');
  const loaded = await loader() as Record<string, unknown>;
  if (typeof loaded.runPayPalReconciliationBatch !== 'function') throw new Error('W3_EXPORT_MISSING: runPayPalReconciliationBatch');
  return loaded.runPayPalReconciliationBatch as Executor;
}

const NOW = Date.parse('2026-11-14T00:00:00.123Z');
const DB = 'https://w3-scripted-db.example.invalid';
const PAYPAL = 'https://api-m.sandbox.paypal.com';
// The executor and run IDs are caller input. They differ from every DB-returned ID, so that a test fails when the
// executor uses one of them as the actor.
const EXECUTOR = 'e0000000-0000-4000-8000-00000000000e';
const RUN = 'f0000000-0000-4000-8000-00000000000f';
const INSTANCE = 'w3-unit-instance';
// Queue rows as S5 returns them. user is the DB owner of the order. lease is the queue lease token.
const ITEMS = [
  { order: '11111111-1111-4111-8111-111111111111', user: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', lease: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' },
  { order: '12121212-1212-4212-8212-121212121212', user: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', lease: 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2' },
  { order: '13131313-1313-4313-8313-131313131313', user: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', lease: 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3' },
] as const;
const ORDER = ITEMS[0].order; const DB_USER = ITEMS[0].user; const LEASE = ITEMS[0].lease;
const CONTEXT = '22222222-2222-4222-8222-222222222222';
const CREATE_KEY = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const QUOTE = '77777777-7777-4777-8777-777777777777';
const CYCLE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CYCLE_TOKEN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROVIDER_ORDER = '5O190127TN364715T';
const CAPTURE = '3C679366HH908993F';

const RPC = {
  run: 'record_web_payment_reconciliation_run', claim: 'claim_web_payment_reconciliation_item',
  finish: 'finish_web_payment_reconciliation_item', getter: 'get_web_payment_charge_context',
  prepare: 'prepare_web_payment_provider_context', binding: 'get_web_payment_provider_binding',
  open: 'open_web_payment_read_cycle', complete: 'complete_web_payment_read_cycle',
} as const;
// A reconciliation run is read-only for the charge. None of these RPCs may appear on the tape.
const FORBIDDEN_RPC = ['claim_web_payment_charge', 'record_web_payment_submission_intent',
  'record_web_payment_submission_result', 'receive_web_payment_purchase', 'authorize_web_payment_provider_entry'];

type Delivery = { data: unknown; status?: number };
type Control = { advance(ms: number): void; abort(): void };
type Reply = Delivery | Promise<Delivery> | ((args: Record<string, any>, control: Control) => Delivery | Promise<Delivery>);
type Script = Record<string, Reply[]>;
type ProviderDelivery = { status: number; body?: unknown } | 'NETWORK_ERROR';
type ProviderReply = ProviderDelivery | ((init: RequestInit, control: Control) => ProviderDelivery | Promise<ProviderDelivery>);
type ProviderScript = { token: ProviderReply[]; get: ProviderReply[] };
type Credential = { clientId: string; clientSecret: string };
type CredentialStep = Credential | null | 'THROW' | ((control: Control) => Credential | null);

// ---- Independent wire literals. Neither SQL nor a product parser builds these fixtures. ----------------------

const RECORDED: Delivery = { data: { contract_version: 'web-payment-reconciliation-run.v1', outcome: 'RECORDED', replayed: false } };
const EMPTY: Delivery = { data: { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'EMPTY' } };
const STALE: Delivery = { data: { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'STALE_LEASE' } };
const LOST: Delivery = { status: 503, data: { code: 'XX000', message: 'Q7pPriv ACK lost' } };
const claimed = (index = 0): Delivery => ({ data: { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'CLAIMED',
  order_id: ITEMS[index].order, user_id: ITEMS[index].user, lease_token: ITEMS[index].lease, attempt: '1', due_reason: 'NEW' } });
// S6 ACK. The queue state follows the sent code the way native finish does for a row that is not blocked.
const finished: Reply = args => {
  const state = args.p_result_code === 'INTAKE_PENDING' ? 'DONE' : args.p_result_code === 'HELD' ? 'HELD' : 'ACTIVE';
  return { data: { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'FINISHED', queue_state: state,
    next_due_at: state === 'ACTIVE' ? '2026-11-14T00:05:00.123456+00:00' : null } };
};
// Getter state of a queue candidate: a PayPal order with a linked provider order, a recorded intent and no intake.
const found = (overrides: Record<string, unknown> = {}): Reply => args => ({ data: {
  contract_version: 'web-payment-charge-context.v1', outcome: 'FOUND', charge_authority: false, order_id: args.p_order_id,
  provider: 'PAYPAL', environment: 'SANDBOX', row_version: '3', payment_state: 'SUBMISSION_UNKNOWN',
  settlement_state: 'NOT_INTAKE', actor_deleted: false, quote_id: QUOTE, quote_hash: HASH, product_id: 'STAR100',
  amount_minor: '999', currency: 'USD', quantity: '1', quote_expires_at: '2026-11-14T00:15:00.123456+00:00',
  context_id: CONTEXT, verification_binding_present: true, provider_order_id: PROVIDER_ORDER, provider_capture_id: null,
  payment_id: null, attempt_id: ATTEMPT, submission_intent_recorded: true, review_required: false, ...overrides } });
const NOT_FOUND_CONTEXT: Delivery = { data: { contract_version: 'web-payment-charge-context.v1', outcome: 'NOT_FOUND', charge_authority: false } };
const prepared: Reply = args => ({ data: { outcome: 'PREPARED', replayed: true, context_id: CONTEXT, order_id: args.p_order_id,
  quote_id: QUOTE, quote_hash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
  scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, settings_version: '1', create_request_key: CREATE_KEY, payment_id: null } });
const binding: Reply = args => ({ data: { contract_version: 'web-payment-provider-binding.v1', outcome: 'FOUND', charge_authority: false,
  order_id: args.p_order_id, context_id: CONTEXT, quote_id: QUOTE, quote_hash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
  billing_country: 'US', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
  binding_id: '66666666-6666-4666-8666-666666666666', binding_version: '1',
  binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', credential_ref: 'Q7pPrivCredential',
  expected_application: { paypal_client_id: 'synthetic-client' } } });
const OPENED: Delivery = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'OPENED', cycle_id: CYCLE,
  cycle_token: CYCLE_TOKEN, generation: '1', deadline_at: '2026-11-14T00:00:45.123456+00:00', superseded_cycle_id: null } };
const OPEN_IN_PROGRESS: Delivery = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'READ_IN_PROGRESS',
  deadline_at: '2026-11-14T00:00:45.123456+00:00' } };
const OPEN_NOT_FOUND: Delivery = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_FOUND' } };
const OPEN_NOT_APPLICABLE: Delivery = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_APPLICABLE' } };
// Hold snapshots follow spec 3/10 section 5: grant_blocked is true exactly when a sticky, unreleased or pending
// basis exists, and then get_eligible is false.
const HOLD_CLEAR = { grant_blocked: false, admission_possible: true, get_eligible: true, version: 'f'.repeat(64) };
const HOLD_STICKY = { grant_blocked: true, admission_possible: false, get_eligible: false, version: 'd'.repeat(64) };
const INTAKE_PENDING = { outcome: 'INTAKE_PENDING', replayed: false, order_id: ORDER,
  inbox_id: '99999999-9999-4999-8999-999999999999', receipt_id: '9007199254740993', coverage: 'SCOPE_ONLY', grant_eligible: false };
const INTAKE_HELD = { outcome: 'REVIEW_REQUIRED', reason_code: 'INTAKE_HELD', grant_eligible: false };
// S3 ACK. It echoes the requested kind and returns one result for each sent fact.
function completed(options: { effectiveKind?: string; intake?: unknown; hold?: unknown } = {}): Reply {
  return args => {
    const sent = args.p_completion; const effective = options.effectiveKind ?? sent.kind;
    return { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'COMPLETED', replayed: false,
      cycle_id: args.p_cycle_id, generation: '1', requested_kind: sent.kind, effective_kind: effective,
      db_adverse: effective === 'ADVERSE',
      fact_results: sent.facts.map((_fact: unknown, index: number) => ({
        observation_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, outcome: 'RECORDED', reason_code: null })),
      assertion_ids: [], intake: options.intake ?? null, hold: options.hold ?? (effective === 'ADVERSE' ? HOLD_STICKY : HOLD_CLEAR) } };
  };
}
const LATE: Delivery = { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'LATE_RECORDED', replayed: false,
  late_id: '2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a', effective_kind: 'CLEAN' } };
const CONFLICT: Delivery = { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'CONFLICT_RECORDED',
  replayed: false, conflict_id: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b' } };

const CREDENTIAL: Credential = { clientId: 'synthetic-client', clientSecret: 'Q7pPriv-secret' };
const TOKEN: ProviderDelivery = { status: 200, body: { token_type: 'Bearer', access_token: 'Q7pPriv-token', expires_in: 32400 } };
function providerOrder(status = 'APPROVED', orderId: string = ORDER): any {
  return { id: PROVIDER_ORDER, intent: 'CAPTURE', status,
    payment_source: { paypal: { address: { country_code: 'US' }, email_address: 'Q7pPriv@example.invalid' } },
    purchase_units: [{ custom_id: `v2:${orderId}`, amount: { currency_code: 'USD', value: '9.99' }, payee: { merchant_id: 'MERCHANTA1' },
      payments: { captures: [] as Array<Record<string, unknown>> } }],
    links: [{ href: 'https://evil.example.invalid/Q7pPriv', method: 'POST', rel: 'capture' }] };
}
function capturedOrder(captureStatus = 'COMPLETED'): any {
  const body = providerOrder('COMPLETED');
  body.purchase_units[0].payments.captures = [{ id: CAPTURE, status: captureStatus,
    amount: { currency_code: 'USD', value: '9.99' }, custom_id: `v2:${ORDER}` }];
  return body;
}
const order = (body: unknown, status = 200): ProviderDelivery => ({ status, body });

const deliver = (reply: Reply, args: Record<string, any>, control: Control): Delivery | Promise<Delivery> =>
  typeof reply === 'function' ? reply(args, control) : reply;
// Advances the scripted clock before the reply is delivered. This models a slow RPC or a slow provider call.
function after(ms: number, reply: Reply): Reply {
  return (args, control) => { control.advance(ms); return deliver(reply, args, control); };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

// Script for one claimed item that completes a CLEAN read of an APPROVED order with no capture.
function oneItem(overrides: Script = {}): Script {
  return { [RPC.run]: [RECORDED, RECORDED], [RPC.claim]: [claimed(0)], [RPC.getter]: [found()], [RPC.prepare]: [prepared],
    [RPC.binding]: [binding], [RPC.open]: [OPENED], [RPC.complete]: [completed()], [RPC.finish]: [finished], ...overrides };
}

type HarnessOptions = { provider?: Partial<ProviderScript>; credentials?: CredentialStep[] };
function harness(script: Script, options: HarnessOptions = {}) {
  const trail: string[] = []; const violations: string[] = [];
  const rpc: Array<{ name: string; label: string; args: Record<string, any>; signal: AbortSignal | null; atMs: number }> = [];
  const provider: Array<{ kind: 'token' | 'get' | 'unexpected'; method: string; url: string; signal: AbortSignal | null; atMs: number }> = [];
  const controller = new AbortController(); let clock = NOW;
  const control: Control = { advance: ms => { clock += ms; }, abort: () => controller.abort() };
  const providerScript: ProviderScript = { token: options.provider?.token ?? [TOKEN],
    get: options.provider?.get ?? [order(providerOrder('APPROVED'))] };
  const credentialSteps = [...(options.credentials ?? [])];

  const rpcFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const prefix = `${DB}/rest/v1/rpc/`; const target = String(url);
    if (!target.startsWith(prefix) || init?.method !== 'POST') {
      violations.push(`unexpected DB request ${init?.method} ${target}`); throw new Error('Unexpected external operation');
    }
    const name = target.slice(prefix.length); const args = JSON.parse(String(init.body)) as Record<string, any>;
    const label = name === RPC.run ? `run:${args.p_phase}` : name;
    rpc.push({ name, label, args, signal: init.signal ?? null, atMs: clock }); trail.push(label);
    const reply = script[name]?.shift();
    if (!reply) { violations.push(`unscripted RPC ${label}`); throw new Error('Unscripted RPC'); }
    const { data, status = 200 } = await (typeof reply === 'function' ? reply(args, control) : reply);
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  };
  const providerFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = String(url); const method = init?.method ?? 'GET';
    const kind = method === 'POST' && target === `${PAYPAL}/v1/oauth2/token` ? 'token' as const
      : method === 'GET' && target === `${PAYPAL}/v2/checkout/orders/${PROVIDER_ORDER}` ? 'get' as const : null;
    provider.push({ kind: kind ?? 'unexpected', method, url: target, signal: init?.signal ?? null, atMs: clock });
    // A CREATE POST, a capture POST or a request to another host is never scripted.
    if (!kind) { violations.push(`unexpected provider request ${method} ${target}`); throw new Error('Unexpected provider operation'); }
    trail.push(kind);
    const reply = providerScript[kind].shift();
    if (!reply) { violations.push(`unscripted provider ${kind}`); throw new Error('Unscripted provider call'); }
    const delivery = await (typeof reply === 'function' ? reply(init ?? {}, control) : reply);
    if (delivery === 'NETWORK_ERROR') throw new TypeError('fetch failed');
    return new Response(delivery.body === undefined ? null : JSON.stringify(delivery.body),
      { status: delivery.status, headers: { 'content-type': 'application/json' } });
  };

  const client = createClient(DB, 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: rpcFetch as unknown as typeof fetch } });
  const resolve = vi.fn(async (_input: any): Promise<Credential | null> => {
    const step = credentialSteps.length ? credentialSteps.shift()! : CREDENTIAL;
    if (step === 'THROW') throw new Error('Q7pPriv resolver failure');
    return typeof step === 'function' ? step(control) : step;
  });
  const chargeLog = vi.fn(); const log = vi.fn(); const factory: any[] = [];
  const charge = () => ({ repository: createWebPaymentChargeRepository(client), bindings: createRpcChargeBindingSource(client),
    credentials: { resolve: (input: unknown) => { trail.push('resolve'); return resolve(input); } },
    transport: createPayPalFetchTransport(providerFetch as unknown as typeof fetch),
    entry: createRpcProviderEntryGate(client), nowMs: () => clock, log: chargeLog });
  const queue = createReconciliationRepository(client);
  const deps = { queue, chargeDeps: (item: unknown) => { factory.push(item); return charge(); }, nowMs: () => clock, log };
  const input = (overrides: Record<string, unknown>) => ({ executorId: EXECUTOR, runId: RUN, instanceId: INSTANCE, maxItems: 1,
    signal: controller.signal, ...overrides });

  const named = (name: string) => rpc.filter(call => call.name === name);
  const providerOf = (kind: 'token' | 'get') => provider.filter(call => call.kind === kind);
  return { trail, violations, rpc, provider, controller, control, script, resolve, log, chargeLog, factory, queue, charge, named, providerOf,
    nowMs: () => clock,
    // Rejects with the missing-implementation marker before any product code runs.
    run: async (overrides: Record<string, unknown> = {}) => (await loadExecutor())(deps, input(overrides)),
    // Resolves for both a returned summary and a rejected run. A load failure still rejects.
    settle: async (overrides: Record<string, unknown> = {}) => {
      const execute = await loadExecutor();
      return Promise.resolve().then(() => execute(deps, input(overrides)))
        .then((value: unknown) => ({ value }), (error: unknown) => ({ error }));
    },
    finishCodes: () => named(RPC.finish).map(call => call.args.p_result_code),
    finishedRun: () => rpc.find(call => call.label === 'run:FINISHED')?.args,
    // Provider GET count for each claim, in claim order.
    getsPerItem: () => {
      const counts: number[] = [];
      for (const step of trail) { if (step === RPC.claim) counts.push(0); else if (step === 'get' && counts.length) counts[counts.length - 1] += 1; }
      return counts;
    } };
}
type Harness = ReturnType<typeof harness>;

// The spy records the timeout argument that the product passes. It is not evidence of real elapsed time.
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

const ZERO = { claimed: 0, opened: 0, completed_clean: 0, completed_adverse: 0, completed_no_data: 0, held: 0, deferred: 0,
  credential_unavailable: 0, in_progress: 0, failed: 0, read_cancelled: 0, write_unknown: 0, stale_lease: 0 };
const counts = (overrides: Partial<typeof ZERO>) => ({ ...ZERO, ...overrides });
// The 13 count metrics of the FINISHED record. S5 returns no due time, so oldest_due_lag_seconds is checked only
// as a finite non-negative integer.
function sentCounts(h: Harness): Record<string, number> {
  const finishedRun = h.finishedRun();
  expect(finishedRun, 'the FINISHED run record was not sent').toBeDefined();
  const { oldest_due_lag_seconds: lag, ...rest } = finishedRun!.p_metrics as Record<string, number>;
  expect(Number.isInteger(lag) && lag >= 0).toBe(true);
  return rest;
}
// Applies to every executor case: no unscripted or unexpected boundary call, no charge command, no CREATE or
// capture POST, and at most one provider GET for each claimed item.
function expectReadOnly(h: Harness) {
  expect(h.violations).toEqual([]);
  for (const name of FORBIDDEN_RPC) expect(h.named(name)).toHaveLength(0);
  expect(h.provider.filter(call => call.kind === 'unexpected')).toEqual([]);
  expect(Math.max(0, ...h.getsPerItem())).toBeLessThanOrEqual(1);
}
// The existing sentinel Q7pPriv marks every synthetic credential, token and private provider field.
function expectSafe(h: Harness, summary: unknown) {
  const text = inspect({ summary, logs: h.log.mock.calls, chargeLogs: h.chargeLog.mock.calls }, { depth: 12 });
  expect(text).not.toContain('Q7pPriv');
  expect(text).not.toContain(CYCLE_TOKEN);
  for (const item of ITEMS) expect(text).not.toContain(item.lease);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// These cases do not load the executor. They pass before it exists. A failure here is a fixture or setup defect,
// and then a failure of a W3 case below is not behavioral RED.
describe('W3 controls: the scripted tape drives the real W1 and W2 modules', () => {
  const scanner = (h: Harness, remainingMs: number) => {
    const reports: unknown[] = [];
    const runtime = { actorKind: 'SCANNER' as const, window: { deadlineAtMs: NOW + remainingMs, signal: h.controller.signal, nowMs: h.nowMs },
      onReadResult: (report: unknown) => { reports.push(report); } };
    return { deps: { ...h.charge(), runtime } as any, reports };
  };

  it('control: the real reconcile workflow with a SCANNER runtime performs open, one GET and one completion', async () => {
    const h = harness(oneItem()); const s = scanner(h, 55_000);
    const outcome = await reconcilePayPalOrder(s.deps, { actorUserId: DB_USER, orderId: ORDER });
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, RPC.binding, 'resolve', 'token', RPC.open, 'get', RPC.complete]);
    expect(h.named(RPC.open)[0].args).toEqual({ p_actor_user_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
      p_order_id: '11111111-1111-4111-8111-111111111111', p_actor_kind: 'SCANNER' });
    expect(h.named(RPC.complete)[0].args.p_completion).toMatchObject({ kind: 'CLEAN', category: 'READ_ORDER_NO_CAPTURE',
      get_http_status: 200, get_body_status: 'PARSED', observed_capture_ids: [], receive_fact_index: null });
    expect(s.reports).toEqual([{ kind: 'COMPLETED', effectiveKind: 'CLEAN', intake: null, opened: true, readCancelled: false,
      cycleId: CYCLE, hold: { grantBlocked: false, admissionPossible: true, getEligible: true, version: 'f'.repeat(64) } }]);
    expect(outcome).toEqual({ kind: 'SUBMISSION_UNKNOWN' });
    expect(h.violations).toEqual([]);
  });

  it('control: the real queue repository parses the scripted S5, S6 and S7 replies', async () => {
    const h = harness({ [RPC.run]: [RECORDED], [RPC.claim]: [claimed(0), EMPTY], [RPC.finish]: [finished, STALE] });
    expect(await h.queue.recordRun({ runId: RUN, executorId: EXECUTOR, instanceId: INSTANCE, phase: 'STARTED' })).toEqual({ replayed: false });
    expect(await h.queue.claim(EXECUTOR, 120)).toEqual({ kind: 'CLAIMED', orderId: '11111111-1111-4111-8111-111111111111',
      userId: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', leaseToken: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', attempt: '1', dueReason: 'NEW' });
    expect(await h.queue.claim(EXECUTOR, 120)).toEqual({ kind: 'EMPTY' });
    expect(await h.queue.finish(ORDER, LEASE, 'HELD')).toEqual({ kind: 'FINISHED', queueState: 'HELD', nextDueAt: null });
    expect(await h.queue.finish(ORDER, LEASE, 'NO_CHANGE')).toEqual({ kind: 'STALE_LEASE' });
    expect(h.violations).toEqual([]);
  });

  it('control: a credential failure under review ends as REVIEW_REQUIRED with no read report', async () => {
    const h = harness({ [RPC.getter]: [found({ review_required: true })], [RPC.prepare]: [prepared], [RPC.binding]: [binding] },
      { credentials: [null] });
    const s = scanner(h, 55_000);
    expect(await reconcilePayPalOrder(s.deps, { actorUserId: DB_USER, orderId: ORDER })).toEqual({ kind: 'REVIEW_REQUIRED' });
    expect(s.reports).toEqual([]);
    expect(h.trail).toEqual([RPC.getter, RPC.prepare, RPC.binding, 'resolve']);
  });

  it('control: a read budget that ends before the resolver read is reported as DEFERRED with the IN_PROGRESS outcome', async () => {
    const h = harness({ [RPC.getter]: [found()], [RPC.prepare]: [prepared], [RPC.binding]: [after(55_000, binding)] });
    const s = scanner(h, 55_000);
    expect(await reconcilePayPalOrder(s.deps, { actorUserId: DB_USER, orderId: ORDER })).toEqual({ kind: 'IN_PROGRESS' });
    expect(s.reports).toEqual([{ kind: 'NOT_OPENED', reason: 'DEFERRED', opened: false, readCancelled: false }]);
    expect(h.resolve).toHaveBeenCalledTimes(0);
  });
});

describe('W3 run record, claim order and the DB actor', () => {
  it('records STARTED, processes one claimed item in the G5 order and records FINISHED with the 14 numeric metrics', async () => {
    const h = harness(oneItem());
    const summary = await h.run();
    expect(h.trail).toEqual(['run:STARTED', RPC.claim, RPC.getter, RPC.prepare, RPC.binding, 'resolve', 'token', RPC.open, 'get',
      RPC.complete, RPC.finish, 'run:FINISHED']);
    expect(h.named(RPC.run)[0].args).toEqual({ p_run_id: 'f0000000-0000-4000-8000-00000000000f',
      p_executor_id: 'e0000000-0000-4000-8000-00000000000e', p_phase: 'STARTED', p_instance_id: 'w3-unit-instance',
      p_metrics: null, p_result_code: null });
    const claim = h.named(RPC.claim)[0].args;
    expect(Object.keys(claim).sort()).toEqual(['p_executor_id', 'p_lease_seconds']);
    expect(claim.p_executor_id).toBe('e0000000-0000-4000-8000-00000000000e');
    expect(Number.isInteger(claim.p_lease_seconds) && claim.p_lease_seconds >= 30 && claim.p_lease_seconds <= 180).toBe(true);
    const finishedRun = h.finishedRun()!;
    expect(Object.keys(finishedRun).sort()).toEqual(['p_executor_id', 'p_instance_id', 'p_metrics', 'p_phase', 'p_result_code', 'p_run_id']);
    expect(finishedRun).toMatchObject({ p_run_id: 'f0000000-0000-4000-8000-00000000000f',
      p_executor_id: 'e0000000-0000-4000-8000-00000000000e', p_phase: 'FINISHED', p_instance_id: 'w3-unit-instance', p_result_code: 'OK' });
    expect(Object.keys(finishedRun.p_metrics).sort()).toEqual(['claimed', 'completed_adverse', 'completed_clean', 'completed_no_data',
      'credential_unavailable', 'deferred', 'failed', 'held', 'in_progress', 'oldest_due_lag_seconds', 'opened', 'read_cancelled',
      'stale_lease', 'write_unknown']);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, opened: 1, completed_clean: 1 }));
    expect(summary).toMatchObject({ resultCode: 'OK', metrics: { claimed: 1, opened: 1, completed_clean: 1, completed_adverse: 0,
      completed_no_data: 0, held: 0, deferred: 0, credential_unavailable: 0, in_progress: 0, failed: 0, read_cancelled: 0,
      write_unknown: 0, stale_lease: 0 } });
    expectReadOnly(h); expectSafe(h, summary);
  });

  it('uses only the user_id and order_id that the queue claim returned as the actor and the order', async () => {
    const h = harness(oneItem());
    await h.run();
    const actor = { p_actor_user_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', p_order_id: '11111111-1111-4111-8111-111111111111' };
    expect(h.named(RPC.getter).map(call => call.args)).toEqual([actor]);
    expect(h.named(RPC.prepare).map(call => call.args)).toEqual([actor]);
    expect(h.named(RPC.binding).map(call => call.args)).toEqual([actor]);
    expect(h.named(RPC.open).map(call => call.args)).toEqual([{ ...actor, p_actor_kind: 'SCANNER' }]);
    const complete = h.named(RPC.complete)[0].args;
    expect(complete).toMatchObject({ p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { kind: 'CLEAN', category: 'READ_ORDER_NO_CAPTURE', observed_capture_ids: [] } });
    expect(complete.p_completion.facts).toHaveLength(1);
    expect(complete.p_completion.facts[0]).toMatchObject({ bind: false, evidence: { source: 'LOOKUP', identity_kind: 'ORDER',
      external_id: '5O190127TN364715T', order_id: '11111111-1111-4111-8111-111111111111',
      user_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', status: 'APPROVED' } });
    expect(h.named(RPC.finish).map(call => call.args)).toEqual([{ p_order_id: '11111111-1111-4111-8111-111111111111',
      p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: 'NO_CHANGE' }]);
    // The item factory receives the DB identity and the read window of this run.
    expect(h.factory).toHaveLength(1);
    expect(h.factory[0]).toMatchObject({ orderId: '11111111-1111-4111-8111-111111111111', userId: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1' });
    expect(h.factory[0].window.deadlineAtMs).toBe(NOW + 55_000);
    // Neither caller ID is ever an actor, an order or a lease.
    const itemArgs = JSON.stringify(h.rpc.filter(call => call.name !== RPC.run && call.name !== RPC.claim).map(call => call.args));
    expect(itemArgs).not.toContain(EXECUTOR); expect(itemArgs).not.toContain(RUN);
    expectReadOnly(h);
  });

  it('records an empty queue as OK with all counts zero and reads nothing', async () => {
    const h = harness({ [RPC.run]: [RECORDED, RECORDED], [RPC.claim]: [EMPTY] });
    const summary = await h.run({ maxItems: 25 });
    expect(h.trail).toEqual(['run:STARTED', RPC.claim, 'run:FINISHED']);
    expect(sentCounts(h)).toEqual(counts({}));
    expect(h.finishedRun()!.p_result_code).toBe('OK');
    expect(h.factory).toHaveLength(0);
    expectReadOnly(h); expectSafe(h, summary);
  });

  it('claims one item at a time, never more than maxItems, and finishes each item with its own lease', async () => {
    const h = harness({ [RPC.run]: [RECORDED, RECORDED], [RPC.claim]: [claimed(0), claimed(1), claimed(2)],
      [RPC.getter]: [found(), found()], [RPC.prepare]: [prepared, prepared], [RPC.binding]: [binding, binding],
      [RPC.open]: [OPEN_IN_PROGRESS, OPEN_IN_PROGRESS], [RPC.finish]: [finished, finished] }, { provider: { token: [TOKEN, TOKEN] } });
    await h.run({ maxItems: 2 });
    expect(h.named(RPC.claim)).toHaveLength(2);
    const item = [RPC.claim, RPC.getter, RPC.prepare, RPC.binding, 'resolve', 'token', RPC.open, RPC.finish];
    expect(h.trail).toEqual(['run:STARTED', ...item, ...item, 'run:FINISHED']);
    expect(h.named(RPC.getter).map(call => call.args)).toEqual([
      { p_actor_user_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', p_order_id: '11111111-1111-4111-8111-111111111111' },
      { p_actor_user_id: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', p_order_id: '12121212-1212-4212-8212-121212121212' }]);
    expect(h.named(RPC.finish).map(call => call.args)).toEqual([
      { p_order_id: '11111111-1111-4111-8111-111111111111', p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: 'IN_PROGRESS' },
      { p_order_id: '12121212-1212-4212-8212-121212121212', p_lease_token: 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', p_result_code: 'IN_PROGRESS' }]);
    expect(sentCounts(h)).toEqual(counts({ claimed: 2, in_progress: 2 }));
    expect(h.finishedRun()!.p_result_code).toBe('OK');
    expectReadOnly(h);
  });

  // A FINISHED record after a failed STARTED record is not specified. The second run reply exists only so that an
  // implementation that sends it does not hit an unscripted RPC.
  const STARTED_FAILURES: Array<[string, Delivery]> = [
    ['a lost STARTED ACK', LOST],
    ['a STARTED reply that is not the S7 contract', { data: { outcome: 'RECORDED', replayed: false } }],
  ];
  it.each(STARTED_FAILURES)('claims nothing and reads nothing after %s', async (_label, reply) => {
    const h = harness({ [RPC.run]: [reply, RECORDED] });
    const outcome = await h.settle({ maxItems: 25 });
    expect(h.trail.filter(step => step === 'run:STARTED')).toHaveLength(1);
    expect(h.trail.filter(step => step !== 'run:FINISHED')).toEqual(['run:STARTED']);
    expect(h.named(RPC.claim)).toHaveLength(0); expect(h.provider).toEqual([]); expect(h.factory).toHaveLength(0);
    expect(inspect(h.log.mock.calls, { depth: 12 })).toContain('payment.paypal.reconcile.run.failed');
    expectReadOnly(h); expectSafe(h, outcome);
  });

  it('attempts the FINISHED record once after the last finish and logs the failed run record', async () => {
    const h = harness(oneItem({ [RPC.run]: [RECORDED, LOST] }));
    const outcome = await h.settle();
    expect(h.trail.filter(step => step === 'run:FINISHED')).toHaveLength(1);
    expect(h.trail.slice(-3)).toEqual([RPC.complete, RPC.finish, 'run:FINISHED']);
    // The lost ACK does not change what the run sent: the confirmed completion and its finish stay on the tape.
    expect(h.finishCodes()).toEqual(['NO_CHANGE']);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, opened: 1, completed_clean: 1 }));
    expect(inspect(h.log.mock.calls, { depth: 12 })).toContain('payment.paypal.reconcile.run.failed');
    expectReadOnly(h); expectSafe(h, outcome);
  });
});

describe('W3 time budget (G5): t0, the claim cutoff and the provider read deadline', () => {
  // The STARTED RPC takes 9,000 ms on the scripted clock. t0 is the time of its ACK. A clock read before the
  // STARTED request would move both boundaries by 9,000 ms.
  it.each([
    [19_999, 2, 'OK'],
    [20_000, 1, 'PARTIAL_BUDGET'],
  ])('at t0 + %i ms the executor has started %i claim(s) and records %s', async (elapsed, wantClaims, wantResult) => {
    const h = harness({ [RPC.run]: [after(9_000, RECORDED), RECORDED], [RPC.claim]: [claimed(0), EMPTY],
      [RPC.getter]: [found()], [RPC.prepare]: [prepared], [RPC.binding]: [binding], [RPC.open]: [OPEN_IN_PROGRESS],
      [RPC.finish]: [after(elapsed, finished)] });
    await h.run({ maxItems: 2 });
    const t0 = NOW + 9_000;
    expect(h.named(RPC.claim)).toHaveLength(wantClaims);
    expect(h.named(RPC.claim).every(call => call.atMs < t0 + 20_000)).toBe(true);
    expect(h.finishedRun()!.p_result_code).toBe(wantResult);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, in_progress: 1 }));
    expectReadOnly(h);
  });

  // The binding read ends 54,999 ms or 55,000 ms after t0. One millisecond of read budget still starts the
  // resolver read with a 1 ms deadline. No budget starts no resolver read.
  it.each([
    [54_999, 1],
    [55_000, 0],
  ])('with the binding read ending at t0 + %i ms the resolver read starts %i time(s)', async (elapsed, wantResolves) => {
    const deadlines = fakeDeadlines();
    const h = harness(oneItem({ [RPC.run]: [after(7_000, RECORDED), RECORDED], [RPC.binding]: [after(elapsed, binding)] }));
    await h.run();
    expect(h.resolve).toHaveBeenCalledTimes(wantResolves);
    if (wantResolves) {
      const signal = h.resolve.mock.calls[0][0].signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(deadlines.firedBy(signal)).toBe(1);
    }
    expect(h.named(RPC.open)).toHaveLength(0); expect(h.providerOf('get')).toHaveLength(0);
    expect(h.finishCodes()).toEqual(['DEFERRED']);
    expectReadOnly(h);
  });

  // The stage named in each row takes the listed time. Then the OPEN decision is made with exactly 20,000 ms or
  // 19,999 ms of provider read budget left. The resolver and the token read still have a positive budget, so a
  // refusal at 19,999 ms is the G5 OPEN rule and not the W2 authorize skip.
  const SLOW_STAGES: Array<[string, (ms: number) => { script: Script; options: HarnessOptions }]> = [
    ['the owner getter', ms => ({ script: oneItem({ [RPC.getter]: [after(ms, found())] }), options: {} })],
    ['the prepare replay', ms => ({ script: oneItem({ [RPC.prepare]: [after(ms, prepared)] }), options: {} })],
    ['the binding read', ms => ({ script: oneItem({ [RPC.binding]: [after(ms, binding)] }), options: {} })],
    ['the credential resolver', ms => ({ script: oneItem(),
      options: { credentials: [(control: Control) => { control.advance(ms); return CREDENTIAL; }] } })],
    ['the token request', ms => ({ script: oneItem(),
      options: { provider: { token: [(_init: RequestInit, control: Control) => { control.advance(ms); return TOKEN; }] } } })],
  ];

  it.each(SLOW_STAGES)('opens the cycle when %s leaves exactly 20,000 ms at the OPEN decision', async (_label, build) => {
    const { script, options } = build(35_000);
    const h = harness(script, options);
    await h.run();
    expect(h.named(RPC.open)).toHaveLength(1);
    expect(h.named(RPC.open)[0].atMs).toBe(NOW + 35_000);
    expect(h.trail.slice(h.trail.indexOf(RPC.open))).toEqual([RPC.open, 'get', RPC.complete, RPC.finish, 'run:FINISHED']);
    expect(h.finishCodes()).toEqual(['NO_CHANGE']);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, opened: 1, completed_clean: 1 }));
    expectReadOnly(h);
  });

  it.each(SLOW_STAGES)('opens no cycle and sends no GET when %s leaves 19,999 ms at the OPEN decision', async (_label, build) => {
    const { script, options } = build(35_001);
    const h = harness(script, options);
    const summary = await h.run();
    expect(h.resolve).toHaveBeenCalledTimes(1); expect(h.providerOf('token')).toHaveLength(1);
    expect(h.named(RPC.open)).toHaveLength(0); expect(h.named(RPC.complete)).toHaveLength(0);
    expect(h.providerOf('get')).toHaveLength(0);
    expect(h.named(RPC.finish).map(call => call.args)).toEqual([{ p_order_id: '11111111-1111-4111-8111-111111111111',
      p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: 'DEFERRED' }]);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, deferred: 1 }));
    expect(h.finishedRun()!.p_result_code).toBe('PARTIAL_BUDGET');
    expectReadOnly(h); expectSafe(h, summary);
  });

  // The getter flag is false, so W2 would send an unprotected S6 GET after an acknowledged NOT_APPLICABLE.
  // A local OPEN refusal is not that acknowledgement.
  it('does not fall through to an unprotected GET when the OPEN is refused at 19,999 ms for an unconfirmed intent', async () => {
    const h = harness(oneItem({ [RPC.getter]: [found({ submission_intent_recorded: false, attempt_id: null })] }),
      { provider: { token: [(_init: RequestInit, control: Control) => { control.advance(35_001); return TOKEN; }] } });
    await h.run();
    expect(h.named(RPC.open)).toHaveLength(0); expect(h.providerOf('get')).toHaveLength(0);
    expect(h.named(RPC.complete)).toHaveLength(0);
    expect(h.finishCodes()).toEqual(['DEFERRED']);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, deferred: 1 }));
    expectReadOnly(h);
  });

  it('does not send an unprotected GET after an acknowledged NOT_APPLICABLE with an unconfirmed intent', async () => {
    const h = harness(oneItem({
      [RPC.getter]: [found({ submission_intent_recorded: false, attempt_id: null })],
      [RPC.open]: [OPEN_NOT_APPLICABLE],
    }));
    await h.run();
    expect(h.named(RPC.open)).toHaveLength(1);
    expect(h.providerOf('get')).toHaveLength(0);
    expect(h.named(RPC.complete)).toHaveLength(0);
    expect(h.finishCodes()).toEqual(['FAILED']);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, failed: 1 }));
    expect(h.finishedRun()!.p_result_code).toBe('OK');
    expectReadOnly(h);
  });

  it.each([
    ['an OPEN that returns at once', 0, 10_000],
    ['an OPEN that leaves 5,000 ms of read budget', 50_000, 5_000],
  ])('recalculates the GET deadline after %s', async (_label, openMs, wantDeadline) => {
    const deadlines = fakeDeadlines();
    const h = harness(oneItem({ [RPC.open]: [after(openMs, OPENED)] }));
    await h.run();
    expect(h.providerOf('get')).toHaveLength(1);
    // No read deadline is longer than 10 s, whatever budget is left.
    expect(deadlines.timers.every(timer => timer.ms <= 10_000)).toBe(true);
    expect(deadlines.firedBy(h.providerOf('get')[0].signal)).toBe(wantDeadline);
    expect(h.finishCodes()).toEqual(['NO_CHANGE']);
    expectReadOnly(h);
  });

  const GET_NOT_STARTED: Array<[string, string, (control: Control) => void]> = [
    ['the read budget ended during OPEN', 'READ_LOCAL_BUDGET_EXHAUSTED', control => control.advance(55_000)],
    ['the run was cancelled during OPEN', 'READ_LOCAL_CANCELLED', control => control.abort()],
  ];
  it.each(GET_NOT_STARTED)('completes the opened cycle with explicit NO_DATA and sends no GET when %s', async (_label, category, during) => {
    const h = harness(oneItem({ [RPC.open]: [(_args, control) => { during(control); return OPENED; }] }));
    const summary = await h.run();
    expect(h.providerOf('get')).toHaveLength(0);
    expect(h.trail.slice(h.trail.indexOf(RPC.open))).toEqual([RPC.open, RPC.complete, RPC.finish, 'run:FINISHED']);
    expect(h.named(RPC.complete)[0].args).toEqual({ p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN, p_completion: {
      contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category, get_http_status: null,
      get_body_status: null, observed_capture_ids: null, unparseable_capture_count: 0, capture_count_exceeded: false,
      facts: [], assertions: [], receive_fact_index: null } });
    expect(h.finishCodes()).toEqual(['NO_DATA']);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, opened: 1, completed_no_data: 1, completed_clean: 0, completed_adverse: 0,
      deferred: 0, failed: 0, write_unknown: 0 });
    expectReadOnly(h); expectSafe(h, summary);
  });

  it('records the actual transport result of a GET that started and was cancelled', async () => {
    const h = harness(oneItem(), { provider: { get: [(_init: RequestInit, control: Control) => { control.abort(); return 'NETWORK_ERROR'; }] } });
    await h.run();
    expect(h.providerOf('get')).toHaveLength(1);
    expect(h.named(RPC.complete)[0].args.p_completion).toMatchObject({ kind: 'NO_DATA', category: 'READ_TRANSPORT_UNKNOWN',
      get_http_status: null, get_body_status: null, observed_capture_ids: null, facts: [], assertions: [] });
    expect(h.finishCodes()).toEqual(['NO_DATA']);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, opened: 1, completed_no_data: 1, read_cancelled: 1, failed: 0, write_unknown: 0 });
    // The completion, the finish and the FINISHED record are still sent after the cancellation.
    expect(h.trail.slice(-3)).toEqual([RPC.complete, RPC.finish, 'run:FINISHED']);
    expectReadOnly(h);
  });

  it('keeps a parsed ADVERSE judgment when the run is cancelled after the GET returned', async () => {
    const h = harness(oneItem(), { provider: { get: [(_init: RequestInit, control: Control) => {
      control.abort(); return order(capturedOrder('DECLINED')); }] } });
    await h.run();
    expect(h.named(RPC.complete)[0].args.p_completion).toMatchObject({ kind: 'ADVERSE', category: 'READ_ADVERSE_FACT',
      get_http_status: 200, observed_capture_ids: ['3C679366HH908993F'] });
    expect(h.finishCodes()).toEqual(['HELD']);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, opened: 1, completed_adverse: 1, completed_no_data: 0, held: 1 });
    expect(h.trail.slice(-3)).toEqual([RPC.complete, RPC.finish, 'run:FINISHED']);
    expectReadOnly(h);
  });

  // Each started write is awaited to its own reply. The completion and the finish stay pending while the read
  // deadline passes and the run is cancelled. Neither write signal is the run signal.
  it('awaits a started completion before the finish, and a started finish before FINISHED, after the read deadline', async () => {
    await loadExecutor();
    const completeGate = deferred<void>(); const finishGate = deferred<void>();
    const h = harness(oneItem({
      [RPC.complete]: [(args, control) => completeGate.promise.then(() => deliver(completed(), args, control))],
      [RPC.finish]: [(args, control) => finishGate.promise.then(() => deliver(finished, args, control))] }));
    const pause = () => new Promise(resolve => setTimeout(resolve, 25));
    const pending = h.run();
    await vi.waitFor(() => expect(h.named(RPC.complete)).toHaveLength(1));
    h.control.advance(60_000); h.control.abort();
    await pause();
    expect(h.named(RPC.finish)).toHaveLength(0); expect(h.trail).not.toContain('run:FINISHED');
    expect(h.named(RPC.complete)[0].signal?.aborted ?? false).toBe(false);
    completeGate.resolve();
    await vi.waitFor(() => expect(h.named(RPC.finish)).toHaveLength(1));
    await pause();
    expect(h.trail).not.toContain('run:FINISHED');
    expect(h.named(RPC.finish)[0].signal?.aborted ?? false).toBe(false);
    finishGate.resolve();
    await pending;
    expect(h.trail.slice(-3)).toEqual([RPC.complete, RPC.finish, 'run:FINISHED']);
    // The confirmed completion is settled as it was confirmed.
    expect(h.finishCodes()).toEqual(['NO_CHANGE']);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, opened: 1, completed_clean: 1, failed: 0, write_unknown: 0 });
    expect(h.rpc.find(call => call.label === 'run:FINISHED')!.signal?.aborted ?? false).toBe(false);
    // The cancellation did reach the provider read, so the checks above are not vacuous.
    expect(h.providerOf('get')[0].signal?.aborted).toBe(true);
    expectReadOnly(h);
  });
});

describe('W3 named budget skips and the pre-report review', () => {
  const DEFERRED_FINISH = [{ p_order_id: '11111111-1111-4111-8111-111111111111',
    p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: 'DEFERRED' }];

  it('credential_budget_skip: no read budget before the resolver read gives resolve 0 and one DEFERRED finish', async () => {
    const h = harness(oneItem({ [RPC.binding]: [after(55_000, binding)] }));
    const summary = await h.run();
    expect(h.resolve).toHaveBeenCalledTimes(0); expect(h.providerOf('token')).toHaveLength(0);
    expect(h.named(RPC.open)).toHaveLength(0); expect(h.providerOf('get')).toHaveLength(0);
    const budgetSkipFinishRpcRequests = h.named(RPC.finish).map(call => call.args);
    expect(budgetSkipFinishRpcRequests.map(request => request.p_result_code)).toEqual(['DEFERRED']);
    expect(budgetSkipFinishRpcRequests).toEqual(DEFERRED_FINISH);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, deferred: 1 }));
    expect(h.finishedRun()!.p_result_code).toBe('PARTIAL_BUDGET');
    expectReadOnly(h); expectSafe(h, summary);
  });

  it('credential_budget_skip: a run cancelled before the resolver read gives resolve 0 and one DEFERRED finish', async () => {
    const h = harness(oneItem({ [RPC.binding]: [(args, control) => { control.abort(); return deliver(binding, args, control); }] }));
    await h.run();
    expect(h.resolve).toHaveBeenCalledTimes(0); expect(h.providerOf('token')).toHaveLength(0);
    expect(h.named(RPC.open)).toHaveLength(0);
    expect(h.named(RPC.finish).map(call => call.args)).toEqual(DEFERRED_FINISH);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, deferred: 1, credential_unavailable: 0, opened: 0, in_progress: 0, failed: 0 });
    expect(h.trail[h.trail.length - 1]).toBe('run:FINISHED');
    expectReadOnly(h);
  });

  it('token_budget_skip: a resolver that returns after the budget ended gives requestToken 0 and one DEFERRED finish', async () => {
    const h = harness(oneItem(), { credentials: [(control: Control) => { control.advance(55_000); return CREDENTIAL; }] });
    const summary = await h.run();
    expect(h.resolve).toHaveBeenCalledTimes(1); expect(h.providerOf('token')).toHaveLength(0);
    expect(h.named(RPC.open)).toHaveLength(0); expect(h.providerOf('get')).toHaveLength(0);
    expect(h.named(RPC.finish).map(call => call.args)).toEqual(DEFERRED_FINISH);
    const budgetSkipMetrics = sentCounts(h);
    expect(budgetSkipMetrics).toMatchObject({ deferred: 1, credential_unavailable: 0, opened: 0 });
    expect(budgetSkipMetrics).toEqual(counts({ claimed: 1, deferred: 1 }));
    expect(h.finishedRun()!.p_result_code).toBe('PARTIAL_BUDGET');
    expectReadOnly(h); expectSafe(h, summary);
  });

  it('token_budget_skip: a run cancelled during the resolver read gives requestToken 0 and one DEFERRED finish', async () => {
    const h = harness(oneItem(), { credentials: [(control: Control) => { control.abort(); return CREDENTIAL; }] });
    await h.run();
    expect(h.resolve).toHaveBeenCalledTimes(1); expect(h.providerOf('token')).toHaveLength(0);
    expect(h.named(RPC.finish).map(call => call.args)).toEqual(DEFERRED_FINISH);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, deferred: 1, credential_unavailable: 0, opened: 0, failed: 0 });
    expectReadOnly(h);
  });

  // The workflow returns REVIEW_REQUIRED and no read report exists. The finish is HELD, and the native finish
  // evaluates the current hold again. It is not FAILED and not CREDENTIAL_UNAVAILABLE.
  const PREREPORT_REVIEW: Array<[string, { script: () => Script; credentials: CredentialStep[] }]> = [
    ['the closed credential resolver', { script: () => oneItem({ [RPC.getter]: [found({ review_required: true })] }), credentials: [null] }],
    ['a failed binding read', { script: () => oneItem({ [RPC.getter]: [found({ review_required: true })], [RPC.binding]: [LOST] }), credentials: [] }],
  ];
  it.each(PREREPORT_REVIEW)('prereport_review_is_held: a review order that stops at %s is finished HELD exactly once', async (_label, setup) => {
    const h = harness(setup.script(), { credentials: setup.credentials });
    const summary = await h.run();
    expect(h.named(RPC.open)).toHaveLength(0); expect(h.providerOf('get')).toHaveLength(0);
    const prereportReviewFinishRpcRequests = h.named(RPC.finish).map(call => call.args);
    expect(prereportReviewFinishRpcRequests.map(request => request.p_result_code)).toEqual(['HELD']);
    expect(prereportReviewFinishRpcRequests).toEqual([{ p_order_id: '11111111-1111-4111-8111-111111111111',
      p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: 'HELD' }]);
    expect(sentCounts(h)).toEqual(counts({ claimed: 1, held: 1 }));
    expect(h.finishedRun()!.p_result_code).toBe('OK');
    expectReadOnly(h); expectSafe(h, summary);
  });
});

describe('W3 finish mapping (plan W3 table)', () => {
  type Row = { label: string; script?: () => Script; options?: () => HarnessOptions; finish: string; gets: number;
    counts: Partial<typeof ZERO>; exact?: boolean; result?: string; notResult?: string };
  const ROWS: Row[] = [
    { label: 'a CLEAN read with no capture and no intake', finish: 'NO_CHANGE', gets: 1,
      counts: { claimed: 1, opened: 1, completed_clean: 1 }, exact: true, result: 'OK' },
    { label: 'a CLEAN read with a PENDING capture and no intake', finish: 'NO_CHANGE', gets: 1,
      options: () => ({ provider: { get: [order(capturedOrder('PENDING'))] } }),
      counts: { claimed: 1, opened: 1, completed_clean: 1 }, exact: true, result: 'OK' },
    { label: 'a CLEAN read whose completion made the intake', finish: 'INTAKE_PENDING', gets: 1,
      script: () => oneItem({ [RPC.complete]: [completed({ intake: INTAKE_PENDING })] }),
      options: () => ({ provider: { get: [order(capturedOrder('COMPLETED'))] } }),
      counts: { claimed: 1, opened: 1, completed_clean: 1 }, exact: true, result: 'OK' },
    // W2 returns CAPTURE_FAILED for this read. The finish follows the confirmed ADVERSE report.
    { label: 'a confirmed ADVERSE read of a DECLINED capture', finish: 'HELD', gets: 1,
      options: () => ({ provider: { get: [order(capturedOrder('DECLINED'))] } }),
      counts: { claimed: 1, opened: 1, completed_adverse: 1, held: 1, completed_clean: 0, failed: 0 }, result: 'OK' },
    { label: 'a CLEAN request that the DB made ADVERSE', finish: 'HELD', gets: 1,
      script: () => oneItem({ [RPC.complete]: [completed({ effectiveKind: 'ADVERSE' })] }),
      counts: { claimed: 1, opened: 1, completed_adverse: 1, held: 1, completed_clean: 0, failed: 0 }, result: 'OK' },
    { label: 'a CLEAN completion that the DB answered with INTAKE_HELD', finish: 'HELD', gets: 1,
      script: () => oneItem({ [RPC.complete]: [completed({ intake: INTAKE_HELD, hold: HOLD_STICKY })] }),
      options: () => ({ provider: { get: [order(capturedOrder('COMPLETED'))] } }),
      counts: { claimed: 1, opened: 1, completed_clean: 1, held: 1, failed: 0 }, result: 'OK' },
    { label: 'a CLEAN completion with no capture and a blocked hold', finish: 'HELD', gets: 1,
      script: () => oneItem({ [RPC.complete]: [completed({ hold: HOLD_STICKY })] }),
      counts: { claimed: 1, opened: 1, completed_clean: 1, held: 1, failed: 0 }, result: 'OK' },
    { label: 'a completion that the DB recorded as a conflict', finish: 'HELD', gets: 1,
      script: () => oneItem({ [RPC.complete]: [CONFLICT] }),
      counts: { claimed: 1, opened: 1, held: 1, completed_clean: 0, completed_adverse: 0, completed_no_data: 0, failed: 0, write_unknown: 0 },
      result: 'OK' },
    { label: 'an acknowledged NO_DATA read (HTTP 503)', finish: 'NO_DATA', gets: 1,
      options: () => ({ provider: { get: [order({ name: 'INTERNAL_SERVICE_ERROR', message: 'Q7pPriv temporary' }, 503)] } }),
      counts: { claimed: 1, opened: 1, completed_no_data: 1 }, exact: true, result: 'OK' },
    { label: 'an acknowledged NO_DATA read (transport failure with no cancellation)', finish: 'NO_DATA', gets: 1,
      options: () => ({ provider: { get: ['NETWORK_ERROR'] } }),
      counts: { claimed: 1, opened: 1, completed_no_data: 1 }, exact: true, result: 'OK' },
    { label: 'an OPEN that answers READ_IN_PROGRESS', finish: 'IN_PROGRESS', gets: 0,
      script: () => oneItem({ [RPC.open]: [OPEN_IN_PROGRESS] }),
      counts: { claimed: 1, in_progress: 1 }, exact: true, result: 'OK' },
    { label: 'the closed credential resolver', finish: 'CREDENTIAL_UNAVAILABLE', gets: 0,
      options: () => ({ credentials: [null] }),
      counts: { claimed: 1, credential_unavailable: 1 }, exact: true, result: 'CREDENTIAL_UNAVAILABLE' },
    { label: 'a credential resolver that fails', finish: 'CREDENTIAL_UNAVAILABLE', gets: 0,
      options: () => ({ credentials: ['THROW'] }),
      counts: { claimed: 1, credential_unavailable: 1 }, exact: true, result: 'CREDENTIAL_UNAVAILABLE' },
    { label: 'a credential for another PayPal client', finish: 'CREDENTIAL_UNAVAILABLE', gets: 0,
      options: () => ({ credentials: [{ clientId: 'other-client', clientSecret: 'Q7pPriv-secret' }] }),
      counts: { claimed: 1, credential_unavailable: 1 }, exact: true, result: 'CREDENTIAL_UNAVAILABLE' },
    { label: 'a refused token request (HTTP 401)', finish: 'CREDENTIAL_UNAVAILABLE', gets: 0,
      options: () => ({ provider: { token: [{ status: 401, body: { error: 'invalid_client', error_description: 'Q7pPriv' } }] } }),
      counts: { claimed: 1, credential_unavailable: 1 }, exact: true, result: 'CREDENTIAL_UNAVAILABLE' },
    { label: 'a late completion', finish: 'FAILED', gets: 1,
      script: () => oneItem({ [RPC.complete]: [LATE] }),
      counts: { claimed: 1, opened: 1, failed: 1, write_unknown: 0, completed_clean: 0, completed_adverse: 0, completed_no_data: 0 },
      result: 'OK' },
    ...(['CYCLE_NOT_FOUND', 'CYCLE_TOKEN_MISMATCH'] as const).map((reason): Row => ({
      label: `S3 BLOCKED ${reason}`, finish: 'FAILED', gets: 1,
      script: () => oneItem({ [RPC.complete]: [{ data: {
        contract_version: 'web-payment-read-cycle-result.v1', outcome: 'BLOCKED', safe_reason_code: reason,
      } }] }),
      counts: { claimed: 1, opened: 1, failed: 1 }, exact: true, result: 'OK',
    })),
    // No commit is assumed for the lost ACK: no completion count, in either direction.
    { label: 'a lost completion ACK', finish: 'FAILED', gets: 1,
      script: () => oneItem({ [RPC.complete]: [LOST] }),
      counts: { claimed: 1, opened: 1, failed: 1, write_unknown: 1 }, exact: true, result: 'WRITE_FAILED' },
    { label: 'a lost OPEN ACK', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.open]: [LOST] }),
      counts: { claimed: 1, failed: 1, write_unknown: 1, opened: 0, completed_clean: 0, completed_no_data: 0 }, result: 'WRITE_FAILED' },
    // An acknowledged OPEN refusal is not an unknown write.
    { label: 'an acknowledged OPEN refusal NOT_FOUND', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.open]: [OPEN_NOT_FOUND] }),
      counts: { claimed: 1, failed: 1, write_unknown: 0, opened: 0 }, notResult: 'WRITE_FAILED' },
    { label: 'an acknowledged OPEN NOT_APPLICABLE for a recorded intent', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.open]: [OPEN_NOT_APPLICABLE] }),
      counts: { claimed: 1, failed: 1, write_unknown: 0, opened: 0 }, notResult: 'WRITE_FAILED' },
    // An owner, prepare or binding failure with no read report is FAILED. It is not a credential failure.
    // The run result of these four rows is not specified, so the rows do not assert it.
    { label: 'an order that the owner getter does not find', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.getter]: [NOT_FOUND_CONTEXT] }),
      counts: { claimed: 1, failed: 1, opened: 0, credential_unavailable: 0, deferred: 0 } },
    { label: 'a failed owner getter', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.getter]: [LOST] }),
      counts: { claimed: 1, failed: 1, opened: 0, credential_unavailable: 0, deferred: 0 } },
    { label: 'a failed prepare replay', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.prepare]: [LOST] }),
      counts: { claimed: 1, failed: 1, opened: 0, credential_unavailable: 0, deferred: 0 } },
    { label: 'a failed binding read', finish: 'FAILED', gets: 0,
      script: () => oneItem({ [RPC.binding]: [LOST] }),
      counts: { claimed: 1, failed: 1, opened: 0, credential_unavailable: 0, deferred: 0 } },
  ];

  it.each(ROWS)('finishes $label as $finish', async row => {
    const h = harness(row.script ? row.script() : oneItem(), row.options ? row.options() : {});
    const summary = await h.run();
    expect(h.named(RPC.finish).map(call => call.args)).toEqual([{ p_order_id: '11111111-1111-4111-8111-111111111111',
      p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: row.finish }]);
    expect(h.providerOf('get')).toHaveLength(row.gets);
    if (row.exact) expect(sentCounts(h)).toEqual(counts(row.counts));
    else expect(sentCounts(h)).toMatchObject(row.counts);
    if (row.result) expect(h.finishedRun()!.p_result_code).toBe(row.result);
    if (row.notResult) expect(h.finishedRun()!.p_result_code).not.toBe(row.notResult);
    expect(h.trail[h.trail.length - 1]).toBe('run:FINISHED');
    expectReadOnly(h); expectSafe(h, summary);
  });
});

describe('W3 STALE_LEASE, unknown finish and run-result priority', () => {
  const STALE_ROWS: Array<[string, () => HarnessOptions, Partial<typeof ZERO>]> = [
    ['a confirmed CLEAN completion', () => ({}), { completed_clean: 1 }],
    ['a confirmed ADVERSE completion', () => ({ provider: { get: [order(capturedOrder('DECLINED'))] } }), { completed_adverse: 1 }],
  ];
  it.each(STALE_ROWS)('keeps the count of %s when the finish returns STALE_LEASE, and sends no second finish', async (_label, options, kept) => {
    const h = harness(oneItem({ [RPC.finish]: [STALE] }), options());
    const summary = await h.run();
    // The lease belongs to another executor. The queue row is not written again.
    expect(h.named(RPC.finish)).toHaveLength(1);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, opened: 1, stale_lease: 1, write_unknown: 0, ...kept });
    const staleRun = { resultCode: h.finishedRun()!.p_result_code };
    expect(staleRun.resultCode).toBe('PARTIAL_STALE_LEASE');
    expect(summary).toMatchObject({ resultCode: 'PARTIAL_STALE_LEASE' });
    expect(h.trail[h.trail.length - 1]).toBe('run:FINISHED');
    expectReadOnly(h); expectSafe(h, summary);
  });

  it('counts a lost finish ACK as an unknown write, keeps the confirmed completion and sends no second finish', async () => {
    const h = harness(oneItem({ [RPC.finish]: [LOST] }));
    const summary = await h.run();
    expect(h.named(RPC.finish)).toHaveLength(1);
    expect(sentCounts(h)).toMatchObject({ claimed: 1, opened: 1, completed_clean: 1, write_unknown: 1, stale_lease: 0 });
    expect(h.finishedRun()!.p_result_code).toBe('WRITE_FAILED');
    expect(h.trail.slice(-2)).toEqual([RPC.finish, 'run:FINISHED']);
    expectReadOnly(h); expectSafe(h, summary);
  });

  // Priority: WRITE_FAILED > PARTIAL_STALE_LEASE > DISCOVERY_FAILED > PARTIAL_BUDGET > CREDENTIAL_UNAVAILABLE > OK.
  // A higher result does not erase the count of a lower cause. Where one item can carry both causes, the row uses
  // one item, so that the row does not depend on whether the batch continues after a failure. A trailing EMPTY
  // claim reply exists only for an implementation that asks again.
  type Priority = { label: string; script: () => Script; options?: () => HarnessOptions; maxItems: number; result: string;
    counts: Partial<typeof ZERO> };
  const closed = (): HarnessOptions => ({ credentials: [null] });
  const PRIORITY: Priority[] = [
    { label: 'a lost completion ACK and a STALE_LEASE finish', maxItems: 1, result: 'WRITE_FAILED',
      script: () => oneItem({ [RPC.complete]: [LOST], [RPC.finish]: [STALE] }), counts: { write_unknown: 1, stale_lease: 1 } },
    { label: 'a credential failure whose finish ACK is lost', maxItems: 1, result: 'WRITE_FAILED',
      script: () => oneItem({ [RPC.finish]: [LOST] }), options: closed, counts: { claimed: 1, write_unknown: 1 } },
    { label: 'a deferred item whose finish ACK is lost', maxItems: 1, result: 'WRITE_FAILED',
      script: () => oneItem({ [RPC.binding]: [after(55_000, binding)], [RPC.finish]: [LOST] }), counts: { claimed: 1, write_unknown: 1 } },
    { label: 'a credential failure whose finish is STALE_LEASE', maxItems: 1, result: 'PARTIAL_STALE_LEASE',
      script: () => oneItem({ [RPC.finish]: [STALE] }), options: closed, counts: { claimed: 1, stale_lease: 1 } },
    { label: 'a STALE_LEASE finish that also used the claim budget', maxItems: 2, result: 'PARTIAL_STALE_LEASE',
      script: () => oneItem({ [RPC.finish]: [after(20_000, STALE)] }), counts: { claimed: 1, completed_clean: 1, stale_lease: 1 } },
    { label: 'a STALE_LEASE finish and then a failed claim', maxItems: 3, result: 'PARTIAL_STALE_LEASE',
      script: () => oneItem({ [RPC.claim]: [claimed(0), LOST, EMPTY], [RPC.finish]: [STALE] }), counts: { claimed: 1, stale_lease: 1 } },
    { label: 'a failed first claim', maxItems: 3, result: 'DISCOVERY_FAILED',
      script: () => ({ [RPC.run]: [RECORDED, RECORDED], [RPC.claim]: [LOST, EMPTY] }), counts: { claimed: 0 } },
    { label: 'a clean item and then a failed claim that used the claim budget', maxItems: 3, result: 'DISCOVERY_FAILED',
      script: () => oneItem({ [RPC.claim]: [claimed(0), after(20_000, LOST), EMPTY] }), counts: { claimed: 1, completed_clean: 1 } },
    { label: 'a credential failure and then a failed claim', maxItems: 3, result: 'DISCOVERY_FAILED',
      script: () => oneItem({ [RPC.claim]: [claimed(0), LOST, EMPTY] }), options: closed, counts: { claimed: 1, credential_unavailable: 1 } },
    { label: 'a credential failure that used the claim budget', maxItems: 2, result: 'PARTIAL_BUDGET',
      script: () => oneItem({ [RPC.finish]: [after(20_000, finished)] }), options: closed, counts: { claimed: 1, credential_unavailable: 1 } },
    { label: 'a deferred item', maxItems: 1, result: 'PARTIAL_BUDGET',
      script: () => oneItem({ [RPC.binding]: [after(55_000, binding)] }), counts: { claimed: 1, deferred: 1 } },
    { label: 'a credential failure with the batch limit reached', maxItems: 1, result: 'CREDENTIAL_UNAVAILABLE',
      script: () => oneItem(), options: closed, counts: { claimed: 1, credential_unavailable: 1 } },
    { label: 'a clean item and then an empty queue', maxItems: 2, result: 'OK',
      script: () => oneItem({ [RPC.claim]: [claimed(0), EMPTY] }), counts: { claimed: 1, completed_clean: 1 } },
  ];

  it.each(PRIORITY)('records $result for $label', async row => {
    const h = harness(row.script(), row.options ? row.options() : {});
    const summary = await h.run({ maxItems: row.maxItems });
    expect(h.finishedRun()!.p_result_code).toBe(row.result);
    expect(summary).toMatchObject({ resultCode: row.result });
    expect(sentCounts(h)).toMatchObject(row.counts);
    expect(h.named(RPC.claim).length).toBeLessThanOrEqual(row.maxItems);
    expect(h.trail[h.trail.length - 1]).toBe('run:FINISHED');
    expectReadOnly(h); expectSafe(h, summary);
  });
});
