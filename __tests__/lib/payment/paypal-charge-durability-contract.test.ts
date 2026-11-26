// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';

// W1 exact RPC contract tests (plan W1; spec 8/10 S1-S7, 4/10 section 3, 5/10 section 3, G5, G8, G9).
// The real repository and the real supabase-js client run against a fetch stub. No database is simulated.
// Response fixtures are hand-written literals of the native jsonb_build_object outputs in the reference
// migrations (20261117051844 submission results, 20261117093017 reconciliation queue). All values are synthetic.
//
// Test-owned projection rule for parsed results (the plan names kind/effectiveKind/grantEligible):
//   outcome -> kind; safe_reason_code and reason_code -> reason; contract_version is checked and dropped;
//   every other wire key -> camelCase; a nested intake uses the existing parseIntake projection.
// Test-owned queue run input: { runId, executorId, instanceId, phase: 'STARTED' }
//   | { runId, executorId, instanceId, phase: 'FINISHED', metrics: <14 exact wire keys>, resultCode }.
// Submission and completion inputs are the exact wire objects and must reach the RPC unchanged.
//
// The reconciliation module does not exist in the frozen tree. It is loaded at runtime through a
// non-literal specifier, so this file stays loadable and the first failure is the missing factory.

const DB = 'https://charge-db.example.invalid';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const ORDER = '11111111-1111-4111-8111-111111111111';
const OTHER_ORDER = '12121212-1212-4212-8212-121212121212';
const CONTEXT = '22222222-2222-4222-8222-222222222222';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const LEASE = '55555555-5555-4555-8555-555555555555';
const CLASSIFICATION = '66666666-6666-4666-8666-666666666666';
const CONFLICT = '67676767-6767-4767-8767-676767676767';
const CYCLE = '77777777-7777-4777-8777-777777777777';
const OTHER_CYCLE = '78787878-7878-4878-8878-787878787878';
const CYCLE_TOKEN = '79797979-7979-4979-8979-797979797979';
const SUPERSEDED = '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a';
const LATE = '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b';
const OBS_ORDER = '88888888-8888-4888-8888-888888888888';
const OBS_CAPTURE = '89898989-8989-4989-8989-898989898989';
const ASSERT_A = '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a';
const ASSERT_B = '9b9b9b9b-9b9b-4b9b-8b9b-9b9b9b9b9b9b';
const INBOX = '99999999-9999-4999-8999-999999999999';
const EXECUTOR = 'abababab-abab-4bab-8bab-abababababab';
const RUN = 'acacacac-acac-4cac-8cac-acacacacacac';
const QUEUE_LEASE = 'adadadad-adad-4dad-8dad-adadadadadad';
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HOLD_VERSION = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const FENCING = '9007199254740993';
const PROVIDER_ORDER = '5O190127TN364715T';
const CAPTURE_X = '3C679366HH908993F';
const CAPTURE_Y = '9SECONDCAPTURE';
const DEADLINE = '2026-11-17T10:00:45.123456+00:00';
const NEXT_DUE = '2026-11-17T10:05:00.654321+00:00';

