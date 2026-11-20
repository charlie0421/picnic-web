import 'server-only';
import type { LogEventCode } from '@/utils/log-event-codes';
import { assessPayPalOrder, minorToPayPalValue, type PayPalEnvironment, type PayPalOrderAssessment, type PayPalScope } from './protocol';
import type { CallerAssertion, ReadCycleReport, ReconciliationRuntime, ResultFact } from './durability-contract';
import { performReadCycle, readSignal, remainingReadMs } from './read-cycle';
import type { ChargeCommand, ChargeContext, ChargeLease, IntakeResult, PreparedProviderContext, WebPaymentChargeRepository } from './repository';
import { buildEvidence, captureList, classifySubmission, expectedOrder, judgmentAssertions, mismatchFacts,
  UNREPRESENTABLE_ASSERTION, type OrderMismatch } from './submission-classification';
import type { PayPalHttpResult, PayPalTransport } from './transport';
import type { ProviderEntryDecision, ProviderEntryGate } from './provider-entry';

export type ProviderChargeBinding = { orderId: string; contextId: string; provider: 'PAYPAL'; environment: PayPalEnvironment;
  billingCountry: string; scope: PayPalScope; bindingId: string; bindingVersion: string; bindingHash: string;
  credentialRef: string; expectedPayPalClientId: string };
export interface ChargeBindingSource {
  // This trusted injected boundary has no production RPC implementation in U1.
  getProviderBinding(actorUserId: string, orderId: string): Promise<ProviderChargeBinding
    | { kind: 'NOT_FOUND' | 'CONTEXT_REQUIRED' | 'VERIFICATION_BINDING_REQUIRED' }>;
}
export interface PayPalCredentialResolver {
  // signal is present only for a trusted reconciliation runtime. A trusted resolver must honor its cancellation.
  resolve(input: { provider: 'PAYPAL'; environment: PayPalEnvironment; credentialRef: string; bindingVersion: string; bindingHash: string;
    signal?: AbortSignal }): Promise<{ clientId: string; clientSecret: string } | null>;
}
export const closedPayPalCredentialResolver: PayPalCredentialResolver = { async resolve() { return null; } };
type Stage = 'CONTEXT' | 'PREPARE' | 'BINDING' | 'CREDENTIAL' | 'TOKEN' | 'ENTRY' | 'CREATE' | 'LOOKUP' | 'CLAIM' | 'INTENT' | 'SUBMIT' | 'OBSERVE' | 'INTAKE'
  | 'CLASSIFY' | 'CYCLE' | 'HELD';
export type PayPalChargeOutcome =
  | { kind: 'PROVIDER_ORDER_READY'; providerOrderId: string; replayed: boolean }
  | { kind: 'INTAKE_PENDING'; replayed: boolean }
  | { kind: 'STATUS'; paymentState: ChargeContext['paymentState']; settlementState: ChargeContext['settlementState']; reviewRequired: boolean }
  | { kind: 'BLOCKED'; reason: string } | { kind: 'UNAVAILABLE'; stage: Stage }
  | { kind: 'NOT_APPROVED' | 'ORDER_VOIDED' | 'IN_PROGRESS' | 'CAPTURE_PENDING' | 'CAPTURE_FAILED' | 'SUBMISSION_UNKNOWN'
      | 'NO_PROVIDER_ORDER' | 'REVIEW_REQUIRED' | 'NOT_FOUND' };
// runtime is a trusted in-memory value from the reconciliation executor. It is never browser input.
export type PayPalChargeDeps = { repository: WebPaymentChargeRepository; bindings: ChargeBindingSource;
  credentials: PayPalCredentialResolver; transport: PayPalTransport; entry: ProviderEntryGate; nowMs: () => number;
  log: (entry: { stage: Stage; level: 'warn' | 'error'; code: LogEventCode; orderId: string; httpStatus?: number }) => void;
  runtime?: ReconciliationRuntime };
export type PayPalChargeBrowserDto = { contractVersion: 'web-payment-charge.v1'; orderId: string; state: PayPalChargeOutcome['kind'];
  newOrderAllowed: false; providerOrderId?: string; paymentState?: ChargeContext['paymentState'];
  settlementState?: ChargeContext['settlementState']; reviewRequired?: boolean };
type Input = { actorUserId: string; orderId: string };
type Authorized = { binding: ProviderChargeBinding; accessToken: string };
type UserReadKind = 'USER_CAPTURE' | 'USER_RECONCILE';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const POSITIVE = /^[1-9][0-9]{0,18}$/;
const ID = /^[A-Z0-9]{1,36}$/;
const SCOPE_VALUE = /^[A-Za-z0-9._:-]{1,200}$/;
const EVENTS = {
  CONTEXT: 'payment.paypal.charge.context.failed', PREPARE: 'payment.paypal.charge.context.failed', BINDING: 'payment.paypal.charge.credential.unavailable',
  CREDENTIAL: 'payment.paypal.charge.credential.unavailable', TOKEN: 'payment.paypal.charge.credential.unavailable',
  ENTRY: 'payment.paypal.charge.context.failed',
  CREATE: 'payment.paypal.charge.create.failed', LOOKUP: 'payment.paypal.charge.lookup.failed', CLAIM: 'payment.paypal.charge.claim.blocked',
  INTENT: 'payment.paypal.charge.intent.failed', SUBMIT: 'payment.paypal.charge.submit.unknown',
  OBSERVE: 'payment.paypal.charge.observe.review', INTAKE: 'payment.paypal.charge.intake.failed',
  CLASSIFY: 'payment.paypal.charge.classify.failed', CYCLE: 'payment.paypal.charge.cycle.failed',
  HELD: 'payment.paypal.charge.intake.held',
} as const satisfies Record<Stage, LogEventCode>;

