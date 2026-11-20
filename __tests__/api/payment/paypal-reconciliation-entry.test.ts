// @vitest-environment node
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceChargeRepository } from '@/lib/payment/paypal-charge/repository';

// W3 closed internal entry, route and production factory (plan section W3; spec G5, 7/10 section 5).
//
// What is real: the supabase-js SDK, the W1 repositories, the W2 orchestrator, the executor, the entry and the
// production factory createClosedReconciliationDeps(). What is synthetic: the three environment values, the secret,
// the global fetch and its scripted RPC replies. The scope is local. No production secret is registered and no
// deployed route is called. A scripted ACK is a delivery fixture. It is not evidence of a native commit.
//
// The entry and route modules are loaded inside each case through a lazy Vite glob with exact relative paths.
// The glob has no entry for a source file that does not exist, so this file loads before those modules exist.
//   W3_IMPLEMENTATION_MISSING  the product file does not exist. This is the expected RED before the product gate.
//   W3_EXPORT_MISSING          the file exists and does not export the public name.
// Every other failure is an assertion, or a setup defect that the control block at the top of this file isolates.
//
// Wiring that these cases assume (coordinator accepted): the production clock is Date.now, the run signal is
// request.signal, and every deadline is made with AbortSignal.timeout, as in W1 and W2.

// The real createClient runs unchanged. The wrapper only records each client that the product creates.
const sdk = vi.hoisted(() => ({ created: [] as Array<{ client: unknown; url: unknown; key: unknown }> }));
vi.mock('@supabase/supabase-js', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: (...args: unknown[]) => {
    const client = (actual.createClient as unknown as (...input: unknown[]) => unknown)(...args);
    sdk.created.push({ client, url: args[0], key: args[1] });
    return client;
  } };
});

// @ts-ignore -- import.meta.glob is replaced by Vite when the test file is transformed.
const W3_MODULES: Record<string, () => Promise<unknown>> = import.meta.glob([
  '../../../lib/payment/paypal-charge/reconciliation-entry.ts',
  '../../../app/api/internal/payment/paypal-reconciliation/route.ts']);
async function loadModule(path: string, exports: string[]): Promise<Record<string, any>> {
  const loader = W3_MODULES[`../../../${path}`];
  if (!loader) throw new Error(`W3_IMPLEMENTATION_MISSING: ${path} does not exist`);
  const loaded = await loader() as Record<string, any>;
  for (const name of exports) if (typeof loaded[name] !== 'function') throw new Error(`W3_EXPORT_MISSING: ${name}`);
  return loaded;
}
type Handler = (request: Request) => Promise<Response>;
// The environment and the global fetch are stubbed before this call in every case.
async function closedHandler(): Promise<Handler> {
  const entry = await loadModule('lib/payment/paypal-charge/reconciliation-entry.ts',
    ['createReconciliationHandler', 'createClosedReconciliationDeps']);
  return entry.createReconciliationHandler(entry.createClosedReconciliationDeps());
}
const loadRoute = () => loadModule('app/api/internal/payment/paypal-reconciliation/route.ts', ['POST']);

const NOW = Date.parse('2026-11-14T00:00:00.123Z');
const DB = 'https://w3-entry-db.example.invalid';
// Each synthetic secret carries the existing sentinel Q7pPriv, so that one search finds a leak of any of them.
const SERVICE_KEY = 'Q7pPriv-synthetic-service-key';
const SECRET = 'Q7pPriv-reconciliation-secret-0123456789abcdef';
const HEADER = 'x-payment-reconciliation-secret';
const SECRET_ENV = 'INTERNAL_PAYMENT_RECONCILIATION_SECRET';
const ROUTE_URL = 'https://www.example.invalid/api/internal/payment/paypal-reconciliation';
// Queue row as S5 returns it. DB_USER is the DB owner of the order.
const ORDER = '11111111-1111-4111-8111-111111111111';
const DB_USER = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const LEASE = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const CONTEXT = '22222222-2222-4222-8222-222222222222';
const QUOTE = '77777777-7777-4777-8777-777777777777';
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const RPC = {
  run: 'record_web_payment_reconciliation_run', claim: 'claim_web_payment_reconciliation_item',
  finish: 'finish_web_payment_reconciliation_item', getter: 'get_web_payment_charge_context',
  prepare: 'prepare_web_payment_provider_context', binding: 'get_web_payment_provider_binding',
  open: 'open_web_payment_read_cycle', complete: 'complete_web_payment_read_cycle',
} as const;
const FINISH_CODES = ['INTAKE_PENDING', 'HELD', 'NO_CHANGE', 'NO_DATA', 'CREDENTIAL_UNAVAILABLE', 'IN_PROGRESS', 'DEFERRED', 'FAILED'];
const METRIC_KEYS = ['claimed', 'completed_adverse', 'completed_clean', 'completed_no_data', 'credential_unavailable', 'deferred',
  'failed', 'held', 'in_progress', 'oldest_due_lag_seconds', 'opened', 'read_cancelled', 'stale_lease', 'write_unknown'];