const SCOPE = { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' };
function evidence(source: 'SUBMIT_RESPONSE' | 'LOOKUP', kind: 'ORDER' | 'CAPTURE', externalId: string, status: string, payloadHash: string) {
  return { source, key: `${kind}:${externalId}:${status}`, payload_hash: payloadHash, provider: 'PAYPAL', environment: 'SANDBOX',
    identity_kind: kind, external_id: externalId, parent_external_id: kind === 'CAPTURE' ? PROVIDER_ORDER : null,
    order_id: ORDER, user_id: ACTOR, quote_hash: HASH, order_reference: `v2:${ORDER}`, scope: SCOPE,
    amount_minor: '999', currency: 'USD', status };
}

// P1 wire input (contract web-payment-submission-classification.v2, 16 exact keys).
const SUBMISSION_INPUT = {
  contract_version: 'web-payment-submission-classification.v2', context_id: CONTEXT, quote_hash: HASH,
  provider_request_key: ATTEMPT, provider_order_id: PROVIDER_ORDER, environment: 'SANDBOX',
  kind: 'CLEAN', category: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', http_status: 201, body_status: 'PARSED',
  post_capture_ids: [CAPTURE_X], unparseable_capture_count: 0, capture_count_exceeded: false,
  facts: [
    { evidence: evidence('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED', '1'.repeat(64)), bind: false },
    { evidence: evidence('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE_X, 'COMPLETED', '2'.repeat(64)), bind: true },
  ],
  assertions: [], receive_fact_index: 1,
};
// Partial VOIDED with no ORDER fact: the caller assertion is the evidence (spec G3).
const VOIDED_INPUT = {
  ...SUBMISSION_INPUT, kind: 'ADVERSE', category: 'RESPONSE_ORDER_VOIDED', http_status: 200,
  post_capture_ids: [CAPTURE_X, CAPTURE_Y],
  facts: [{ evidence: evidence('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE_Y, 'PENDING', '3'.repeat(64)), bind: false },
    { evidence: evidence('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE_X, 'PENDING', '4'.repeat(64)), bind: false }],
  assertions: [{ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } },
    { code: 'SAME_ID_RACE_UNCONFIRMED', detail: {} }],
  receive_fact_index: null,
};
const NO_RESPONSE_INPUT = {
  ...SUBMISSION_INPUT, kind: 'NO_RESPONSE', category: 'HTTP_5XX', http_status: 503, body_status: 'EMPTY',
  post_capture_ids: null, facts: [], receive_fact_index: null,
};
// P2 wire input (contract web-payment-read-cycle-completion.v2, 11 exact keys). O={X,Y}, fact={X}.
const COMPLETION_INPUT = {
  contract_version: 'web-payment-read-cycle-completion.v2', kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED',
  get_http_status: 200, get_body_status: 'PARSED', observed_capture_ids: [CAPTURE_X, CAPTURE_Y],
  unparseable_capture_count: 0, capture_count_exceeded: false,
  facts: [
    { evidence: evidence('LOOKUP', 'ORDER', PROVIDER_ORDER, 'COMPLETED', '5'.repeat(64)), bind: false },
    { evidence: evidence('LOOKUP', 'CAPTURE', CAPTURE_X, 'COMPLETED', '6'.repeat(64)), bind: true },
  ],
  assertions: [], receive_fact_index: 1,
};
const NO_DATA_INPUT = {
  contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category: 'READ_LOCAL_BUDGET_EXHAUSTED',
  get_http_status: null, get_body_status: null, observed_capture_ids: null, unparseable_capture_count: 0,
  capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null,
};
const PREINTENT_ASSERTIONS = [{ code: 'COUNTRY_MISMATCH', detail: {} },
  { code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'MISSING_MERCHANT' } }];

const HOLD_BLOCKED = { grant_blocked: true, admission_possible: false, get_eligible: false, version: HOLD_VERSION };
const HOLD_BLOCKED_DTO = { grantBlocked: true, admissionPossible: false, getEligible: false, version: HOLD_VERSION };
const HOLD_PENDING = { grant_blocked: true, admission_possible: false, get_eligible: true, version: 'd'.repeat(64) };
const HOLD_PENDING_DTO = { grantBlocked: true, admissionPossible: false, getEligible: true, version: 'd'.repeat(64) };
const HOLD_CLEAR = { grant_blocked: false, admission_possible: true, get_eligible: false, version: 'e'.repeat(64) };
const HOLD_CLEAR_DTO = { grantBlocked: false, admissionPossible: true, getEligible: false, version: 'e'.repeat(64) };
const INTAKE_PENDING = { outcome: 'INTAKE_PENDING', replayed: false, order_id: ORDER, inbox_id: INBOX,
  receipt_id: '9007199254740993', coverage: 'SCOPE_ONLY', grant_eligible: false };
const INTAKE_PENDING_DTO = { kind: 'INTAKE_PENDING', replayed: false, orderId: ORDER, inboxId: INBOX,
  receiptId: '9007199254740993', coverage: 'SCOPE_ONLY', grantEligible: false };
const INTAKE_HELD = { outcome: 'REVIEW_REQUIRED', reason_code: 'INTAKE_HELD', grant_eligible: false };
const INTAKE_HELD_DTO = { kind: 'REVIEW_REQUIRED', reason: 'INTAKE_HELD', grantEligible: false };

// S1 literal: requested CLEAN, native IDENTITY_ALREADY_BOUND, so the DB returns effective ADVERSE.
const S1_MIXED = {
  contract_version: 'web-payment-submission-result.v1', outcome: 'CLASSIFIED', replayed: false,
  classification_id: CLASSIFICATION, requested_kind: 'CLEAN', effective_kind: 'ADVERSE',
  effective_category: 'DB_ADVERSE_OVERRIDE', db_adverse: true,
  fact_results: [{ observation_id: OBS_ORDER, outcome: 'RECORDED', reason_code: null },
    { observation_id: OBS_CAPTURE, outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND' }],
  assertion_ids: [ASSERT_A], intake: null, hold: HOLD_BLOCKED,
};
const S1_MIXED_DTO = {
  kind: 'CLASSIFIED', replayed: false, classificationId: CLASSIFICATION, requestedKind: 'CLEAN', effectiveKind: 'ADVERSE',
  effectiveCategory: 'DB_ADVERSE_OVERRIDE', dbAdverse: true,
  factResults: [{ observationId: OBS_ORDER, kind: 'RECORDED', reason: null },
    { observationId: OBS_CAPTURE, kind: 'REVIEW_REQUIRED', reason: 'IDENTITY_ALREADY_BOUND' }],
  assertionIds: [ASSERT_A], intake: null, hold: HOLD_BLOCKED_DTO,
};
const S1_CLEAN = { ...S1_MIXED, effective_kind: 'CLEAN', effective_category: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', db_adverse: false,
  fact_results: [{ observation_id: OBS_ORDER, outcome: 'RECORDED', reason_code: null },
    { observation_id: OBS_CAPTURE, outcome: 'RECORDED', reason_code: null }],
  assertion_ids: [], intake: INTAKE_PENDING, hold: HOLD_CLEAR };
const S1_CONFLICT = { contract_version: 'web-payment-submission-result.v1', outcome: 'CONFLICT_RECORDED', replayed: false,
  conflict_id: CONFLICT, original_classification_id: CLASSIFICATION };

const S2_OPENED = { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'OPENED', cycle_id: CYCLE,
  cycle_token: CYCLE_TOKEN, generation: '9007199254740993', deadline_at: DEADLINE, superseded_cycle_id: null };

// S3 literal: requested CLEAN with O={X,Y} and fact={X}; the DB derives divergence and returns ADVERSE.
const S3_MIXED = {
  contract_version: 'web-payment-read-cycle-result.v1', outcome: 'COMPLETED', replayed: false, cycle_id: CYCLE,
  generation: '2', requested_kind: 'CLEAN', effective_kind: 'ADVERSE', db_adverse: true,
  fact_results: [{ observation_id: OBS_ORDER, outcome: 'RECORDED', reason_code: null },
    { observation_id: OBS_CAPTURE, outcome: 'RECORDED', reason_code: null }],
  assertion_ids: [ASSERT_A, ASSERT_B], intake: null, hold: HOLD_BLOCKED,
};
const S3_MIXED_DTO = {
  kind: 'COMPLETED', replayed: false, cycleId: CYCLE, generation: '2', requestedKind: 'CLEAN', effectiveKind: 'ADVERSE',
  dbAdverse: true, factResults: [{ observationId: OBS_ORDER, kind: 'RECORDED', reason: null },
    { observationId: OBS_CAPTURE, kind: 'RECORDED', reason: null }],
  assertionIds: [ASSERT_A, ASSERT_B], intake: null, hold: HOLD_BLOCKED_DTO,
};

const S5_CLAIMED = { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'CLAIMED', order_id: ORDER,
  user_id: ACTOR, lease_token: QUEUE_LEASE, attempt: '1', due_reason: 'NEW' };
const S6_FINISHED = { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'FINISHED',
  queue_state: 'ACTIVE', next_due_at: NEXT_DUE };
const METRICS = { claimed: 3, opened: 2, completed_clean: 1, completed_adverse: 0, completed_no_data: 1, held: 0,
  deferred: 1, credential_unavailable: 0, in_progress: 0, failed: 0, read_cancelled: 0, write_unknown: 0,
  stale_lease: 1, oldest_due_lag_seconds: 42 };
const STARTED_RUN = { runId: RUN, executorId: EXECUTOR, instanceId: 'synthetic-instance-1', phase: 'STARTED' };
const FINISHED_RUN = { runId: RUN, executorId: EXECUTOR, instanceId: 'synthetic-instance-1', phase: 'FINISHED',
  metrics: METRICS, resultCode: 'PARTIAL_STALE_LEASE' };
const S7_RECORDED = { contract_version: 'web-payment-reconciliation-run.v1', outcome: 'RECORDED', replayed: false };

const SENDER = { attemptId: ATTEMPT, leaseToken: LEASE, fencingVersion: FENCING };
const S1_ARGS = { p_actor_user_id: ACTOR, p_order_id: ORDER, p_attempt_id: ATTEMPT, p_lease_token: LEASE,
  p_fencing_version: FENCING, p_classification: SUBMISSION_INPUT };
const SECRETS = /Q7pPriv|55555555-5555-4555-8555-555555555555|79797979-7979-4979-8979-797979797979|adadadad-adad-4dad-8dad-adadadadadad|PGRST/;

const rpcFetch = vi.fn();
let wire: unknown;
let status: number;
let expectedRpc: string;

function client() {
  return createClient(DB, 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: rpcFetch },
  });
}
type AnyFn = (...args: any[]) => Promise<any>;
function method(target: unknown, name: string): AnyFn {
  const candidate = (target as Record<string, unknown>)[name];
  expect(typeof candidate, `${name} must exist on the real repository`).toBe('function');
  return (candidate as AnyFn).bind(target);
}
const charge = (name: 'recordSubmissionResult' | 'openReadCycle' | 'completeReadCycle' | 'recordPreIntentAssertions') =>
  method(createWebPaymentChargeRepository(client()), name);
const RECONCILIATION_MODULE: string = '@/lib/payment/paypal-charge/reconciliation-repository';
async function queue(name: 'claim' | 'finish' | 'recordRun'): Promise<AnyFn> {
  const specifier = RECONCILIATION_MODULE;
  const loaded = await import(/* @vite-ignore */ specifier).catch(() => null) as Record<string, unknown> | null;
  const factory = loaded?.createReconciliationRepository;
  expect(typeof factory, 'reconciliation-repository.ts must export createReconciliationRepository').toBe('function');
  return method((factory as (c: unknown) => unknown)(client()), name);
}
function expectRpc(name: string, args: Record<string, unknown>) {
  expect(rpcFetch).toHaveBeenCalledTimes(1);
  const [url, init] = rpcFetch.mock.calls[0];
  expect(url).toBe(`${DB}/rest/v1/rpc/${name}`);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual(args);
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
  expect(new Headers(init.headers).get('x-retry-count')).toBeNull();
}
async function expectResponseClosed(run: () => Promise<unknown>) {
  const caught = await run().catch(error => error);
  expect(caught).toMatchObject({ stage: 'RESPONSE' });
  expect(String(caught) + JSON.stringify(caught)).not.toMatch(SECRETS);
  expect(rpcFetch).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  vi.spyOn(AbortSignal, 'timeout');
  status = 200; wire = null; expectedRpc = 'record_web_payment_submission_result';
  rpcFetch.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
    if (url !== `${DB}/rest/v1/rpc/${expectedRpc}` || init.method !== 'POST') throw new Error('Unexpected external operation');
    return new Response(JSON.stringify(wire), { status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('S1 record_web_payment_submission_result through the real repository', () => {
  beforeEach(() => { expectedRpc = 'record_web_payment_submission_result'; });

  it('keeps requested CLEAN and DB effective ADVERSE separate in one retry-free RPC', async () => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = S1_MIXED;
    await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT)).resolves.toEqual(S1_MIXED_DTO);
    expectRpc('record_web_payment_submission_result', S1_ARGS);
  });
  it('sends only the intent sender tuple from a full lease and the input unchanged', async () => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = { ...S1_MIXED, requested_kind: 'ADVERSE', effective_category: 'RESPONSE_ORDER_VOIDED' };
    const fullLease ={ ...SENDER, rowVersion: '9007199254740995', providerRequestKey: ATTEMPT,
      submitNotAfter: '2026-11-14T00:01:00.123456+00:00', quoteHash: HASH };
    await recordSubmissionResult(ACTOR, ORDER, fullLease, VOIDED_INPUT);
    expectRpc('record_web_payment_submission_result', { ...S1_ARGS, p_classification: VOIDED_INPUT });
    const sent = JSON.parse(rpcFetch.mock.calls[0][1].body).p_classification;
    expect(sent.facts.map((f: any) => [f.evidence.external_id, f.bind])).toEqual([[CAPTURE_Y, false], [CAPTURE_X, false]]);
    expect(sent.post_capture_ids).toEqual([CAPTURE_X, CAPTURE_Y]);
  });
  it('projects CLEAN with the native INTAKE_PENDING receive result and hold', async () => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = S1_CLEAN;
    await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT)).resolves.toEqual({
      ...S1_MIXED_DTO, effectiveKind: 'CLEAN', effectiveCategory: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', dbAdverse: false,
      factResults: [{ observationId: OBS_ORDER, kind: 'RECORDED', reason: null }, { observationId: OBS_CAPTURE, kind: 'RECORDED', reason: null }],
      assertionIds: [], intake: INTAKE_PENDING_DTO, hold: HOLD_CLEAR_DTO,
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it('projects a CLEAN classification whose receive returns INTAKE_HELD', async () => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = { ...S1_CLEAN, intake: INTAKE_HELD, hold: HOLD_PENDING };
    const result = await recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT);
    expect(result.intake).toEqual(INTAKE_HELD_DTO);
    expect(result.hold).toEqual(HOLD_PENDING_DTO);
    expect(result.effectiveKind).toBe('CLEAN');
  });
  it('projects a replayed NO_RESPONSE classification without facts or intake', async () => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = { ...S1_MIXED, replayed: true, requested_kind: 'NO_RESPONSE', effective_kind: 'NO_RESPONSE',
      effective_category: 'HTTP_5XX', db_adverse: false, fact_results: [], assertion_ids: [], hold: HOLD_PENDING };
    await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, NO_RESPONSE_INPUT)).resolves.toEqual({
      kind: 'CLASSIFIED', replayed: true, classificationId: CLASSIFICATION, requestedKind: 'NO_RESPONSE',
      effectiveKind: 'NO_RESPONSE', effectiveCategory: 'HTTP_5XX', dbAdverse: false, factResults: [], assertionIds: [],
      intake: null, hold: HOLD_PENDING_DTO,
    });
  });
  it('returns CONFLICT_RECORDED as a normal committed result', async () => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = S1_CONFLICT;
    await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT)).resolves.toEqual({
      kind: 'CONFLICT_RECORDED', replayed: false, conflictId: CONFLICT, originalClassificationId: CLASSIFICATION,
    });
    expectRpc('record_web_payment_submission_result', S1_ARGS);
  });
  it.each(['ORDER_NOT_FOUND', 'NOT_APPLICABLE', 'SENDER_TUPLE_MISMATCH'])('returns BLOCKED %s without authority', async reason => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = { contract_version: 'web-payment-submission-result.v1', outcome: 'BLOCKED', safe_reason_code: reason };
    await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT)).resolves.toEqual({ kind: 'BLOCKED', reason });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['null', null], ['array', []], ['empty object', {}],
    ['other contract', { ...S1_MIXED, contract_version: 'web-payment-submission-result.v2' }],
    ['unknown outcome', { ...S1_MIXED, outcome: 'CLASSIFIED_LATER' }],
    ['reflected lease token', { ...S1_MIXED, lease_token: LEASE }],
    ['missing hold', (({ hold, ...rest }) => rest)(S1_MIXED)],
    ['missing intake key', (({ intake, ...rest }) => rest)(S1_MIXED)],
    ['extra hold key', { ...S1_MIXED, hold: { ...HOLD_BLOCKED, review_projection: true } }],
    ['invalid hold version', { ...S1_MIXED, hold: { ...HOLD_BLOCKED, version: 'Q7pPriv' } }],
    ['string hold boolean', { ...S1_MIXED, hold: { ...HOLD_BLOCKED, grant_blocked: 'true' } }],
    ['uppercase classification UUID', { ...S1_MIXED, classification_id: 'A6666666-6666-4666-8666-666666666666' }],
    ['unknown requested kind', { ...S1_MIXED, requested_kind: 'MAYBE' }],
    ['read-only effective kind', { ...S1_MIXED, effective_kind: 'NO_DATA' }],
    ['unknown effective category', { ...S1_MIXED, effective_category: 'FUTURE_CATEGORY' }],
    ['unsafe ADVERSE to CLEAN downgrade', { ...S1_MIXED, requested_kind: 'ADVERSE', effective_kind: 'CLEAN',
      effective_category: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', db_adverse: false }],
    ['string db_adverse', { ...S1_MIXED, db_adverse: 'true' }],
    ['numeric replayed', { ...S1_MIXED, replayed: 0 }],
    ['fact_results object', { ...S1_MIXED, fact_results: {} }],
    ['extra fact result key', { ...S1_MIXED, fact_results: [{ ...S1_MIXED.fact_results[0], trust: 'SERVER_REPORTED' }] }],
    ['RECORDED fact with reason', { ...S1_MIXED, fact_results: [{ observation_id: OBS_ORDER, outcome: 'RECORDED', reason_code: 'IDENTITY_ALREADY_BOUND' }] }],
    ['unknown fact reason', { ...S1_MIXED, fact_results: [{ observation_id: OBS_ORDER, outcome: 'REVIEW_REQUIRED', reason_code: 'NEW_REASON' }] }],
    ['malformed assertion id', { ...S1_MIXED, assertion_ids: ['Q7pPriv'] }],
    ['cross-order intake', { ...S1_CLEAN, intake: { ...INTAKE_PENDING, order_id: OTHER_ORDER } }],
    ['grant-eligible intake', { ...S1_CLEAN, intake: { ...INTAKE_HELD, grant_eligible: true } }],
    ['numeric receipt id', { ...S1_CLEAN, intake: { ...INTAKE_PENDING, receipt_id: 9007199254740992 } }],
    ['unknown BLOCKED reason', { contract_version: 'web-payment-submission-result.v1', outcome: 'BLOCKED', safe_reason_code: 'CYCLE_NOT_FOUND' }],
    ['extra BLOCKED key', { contract_version: 'web-payment-submission-result.v1', outcome: 'BLOCKED', safe_reason_code: 'NOT_APPLICABLE', detail: 'Q7pPriv' }],
    ['CONFLICT without original id', (({ original_classification_id, ...rest }) => rest)(S1_CONFLICT)],
    ['CONFLICT with invalid id', { ...S1_CONFLICT, conflict_id: 'Q7pPriv' }],
  ] as [string, unknown][])('closes malformed S1 output: %s', async (_label, data) => {
    const recordSubmissionResult = charge('recordSubmissionResult');
    wire = data;
    await expectResponseClosed(() => recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT));
  });
});

