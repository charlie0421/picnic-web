import 'server-only';
import { assessPayPalOrder } from './protocol';
import type { CallerAssertion, ReadActorKind, ReadCategory, ReadCompletionInput, ReadCycleReport, ReadKind, ReadWindow,
  ResultFact } from './durability-contract';
import type { ProviderChargeBinding } from './orchestrator';
import type { ChargeContext, WebPaymentChargeRepository } from './repository';
import { asFact, buildEvidence, captureIdSet, expectedOrder, judgmentAssertions, mismatchFacts, orderTupleMatches,
  PARTIAL_VOIDED_ASSERTION, representableCaptures, UNREPRESENTABLE_ASSERTION, type CaptureIdSet } from './submission-classification';
import type { PayPalBodyStatus, PayPalHttpResult, PayPalTransport } from './transport';

// W2 protected read cycle (spec 5/10, G5, G8, G9): open, at most one GET, one completion.
// The cycle token stays in this call. It is not logged, returned or placed in a report.

export type ReadCycleInput = { actorUserId: string; orderId: string; context: ChargeContext; binding: ProviderChargeBinding;
  accessToken: string; actorKind: ReadActorKind; window?: ReadWindow };
export type ReadCycleDeps = { repository: WebPaymentChargeRepository; transport: PayPalTransport; nowMs: () => number };

// Remaining read budget in milliseconds. A clock failure gives no budget.
export function remainingReadMs(window: ReadWindow): number {
  try { const value = window.deadlineAtMs - window.nowMs(); return Number.isFinite(value) ? value : 0; } catch { return 0; }
}
// Signal for one read that starts now: the run cancellation or min(10 s, remaining), whichever is first.
// Returns null when the read must not start (cancelled before the start or no budget).
export function readSignal(window: ReadWindow): AbortSignal | null {
  if (window.signal.aborted) return null;
  const remaining = remainingReadMs(window);
  if (!(remaining > 0)) return null;
  return AbortSignal.any([window.signal, AbortSignal.timeout(Math.min(10_000, remaining))]);
}