function matches(value: unknown, regex: RegExp): value is string { return typeof value === 'string' && regex.exec(value)?.[0] === value; }
function positive(value: unknown): value is string { return matches(value, POSITIVE) && BigInt(value) <= BigInt('9223372036854775807'); }
function log(d: Pick<PayPalChargeDeps, 'log'>, stage: Stage, orderId: string, httpStatus?: number) {
  try { d.log({ stage, level: ['CONTEXT', 'CREATE', 'SUBMIT', 'INTAKE', 'CLASSIFY', 'CYCLE'].includes(stage) ? 'error' : 'warn', code: EVENTS[stage], orderId,
    ...(Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599 ? { httpStatus } : {}) }); }
  catch { /* Logging cannot authorize or repeat a payment operation. */ }
}
function unavailable(d: Pick<PayPalChargeDeps, 'log'>, stage: Stage, orderId: string, status?: number): PayPalChargeOutcome {
  log(d, stage, orderId, status); return { kind: 'UNAVAILABLE', stage };
}
function now(d: Pick<PayPalChargeDeps, 'nowMs'>): number {
  try { const value = d.nowMs(); return Number.isFinite(value) ? value : NaN; } catch { return NaN; }
}
function before(d: Pick<PayPalChargeDeps, 'nowMs'>, timestamp: string, margin = 0) {
  return now(d) < Date.parse(timestamp) - margin;
}
function recovery(c: ChargeContext) {
  return c.submissionIntentRecorded || c.paymentState === 'SUBMISSION_UNKNOWN' || c.providerCaptureId !== null || c.settlementState !== 'NOT_INTAKE';
}
function freshRefusal(d: Pick<PayPalChargeDeps, 'nowMs'>, c: ChargeContext): PayPalChargeOutcome | null {
  if (c.reviewRequired) return { kind: 'REVIEW_REQUIRED' };
  if (c.actorDeleted) return { kind: 'BLOCKED', reason: 'ACTOR_DELETED' };
  if (!before(d, c.quoteExpiresAt)) return { kind: 'BLOCKED', reason: 'QUOTE_EXPIRED' };
  if (recovery(c)) return { kind: 'SUBMISSION_UNKNOWN' };
  return null;
}

// The report callback is synchronous and grants no authority. Its failure cannot change the workflow.
function report(d: Pick<PayPalChargeDeps, 'runtime'>, value: ReadCycleReport) {
  try { d.runtime?.onReadResult(value); } catch { /* The executor settles from its own state. */ }
}
function deferred(d: Pick<PayPalChargeDeps, 'runtime'>) {
  report(d, { kind: 'NOT_OPENED', reason: 'DEFERRED', opened: false, readCancelled: d.runtime?.window.signal.aborted ?? false });
}
// Options for one provider or resolver read that starts now. Without a runtime the read has no extra signal.
// With a runtime the remaining time is recalculated here. null means that the read must not start: the budget
// ended or the run was cancelled before the start. That is reported once as DEFERRED and is not a credential,
// token or provider failure.
function runtimeRead(d: Pick<PayPalChargeDeps, 'runtime'>): { signal?: AbortSignal } | null {
  if (!d.runtime) return {};
  const signal = readSignal(d.runtime.window);
  if (signal) return { signal };
  deferred(d); return null;
}

async function owner(d: Pick<PayPalChargeDeps, 'repository'> & Partial<Pick<PayPalChargeDeps, 'log'>>, i: Input): Promise<{ context: ChargeContext } | { outcome: PayPalChargeOutcome }> {
  if (!matches(i.actorUserId, UUID) || !matches(i.orderId, UUID)) return { outcome: { kind: 'BLOCKED', reason: 'INPUT_INVALID' } };
  const failed = (): { outcome: PayPalChargeOutcome } => {
    if (d.log) log({ log: d.log }, 'CONTEXT', i.orderId);
    return { outcome: { kind: 'UNAVAILABLE', stage: 'CONTEXT' } };
  };
  try {
    const result = await d.repository.getChargeContext(i.actorUserId, i.orderId);
    if (result.kind === 'NOT_FOUND') return { outcome: { kind: 'NOT_FOUND' } };
    const c = result.context;
    if (c.chargeAuthority !== false || c.orderId !== i.orderId || c.provider !== 'PAYPAL'
      || (c.environment !== 'LIVE' && c.environment !== 'SANDBOX') || c.currency !== 'USD' || c.quantity !== '1'
      || !minorToPayPalValue(c.amountMinor) || !matches(c.quoteHash, HASH) || !positive(c.rowVersion)) return failed();
    return { context: c };
  } catch { return failed(); }
}