const ZERO = { claimed: 0, opened: 0, completed_clean: 0, completed_adverse: 0, completed_no_data: 0, held: 0, deferred: 0,
  credential_unavailable: 0, in_progress: 0, failed: 0, read_cancelled: 0, write_unknown: 0, stale_lease: 0 };

// ---- Independent wire literals. Neither SQL nor a product parser builds these fixtures. ----------------------

type Delivery = { data: unknown; status?: number };
// A function reply receives the request arguments and the zero-based call number of that RPC.
type ReplyFn = (args: Record<string, any>, index: number) => Delivery;
type Reply = Delivery | ReplyFn;
// An array is consumed in order. A single function answers every call of that RPC.
type Script = Record<string, Reply[] | ReplyFn>;

const RECORDED: Delivery = { data: { contract_version: 'web-payment-reconciliation-run.v1', outcome: 'RECORDED', replayed: false } };
const EMPTY: Delivery = { data: { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'EMPTY' } };
const CLAIMED: Delivery = { data: { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'CLAIMED',
  order_id: ORDER, user_id: DB_USER, lease_token: LEASE, attempt: '1', due_reason: 'NEW' } };
const FINISHED: Delivery = { data: { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'FINISHED',
  queue_state: 'ACTIVE', next_due_at: '2026-11-14T00:05:00.123456+00:00' } };
const LOST: Delivery = { status: 503, data: { code: 'XX000', message: 'Q7pPriv ACK lost' } };
const FOUND: Delivery = { data: { contract_version: 'web-payment-charge-context.v1', outcome: 'FOUND', charge_authority: false,
  order_id: ORDER, provider: 'PAYPAL', environment: 'SANDBOX', row_version: '3', payment_state: 'SUBMISSION_UNKNOWN',
  settlement_state: 'NOT_INTAKE', actor_deleted: false, quote_id: QUOTE, quote_hash: HASH, product_id: 'STAR100',
  amount_minor: '999', currency: 'USD', quantity: '1', quote_expires_at: '2026-11-14T00:15:00.123456+00:00',
  context_id: CONTEXT, verification_binding_present: true, provider_order_id: '5O190127TN364715T', provider_capture_id: null,
  payment_id: null, attempt_id: '44444444-4444-4444-8444-444444444444', submission_intent_recorded: true, review_required: false } };
const NOT_FOUND: Delivery = { data: { contract_version: 'web-payment-charge-context.v1', outcome: 'NOT_FOUND', charge_authority: false } };
const PREPARED: Delivery = { data: { outcome: 'PREPARED', replayed: true, context_id: CONTEXT, order_id: ORDER, quote_id: QUOTE,
  quote_hash: HASH, provider: 'PAYPAL', environment: 'SANDBOX', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
  settings_version: '1', create_request_key: '33333333-3333-4333-8333-333333333333', payment_id: null } };