// Builds the exact S3 p_completion object from one GET result (G8 closed table).
export function collectReadFacts(response: PayPalHttpResult, context: ChargeContext, binding: ProviderChargeBinding,
  actorUserId: string): ReadCompletionInput {
  const build = (kind: ReadKind, category: ReadCategory, httpStatus: number | null, bodyStatus: PayPalBodyStatus | null,
    ids: CaptureIdSet | null, facts: ResultFact[] = [], assertions: CallerAssertion[] = [], receive: number | null = null): ReadCompletionInput => ({
    contract_version: 'web-payment-read-cycle-completion.v2', kind, category, get_http_status: httpStatus,
    get_body_status: bodyStatus, observed_capture_ids: ids?.ids ?? null, unparseable_capture_count: ids?.unparseable ?? 0,
    capture_count_exceeded: ids?.exceeded ?? false, facts, assertions, receive_fact_index: receive });
  if (response.kind !== 'RESPONSE' || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    return build('NO_DATA', 'READ_TRANSPORT_UNKNOWN', null, null, null);
  }
  const { status, bodyStatus } = response; const body = response.body; const e = expectedOrder(context, binding);
  if (status < 200 || status >= 300) {
    // A non-2xx PARSED response that carries actual provider facts keeps them. It is never NO_DATA.
    // A bounded parsed judgment is evaluated before the status-only fallback. NO_DATA never hides it.
    if (bodyStatus === 'PARSED') {
      const ids = captureIdSet(body); const observed = assessPayPalOrder(body, e).observed;
      // More than 32 raw captures: no fact and unknown IDs, as for a 2xx response.
      if (ids.exceeded) return build('ADVERSE', 'READ_WORK_BOUND_EXCEEDED', status, 'PARSED', ids);
      const order = buildEvidence(context, actorUserId, binding, observed, 'LOOKUP');
      const captures = ids.ids !== null && orderTupleMatches(context, binding, observed)
        ? representableCaptures(context, actorUserId, binding, observed, 'LOOKUP', body) : [];
      const facts = [...(order ? [asFact(order)] : []), ...captures.map(candidate => asFact(candidate.evidence))];
      if (facts.length) return build('ADVERSE', 'READ_NON_SUCCESS_FACT', status, 'PARSED', ids, facts);
      // A known VOIDED ORDER whose ORDER fact cannot be built. READ_ORDER_VOIDED is for 2xx only (M2), so the
      // judgment uses the conservative category with the exact assertion (G3) and the observed IDs (G9).
      if (observed.rawStatus === 'VOIDED') {
        return build('ADVERSE', 'READ_ADVERSE_UNSPECIFIED', status, 'PARSED', ids, [], [PARTIAL_VOIDED_ASSERTION]);
      }
    }
    // 1xx and 3xx. The 2xx range is handled below.
    if (status < 400) return build('ADVERSE', 'READ_HTTP_UNEXPECTED', status, bodyStatus, null);
    if (status >= 500) return build('NO_DATA', 'READ_HTTP_5XX', status, bodyStatus, null);
    if (status === 401 || status === 403 || status === 408 || status === 429) {
      return build('NO_DATA', `READ_HTTP_${status}` as ReadCategory, status, bodyStatus, null);
    }
    return build('ADVERSE', 'READ_HTTP_REJECTED', status, bodyStatus, null);
  }
  if (bodyStatus !== 'PARSED') return build('NO_DATA', 'READ_BODY_UNREADABLE', status, bodyStatus, null);

  const assessment = assessPayPalOrder(body, e); const observed = assessment.observed; const ids = captureIdSet(body);
  const result = (kind: ReadKind, category: ReadCategory, facts: ResultFact[], assertions: CallerAssertion[] = [],
    receive: number | null = null) => build(kind, category, status, 'PARSED', ids, facts, assertions, receive);
  if (ids.exceeded) return result('ADVERSE', 'READ_WORK_BOUND_EXCEEDED', []);
  const order = buildEvidence(context, actorUserId, binding, observed, 'LOOKUP');
  // A CAPTURE fact needs a known ID set that contains its ID, and the ORDER tuple of this order.
  const attributable = () => ids.ids !== null && orderTupleMatches(context, binding, observed)
    ? representableCaptures(context, actorUserId, binding, observed, 'LOOKUP', body).map(candidate => asFact(candidate.evidence)) : [];
  // A known VOIDED ORDER is ADVERSE before every CLEAN judgment (G3).
  if (observed.rawStatus === 'VOIDED') {
    return order ? result('ADVERSE', 'READ_ORDER_VOIDED', [asFact(order), ...attributable()])
      : result('ADVERSE', 'READ_ORDER_VOIDED', [], [PARTIAL_VOIDED_ASSERTION]);
  }
  // An undeterminable shape cannot be CLEAN. It is a parsed partial judgment and not NO_DATA.
  if (ids.ids === null) return result('ADVERSE', 'READ_PARTIAL_INDETERMINATE', order ? [asFact(order)] : [], [UNREPRESENTABLE_ASSERTION]);
  if (ids.unparseable > 0) return result('ADVERSE', 'READ_CAPTURE_ID_UNPARSEABLE', [...(order ? [asFact(order)] : []), ...attributable()]);
  if (assessment.kind === 'OK') {
    if (!order) return result('ADVERSE', 'READ_PARTIAL_INDETERMINATE', [], [UNREPRESENTABLE_ASSERTION]);
    const capture = assessment.captures[0];
    if (!capture) {
      return assessment.status === 'UNRECOGNIZED' ? result('ADVERSE', 'READ_ADVERSE_FACT', [asFact(order)])
        : result('CLEAN', 'READ_ORDER_NO_CAPTURE', [asFact(order)]);
    }
    const captured = buildEvidence(context, actorUserId, binding, observed, 'LOOKUP', capture);
    if (!captured) return result('ADVERSE', 'READ_PARTIAL_INDETERMINATE', [asFact(order)], [UNREPRESENTABLE_ASSERTION]);
    // W states what it saw. The DB compares the observed IDs with the POST IDs and the capture link.
    const linkedElsewhere = context.providerCaptureId !== null && captured.external_id !== context.providerCaptureId;
    if (assessment.status === 'UNRECOGNIZED' || linkedElsewhere) return result('ADVERSE', 'READ_ADVERSE_FACT', [asFact(order), asFact(captured)]);
    const facts = [asFact(order), asFact(captured, true)];
    if (capture.status === 'COMPLETED') return result('CLEAN', 'READ_CAPTURE_COMPLETED', facts, [], 1);
    if (capture.status === 'PENDING') return result('CLEAN', 'READ_CAPTURE_PENDING', facts);
    return result('ADVERSE', 'READ_ADVERSE_FACT', facts);
  }
  const known = ids.ids;
  // Several different actual capture IDs with no existing CAPTURE link are competing facts. A protected GET
  // does not choose one as a new link: the candidate list keeps its response order, deduplicated by evidence
  // hash, and every fact is record-only (bind=false). Two statuses of one ID stay two facts.
  // With an existing link, the fact of the linked ID keeps bind=true and the others stay bind=false.
  const competing = context.providerCaptureId === null && known.length > 1;
  const facts = mismatchFacts(context, actorUserId, binding, assessment, 'LOOKUP', body, !competing).facts
    .filter(item => item.evidence.identity_kind !== 'CAPTURE' || known.includes(item.evidence.external_id));
  const judgments = judgmentAssertions(body, assessment, e, false);
  if (judgments.length) return result('ADVERSE', 'READ_CONTRADICTION_UNREPRESENTABLE', facts, judgments);
  if (facts.length) return result('ADVERSE', 'READ_ADVERSE_FACT', facts);
  return result('ADVERSE', 'READ_PARTIAL_INDETERMINATE', [], [UNREPRESENTABLE_ASSERTION]);
}