function samePrepared(c: ChargeContext, prepared: PreparedProviderContext) {
  return prepared.orderId === c.orderId && prepared.quoteId === c.quoteId && prepared.quoteHash === c.quoteHash
    && prepared.provider === c.provider && prepared.environment === c.environment && prepared.paymentId === c.paymentId
    && (c.contextId === null ? prepared.replayed === false : prepared.replayed === true && prepared.contextId === c.contextId);
}

function validBinding(value: unknown, c: ChargeContext, contextId: string): value is ProviderChargeBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as ProviderChargeBinding;
  return b.orderId === c.orderId && b.contextId === contextId && b.provider === 'PAYPAL' && b.environment === c.environment
    && matches(b.billingCountry, /^[A-Z]{2}$/) && matches(b.bindingId, UUID) && positive(b.bindingVersion) && matches(b.bindingHash, HASH)
    && matches(b.credentialRef, /^[A-Za-z][A-Za-z0-9._-]{0,127}$/) && matches(b.expectedPayPalClientId, SCOPE_VALUE)
    && !!b.scope && typeof b.scope === 'object' && !Array.isArray(b.scope)
    && Object.keys(b.scope).length === 2 && matches(b.scope.account_id, SCOPE_VALUE) && matches(b.scope.merchant_id, SCOPE_VALUE);
}
function credentialValue(value: unknown): value is string { return matches(value, /^[\x21-\x7e]{1,8192}$/); }

async function authorize(d: PayPalChargeDeps, i: Input, c: ChargeContext, prepared?: PreparedProviderContext):
  Promise<{ authorized: Authorized } | { outcome: PayPalChargeOutcome }> {
  const contextId = prepared?.contextId ?? c.contextId;
  if (!contextId || (c.contextId !== null && !c.verificationBindingPresent)) return { outcome: unavailable(d, 'BINDING', i.orderId) };
  if (!prepared) {
    if (!c.contextId || !c.verificationBindingPresent) return { outcome: unavailable(d, 'BINDING', i.orderId) };
    // Existing-context replay takes wallet/order locks. It does not create a
    // context or reauthorize current settings, including during deleted-actor recovery.
    // A started prepare is awaited to its own service deadline. It does not receive the read signal.
    let replay;
    try { replay = await d.repository.prepareProviderContext(i.actorUserId, i.orderId); }
    catch { return { outcome: unavailable(d, 'PREPARE', i.orderId) }; }
    if (replay.kind !== 'PREPARED' || !samePrepared(c, replay)) return { outcome: unavailable(d, 'PREPARE', i.orderId) };
    prepared = replay;
  }
  const preparedScope = prepared?.scope;
  if (!preparedScope) return { outcome: unavailable(d, 'PREPARE', i.orderId) };
  let binding;
  try { binding = await d.bindings.getProviderBinding(i.actorUserId, i.orderId); }
  catch { return { outcome: unavailable(d, 'BINDING', i.orderId) }; }
  if (!validBinding(binding, c, contextId) || binding.scope.account_id !== preparedScope.account_id
    || binding.scope.merchant_id !== preparedScope.merchant_id || Object.keys(preparedScope).length !== 2) {
    return { outcome: unavailable(d, 'BINDING', i.orderId) };
  }
  const resolveRead = runtimeRead(d); if (!resolveRead) return { outcome: { kind: 'IN_PROGRESS' } };
  let credential;
  try { credential = await d.credentials.resolve({ provider: 'PAYPAL', environment: binding.environment,
    credentialRef: binding.credentialRef, bindingVersion: binding.bindingVersion, bindingHash: binding.bindingHash, ...resolveRead }); }
  catch { return { outcome: unavailable(d, 'CREDENTIAL', i.orderId) }; }
  // Resolver output attests no hash. Only the returned client ID can be compared here.
  if (!credential || credential.clientId !== binding.expectedPayPalClientId || !credentialValue(credential.clientId)
    || !credentialValue(credential.clientSecret)) return { outcome: unavailable(d, 'CREDENTIAL', i.orderId) };
  const tokenRead = runtimeRead(d); if (!tokenRead) return { outcome: { kind: 'IN_PROGRESS' } };
  let token;
  try { token = await d.transport.requestToken({ environment: binding.environment, credential, ...tokenRead }); }
  catch { return { outcome: unavailable(d, 'TOKEN', i.orderId) }; }
  if (!token || !credentialValue(token.accessToken)) return { outcome: unavailable(d, 'TOKEN', i.orderId) };
  return { authorized: { binding, accessToken: token.accessToken } };
}

function successful(result: PayPalHttpResult): result is Extract<PayPalHttpResult, { kind: 'RESPONSE' }> {
  return result.kind === 'RESPONSE' && Number.isInteger(result.status) && result.status >= 200 && result.status < 300;
}