describe('S2 open_web_payment_read_cycle through the real repository', () => {
  beforeEach(() => { expectedRpc = 'open_web_payment_read_cycle'; });

  it.each(['USER_CAPTURE', 'USER_RECONCILE', 'SCANNER', 'OPERATOR_CONFIRMATION'])('opens with actor kind %s and keeps the token in memory only', async actorKind => {
    const openReadCycle = charge('openReadCycle');
    wire = S2_OPENED;
    await expect(openReadCycle(ACTOR, ORDER, actorKind)).resolves.toEqual({ kind: 'OPENED', cycleId: CYCLE,
      cycleToken: CYCLE_TOKEN, generation: '9007199254740993', deadlineAt: DEADLINE, supersededCycleId: null });
    expectRpc('open_web_payment_read_cycle', { p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: actorKind });
  });
  it('projects a superseded abandoned cycle id', async () => {
    const openReadCycle = charge('openReadCycle');
    wire = { ...S2_OPENED, generation: '3', superseded_cycle_id: SUPERSEDED };
    await expect(openReadCycle(ACTOR, ORDER, 'SCANNER')).resolves.toMatchObject({ kind: 'OPENED', generation: '3', supersededCycleId: SUPERSEDED });
  });
  it.each([
    [{ contract_version: 'web-payment-read-cycle-open.v1', outcome: 'READ_IN_PROGRESS', deadline_at: DEADLINE }, { kind: 'READ_IN_PROGRESS', deadlineAt: DEADLINE }],
    [{ contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_FOUND' }, { kind: 'NOT_FOUND' }],
    [{ contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_APPLICABLE' }, { kind: 'NOT_APPLICABLE' }],
  ])('keeps non-opened outcome %# without a token', async (data, expected) => {
    const openReadCycle = charge('openReadCycle');
    wire = data;
    await expect(openReadCycle(ACTOR, ORDER, 'USER_RECONCILE')).resolves.toEqual(expected);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['other contract', { ...S2_OPENED, contract_version: 'web-payment-read-cycle-open.v2' }],
    ['unknown outcome', { ...S2_OPENED, outcome: 'OPENED_LATER' }],
    ['numeric generation', { ...S2_OPENED, generation: 9007199254740992 }],
    ['zero generation', { ...S2_OPENED, generation: '0' }],
    ['padded generation', { ...S2_OPENED, generation: '01' }],
    ['missing token', (({ cycle_token, ...rest }) => rest)(S2_OPENED)],
    ['malformed token', { ...S2_OPENED, cycle_token: 'Q7pPriv' }],
    ['missing superseded key', (({ superseded_cycle_id, ...rest }) => rest)(S2_OPENED)],
    ['malformed superseded id', { ...S2_OPENED, superseded_cycle_id: 'Q7pPriv' }],
    ['malformed deadline', { ...S2_OPENED, deadline_at: 'soon' }],
    ['extra OPENED key', { ...S2_OPENED, cycle_token_hash: HASH }],
    ['token in READ_IN_PROGRESS', { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'READ_IN_PROGRESS', deadline_at: DEADLINE, cycle_token: CYCLE_TOKEN }],
    ['extra NOT_FOUND key', { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_FOUND', order_id: ORDER }],
  ] as [string, unknown][])('closes malformed S2 output: %s', async (_label, data) => {
    const openReadCycle = charge('openReadCycle');
    wire = data;
    await expectResponseClosed(() => openReadCycle(ACTOR, ORDER, 'USER_CAPTURE'));
  });
});

describe('S3 complete_web_payment_read_cycle through the real repository', () => {
  beforeEach(() => { expectedRpc = 'complete_web_payment_read_cycle'; });

  it('keeps requested CLEAN and DB effective ADVERSE separate for O={X,Y} and fact={X}', async () => {
    const completeReadCycle = charge('completeReadCycle');
    wire = S3_MIXED;
    await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual(S3_MIXED_DTO);
    expectRpc('complete_web_payment_read_cycle', { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN, p_completion: COMPLETION_INPUT });
    const sent = JSON.parse(rpcFetch.mock.calls[0][1].body).p_completion;
    expect(sent.observed_capture_ids).toEqual([CAPTURE_X, CAPTURE_Y]);
    expect(sent.facts.filter((f: any) => f.evidence.identity_kind === 'CAPTURE').map((f: any) => f.evidence.external_id)).toEqual([CAPTURE_X]);
  });
  it('projects a CLEAN completion whose receive returns INTAKE_HELD', async () => {
    const completeReadCycle = charge('completeReadCycle');
    wire = { ...S3_MIXED, effective_kind: 'CLEAN', db_adverse: false, assertion_ids: [], intake: INTAKE_HELD, hold: HOLD_PENDING };
    await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual({
      ...S3_MIXED_DTO, effectiveKind: 'CLEAN', dbAdverse: false, assertionIds: [], intake: INTAKE_HELD_DTO, hold: HOLD_PENDING_DTO,
    });
  });
  it('projects an explicit NO_DATA completion', async () => {
    const completeReadCycle = charge('completeReadCycle');
    wire = { ...S3_MIXED, requested_kind: 'NO_DATA', effective_kind: 'NO_DATA', db_adverse: false, fact_results: [],
      assertion_ids: [], hold: HOLD_PENDING };
    await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, NO_DATA_INPUT)).resolves.toMatchObject({
      kind: 'COMPLETED', requestedKind: 'NO_DATA', effectiveKind: 'NO_DATA', dbAdverse: false, factResults: [], intake: null,
    });
    expectRpc('complete_web_payment_read_cycle', { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN, p_completion: NO_DATA_INPUT });
  });
  it.each(['CLEAN', 'ADVERSE', 'NO_DATA', 'INVALID'])('returns LATE_RECORDED with effective %s', async effectiveKind => {
    const completeReadCycle = charge('completeReadCycle');
    wire = { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'LATE_RECORDED', replayed: true, late_id: LATE, effective_kind: effectiveKind };
    await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual({ kind: 'LATE_RECORDED', replayed: true, lateId: LATE, effectiveKind });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it('returns CONFLICT_RECORDED as a normal committed result', async () => {
    const completeReadCycle = charge('completeReadCycle');
    wire = { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'CONFLICT_RECORDED', replayed: false, conflict_id: CONFLICT };
    await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual({ kind: 'CONFLICT_RECORDED', replayed: false, conflictId: CONFLICT });
  });
  it.each(['CYCLE_NOT_FOUND', 'CYCLE_TOKEN_MISMATCH'])('returns BLOCKED %s', async reason => {
    const completeReadCycle = charge('completeReadCycle');
    wire = { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'BLOCKED', safe_reason_code: reason };
    await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual({ kind: 'BLOCKED', reason });
  });
  it.each([
    ['other contract', { ...S3_MIXED, contract_version: 'web-payment-submission-result.v1' }],
    ['reflected cycle token', { ...S3_MIXED, cycle_token: CYCLE_TOKEN }],
    ['cross-cycle result', { ...S3_MIXED, cycle_id: OTHER_CYCLE }],
    ['submission-only effective category', { ...S3_MIXED, effective_category: 'DB_ADVERSE_OVERRIDE' }],
    ['submission-only requested kind', { ...S3_MIXED, requested_kind: 'NO_RESPONSE' }],
    ['unsafe ADVERSE to CLEAN downgrade', { ...S3_MIXED, requested_kind: 'ADVERSE', effective_kind: 'CLEAN', db_adverse: false }],
    ['unsafe NO_DATA to CLEAN change', { ...S3_MIXED, requested_kind: 'NO_DATA', effective_kind: 'CLEAN', db_adverse: false }],
    ['numeric generation', { ...S3_MIXED, generation: 2 }],
    ['invalid hold version', { ...S3_MIXED, hold: { ...HOLD_BLOCKED, version: HOLD_VERSION.toUpperCase() } }],
    ['missing fact_results', (({ fact_results, ...rest }) => rest)(S3_MIXED)],
    ['ABANDONED late kind', { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'LATE_RECORDED', replayed: false, late_id: LATE, effective_kind: 'ABANDONED' }],
    ['LATE without id', { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'LATE_RECORDED', replayed: false, effective_kind: 'ADVERSE' }],
    ['submission BLOCKED reason', { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'BLOCKED', safe_reason_code: 'ORDER_NOT_FOUND' }],
    ['CONFLICT with original classification', { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'CONFLICT_RECORDED', replayed: false, conflict_id: CONFLICT, original_classification_id: CLASSIFICATION }],
  ] as [string, unknown][])('closes malformed S3 output: %s', async (_label, data) => {
    const completeReadCycle = charge('completeReadCycle');
    wire = data;
    await expectResponseClosed(() => completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT));
  });
});

describe('S4 record_web_payment_preintent_assertions through the real repository', () => {
  beforeEach(() => { expectedRpc = 'record_web_payment_preintent_assertions'; });

  it.each([false, true])('records caller assertions unchanged with replayed=%s', async replayed => {
    const recordPreIntentAssertions = charge('recordPreIntentAssertions');
    wire = { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed, assertion_ids: [ASSERT_A, ASSERT_B] };
    await expect(recordPreIntentAssertions(ACTOR, ORDER, PREINTENT_ASSERTIONS)).resolves.toEqual({
      kind: 'RECORDED', replayed, assertionIds: [ASSERT_A, ASSERT_B] });
    expectRpc('record_web_payment_preintent_assertions', { p_actor_user_id: ACTOR, p_order_id: ORDER, p_assertions: PREINTENT_ASSERTIONS });
  });
  it.each(['ORDER_NOT_FOUND', 'NOT_APPLICABLE', 'ORDER_LINK_REQUIRED'])('returns BLOCKED %s', async reason => {
    const recordPreIntentAssertions = charge('recordPreIntentAssertions');
    wire = { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'BLOCKED', safe_reason_code: reason };
    await expect(recordPreIntentAssertions(ACTOR, ORDER, PREINTENT_ASSERTIONS)).resolves.toEqual({ kind: 'BLOCKED', reason });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['other contract', { contract_version: 'web-payment-preintent-assertions.v2', outcome: 'RECORDED', replayed: false, assertion_ids: [ASSERT_A] }],
    ['missing assertion ids', { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: false }],
    ['numeric assertion id', { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: false, assertion_ids: [123] }],
    ['string replayed', { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: 'yes', assertion_ids: [ASSERT_A] }],
    ['sender BLOCKED reason', { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'BLOCKED', safe_reason_code: 'SENDER_TUPLE_MISMATCH' }],
    ['extra RECORDED key', { contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: false, assertion_ids: [ASSERT_A], origin: 'PRE_INTENT' }],
  ] as [string, unknown][])('closes malformed S4 output: %s', async (_label, data) => {
    const recordPreIntentAssertions = charge('recordPreIntentAssertions');
    wire = data;
    await expectResponseClosed(() => recordPreIntentAssertions(ACTOR, ORDER, PREINTENT_ASSERTIONS));
  });
});

describe('S5 claim_web_payment_reconciliation_item through the real reconciliation repository', () => {
  beforeEach(() => { expectedRpc = 'claim_web_payment_reconciliation_item'; });

  it.each(['NEW', 'BACKOFF_DUE', 'REENTRY'])('claims one item with due reason %s and the DB actor', async dueReason => {
    const claim = await queue('claim');
    wire = { ...S5_CLAIMED, due_reason: dueReason };
    await expect(claim(EXECUTOR, 60)).resolves.toEqual({ kind: 'CLAIMED', orderId: ORDER, userId: ACTOR,
      leaseToken: QUEUE_LEASE, attempt: '1', dueReason });
    expectRpc('claim_web_payment_reconciliation_item', { p_executor_id: EXECUTOR, p_lease_seconds: 60 });
  });
  it('returns EMPTY without a lease', async () => {
    const claim = await queue('claim');
    wire = { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'EMPTY' };
    await expect(claim(EXECUTOR, 180)).resolves.toEqual({ kind: 'EMPTY' });
    expectRpc('claim_web_payment_reconciliation_item', { p_executor_id: EXECUTOR, p_lease_seconds: 180 });
  });
  it.each([
    ['other contract', { ...S5_CLAIMED, contract_version: 'web-payment-reconciliation-claim.v2' }],
    ['numeric attempt', { ...S5_CLAIMED, attempt: 1 }],
    ['zero attempt', { ...S5_CLAIMED, attempt: '0' }],
    ['unknown due reason', { ...S5_CLAIMED, due_reason: 'RETRY' }],
    ['malformed user id', { ...S5_CLAIMED, user_id: 'Q7pPriv' }],
    ['missing lease token', (({ lease_token, ...rest }) => rest)(S5_CLAIMED)],
    ['extra CLAIMED key', { ...S5_CLAIMED, row_version: '2' }],
    ['extra EMPTY key', { contract_version: 'web-payment-reconciliation-claim.v1', outcome: 'EMPTY', order_id: ORDER }],
  ] as [string, unknown][])('closes malformed S5 output: %s', async (_label, data) => {
    const claim = await queue('claim');
    wire = data;
    await expectResponseClosed(() => claim(EXECUTOR, 60));
  });
});

describe('S6 finish_web_payment_reconciliation_item through the real reconciliation repository', () => {
  beforeEach(() => { expectedRpc = 'finish_web_payment_reconciliation_item'; });

  it.each(['INTAKE_PENDING', 'HELD', 'NO_CHANGE', 'NO_DATA', 'CREDENTIAL_UNAVAILABLE', 'IN_PROGRESS', 'DEFERRED', 'FAILED'])
  ('sends result code %s with the queue lease', async resultCode => {
    const finish = await queue('finish');
    wire = S6_FINISHED;
    await expect(finish(ORDER, QUEUE_LEASE, resultCode)).resolves.toEqual({ kind: 'FINISHED', queueState: 'ACTIVE', nextDueAt: NEXT_DUE });
    expectRpc('finish_web_payment_reconciliation_item', { p_order_id: ORDER, p_lease_token: QUEUE_LEASE, p_result_code: resultCode });
  });
  it.each(['HELD', 'DONE'])('projects FINISHED %s with no next due time', async queueState => {
    const finish = await queue('finish');
    wire = { ...S6_FINISHED, queue_state: queueState, next_due_at: null };
    await expect(finish(ORDER, QUEUE_LEASE, 'HELD')).resolves.toEqual({ kind: 'FINISHED', queueState, nextDueAt: null });
  });
  it('keeps STALE_LEASE distinct from a finished item', async () => {
    const finish = await queue('finish');
    wire = { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'STALE_LEASE' };
    await expect(finish(ORDER, QUEUE_LEASE, 'NO_CHANGE')).resolves.toEqual({ kind: 'STALE_LEASE' });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['other contract', { ...S6_FINISHED, contract_version: 'web-payment-reconciliation-claim.v1' }],
    ['unknown queue state', { ...S6_FINISHED, queue_state: 'PAUSED' }],
    ['malformed next due', { ...S6_FINISHED, next_due_at: 'later' }],
    ['missing next due key', (({ next_due_at, ...rest }) => rest)(S6_FINISHED)],
    ['extra STALE_LEASE key', { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'STALE_LEASE', lease_token: QUEUE_LEASE }],
    ['unknown outcome', { contract_version: 'web-payment-reconciliation-finish.v1', outcome: 'RELEASED' }],
  ] as [string, unknown][])('closes malformed S6 output: %s', async (_label, data) => {
    const finish = await queue('finish');
    wire = data;
    await expectResponseClosed(() => finish(ORDER, QUEUE_LEASE, 'NO_CHANGE'));
  });
});

describe('S7 record_web_payment_reconciliation_run through the real reconciliation repository', () => {
  beforeEach(() => { expectedRpc = 'record_web_payment_reconciliation_run'; });

  it('records STARTED with explicit null metrics and result code', async () => {
    const recordRun = await queue('recordRun');
    wire = S7_RECORDED;
    await expect(recordRun(STARTED_RUN)).resolves.toEqual({ replayed: false });
    expectRpc('record_web_payment_reconciliation_run', { p_run_id: RUN, p_executor_id: EXECUTOR, p_phase: 'STARTED',
      p_instance_id: 'synthetic-instance-1', p_metrics: null, p_result_code: null });
  });
  it('records FINISHED with the 14 exact metric keys and PARTIAL_STALE_LEASE', async () => {
    const recordRun = await queue('recordRun');
    wire = { ...S7_RECORDED, replayed: true };
    await expect(recordRun(FINISHED_RUN)).resolves.toEqual({ replayed: true });
    expectRpc('record_web_payment_reconciliation_run', { p_run_id: RUN, p_executor_id: EXECUTOR, p_phase: 'FINISHED',
      p_instance_id: 'synthetic-instance-1', p_metrics: METRICS, p_result_code: 'PARTIAL_STALE_LEASE' });
    expect(Object.keys(JSON.parse(rpcFetch.mock.calls[0][1].body).p_metrics).sort()).toEqual(['claimed', 'completed_adverse',
      'completed_clean', 'completed_no_data', 'credential_unavailable', 'deferred', 'failed', 'held', 'in_progress',
      'oldest_due_lag_seconds', 'opened', 'read_cancelled', 'stale_lease', 'write_unknown']);
  });
  it.each([
    ['other contract', { ...S7_RECORDED, contract_version: 'web-payment-reconciliation-run.v2' }],
    ['unknown outcome', { ...S7_RECORDED, outcome: 'CONFLICT' }],
    ['string replayed', { ...S7_RECORDED, replayed: 'false' }],
    ['extra key', { ...S7_RECORDED, run_id: RUN }],
  ] as [string, unknown][])('closes malformed S7 output: %s', async (_label, data) => {
    const recordRun = await queue('recordRun');
    wire = data;
    await expectResponseClosed(() => recordRun(FINISHED_RUN));
  });
});

// W1 review correction F2/F3. Native bounds from the reference migrations:
// facts <= 33 per S1/S3 request (fact_results keeps input order and may repeat an observation id
// when the same evidence replays); assertions per origin <= 15 (caller <= 8 plus DB code <= 7);
// S4 records 1..8 caller assertions; T7.attempt is int32 and S5 claims only attempt < 2147483647.
// Each oversized case changes one array or field of a valid full wire fixture.
describe('W1 review bounds through the real repositories', () => {
  const boundId = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  // Index 2 repeats the observation id of index 1; index 3 is a native REVIEW result.
  const factObservationId = (i: number) => boundId('f0f0f0f0', i === 2 ? 1 : i);
  const factResultsWire = (n: number) => Array.from({ length: n }, (_unused, i) => i === 3
    ? { observation_id: factObservationId(i), outcome: 'REVIEW_REQUIRED', reason_code: 'IDENTITY_ALREADY_BOUND' }
    : { observation_id: factObservationId(i), outcome: 'RECORDED', reason_code: null });
  const factResultsExpected = (n: number) => Array.from({ length: n }, (_unused, i) => i === 3
    ? { observationId: factObservationId(i), kind: 'REVIEW_REQUIRED', reason: 'IDENTITY_ALREADY_BOUND' }
    : { observationId: factObservationId(i), kind: 'RECORDED', reason: null });
  // Native assertion ids are distinct and sorted.
  const assertionIds = (n: number) => Array.from({ length: n }, (_unused, i) => boundId('a0a0a0a0', i + 1));

  it('keeps the expected id fixtures distinct where native ids are distinct', () => {
    expect(factResultsWire(33)[2].observation_id).toBe(factResultsWire(33)[1].observation_id);
    expect(new Set(assertionIds(16)).size).toBe(16);
    expect([...assertionIds(16)].sort()).toEqual(assertionIds(16));
  });

  describe('S1 record_web_payment_submission_result', () => {
    beforeEach(() => { expectedRpc = 'record_web_payment_submission_result'; });
    it('accepts 33 fact_results in order with a repeated observation id', async () => {
      const recordSubmissionResult = charge('recordSubmissionResult');
      wire = { ...S1_MIXED, fact_results: factResultsWire(33) };
      await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT)).resolves.toEqual({ ...S1_MIXED_DTO, factResults: factResultsExpected(33) });
      expectRpc('record_web_payment_submission_result', S1_ARGS);
    });
    it('closes 34 fact_results as RESPONSE', async () => {
      const recordSubmissionResult = charge('recordSubmissionResult');
      wire = { ...S1_MIXED, fact_results: factResultsWire(34) };
      await expectResponseClosed(() => recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT));
    });
    it('accepts 15 assertion_ids', async () => {
      const recordSubmissionResult = charge('recordSubmissionResult');
      wire = { ...S1_MIXED, assertion_ids: assertionIds(15) };
      await expect(recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT)).resolves.toEqual({ ...S1_MIXED_DTO, assertionIds: assertionIds(15) });
    });
    it('closes 16 assertion_ids as RESPONSE', async () => {
      const recordSubmissionResult = charge('recordSubmissionResult');
      wire = { ...S1_MIXED, assertion_ids: assertionIds(16) };
      await expectResponseClosed(() => recordSubmissionResult(ACTOR, ORDER, SENDER, SUBMISSION_INPUT));
    });
  });

  describe('S3 complete_web_payment_read_cycle', () => {
    beforeEach(() => { expectedRpc = 'complete_web_payment_read_cycle'; });
    it('accepts 33 fact_results in order with a repeated observation id', async () => {
      const completeReadCycle = charge('completeReadCycle');
      wire = { ...S3_MIXED, fact_results: factResultsWire(33) };
      await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual({ ...S3_MIXED_DTO, factResults: factResultsExpected(33) });
      expectRpc('complete_web_payment_read_cycle', { p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN, p_completion: COMPLETION_INPUT });
    });
    it('closes 34 fact_results as RESPONSE', async () => {
      const completeReadCycle = charge('completeReadCycle');
      wire = { ...S3_MIXED, fact_results: factResultsWire(34) };
      await expectResponseClosed(() => completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT));
    });
    it('accepts 15 assertion_ids', async () => {
      const completeReadCycle = charge('completeReadCycle');
      wire = { ...S3_MIXED, assertion_ids: assertionIds(15) };
      await expect(completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT)).resolves.toEqual({ ...S3_MIXED_DTO, assertionIds: assertionIds(15) });
    });
    it('closes 16 assertion_ids as RESPONSE', async () => {
      const completeReadCycle = charge('completeReadCycle');
      wire = { ...S3_MIXED, assertion_ids: assertionIds(16) };
      await expectResponseClosed(() => completeReadCycle(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT));
    });
  });

  describe('S4 record_web_payment_preintent_assertions', () => {
    beforeEach(() => { expectedRpc = 'record_web_payment_preintent_assertions'; });
    const recorded = (ids: string[]) => ({ contract_version: 'web-payment-preintent-assertions.v1', outcome: 'RECORDED', replayed: false, assertion_ids: ids });
    it.each([1, 8])('accepts RECORDED with %i assertion_ids', async n => {
      const recordPreIntentAssertions = charge('recordPreIntentAssertions');
      wire = recorded(assertionIds(n));
      await expect(recordPreIntentAssertions(ACTOR, ORDER, PREINTENT_ASSERTIONS)).resolves.toEqual({ kind: 'RECORDED', replayed: false, assertionIds: assertionIds(n) });
      expectRpc('record_web_payment_preintent_assertions', { p_actor_user_id: ACTOR, p_order_id: ORDER, p_assertions: PREINTENT_ASSERTIONS });
    });
    it.each([0, 9])('closes RECORDED with %i assertion_ids as RESPONSE', async n => {
      const recordPreIntentAssertions = charge('recordPreIntentAssertions');
      wire = recorded(assertionIds(n));
      await expectResponseClosed(() => recordPreIntentAssertions(ACTOR, ORDER, PREINTENT_ASSERTIONS));
    });
  });

  describe('S5 claim_web_payment_reconciliation_item', () => {
    beforeEach(() => { expectedRpc = 'claim_web_payment_reconciliation_item'; });
    it('accepts the int32 maximum attempt 2147483647', async () => {
      const claim = await queue('claim');
      wire = { ...S5_CLAIMED, attempt: '2147483647' };
      await expect(claim(EXECUTOR, 60)).resolves.toEqual({ kind: 'CLAIMED', orderId: ORDER, userId: ACTOR,
        leaseToken: QUEUE_LEASE, attempt: '2147483647', dueReason: 'NEW' });
      expectRpc('claim_web_payment_reconciliation_item', { p_executor_id: EXECUTOR, p_lease_seconds: 60 });
    });
    it('closes attempt 2147483648 beyond int32 as RESPONSE', async () => {
      const claim = await queue('claim');
      wire = { ...S5_CLAIMED, attempt: '2147483648' };
      await expectResponseClosed(() => claim(EXECUTOR, 60));
    });
  });
});

