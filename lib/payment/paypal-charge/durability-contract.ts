import 'server-only';
import type { PayPalEnvironment, PayPalEvidence } from './protocol';
import type { ChargeLease, IntakeResult } from './repository';
import type { PayPalBodyStatus } from './transport';

// W1 wire contract for the durable result RPCs S1-S7 (spec 8/10, G5, G8, G9).
// Parsers accept unknown and return a closed union or throw WireContractError.
// They never echo input values in an error. Imports from repository/transport are type-only,
// so this module has no runtime import cycle.

export class WireContractError extends Error {
  constructor() { super('WEB_PAYMENT_WIRE_CONTRACT_INVALID'); }
}

// ---- Shared input types --------------------------------------------------------------------

export type SenderCapability = Pick<ChargeLease, 'attemptId' | 'leaseToken' | 'fencingVersion'>;
export type CallerAssertionCode = 'COUNTRY_MISMATCH' | 'SHAPE_CONTRADICTION' | 'INTENT_MISMATCH'
  | 'SAME_ID_RACE_UNCONFIRMED' | 'UNREPRESENTABLE_CONTRADICTION' | 'UNRECORDABLE_PROVIDER_FACT';
export type CallerAssertion = { code: CallerAssertionCode; detail: Record<string, unknown> };
export type ResultFact = { evidence: PayPalEvidence; bind: boolean };

export type SubmissionKind = 'CLEAN' | 'ADVERSE' | 'NO_RESPONSE';
export const SUBMISSION_CATEGORIES = ['TRANSPORT_UNKNOWN', 'HTTP_5XX', 'HTTP_408', 'HTTP_429', 'BODY_UNREADABLE',
  'PARTIAL_UNCONTRADICTED', 'NO_CAPTURE_UNCONTRADICTED', 'RESPONSE_COMPLETE_CAPTURE_COMPLETED',
  'RESPONSE_COMPLETE_CAPTURE_PENDING', 'RESPONSE_ADVERSE_FACT', 'RESPONSE_ORDER_VOIDED',
  'RESPONSE_CONTRADICTION_UNREPRESENTABLE', 'HTTP_REJECTED_4XX', 'HTTP_UNEXPECTED_STATUS', 'WORK_BOUND_EXCEEDED'] as const;
export type SubmissionCategory = typeof SUBMISSION_CATEGORIES[number];
export type EffectiveSubmissionCategory = SubmissionCategory | 'DB_ADVERSE_OVERRIDE';

// Exact p_classification object (contract web-payment-submission-classification.v2). Sent unchanged.
export type SubmissionInput = {
  contract_version: 'web-payment-submission-classification.v2'; context_id: string; quote_hash: string;
  provider_request_key: string; provider_order_id: string; environment: PayPalEnvironment;
  kind: SubmissionKind; category: SubmissionCategory; http_status: number | null; body_status: PayPalBodyStatus | null;
  post_capture_ids: string[] | null; unparseable_capture_count: number; capture_count_exceeded: boolean;
  facts: ResultFact[]; assertions: CallerAssertion[]; receive_fact_index: number | null;
};

export type ReadKind = 'CLEAN' | 'ADVERSE' | 'NO_DATA';
export const READ_CATEGORIES = ['READ_ORDER_NO_CAPTURE', 'READ_CAPTURE_PENDING', 'READ_CAPTURE_COMPLETED',
  'READ_ORDER_VOIDED', 'READ_ADVERSE_FACT', 'READ_NON_SUCCESS_FACT', 'READ_CONTRADICTION_UNREPRESENTABLE',
  'READ_PARTIAL_INDETERMINATE', 'READ_WORK_BOUND_EXCEEDED', 'READ_CAPTURE_ID_UNPARSEABLE', 'READ_HTTP_REJECTED',
  'READ_HTTP_UNEXPECTED', 'READ_ADVERSE_UNSPECIFIED', 'READ_TRANSPORT_UNKNOWN', 'READ_HTTP_5XX', 'READ_HTTP_408',
  'READ_HTTP_429', 'READ_HTTP_401', 'READ_HTTP_403', 'READ_BODY_UNREADABLE', 'READ_LOCAL_BUDGET_EXHAUSTED',
  'READ_LOCAL_CANCELLED'] as const;
export type ReadCategory = typeof READ_CATEGORIES[number];