// The binding names a credential reference and the expected client. The closed production resolver must not use them.
const BINDING: Delivery = { data: { contract_version: 'web-payment-provider-binding.v1', outcome: 'FOUND', charge_authority: false,
  order_id: ORDER, context_id: CONTEXT, quote_id: QUOTE, quote_hash: HASH, provider: 'PAYPAL', environment: 'SANDBOX',
  billing_country: 'US', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
  binding_id: '66666666-6666-4666-8666-666666666666', binding_version: '1',
  binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', credential_ref: 'Q7pPrivCredential',
  expected_application: { paypal_client_id: 'synthetic-client' } } };

// Script for one claimed item. With the closed resolver the item stops after the binding read.
function closedItem(overrides: Script = {}): Script {
  return { [RPC.run]: [RECORDED, RECORDED], [RPC.claim]: [CLAIMED, EMPTY], [RPC.getter]: [FOUND], [RPC.prepare]: [PREPARED],
    [RPC.binding]: [BINDING], [RPC.finish]: [FINISHED], ...overrides };
}

function createTape() {
  const rpc: Array<{ name: string; label: string; args: Record<string, any>; signal: AbortSignal | null }> = [];
  // outside holds every request that does not go to the scripted DB, for example a provider call.
  const outside: string[] = []; const violations: string[] = []; const used: Record<string, number> = {};
  const state = { script: {} as Script };
  const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const prefix = `${DB}/rest/v1/rpc/`;
    if (!target.startsWith(prefix)) { outside.push(`${init?.method ?? 'GET'} ${target}`); throw new Error('Unexpected external operation'); }
    if (init?.method !== 'POST') { violations.push(`unexpected DB method ${init?.method} ${target}`); throw new Error('Unexpected DB operation'); }
    const name = target.slice(prefix.length); const args = JSON.parse(String(init.body)) as Record<string, any>;
    const label = name === RPC.run ? `run:${args.p_phase}` : name;
    rpc.push({ name, label, args, signal: init.signal ?? null });
    const index = used[name] ?? 0; used[name] = index + 1;
    const entry = state.script[name];
    const reply = typeof entry === 'function' ? entry : entry?.shift();
    if (!reply) { violations.push(`unscripted RPC ${label}`); throw new Error('Unscripted RPC'); }
    const { data, status = 200 } = typeof reply === 'function' ? reply(args, index) : reply;
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  };
  return { rpc, outside, violations, state, fetchImpl,
    labels: () => rpc.map(call => call.label),
    named: (name: string) => rpc.filter(call => call.name === name),
    aborted: () => rpc.filter(call => call.signal?.aborted).map(call => call.label) };
}
let tape: ReturnType<typeof createTape>;
// One stable function is the global fetch for the whole file. A product module that keeps a reference to the
// global fetch still reaches the tape of the current case.
const stableFetch = (url: RequestInfo | URL, init?: RequestInit) => tape.fetchImpl(url, init);
let consoleSpies: Array<{ mock: { calls: unknown[][] } }>;

function post(headers: Record<string, string> = { [HEADER]: SECRET }, init: { body?: string; signal?: AbortSignal; url?: string } = {}) {
  return new Request(init.url ?? ROUTE_URL, { method: 'POST', headers,
    ...(init.body !== undefined ? { body: init.body } : {}), ...(init.signal ? { signal: init.signal } : {}) });
}
// The spy records the timeout argument that the product passes. It is not evidence of real elapsed time.
function fakeDeadlines() {
  const timers: Array<{ ms: number; controller: AbortController }> = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController(); timers.push({ ms, controller }); return controller.signal; });
  // Fires every recorded deadline of that duration. Returns how many it fired.
  const fire = (ms: number) => {
    const matching = timers.filter(timer => timer.ms === ms); matching.forEach(timer => timer.controller.abort()); return matching.length;
  };
  return { timers, fire };
}
function fakeClock() {
  let now = NOW;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  return { advance: (ms: number) => { now += ms; } };
}
const consoleText = () => inspect(consoleSpies.map(spy => spy.mock.calls), { depth: 12 });
// No synthetic secret, credential reference, lease token or scripted error text may leave the entry.
function expectSafeText(text: string) {
  expect(text).not.toContain('Q7pPriv');
  expect(text).not.toContain(LEASE);
}
// A refused or failed request: a safe body and safe logs.
async function expectSafeFailure(response: Response, status: number) {
  expect(response.status).toBe(status);
  expectSafeText(await response.text());
  expectSafeText(consoleText());
}
// The numeric body of an accepted run: exactly the 14 S7 metric keys, each a non-negative integer.
async function numericBody(response: Response): Promise<Record<string, number>> {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type') ?? '').toContain('application/json');
  const text = await response.text(); expectSafeText(text);
  const body = JSON.parse(text) as Record<string, number>;
  expect(Object.keys(body).sort()).toEqual(METRIC_KEYS);
  expect(Object.values(body).every(value => Number.isInteger(value) && value >= 0)).toBe(true);
  return body;
}
const countsOf = (body: Record<string, number>) => { const { oldest_due_lag_seconds: _lag, ...rest } = body; return rest; };