// Unprotected GET. Only S1 (before claim) and S6 (no intent) use it. A read after an intent uses protectedRead.
// started holds read options that the caller already obtained, so that one call reports DEFERRED at most once.
async function lookup(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized, started?: { signal?: AbortSignal }):
  Promise<{ assessment: PayPalOrderAssessment; body: unknown } | { outcome: PayPalChargeOutcome }> {
  const read = started ?? runtimeRead(d); if (!read) return { outcome: { kind: 'IN_PROGRESS' } };
  let result;
  try { result = await d.transport.getOrder({ environment: a.binding.environment, accessToken: a.accessToken, providerOrderId: c.providerOrderId!, ...read }); }
  catch { return { outcome: unavailable(d, 'LOOKUP', i.orderId) }; }
  if (!successful(result) || result.body === null) return { outcome: unavailable(d, 'LOOKUP', i.orderId, result.kind === 'RESPONSE' ? result.status : undefined) };
  return { assessment: assessPayPalOrder(result.body, expectedOrder(c, a.binding)), body: result.body };
}

// Best-effort record of one fact outside the barrier (S0, S1, S6). A failed record cannot authorize
// recovery, binding or intake. A lost bind response keeps the same actual evidence through native
// replay/IDENTITY_NOT_BOUND semantics and never binds a replacement candidate.
async function recordFact(d: PayPalChargeDeps, contextId: string, fact: ResultFact): Promise<void> {
  if (fact.bind) {
    try { await d.repository.bindProviderIdentity(contextId, fact.evidence); return; } catch { /* Commit is unknown. */ }
  }
  try { await d.repository.recordObservation(contextId, fact.evidence); } catch { /* The local refusal remains closed. */ }
}