// Exact p_completion object (contract web-payment-read-cycle-completion.v2). Sent unchanged.
export type ReadCompletionInput = {
  contract_version: 'web-payment-read-cycle-completion.v2'; kind: ReadKind; category: ReadCategory;
  get_http_status: number | null; get_body_status: PayPalBodyStatus | null; observed_capture_ids: string[] | null;
  unparseable_capture_count: number; capture_count_exceeded: boolean; facts: ResultFact[];
  assertions: CallerAssertion[]; receive_fact_index: number | null;
};
export type ReadActorKind = 'USER_CAPTURE' | 'USER_RECONCILE' | 'SCANNER' | 'OPERATOR_CONFIRMATION';

// ---- Result types (outcome -> kind, safe_reason_code/reason_code -> reason, other keys camelCase) ----

export type FactResult = { observationId: string; kind: 'RECORDED'; reason: null }
  | { observationId: string; kind: 'REVIEW_REQUIRED'; reason: string };
export type HoldSnapshot = { grantBlocked: boolean; admissionPossible: boolean; getEligible: boolean; version: string };

export type SubmissionResult =
  | { kind: 'CLASSIFIED'; replayed: boolean; classificationId: string; requestedKind: SubmissionKind;
      effectiveKind: SubmissionKind; effectiveCategory: EffectiveSubmissionCategory; dbAdverse: boolean;
      factResults: FactResult[]; assertionIds: string[]; intake: IntakeResult | null; hold: HoldSnapshot }
  | { kind: 'CONFLICT_RECORDED'; replayed: boolean; conflictId: string; originalClassificationId: string }
  | { kind: 'BLOCKED'; reason: 'ORDER_NOT_FOUND' | 'NOT_APPLICABLE' | 'SENDER_TUPLE_MISMATCH' };

// cycleToken is a memory-only capability. Do not log it or place it in a DTO or error.
export type ReadOpenResult =
  | { kind: 'OPENED'; cycleId: string; cycleToken: string; generation: string; deadlineAt: string; supersededCycleId: string | null }
  | { kind: 'READ_IN_PROGRESS'; deadlineAt: string } | { kind: 'NOT_APPLICABLE' } | { kind: 'NOT_FOUND' };

export type ReadCompletionResult =
  | { kind: 'COMPLETED'; replayed: boolean; cycleId: string; generation: string; requestedKind: ReadKind;
      effectiveKind: ReadKind; dbAdverse: boolean; factResults: FactResult[]; assertionIds: string[];
      intake: IntakeResult | null; hold: HoldSnapshot }
  | { kind: 'LATE_RECORDED'; replayed: boolean; lateId: string; effectiveKind: ReadKind | 'INVALID' }
  | { kind: 'CONFLICT_RECORDED'; replayed: boolean; conflictId: string }
  | { kind: 'BLOCKED'; reason: 'CYCLE_NOT_FOUND' | 'CYCLE_TOKEN_MISMATCH' };

export type PreIntentResult = { kind: 'RECORDED'; replayed: boolean; assertionIds: string[] }
  | { kind: 'BLOCKED'; reason: 'ORDER_NOT_FOUND' | 'NOT_APPLICABLE' | 'ORDER_LINK_REQUIRED' };

export type QueueDueReason = 'NEW' | 'BACKOFF_DUE' | 'REENTRY';
export type QueueClaimResult = { kind: 'EMPTY' }
  | { kind: 'CLAIMED'; orderId: string; userId: string; leaseToken: string; attempt: string; dueReason: QueueDueReason };
export type QueueFinishCode = 'INTAKE_PENDING' | 'HELD' | 'NO_CHANGE' | 'NO_DATA' | 'CREDENTIAL_UNAVAILABLE'
  | 'IN_PROGRESS' | 'DEFERRED' | 'FAILED';
export type QueueState = 'ACTIVE' | 'HELD' | 'DONE';
export type QueueFinishResult = { kind: 'FINISHED'; queueState: QueueState; nextDueAt: string | null } | { kind: 'STALE_LEASE' };

export const RECONCILIATION_METRIC_KEYS = ['claimed', 'opened', 'completed_clean', 'completed_adverse',
  'completed_no_data', 'held', 'deferred', 'credential_unavailable', 'in_progress', 'failed', 'read_cancelled',
  'write_unknown', 'stale_lease', 'oldest_due_lag_seconds'] as const;