beforeEach(() => {
  tape = createTape(); sdk.created.length = 0;
  vi.stubGlobal('fetch', stableFetch);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', DB);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY);
  vi.stubEnv(SECRET_ENV, SECRET);
  // Environment credentials for the expected client. The closed production resolver must ignore them.
  vi.stubEnv('PAYPAL_CLIENT_ID', 'synthetic-client');
  vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'synthetic-client');
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'Q7pPriv-env-client-secret');
  consoleSpies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'),
    vi.spyOn(console, 'debug')].map(spy => spy.mockImplementation(() => {}));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// These cases do not load a W3 module. They pass before W3 exists. A failure here is a fixture or setup defect,
// and then a failure of a W3 case below is not behavioral RED.
describe('W3 entry controls: the synthetic environment drives the real SDK and the real W1 service factory', () => {
  it('control: the env values, the global fetch stub and the SDK recorder reach the W1 service repository', async () => {
    tape.state.script = { [RPC.getter]: [NOT_FOUND] };
    expect(await createServiceChargeRepository().getChargeContext(DB_USER, ORDER)).toEqual({ kind: 'NOT_FOUND' });
    expect(sdk.created.map(item => [item.url, item.key])).toEqual([['https://w3-entry-db.example.invalid', 'Q7pPriv-synthetic-service-key']]);
    expect(tape.labels()).toEqual([RPC.getter]);
    expect(tape.rpc[0].args).toEqual({ p_actor_user_id: DB_USER, p_order_id: ORDER });
    expect(tape.rpc[0].signal).toBeInstanceOf(AbortSignal);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  it('control: the deadline spy records and fires the W1 ten-second RPC deadline', async () => {
    const deadlines = fakeDeadlines(); tape.state.script = { [RPC.getter]: [NOT_FOUND] };
    await createServiceChargeRepository().getChargeContext(DB_USER, ORDER);
    expect(deadlines.timers.map(timer => timer.ms)).toEqual([10_000]);
    expect(tape.aborted()).toEqual([]);
    expect(deadlines.fire(10_000)).toBe(1);
    expect(tape.aborted()).toEqual([RPC.getter]);
  });

  it('control: a synthetic POST request carries the secret header and follows its abort controller', () => {
    const controller = new AbortController(); const request = post(undefined, { signal: controller.signal });
    expect(request.method).toBe('POST');
    expect(request.headers.get('x-payment-reconciliation-secret')).toBe('Q7pPriv-reconciliation-secret-0123456789abcdef');
    expect(request.signal.aborted).toBe(false);
    controller.abort();
    expect(request.signal.aborted).toBe(true);
  });
});

describe('W3 internal entry authentication', () => {
  const UNSET: Array<[string, string | undefined, Record<string, string>]> = [
    ['an absent secret setting and the test secret in the header', undefined, { [HEADER]: SECRET }],
    ['an absent secret setting and no header', undefined, {}],
    ['an absent secret setting and an empty header', undefined, { [HEADER]: '' }],
    ['an empty secret setting and the test secret in the header', '', { [HEADER]: SECRET }],
    ['an empty secret setting and no header', '', {}],
    // An empty header equals an empty setting. That is not authentication.
    ['an empty secret setting and an empty header', '', { [HEADER]: '' }],
  ];
  it.each(UNSET)('answers 503 and starts no run with %s', async (_label, setting, headers) => {
    vi.stubEnv(SECRET_ENV, setting);
    const response = await (await closedHandler())(post(headers));
    await expectSafeFailure(response, 503);
    expect(tape.rpc).toEqual([]); expect(tape.outside).toEqual([]);
  });

  const MISMATCHED: Array<[string, Record<string, string>]> = [
    ['no secret header', {}],
    ['an empty secret header', { [HEADER]: '' }],
    ['a value of the same length with a different last character', { [HEADER]: `${SECRET.slice(0, -1)}0` }],
    ['a value of the same length with a different first character', { [HEADER]: `q${SECRET.slice(1)}` }],
    ['a prefix of the secret', { [HEADER]: SECRET.slice(0, -1) }],
    ['the secret with one more character', { [HEADER]: `${SECRET}f` }],
    ['the secret in another letter case', { [HEADER]: SECRET.toUpperCase() }],
    ['the secret only in the authorization header', { authorization: `Bearer ${SECRET}` }],
    ['the secret only in a similar header name', { 'x-payment-reconciliation-secret-2': SECRET }],
  ];
  it.each(MISMATCHED)('answers 401 and starts no run with %s', async (_label, headers) => {
    const response = await (await closedHandler())(post(headers));
    await expectSafeFailure(response, 401);
    // The executor is not called: no run record, no claim and no provider request exist.
    expect(tape.rpc).toEqual([]); expect(tape.outside).toEqual([]);
  });

  it('answers 401 when the secret is only in the request body and the query string', async () => {
    const response = await (await closedHandler())(post({ 'content-type': 'application/json' },
      { url: `${ROUTE_URL}?secret=${SECRET}&${HEADER}=${SECRET}`, body: JSON.stringify({ secret: SECRET, [HEADER]: SECRET }) }));
    await expectSafeFailure(response, 401);
    expect(tape.rpc).toEqual([]); expect(tape.outside).toEqual([]);
  });

  it('starts the run with the STARTED record only after the exact secret matched', async () => {
    tape.state.script = { [RPC.run]: [RECORDED, RECORDED], [RPC.claim]: [EMPTY] };
    const response = await (await closedHandler())(post());
    expect(countsOf(await numericBody(response))).toEqual(ZERO);
    expect(tape.labels()).toEqual(['run:STARTED', RPC.claim, 'run:FINISHED']);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });
});

describe('W3 accepted run through the closed production factory', () => {
  it('answers only the numeric metrics, keeps the credential resolver closed and calls no provider', async () => {
    tape.state.script = closedItem();
    const response = await (await closedHandler())(post());
    const body = await numericBody(response);
    const closedResolverResult = countsOf(body);
    expect(closedResolverResult).toMatchObject({ opened: 0, credential_unavailable: 1 });
    expect(closedResolverResult).toEqual({ ...ZERO, claimed: 1, credential_unavailable: 1 });
    // The item stops after the binding read: no token request, no OPEN and no provider GET.
    expect(tape.labels()[0]).toBe('run:STARTED'); expect(tape.labels()[1]).toBe(RPC.claim);
    expect(tape.labels().filter(label => label !== RPC.claim)).toEqual(['run:STARTED', RPC.getter, RPC.prepare, RPC.binding,
      RPC.finish, 'run:FINISHED']);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
    const actor = { p_actor_user_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', p_order_id: '11111111-1111-4111-8111-111111111111' };
    expect(tape.named(RPC.getter).map(call => call.args)).toEqual([actor]);
    expect(tape.named(RPC.binding).map(call => call.args)).toEqual([actor]);
    expect(tape.named(RPC.finish).map(call => call.args)).toEqual([{ p_order_id: '11111111-1111-4111-8111-111111111111',
      p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', p_result_code: 'CREDENTIAL_UNAVAILABLE' }]);
    const finishedRun = tape.rpc.find(call => call.label === 'run:FINISHED')!.args;
    expect(finishedRun.p_result_code).toBe('CREDENTIAL_UNAVAILABLE');
    // The response is the metric object that the run recorded, and nothing else.
    expect(body).toEqual(finishedRun.p_metrics);
    expectSafeText(consoleText());
  });

  it('takes no identity, order, lease, credential, provider or batch size from the caller', async () => {
    const BODY = { executorId: 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', runId: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
      instanceId: 'Q7pPriv-body-instance', maxItems: 9999, leaseSeconds: 5,
      actorUserId: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', userId: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
      orderId: 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', leaseToken: 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4',
      provider: 'PORTONE', environment: 'LIVE', credentialRef: 'Q7pPrivBodyRef', accessToken: 'Q7pPriv-body-token',
      credential: { clientId: 'synthetic-client', clientSecret: 'Q7pPriv-body-secret' } };
    tape.state.script = closedItem();
    const query = 'executorId=c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0&runId=c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'
      + '&userId=c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2&orderId=c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3&maxItems=9999&leaseSeconds=5';
    const response = await (await closedHandler())(post({ [HEADER]: SECRET, 'content-type': 'application/json' },
      { url: `${ROUTE_URL}?${query}`, body: JSON.stringify(BODY) }));
    expect(countsOf(await numericBody(response))).toEqual({ ...ZERO, claimed: 1, credential_unavailable: 1 });
    const sent = JSON.stringify(tape.rpc.map(call => call.args));
    for (const value of ['c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
      'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4',
      'Q7pPriv', 'PORTONE', 'LIVE', 'synthetic-client']) expect(sent).not.toContain(value);
    const started = tape.rpc[0].args;
    expect(started).toMatchObject({ p_phase: 'STARTED', p_metrics: null, p_result_code: null });
    expect(started.p_run_id).toMatch(UUID); expect(started.p_executor_id).toMatch(UUID);
    expect(typeof started.p_instance_id === 'string' && started.p_instance_id.trim().length >= 1 && started.p_instance_id.length <= 120).toBe(true);
    const claim = tape.named(RPC.claim)[0].args;
    expect(claim.p_executor_id).toBe(started.p_executor_id);
    expect(Number.isInteger(claim.p_lease_seconds) && claim.p_lease_seconds >= 30 && claim.p_lease_seconds <= 180).toBe(true);
    // The actor and the order are the ones that the queue claim returned.
    expect(tape.named(RPC.getter).map(call => call.args)).toEqual([{ p_actor_user_id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
      p_order_id: '11111111-1111-4111-8111-111111111111' }]);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  // The queue always has another item until call 60. Each item ends at the owner getter. A run with no batch
  // limit would claim 60 items.
  it('claims at most 25 items in one accepted run, whatever the caller asks for', async () => {
    const id = (prefix: string, index: number) => `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    tape.state.script = { [RPC.run]: () => RECORDED,
      [RPC.claim]: (_args, index) => index >= 60 ? EMPTY : { data: { contract_version: 'web-payment-reconciliation-claim.v1',
        outcome: 'CLAIMED', order_id: id('1', index), user_id: id('a', index), lease_token: id('b', index), attempt: '1', due_reason: 'NEW' } },
      [RPC.getter]: () => NOT_FOUND, [RPC.finish]: () => FINISHED };
    const response = await (await closedHandler())(post({ [HEADER]: SECRET, 'content-type': 'application/json' },
      { url: `${ROUTE_URL}?maxItems=9999`, body: JSON.stringify({ maxItems: 9999 }) }));
    const body = await numericBody(response);
    const claims = tape.named(RPC.claim).length;
    expect(claims).toBeGreaterThanOrEqual(1); expect(claims).toBeLessThanOrEqual(25);
    expect(body.claimed).toBe(claims);
    expect(tape.named(RPC.finish)).toHaveLength(claims);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  it('creates one new Supabase client and one new run for each accepted invocation', async () => {
    tape.state.script = { [RPC.run]: () => RECORDED, [RPC.claim]: () => EMPTY };
    const handle = await closedHandler();
    const before = sdk.created.length;
    await numericBody(await handle(post()));
    expect(sdk.created.length).toBe(before + 1);
    await numericBody(await handle(post()));
    expect(sdk.created.length).toBe(before + 2);
    const [first, second] = sdk.created.slice(before);
    expect(first.client).not.toBe(second.client);
    expect([first, second].map(item => [item.url, item.key])).toEqual([
      ['https://w3-entry-db.example.invalid', 'Q7pPriv-synthetic-service-key'],
      ['https://w3-entry-db.example.invalid', 'Q7pPriv-synthetic-service-key']]);
    const started = tape.rpc.filter(call => call.label === 'run:STARTED').map(call => call.args);
    expect(started).toHaveLength(2);
    expect(started[0].p_run_id).toMatch(UUID); expect(started[1].p_run_id).toMatch(UUID);
    expect(started[0].p_run_id).not.toBe(started[1].p_run_id);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  // A FINISHED record after a failed STARTED record is not specified. The second run reply exists only so that an
  // implementation that sends it does not hit an unscripted RPC.
  it('answers 503 and claims nothing when the STARTED record fails', async () => {
    tape.state.script = { [RPC.run]: [LOST, RECORDED] };
    const response = await (await closedHandler())(post());
    await expectSafeFailure(response, 503);
    expect(tape.labels().filter(label => label === 'run:STARTED')).toHaveLength(1);
    expect(tape.named(RPC.claim)).toHaveLength(0); expect(tape.named(RPC.getter)).toHaveLength(0);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  it('answers 503 when the FINISHED record fails after the item was finished', async () => {
    tape.state.script = closedItem({ [RPC.run]: [RECORDED, LOST] });
    const finishedWriteFailedResponse = await (await closedHandler())(post());
    expect(finishedWriteFailedResponse.status).toBe(503);
    await expectSafeFailure(finishedWriteFailedResponse, 503);
    expect(tape.named(RPC.finish)).toHaveLength(1);
    expect(tape.labels().filter(label => label === 'run:FINISHED')).toHaveLength(1);
    expect(tape.labels()[tape.labels().length - 1]).toBe('run:FINISHED');
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });
});

describe('W3 production factory read deadlines: only the owner getter and the provider binding read', () => {
  // The request is cancelled while the finish RPC is in flight. At that moment the two reads that already ended
  // carry the run signal. No command and no prepare replay carries it.
  it('applies the run signal to the getter and the binding read and to no command', async () => {
    const controller = new AbortController(); let atCancel: Record<string, boolean> | null = null;
    tape.state.script = closedItem({ [RPC.finish]: [() => {
      controller.abort();
      atCancel = Object.fromEntries(tape.rpc.map(call => [call.label, call.signal?.aborted ?? false]));
      return FINISHED;
    }] });
    await (await closedHandler())(post(undefined, { signal: controller.signal }));
    expect(atCancel).toEqual({ 'run:STARTED': false, [RPC.claim]: false, [RPC.getter]: true, [RPC.prepare]: false,
      [RPC.binding]: true, [RPC.finish]: false });
    // The started finish and the FINISHED record are still completed with their own client deadline.
    const finishedRun = tape.rpc.find(call => call.label === 'run:FINISHED');
    expect(finishedRun).toBeDefined();
    expect(finishedRun!.signal?.aborted ?? false).toBe(false);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  // Scripted clock: the claim ACK arrives 51,000 ms after t0, the getter takes 1,000 ms and the prepare replay
  // takes 1,000 ms. The getter starts with 4,000 ms of read budget and the binding read with 2,000 ms. The prepare
  // replay starts with 3,000 ms and must get no read deadline.
  it('gives the getter and the binding read min(10 s, t0 + 55 s - now) and gives every command its own 10 s deadline', async () => {
    const clock = fakeClock(); const deadlines = fakeDeadlines();
    const slow = (ms: number, reply: Delivery): ReplyFn => () => { clock.advance(ms); return reply; };
    tape.state.script = closedItem({ [RPC.claim]: [slow(51_000, CLAIMED), EMPTY], [RPC.getter]: [slow(1_000, FOUND)],
      [RPC.prepare]: [slow(1_000, PREPARED)], [RPC.binding]: [slow(500, BINDING)] });
    const response = await (await closedHandler())(post());
    await numericBody(response);
    const labels = ['run:STARTED', RPC.claim, RPC.getter, RPC.prepare, RPC.binding, RPC.finish, 'run:FINISHED'];
    expect(tape.labels()).toEqual(labels);
    expect(tape.named(RPC.finish)[0].args.p_result_code).toBe('CREDENTIAL_UNAVAILABLE');
    const durations = deadlines.timers.map(timer => timer.ms);
    expect(durations).toContain(4_000); expect(durations).toContain(2_000); expect(durations).not.toContain(3_000);
    expect(tape.aborted()).toEqual([]);
    expect(deadlines.fire(4_000)).toBeGreaterThanOrEqual(1);
    expect(tape.aborted()).toEqual([RPC.getter]);
    expect(deadlines.fire(2_000)).toBeGreaterThanOrEqual(1);
    expect(tape.aborted()).toEqual([RPC.getter, RPC.binding]);
    // Every RPC, command or read, has the W1 ten-second client deadline of its own.
    deadlines.fire(10_000);
    expect(tape.aborted()).toEqual(labels);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  it('caps the read deadline at 10 s when 20 s of read budget remain', async () => {
    const clock = fakeClock(); const deadlines = fakeDeadlines();
    tape.state.script = closedItem({ [RPC.claim]: [() => { clock.advance(35_000); return CLAIMED; }, EMPTY] });
    await numericBody(await (await closedHandler())(post()));
    expect(tape.named(RPC.getter)).toHaveLength(1); expect(tape.named(RPC.binding)).toHaveLength(1);
    expect(deadlines.timers.map(timer => timer.ms)).not.toContain(20_000);
    deadlines.fire(10_000);
    expect(tape.aborted()).toEqual(tape.labels());
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });

  // The finish code of this local skip is not specified. The case fixes only what must not be sent.
  it('sends no getter request and opens no cycle when no read budget remains before the owner read', async () => {
    const clock = fakeClock();
    tape.state.script = closedItem({ [RPC.claim]: [() => { clock.advance(55_000); return CLAIMED; }, EMPTY] });
    const response = await (await closedHandler())(post());
    await numericBody(response);
    expect(tape.named(RPC.getter)).toHaveLength(0); expect(tape.named(RPC.binding)).toHaveLength(0);
    expect(tape.named(RPC.open)).toHaveLength(0); expect(tape.named(RPC.complete)).toHaveLength(0);
    const finishes = tape.named(RPC.finish).map(call => call.args);
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toMatchObject({ p_order_id: '11111111-1111-4111-8111-111111111111',
      p_lease_token: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' });
    expect(FINISH_CODES).toContain(finishes[0].p_result_code);
    expect(tape.labels()[tape.labels().length - 1]).toBe('run:FINISHED');
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });
});

describe('W3 route segment app/api/internal/payment/paypal-reconciliation', () => {
  it('exports POST as the only HTTP method, the nodejs runtime and maxDuration 120', async () => {
    const route = await loadRoute();
    expect(Object.keys(route).filter(name => ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(name))).toEqual(['POST']);
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(120);
  });

  it('route POST answers 401 and starts no run for a mismatched secret', async () => {
    const route = await loadRoute();
    const response = await route.POST(post({ [HEADER]: `${SECRET.slice(0, -1)}0` }));
    await expectSafeFailure(response, 401);
    expect(tape.rpc).toEqual([]); expect(tape.outside).toEqual([]);
  });

  it('route POST answers the numeric metrics of a closed run for the exact secret', async () => {
    tape.state.script = closedItem();
    const route = await loadRoute();
    const body = await numericBody(await route.POST(post()));
    expect(countsOf(body)).toEqual({ ...ZERO, claimed: 1, credential_unavailable: 1 });
    expect(tape.labels()[0]).toBe('run:STARTED');
    expect(tape.named(RPC.open)).toHaveLength(0);
    expect(tape.outside).toEqual([]); expect(tape.violations).toEqual([]);
  });
});