// A CREATE (S0) or unprotected GET (S1, S6) that does not match this order. No intent exists on these paths.
async function mismatch(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  assessment: OrderMismatch, source: 'CREATE_RESPONSE' | 'LOOKUP', body: unknown): Promise<PayPalChargeOutcome> {
  const rawCaptures = captureList(body);
  if (rawCaptures && rawCaptures.length > 32) {
    // Do not partially persist either CAPTURE or ORDER evidence above the local work bound.
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const { facts } = mismatchFacts(c, i.actorUserId, a.binding, assessment, source, body);
  if (c.contextId) { for (const fact of facts) await recordFact(d, c.contextId, fact); }
  if (!facts.length && !assessment.observed.rawStatus) return unavailable(d, source === 'CREATE_RESPONSE' ? 'CREATE' : 'LOOKUP', i.orderId);
  if (source === 'LOOKUP' && c.providerOrderId) {
    // P3: best-effort store of the W judgment that no evidence field can express. A stored assertion is
    // sticky. A failed store loses it, and a later clean GET can then lead to a claim (R-PRE residual).
    const judgments = judgmentAssertions(body, assessment, expectedOrder(c, a.binding), false);
    const assertions: CallerAssertion[] = judgments.length || facts.length ? judgments : [UNREPRESENTABLE_ASSERTION];
    if (assertions.length) {
      try { await d.repository.recordPreIntentAssertions(i.actorUserId, i.orderId, assertions); }
      catch { /* The current call stays in local REVIEW. */ }
    }
  }
  log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
}

// An actual capture seen by an unprotected GET (S1, S6). W records the observation and creates no intake.
async function captureObserved(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  assessment: Extract<PayPalOrderAssessment, { kind: 'OK' }>): Promise<PayPalChargeOutcome> {
  const capture = assessment.captures[0];
  const e = buildEvidence(c, i.actorUserId, a.binding, assessment.observed, 'LOOKUP', capture ?? null);
  if (!capture || !e || !c.contextId) return { kind: 'SUBMISSION_UNKNOWN' };
  if (assessment.status === 'UNRECOGNIZED') {
    const order = buildEvidence(c, i.actorUserId, a.binding, assessment.observed, 'LOOKUP');
    if (order) await recordFact(d, c.contextId, { evidence: order, bind: false });
  }
  if (c.providerCaptureId !== null && e.external_id !== c.providerCaptureId) {
    // Never replace the existing capture link.
    await recordFact(d, c.contextId, { evidence: e, bind: false });
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  let observation;
  try { observation = await d.repository.bindProviderIdentity(c.contextId, e); }
  catch { return unavailable(d, 'OBSERVE', i.orderId); }
  if (c.reviewRequired || observation.kind === 'REVIEW_REQUIRED' || capture.status === 'UNRECOGNIZED' || assessment.status === 'UNRECOGNIZED') {
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  if (capture.status === 'PENDING') return { kind: 'CAPTURE_PENDING' };
  if (capture.status === 'DECLINED' || capture.status === 'FAILED') return { kind: 'CAPTURE_FAILED' };
  // REFUNDED and PARTIALLY_REFUNDED are REVIEW. A COMPLETED capture without an intent is
  // EXTERNAL_CAPTURE_WITHOUT_INTENT: W never calls receive, so this read creates no intake.
  log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
}

// S6: an intent-less read keeps the existing observation record. It runs only after S2 OPEN returned the
// authoritative NOT_APPLICABLE for a context whose intent the caller had not confirmed.
async function lookupOutcome(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  started: { signal?: AbortSignal }): Promise<PayPalChargeOutcome> {
  const result = await lookup(d, i, c, a, started);
  if ('outcome' in result) return result.outcome;
  const assessment = result.assessment;
  if (assessment.kind === 'MISMATCH') return mismatch(d, i, c, a, assessment, 'LOOKUP', result.body);
  if (assessment.captures.length) return captureObserved(d, i, c, a, assessment);
  if (assessment.status === 'UNRECOGNIZED') {
    const e = buildEvidence(c, i.actorUserId, a.binding, assessment.observed, 'LOOKUP');
    if (e && c.contextId) await recordFact(d, c.contextId, { evidence: e, bind: false });
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  if (assessment.status === 'VOIDED') return { kind: 'ORDER_VOIDED' };
  return { kind: assessment.status === 'COMPLETED' || recovery(c) ? 'SUBMISSION_UNKNOWN' : 'NOT_APPROVED' };
}

// CAPTURE_FAILED needs W's own ADVERSE request for exactly one actual DECLINED or FAILED capture with a
// known, not VOIDED ORDER and no W judgment. Every other ADVERSE result is REVIEW.
function captureFailed(adverseFact: boolean, facts: ResultFact[], assertions: CallerAssertion[]) {
  if (!adverseFact || assertions.length) return false;
  const captures = facts.filter(fact => fact.evidence.identity_kind === 'CAPTURE');
  return captures.length === 1 && (captures[0].evidence.status === 'DECLINED' || captures[0].evidence.status === 'FAILED')
    && facts.every(fact => fact.evidence.identity_kind === 'CAPTURE'
      || ['CREATED', 'SAVED', 'APPROVED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'].includes(fact.evidence.status));
}
// Outcome of a DB effective CLEAN result. The intake is the one that the DB made inside S1 or S3.
function settleClean(d: PayPalChargeDeps, i: Input, intake: IntakeResult | null, pending: boolean, noCapture: boolean): PayPalChargeOutcome {
  if (intake?.kind === 'INTAKE_PENDING') return { kind: 'INTAKE_PENDING', replayed: intake.replayed };
  if (intake?.kind === 'REVIEW_REQUIRED') { log(d, 'HELD', i.orderId); return { kind: 'REVIEW_REQUIRED' }; }
  if (pending) return { kind: 'CAPTURE_PENDING' };
  if (noCapture) return { kind: 'SUBMISSION_UNKNOWN' };
  log(d, 'HELD', i.orderId); return { kind: 'REVIEW_REQUIRED' };
}

// P2: every GET of an order with an intent is open -> GET -> complete. No step is retried in this call,
// and no branch sends a POST, a per-fact RPC or a direct receive.
// S2 OPEN decides the current intent under the DB lock, after the token is ready. The getter flag alone never
// selects an unprotected GET. OPENED completes P2 whatever the getter said. intentUnconfirmed is true only when
// this caller has no intent evidence (no getter flag, no just-acknowledged P1, no LOOKUP_ONLY). Only then does
// the authoritative NOT_APPLICABLE fall back to the S6 observation read. OPEN failure, READ_IN_PROGRESS and a
// NOT_APPLICABLE for a known intent send no GET. W does not claim atomicity between the committed
// NOT_APPLICABLE and the later provider GET.
async function protectedRead(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized, userKind: UserReadKind,
  intentUnconfirmed = false): Promise<PayPalChargeOutcome> {
  const window = d.runtime?.window;
  if (window && (window.signal.aborted || !(remainingReadMs(window) > 0))) { deferred(d); return { kind: 'IN_PROGRESS' }; }
  const { report: cycle, completion } = await performReadCycle({ repository: d.repository, transport: d.transport, nowMs: d.nowMs },
    { actorUserId: i.actorUserId, orderId: i.orderId, context: c, binding: a.binding, accessToken: a.accessToken,
      actorKind: d.runtime ? d.runtime.actorKind : userKind, ...(window ? { window } : {}) });
  if (intentUnconfirmed && cycle.kind === 'NOT_OPENED' && cycle.reason === 'NOT_APPLICABLE') {
    // One report for this call: DEFERRED when the S6 read cannot start, otherwise the NOT_APPLICABLE report.
    const started = runtimeRead(d); if (!started) return { kind: 'IN_PROGRESS' };
    report(d, cycle);
    return lookupOutcome(d, i, c, a, started);
  }
  report(d, cycle);
  if (cycle.kind === 'NOT_OPENED' && cycle.reason === 'IN_PROGRESS') return { kind: 'IN_PROGRESS' };
  // No OPEN ACK or no completion ACK: the read result is unknown. NOT_APPLICABLE for a confirmed intent
  // is not permission to send an unprotected GET.
  if (cycle.kind === 'NOT_OPENED' || cycle.kind === 'WRITE_UNKNOWN') { log(d, 'CYCLE', i.orderId); return { kind: 'SUBMISSION_UNKNOWN' }; }
  // LATE or CONFLICT: the result is not the cycle result. It is never an intake.
  if (cycle.kind !== 'COMPLETED' || !completion) { log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' }; }
  if (cycle.effectiveKind === 'NO_DATA') return { kind: 'SUBMISSION_UNKNOWN' };
  if (cycle.effectiveKind !== 'CLEAN') {
    if (completion.kind === 'ADVERSE' && captureFailed(completion.category === 'READ_ADVERSE_FACT', completion.facts, completion.assertions)) {
      return { kind: 'CAPTURE_FAILED' };
    }
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  return settleClean(d, i, cycle.intake ?? null, completion.category === 'READ_CAPTURE_PENDING', completion.category === 'READ_ORDER_NO_CAPTURE');
}

// P1: the one capture POST result is classified by one atomic RPC with the intent sender. An RPC failure or a
// lost ACK ends the call as SUBMISSION_UNKNOWN with no GET. Only an acknowledged GET-eligible NO_RESPONSE
// continues to one protected read.
async function settleSubmission(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized, sender: ChargeLease,
  response: PayPalHttpResult): Promise<PayPalChargeOutcome> {
  let input; let result;
  try {
    input = classifySubmission(response, c, a.binding, sender, i.actorUserId);
    result = await d.repository.recordSubmissionResult(i.actorUserId, i.orderId, sender, input);
  } catch { log(d, 'CLASSIFY', i.orderId); return { kind: 'SUBMISSION_UNKNOWN' }; }
  // BLOCKED or CONFLICT_RECORDED: this sender has no classified result.
  if (result.kind !== 'CLASSIFIED') { log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' }; }
  if (result.effectiveKind === 'ADVERSE') {
    if (input.kind === 'ADVERSE' && captureFailed(input.category === 'RESPONSE_ADVERSE_FACT', input.facts, input.assertions)) {
      return { kind: 'CAPTURE_FAILED' };
    }
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  if (result.effectiveKind === 'CLEAN') {
    return settleClean(d, i, result.intake, input.category === 'RESPONSE_COMPLETE_CAPTURE_PENDING', false);
  }
  log(d, 'SUBMIT', i.orderId);
  if (!result.hold.getEligible) return { kind: 'SUBMISSION_UNKNOWN' };
  return protectedRead(d, i, c, a, 'USER_CAPTURE');
}

async function reconcileContext(d: PayPalChargeDeps, i: Input, c: ChargeContext, userKind: UserReadKind): Promise<PayPalChargeOutcome> {
  if (!c.providerOrderId) return { kind: 'NO_PROVIDER_ORDER' };
  const auth = await authorize(d, i, c);
  if ('outcome' in auth) return c.reviewRequired ? { kind: 'REVIEW_REQUIRED' } : auth.outcome;
  // Every reconcile and capture-recovery read asks S2 OPEN first. A false getter flag is not proof of no intent.
  const outcome = await protectedRead(d, i, c, auth.authorized, userKind, !c.submissionIntentRecorded);
  return c.reviewRequired ? { kind: 'REVIEW_REQUIRED' } : outcome;
}

export async function ensurePayPalProviderOrder(d: PayPalChargeDeps, i: Input): Promise<PayPalChargeOutcome> {
  const loaded = await owner(d, i); if ('outcome' in loaded) return loaded.outcome;
  const c = loaded.context;
  // READY reports an immutable identity, not live provider-order entry or capture authority.
  if (c.providerOrderId) return { kind: 'PROVIDER_ORDER_READY', providerOrderId: c.providerOrderId, replayed: true };
  const refusal = freshRefusal(d, c); if (refusal) { log(d, 'PREPARE', i.orderId); return refusal; }
  if (c.contextId !== null && !c.verificationBindingPresent) return unavailable(d, 'BINDING', i.orderId);
  let prepared;
  try { prepared = await d.repository.prepareProviderContext(i.actorUserId, i.orderId); }
  catch { return unavailable(d, 'PREPARE', i.orderId); }
  if (prepared.kind === 'REFUSED') { log(d, 'PREPARE', i.orderId); return { kind: 'BLOCKED', reason: prepared.code }; }
  if (!samePrepared(c, prepared)) return unavailable(d, 'PREPARE', i.orderId);
  const auth = await authorize(d, i, c, prepared); if ('outcome' in auth) return auth.outcome;
  let decision: ProviderEntryDecision;
  try { decision = await d.entry.authorizeProviderEntry({ actorUserId: i.actorUserId, orderId: i.orderId,
    contextId: prepared.contextId, createRequestKey: prepared.createRequestKey, bindingHash: auth.authorized.binding.bindingHash }); }
  catch { return unavailable(d, 'ENTRY', i.orderId); }
  if (decision.kind === 'BLOCKED') {
    log(d, 'ENTRY', i.orderId);
    return decision.reason === 'REVIEW_REQUIRED' ? { kind: 'REVIEW_REQUIRED' } : { kind: 'BLOCKED', reason: decision.reason };
  }
  if (decision.kind === 'ORDER_LINKED') {
    const refreshed = await owner({ repository: d.repository }, i);
    if ('context' in refreshed && refreshed.context.contextId === prepared.contextId && refreshed.context.providerOrderId !== null) {
      return { kind: 'PROVIDER_ORDER_READY', providerOrderId: refreshed.context.providerOrderId, replayed: true };
    }
    return unavailable(d, 'ENTRY', i.orderId);
  }
  if (decision.kind !== 'AUTHORIZED') return unavailable(d, 'ENTRY', i.orderId);
  const deadline = Date.parse(decision.entryNotAfter);
  if (decision.orderId !== i.orderId || decision.orderId !== c.orderId || decision.contextId !== prepared.contextId
    || decision.createRequestKey !== prepared.createRequestKey || decision.quoteHash !== c.quoteHash
    || decision.bindingHash !== auth.authorized.binding.bindingHash || !Number.isFinite(deadline)
    || deadline !== Date.parse(c.quoteExpiresAt)) return unavailable(d, 'ENTRY', i.orderId);
  const { orderId, contextId, createRequestKey, quoteHash, entryNotAfter } = decision;
  const enteredInput = { actorUserId: i.actorUserId, orderId };
  const contextual = { ...c, orderId, contextId, quoteHash };
  if (!before(d, entryNotAfter)) { log(d, 'PREPARE', orderId); return { kind: 'BLOCKED', reason: 'QUOTE_EXPIRED' }; }
  let response;
  try { response = await d.transport.createOrder({ environment: auth.authorized.binding.environment, accessToken: auth.authorized.accessToken,
    requestKey: createRequestKey, orderId, amountMinor: c.amountMinor }); }
  catch { log(d, 'CREATE', orderId); return { kind: 'SUBMISSION_UNKNOWN' }; }
  if (!successful(response) || response.body === null) { log(d, 'CREATE', orderId); return { kind: 'SUBMISSION_UNKNOWN' }; }
  const assessment = assessPayPalOrder(response.body, expectedOrder(contextual, auth.authorized.binding, null));
  if (assessment.kind === 'MISMATCH') return mismatch(d, enteredInput, contextual, auth.authorized, assessment, 'CREATE_RESPONSE', response.body);
  if (assessment.status === 'UNRECOGNIZED') {
    const actual = buildEvidence(contextual, enteredInput.actorUserId, auth.authorized.binding, assessment.observed, 'CREATE_RESPONSE');
    if (actual) await recordFact(d, contextId, { evidence: actual, bind: false });
    log(d, 'OBSERVE', orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const e = buildEvidence(contextual, enteredInput.actorUserId, auth.authorized.binding, assessment.observed, 'CREATE_RESPONSE');
  if (!e) return unavailable(d, 'OBSERVE', orderId);
  let bound;
  try { bound = await d.repository.bindProviderIdentity(contextId, e); }
  catch { return unavailable(d, 'OBSERVE', orderId); }
  if (bound.kind === 'REVIEW_REQUIRED') { log(d, 'OBSERVE', orderId); return { kind: 'REVIEW_REQUIRED' }; }
  return { kind: 'PROVIDER_ORDER_READY', providerOrderId: assessment.providerOrderId, replayed: prepared.replayed };
}

function blocked(command: Extract<ChargeCommand, { kind: 'BLOCKED' }>): PayPalChargeOutcome {
  if (command.reason === 'LEASE_ACTIVE') return { kind: 'IN_PROGRESS' };
  if (command.reason === 'REVIEW_REQUIRED') return { kind: 'REVIEW_REQUIRED' };
  return { kind: 'BLOCKED', reason: command.reason };
}
function sameContext(a: ChargeContext, b: ChargeContext) {
  return a.orderId === b.orderId && a.contextId === b.contextId && a.providerOrderId === b.providerOrderId
    && a.provider === b.provider && a.environment === b.environment && a.quoteId === b.quoteId && a.quoteHash === b.quoteHash
    && a.amountMinor === b.amountMinor && a.currency === b.currency && a.quoteExpiresAt === b.quoteExpiresAt;
}
function usableClaim(c: ChargeContext, lease: ChargeLease) {
  return positive(lease.rowVersion) && BigInt(lease.rowVersion) > BigInt(c.rowVersion) && lease.quoteHash === c.quoteHash
    && lease.providerRequestKey === lease.attemptId && Date.parse(lease.submitNotAfter) <= Date.parse(c.quoteExpiresAt);
}
function sameIntent(claim: ChargeLease, intent: ChargeLease) {
  return intent.attemptId === claim.attemptId && intent.leaseToken === claim.leaseToken && intent.fencingVersion === claim.fencingVersion
    && intent.providerRequestKey === claim.providerRequestKey && intent.quoteHash === claim.quoteHash
    && intent.submitNotAfter === claim.submitNotAfter && positive(intent.rowVersion)
    && BigInt(intent.rowVersion) === BigInt(claim.rowVersion) + BigInt(1);
}

export async function capturePayPalOrder(d: PayPalChargeDeps, i: Input & { approvedProviderOrderId: string }): Promise<PayPalChargeOutcome> {
  const loaded = await owner(d, i); if ('outcome' in loaded) return loaded.outcome;
  let c = loaded.context;
  if (!c.providerOrderId) return { kind: 'NO_PROVIDER_ORDER' };
  if (!matches(i.approvedProviderOrderId, ID) || i.approvedProviderOrderId !== c.providerOrderId) {
    log(d, 'CLAIM', i.orderId); return { kind: 'BLOCKED', reason: 'PROVIDER_ORDER_MISMATCH' };
  }
  if (recovery(c)) return reconcileContext(d, i, c, 'USER_CAPTURE');
  const refusal = freshRefusal(d, c); if (refusal) { log(d, 'CLAIM', i.orderId); return refusal; }
  const auth = await authorize(d, i, c); if ('outcome' in auth) return auth.outcome;
  const a = auth.authorized;
  // S1: the GET before claim is outside the barrier.
  const original = await lookup(d, i, c, a); if ('outcome' in original) return original.outcome;
  const assessment = original.assessment;
  if (assessment.kind === 'MISMATCH') return mismatch(d, i, c, a, assessment, 'LOOKUP', original.body);
  if (assessment.captures.length) return captureObserved(d, i, c, a, assessment);
  if (assessment.status === 'UNRECOGNIZED') {
    const e = buildEvidence(c, i.actorUserId, a.binding, assessment.observed, 'LOOKUP');
    if (e && c.contextId) await recordFact(d, c.contextId, { evidence: e, bind: false });
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  if (assessment.status === 'VOIDED') return { kind: 'ORDER_VOIDED' };
  if (assessment.status !== 'APPROVED') return { kind: assessment.status === 'COMPLETED' ? 'SUBMISSION_UNKNOWN' : 'NOT_APPROVED' };
  let command: ChargeCommand;
  try { command = await d.repository.claimCharge(i.actorUserId, i.orderId, c.rowVersion); }
  catch { return unavailable(d, 'CLAIM', i.orderId); }
  if (command.kind === 'BLOCKED' && command.reason === 'VERSION_MISMATCH') {
    const refreshed = await owner(d, i); if ('outcome' in refreshed) return refreshed.outcome;
    const fresh = refreshed.context;
    if (!sameContext(c, fresh)) { log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' }; }
    const freshFailure = freshRefusal(d, fresh); if (freshFailure) { log(d, 'CLAIM', i.orderId); return freshFailure; }
    c = fresh;
    try { command = await d.repository.claimCharge(i.actorUserId, i.orderId, c.rowVersion); }
    catch { return unavailable(d, 'CLAIM', i.orderId); }
  }
  if (command.kind === 'BLOCKED') { log(d, 'CLAIM', i.orderId); return blocked(command); }
  if (command.kind === 'LOOKUP_ONLY') {
    // Another sender has an intent. This recovery read uses the same protected boundary.
    if (command.quoteHash === c.quoteHash) return protectedRead(d, i, c, a, 'USER_CAPTURE');
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const lease = command.lease;
  if (!usableClaim(c, lease)) return unavailable(d, 'CLAIM', i.orderId);
  const remainingMs = Date.parse(lease.submitNotAfter) - now(d);
  if (!Number.isFinite(remainingMs) || remainingMs < 10_000) { log(d, 'CLAIM', i.orderId); return { kind: 'IN_PROGRESS' }; }
  // An intent RPC failure or a lost intent ACK is not POST authority: POST 0, P1 0.
  let intent;
  try { intent = await d.repository.recordSubmissionIntent(i.actorUserId, i.orderId, lease.rowVersion, lease); }
  catch { log(d, 'INTENT', i.orderId); return { kind: 'SUBMISSION_UNKNOWN' }; }
  if (intent.kind === 'BLOCKED') { log(d, 'INTENT', i.orderId); return blocked(intent); }
  if (intent.kind !== 'SUBMIT' || !sameIntent(lease, intent.lease) || !before(d, intent.lease.submitNotAfter, 2_000)
    || !before(d, c.quoteExpiresAt, 2_000)) { log(d, 'INTENT', i.orderId); return { kind: 'SUBMISSION_UNKNOWN' }; }
  let response: PayPalHttpResult;
  try { response = await d.transport.captureOrder({ environment: a.binding.environment, accessToken: a.accessToken,
    providerOrderId: c.providerOrderId!, requestKey: intent.lease.providerRequestKey }); }
  catch { response = { kind: 'TRANSPORT_UNKNOWN' }; }
  // After the one POST, the sender of the intent ACK records one atomic classification. No branch sends another POST.
  return settleSubmission(d, i, c, a, intent.lease, response);
}

export async function reconcilePayPalOrder(d: PayPalChargeDeps, i: Input): Promise<PayPalChargeOutcome> {
  const loaded = await owner(d, i); return 'outcome' in loaded ? loaded.outcome : reconcileContext(d, i, loaded.context, 'USER_RECONCILE');
}
export async function getPayPalChargeStatus(d: Pick<PayPalChargeDeps, 'repository'>, i: Input): Promise<PayPalChargeOutcome> {
  const loaded = await owner({ repository: d.repository }, i); if ('outcome' in loaded) return loaded.outcome;
  return { kind: 'STATUS', paymentState: loaded.context.paymentState, settlementState: loaded.context.settlementState,
    reviewRequired: loaded.context.reviewRequired };
}
export function toPayPalChargeBrowserDto(orderId: string, o: PayPalChargeOutcome): PayPalChargeBrowserDto {
  return { contractVersion: 'web-payment-charge.v1', orderId, state: o.kind, newOrderAllowed: false,
    ...(o.kind === 'PROVIDER_ORDER_READY' ? { providerOrderId: o.providerOrderId } : {}),
    ...(o.kind === 'STATUS' ? { paymentState: o.paymentState, settlementState: o.settlementState, reviewRequired: o.reviewRequired } : {}) };
}