export type ReconciliationMetrics = Record<typeof RECONCILIATION_METRIC_KEYS[number], number>;
export type ReconciliationRunResultCode = 'OK' | 'PARTIAL_BUDGET' | 'DISCOVERY_FAILED' | 'WRITE_FAILED'
  | 'CREDENTIAL_UNAVAILABLE' | 'PARTIAL_STALE_LEASE';
export type ReconciliationRunInput =
  | { runId: string; executorId: string; instanceId: string; phase: 'STARTED' }
  | { runId: string; executorId: string; instanceId: string; phase: 'FINISHED';
      metrics: ReconciliationMetrics; resultCode: ReconciliationRunResultCode };

// ---- W2 shared read window, report and runtime types ----------------------------------------

// A trusted in-memory read budget. deadlineAtMs is compared with nowMs(). signal is the run cancellation.
export type ReadWindow = { deadlineAtMs: number; signal: AbortSignal; nowMs: () => number };
// Result of one protected read cycle. It never contains the cycle token.
export type ReadCycleReport = { kind: 'COMPLETED' | 'NOT_OPENED' | 'WRITE_UNKNOWN' | 'LATE' | 'CONFLICT';
  effectiveKind?: ReadKind; intake?: IntakeResult | null;
  reason?: 'IN_PROGRESS' | 'DEFERRED' | 'NOT_APPLICABLE' | 'FAILED';
  opened: boolean; readCancelled: boolean; cycleId?: string; hold?: HoldSnapshot };
// The reconciliation executor injects this value. It is not browser input and grants no DB authority.
// onReadResult is a synchronous report callback.
export type ReconciliationRuntime = { actorKind: 'SCANNER'; window: ReadWindow;
  onReadResult: (report: ReadCycleReport) => void };

// ---- Parser primitives ---------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const POSITIVE = /^[1-9][0-9]{0,18}$/;

export const OBSERVATION_REASON_CODES: ReadonlySet<string> = new Set(['OBSERVATION_KEY_CONFLICT', 'CONTEXT_NOT_FOUND',
  'UNRECOGNIZED_STATUS', 'ORDER_BINDING_MISMATCH', 'PROVIDER_SCOPE_MISMATCH', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH',
  'ORDER_REFERENCE_MISMATCH', 'PAYMENT_ID_MISMATCH', 'PARENT_MISMATCH', 'IDENTITY_ALREADY_BOUND', 'IDENTITY_NOT_BOUND',
  'LOOKUP_REQUIRED', 'PROVIDER_ID_CONFLICT']);
const INTAKE_REVIEW_REASONS = ['CANDIDATE_BINDING_INVALID', 'EXISTING_PURCHASE_IDENTITY', 'INTAKE_HELD'] as const;