function localNoData(category: 'READ_LOCAL_BUDGET_EXHAUSTED' | 'READ_LOCAL_CANCELLED'): ReadCompletionInput {
  return { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category, get_http_status: null,
    get_body_status: null, observed_capture_ids: null, unparseable_capture_count: 0, capture_count_exceeded: false,
    facts: [], assertions: [], receive_fact_index: null };
}

// One protected read. completion is the object that this call sent to S3, or null when no cycle was opened.
// The caller has already checked owner, prepare, binding and token. No step is retried in this call.
export async function performReadCycle(d: ReadCycleDeps, i: ReadCycleInput):
  Promise<{ report: ReadCycleReport; completion: ReadCompletionInput | null }> {
  const cancelled = () => i.window?.signal.aborted ?? false;
  let open;
  try { open = await d.repository.openReadCycle(i.actorUserId, i.orderId, i.actorKind); }
  catch { return { report: { kind: 'NOT_OPENED', reason: 'FAILED', opened: false, readCancelled: cancelled() }, completion: null }; }
  if (open.kind !== 'OPENED') {
    const reason = open.kind === 'READ_IN_PROGRESS' ? 'IN_PROGRESS' : open.kind === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'FAILED';
    return { report: { kind: 'NOT_OPENED', reason, opened: false, readCancelled: cancelled() }, completion: null };
  }
  // After OPENED this call settles exactly one of: a GET attempt, or an explicit GET-not-started completion.
  let completion: ReadCompletionInput;
  const signal = i.window ? readSignal(i.window) : undefined;
  if (signal === null) {
    // A local judgment that no GET started. It is not evidence that no capture POST was sent.
    completion = localNoData(cancelled() ? 'READ_LOCAL_CANCELLED' : 'READ_LOCAL_BUDGET_EXHAUSTED');
  } else {
    let response: PayPalHttpResult;
    try {
      response = await d.transport.getOrder({ environment: i.binding.environment, accessToken: i.accessToken,
        providerOrderId: i.context.providerOrderId as string, ...(signal ? { signal } : {}) });
    } catch { response = { kind: 'TRANSPORT_UNKNOWN' }; }
    // A GET that started and was cancelled uses its actual transport result. A parsed judgment is kept.
    completion = collectReadFacts(response, i.context, i.binding, i.actorUserId);
  }
  // The completion write does not receive the read signal. It is awaited to its own service deadline.
  const base = { opened: true, readCancelled: false, cycleId: open.cycleId };
  let result;
  try { result = await d.repository.completeReadCycle(open.cycleId, open.cycleToken, completion); }
  catch { return { report: { ...base, kind: 'WRITE_UNKNOWN', readCancelled: cancelled() }, completion }; }
  const readCancelled = cancelled();
  if (result.kind === 'COMPLETED') {
    return { report: { ...base, kind: 'COMPLETED', effectiveKind: result.effectiveKind, intake: result.intake, readCancelled,
      hold: result.hold }, completion };
  }
  if (result.kind === 'LATE_RECORDED') return { report: { ...base, kind: 'LATE', readCancelled }, completion };
  if (result.kind === 'CONFLICT_RECORDED') return { report: { ...base, kind: 'CONFLICT', readCancelled }, completion };
  // BLOCKED: the cycle or its token was refused. The completion is not recorded.
  return { report: { ...base, kind: 'WRITE_UNKNOWN', reason: 'FAILED', readCancelled }, completion };
}

export async function runReadCycle(deps: ReadCycleDeps, input: ReadCycleInput): Promise<ReadCycleReport> {
  return (await performReadCycle(deps, input)).report;
}