describe('S1-S7 safe RPC failure without retry', () => {
  const operations: [string, string, () => Promise<() => Promise<unknown>>][] = [
    ['S1', 'record_web_payment_submission_result', async () => { const f = charge('recordSubmissionResult'); return () => f(ACTOR, ORDER, SENDER, SUBMISSION_INPUT); }],
    ['S2', 'open_web_payment_read_cycle', async () => { const f = charge('openReadCycle'); return () => f(ACTOR, ORDER, 'SCANNER'); }],
    ['S3', 'complete_web_payment_read_cycle', async () => { const f = charge('completeReadCycle'); return () => f(CYCLE, CYCLE_TOKEN, COMPLETION_INPUT); }],
    ['S4', 'record_web_payment_preintent_assertions', async () => { const f = charge('recordPreIntentAssertions'); return () => f(ACTOR, ORDER, PREINTENT_ASSERTIONS); }],
    ['S5', 'claim_web_payment_reconciliation_item', async () => { const f = await queue('claim'); return () => f(EXECUTOR, 60); }],
    ['S6', 'finish_web_payment_reconciliation_item', async () => { const f = await queue('finish'); return () => f(ORDER, QUEUE_LEASE, 'FAILED'); }],
    ['S7', 'record_web_payment_reconciliation_run', async () => { const f = await queue('recordRun'); return () => f(FINISHED_RUN); }],
  ];
  const errors: [string, number, Record<string, unknown>][] = [
    ['22023 input invalid', 400, { code: '22023', message: 'WEB_PAYMENT_CLASSIFICATION_INPUT_INVALID', details: `Q7pPriv ${LEASE} ${CYCLE_TOKEN}`, hint: QUEUE_LEASE }],
    ['P0001 isolation', 400, { code: 'P0001', message: 'WEB_PAYMENT_ISOLATION_UNSUPPORTED', details: 'Q7pPriv' }],
    ['503 gateway', 503, { code: 'PGRST000', message: 'Q7pPriv upstream', details: LEASE }],
  ];
  for (const [label, rpc, prepare] of operations) {
    it.each(errors)(`${label} sanitizes %s as RPC with one fetch`, async (_name, errorStatus, body) => {
      const run = await prepare();
      expectedRpc = rpc; status = errorStatus; wire = body;
      const caught = await run().catch(error => error);
      expect(caught).toMatchObject({ stage: 'RPC' });
      expect(String(caught) + JSON.stringify(caught)).not.toMatch(SECRETS);
      expect(rpcFetch).toHaveBeenCalledTimes(1);
      expect(new Headers(rpcFetch.mock.calls[0][1].headers).get('x-retry-count')).toBeNull();
    });
    it(`${label} propagates the ten-second RPC signal and sanitizes timeout`, async () => {
      const run = await prepare();
      expectedRpc = rpc;
      const controller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
      rpcFetch.mockImplementation(async (_url: string, init: RequestInit) => {
        controller.abort(new DOMException('Q7pPriv', 'TimeoutError')); init.signal!.throwIfAborted();
      });
      const caught = await run().catch(error => error);
      expect(caught).toMatchObject({ stage: 'RPC' });
      expect(String(caught) + JSON.stringify(caught)).not.toMatch(/Q7pPriv|TimeoutError/);
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(rpcFetch).toHaveBeenCalledTimes(1);
      expect(rpcFetch.mock.calls[0][1].signal).toBe(controller.signal);
    });
  }
});