function fail(): never { throw new WireContractError(); }
function ensure(condition: unknown): asserts condition { if (!condition) fail(); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  ensure(Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)));
}
function matches(value: unknown, regex: RegExp): value is string { return typeof value === 'string' && regex.exec(value)?.[0] === value; }
function uuid(value: unknown): value is string { return matches(value, UUID); }
function positive(value: unknown): value is string {
  return matches(value, POSITIVE) && BigInt(value) <= BigInt('9223372036854775807');
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
function timestamp(value: unknown): value is string {
  if (!matches(value, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/)) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}
function envelope(value: unknown, contractVersion: string): Record<string, unknown> {
  const d = record(value); ensure(d.contract_version === contractVersion); return d;
}
// Native bounds: facts <= 33 per S1/S3 request; assertions per origin <= 15 (caller 8 + DB 7);
// S4 records 1..8 caller assertions; T7.attempt is int32.
const MAX_FACT_RESULTS = 33;
const MAX_ORIGIN_ASSERTIONS = 15;
const INT32_MAX = 2147483647;
// The length is checked before any element is read or copied. Order and permitted duplicates are kept.
function uuidList(value: unknown, min: number, max: number): string[] {
  ensure(Array.isArray(value) && value.length >= min && value.length <= max && value.every(uuid));
  return [...value as string[]];
}
// Canonical positive decimal string within int32.
function positiveInt32(value: unknown): value is string {
  return matches(value, /^[1-9][0-9]{0,9}$/) && Number(value) <= INT32_MAX;
}

// ---- Nested parsers ------------------------------------------------------------------------

// Native receive result. orderId=null is used where the caller has no order to compare (S3).
export function parseIntakeWire(value: unknown, orderId: string | null): IntakeResult {
  const d = record(value); ensure(d.grant_eligible === false);
  if (d.outcome === 'NOT_COMPLETED') { exactKeys(d, ['outcome', 'grant_eligible']); return { kind: 'NOT_COMPLETED', grantEligible: false }; }
  if (d.outcome === 'REVIEW_REQUIRED') {
    exactKeys(d, ['outcome', 'reason_code', 'grant_eligible']);
    ensure(oneOf(d.reason_code, INTAKE_REVIEW_REASONS));
    return { kind: 'REVIEW_REQUIRED', reason: d.reason_code, grantEligible: false };
  }
  exactKeys(d, ['outcome', 'replayed', 'order_id', 'inbox_id', 'receipt_id', 'coverage', 'grant_eligible']);
  ensure(d.outcome === 'INTAKE_PENDING' && uuid(d.order_id) && (orderId === null || d.order_id === orderId)
    && typeof d.replayed === 'boolean' && uuid(d.inbox_id) && positive(d.receipt_id) && d.coverage === 'SCOPE_ONLY');
  return { kind: 'INTAKE_PENDING', replayed: d.replayed, orderId: d.order_id, inboxId: d.inbox_id,
    receiptId: d.receipt_id, coverage: 'SCOPE_ONLY', grantEligible: false };
}

function parseHold(value: unknown): HoldSnapshot {
  const d = record(value); exactKeys(d, ['grant_blocked', 'admission_possible', 'get_eligible', 'version']);
  ensure(typeof d.grant_blocked === 'boolean' && typeof d.admission_possible === 'boolean'
    && typeof d.get_eligible === 'boolean' && matches(d.version, HASH));
  return { grantBlocked: d.grant_blocked, admissionPossible: d.admission_possible, getEligible: d.get_eligible, version: d.version };
}

function parseFactResults(value: unknown): FactResult[] {
  ensure(Array.isArray(value) && value.length <= MAX_FACT_RESULTS);
  return value.map((item): FactResult => {
    const d = record(item); exactKeys(d, ['observation_id', 'outcome', 'reason_code']); ensure(uuid(d.observation_id));
    if (d.outcome === 'RECORDED' && d.reason_code === null) return { observationId: d.observation_id, kind: 'RECORDED', reason: null };
    ensure(d.outcome === 'REVIEW_REQUIRED' && typeof d.reason_code === 'string' && OBSERVATION_REASON_CODES.has(d.reason_code));
    return { observationId: d.observation_id, kind: 'REVIEW_REQUIRED', reason: d.reason_code };
  });
}

// The DB only moves a kind to the safer ADVERSE side (spec 4/10 section 3 step 11), and
// db_adverse is true exactly when the effective kind is ADVERSE.
function effectiveKindValid(requested: string, effective: string, dbAdverse: unknown) {
  return (effective === requested || effective === 'ADVERSE') && dbAdverse === (effective === 'ADVERSE');
}

// ---- S1-S4 ---------------------------------------------------------------------------------

const SUBMISSION_KINDS = ['CLEAN', 'ADVERSE', 'NO_RESPONSE'] as const;
const READ_KINDS = ['CLEAN', 'ADVERSE', 'NO_DATA'] as const;

export function parseSubmissionResult(value: unknown, orderId: string): SubmissionResult {
  const d = envelope(value, 'web-payment-submission-result.v1');
  if (d.outcome === 'BLOCKED') {
    exactKeys(d, ['contract_version', 'outcome', 'safe_reason_code']);
    ensure(oneOf(d.safe_reason_code, ['ORDER_NOT_FOUND', 'NOT_APPLICABLE', 'SENDER_TUPLE_MISMATCH'] as const));
    return { kind: 'BLOCKED', reason: d.safe_reason_code };
  }
  if (d.outcome === 'CONFLICT_RECORDED') {
    exactKeys(d, ['contract_version', 'outcome', 'replayed', 'conflict_id', 'original_classification_id']);
    ensure(typeof d.replayed === 'boolean' && uuid(d.conflict_id) && uuid(d.original_classification_id));
    return { kind: 'CONFLICT_RECORDED', replayed: d.replayed, conflictId: d.conflict_id, originalClassificationId: d.original_classification_id };
  }
  ensure(d.outcome === 'CLASSIFIED');
  exactKeys(d, ['contract_version', 'outcome', 'replayed', 'classification_id', 'requested_kind', 'effective_kind',
    'effective_category', 'db_adverse', 'fact_results', 'assertion_ids', 'intake', 'hold']);
  ensure(typeof d.replayed === 'boolean' && uuid(d.classification_id) && oneOf(d.requested_kind, SUBMISSION_KINDS)
    && oneOf(d.effective_kind, SUBMISSION_KINDS) && typeof d.db_adverse === 'boolean'
    && effectiveKindValid(d.requested_kind, d.effective_kind, d.db_adverse));
  // effective_category is DB_ADVERSE_OVERRIDE exactly when the DB changed the requested kind.
  const overridden = d.requested_kind !== d.effective_kind;
  ensure(overridden ? d.effective_category === 'DB_ADVERSE_OVERRIDE' : oneOf(d.effective_category, SUBMISSION_CATEGORIES));
  return { kind: 'CLASSIFIED', replayed: d.replayed, classificationId: d.classification_id, requestedKind: d.requested_kind,
    effectiveKind: d.effective_kind, effectiveCategory: d.effective_category as EffectiveSubmissionCategory, dbAdverse: d.db_adverse,
    factResults: parseFactResults(d.fact_results), assertionIds: uuidList(d.assertion_ids, 0, MAX_ORIGIN_ASSERTIONS),
    intake: d.intake === null ? null : parseIntakeWire(d.intake, orderId), hold: parseHold(d.hold) };
}

export function parseReadOpenResult(value: unknown): ReadOpenResult {
  const d = envelope(value, 'web-payment-read-cycle-open.v1');
  if (d.outcome === 'NOT_FOUND' || d.outcome === 'NOT_APPLICABLE') {
    exactKeys(d, ['contract_version', 'outcome']); return { kind: d.outcome };
  }
  if (d.outcome === 'READ_IN_PROGRESS') {
    exactKeys(d, ['contract_version', 'outcome', 'deadline_at']); ensure(timestamp(d.deadline_at));
    return { kind: 'READ_IN_PROGRESS', deadlineAt: d.deadline_at };
  }
  ensure(d.outcome === 'OPENED');
  exactKeys(d, ['contract_version', 'outcome', 'cycle_id', 'cycle_token', 'generation', 'deadline_at', 'superseded_cycle_id']);
  ensure(uuid(d.cycle_id) && uuid(d.cycle_token) && positive(d.generation) && timestamp(d.deadline_at)
    && (d.superseded_cycle_id === null || uuid(d.superseded_cycle_id)));
  return { kind: 'OPENED', cycleId: d.cycle_id, cycleToken: d.cycle_token, generation: d.generation,
    deadlineAt: d.deadline_at, supersededCycleId: d.superseded_cycle_id as string | null };
}

export function parseReadCompletionResult(value: unknown, cycleId: string): ReadCompletionResult {
  const d = envelope(value, 'web-payment-read-cycle-result.v1');
  if (d.outcome === 'BLOCKED') {
    exactKeys(d, ['contract_version', 'outcome', 'safe_reason_code']);
    ensure(oneOf(d.safe_reason_code, ['CYCLE_NOT_FOUND', 'CYCLE_TOKEN_MISMATCH'] as const));
    return { kind: 'BLOCKED', reason: d.safe_reason_code };
  }
  if (d.outcome === 'LATE_RECORDED') {
    exactKeys(d, ['contract_version', 'outcome', 'replayed', 'late_id', 'effective_kind']);
    ensure(typeof d.replayed === 'boolean' && uuid(d.late_id) && oneOf(d.effective_kind, [...READ_KINDS, 'INVALID'] as const));
    return { kind: 'LATE_RECORDED', replayed: d.replayed, lateId: d.late_id, effectiveKind: d.effective_kind };
  }
  if (d.outcome === 'CONFLICT_RECORDED') {
    exactKeys(d, ['contract_version', 'outcome', 'replayed', 'conflict_id']);
    ensure(typeof d.replayed === 'boolean' && uuid(d.conflict_id));
    return { kind: 'CONFLICT_RECORDED', replayed: d.replayed, conflictId: d.conflict_id };
  }
  ensure(d.outcome === 'COMPLETED');
  exactKeys(d, ['contract_version', 'outcome', 'replayed', 'cycle_id', 'generation', 'requested_kind', 'effective_kind',
    'db_adverse', 'fact_results', 'assertion_ids', 'intake', 'hold']);
  ensure(typeof d.replayed === 'boolean' && uuid(d.cycle_id) && d.cycle_id === cycleId && positive(d.generation)
    && oneOf(d.requested_kind, READ_KINDS) && oneOf(d.effective_kind, READ_KINDS) && typeof d.db_adverse === 'boolean'
    && effectiveKindValid(d.requested_kind, d.effective_kind, d.db_adverse));
  return { kind: 'COMPLETED', replayed: d.replayed, cycleId: d.cycle_id, generation: d.generation,
    requestedKind: d.requested_kind, effectiveKind: d.effective_kind, dbAdverse: d.db_adverse,
    factResults: parseFactResults(d.fact_results), assertionIds: uuidList(d.assertion_ids, 0, MAX_ORIGIN_ASSERTIONS),
    intake: d.intake === null ? null : parseIntakeWire(d.intake, null), hold: parseHold(d.hold) };
}

export function parsePreIntentResult(value: unknown): PreIntentResult {
  const d = envelope(value, 'web-payment-preintent-assertions.v1');
  if (d.outcome === 'BLOCKED') {
    exactKeys(d, ['contract_version', 'outcome', 'safe_reason_code']);
    ensure(oneOf(d.safe_reason_code, ['ORDER_NOT_FOUND', 'NOT_APPLICABLE', 'ORDER_LINK_REQUIRED'] as const));
    return { kind: 'BLOCKED', reason: d.safe_reason_code };
  }
  ensure(d.outcome === 'RECORDED');
  exactKeys(d, ['contract_version', 'outcome', 'replayed', 'assertion_ids']);
  ensure(typeof d.replayed === 'boolean');
  return { kind: 'RECORDED', replayed: d.replayed, assertionIds: uuidList(d.assertion_ids, 1, 8) };
}

// ---- S5-S7 ---------------------------------------------------------------------------------

export function parseQueueClaimResult(value: unknown): QueueClaimResult {
  const d = envelope(value, 'web-payment-reconciliation-claim.v1');
  if (d.outcome === 'EMPTY') { exactKeys(d, ['contract_version', 'outcome']); return { kind: 'EMPTY' }; }
  ensure(d.outcome === 'CLAIMED');
  exactKeys(d, ['contract_version', 'outcome', 'order_id', 'user_id', 'lease_token', 'attempt', 'due_reason']);
  ensure(uuid(d.order_id) && uuid(d.user_id) && uuid(d.lease_token) && positiveInt32(d.attempt)
    && oneOf(d.due_reason, ['NEW', 'BACKOFF_DUE', 'REENTRY'] as const));
  return { kind: 'CLAIMED', orderId: d.order_id, userId: d.user_id, leaseToken: d.lease_token, attempt: d.attempt, dueReason: d.due_reason };
}

export function parseQueueFinishResult(value: unknown): QueueFinishResult {
  const d = envelope(value, 'web-payment-reconciliation-finish.v1');
  if (d.outcome === 'STALE_LEASE') { exactKeys(d, ['contract_version', 'outcome']); return { kind: 'STALE_LEASE' }; }
  ensure(d.outcome === 'FINISHED');
  exactKeys(d, ['contract_version', 'outcome', 'queue_state', 'next_due_at']);
  // Native finish returns next_due_at only for ACTIVE.
  ensure(oneOf(d.queue_state, ['ACTIVE', 'HELD', 'DONE'] as const)
    && (d.queue_state === 'ACTIVE' ? timestamp(d.next_due_at) : d.next_due_at === null));
  return { kind: 'FINISHED', queueState: d.queue_state, nextDueAt: d.next_due_at as string | null };
}

export function parseRunRecordResult(value: unknown): { replayed: boolean } {
  const d = envelope(value, 'web-payment-reconciliation-run.v1');
  exactKeys(d, ['contract_version', 'outcome', 'replayed']);
  ensure(d.outcome === 'RECORDED' && typeof d.replayed === 'boolean');
  return { replayed: d.replayed };
}
