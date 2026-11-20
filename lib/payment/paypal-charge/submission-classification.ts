import 'server-only';
import { assessPayPalOrder, buildPayPalEvidence, type ExpectedPayPalOrder, type ObservedPayPalCapture,
  type ObservedPayPalOrder, type PayPalEvidence, type PayPalOrderAssessment } from './protocol';
import type { CallerAssertion, CallerAssertionCode, ResultFact, SubmissionCategory, SubmissionInput,
  SubmissionKind } from './durability-contract';
import type { ProviderChargeBinding } from './orchestrator';
import type { ChargeContext, ChargeLease } from './repository';
import type { PayPalBodyStatus, PayPalHttpResult } from './transport';

// W2 pure POST classification (spec 4/10 sections 4, 5 and 8; G3; G9). This module also owns the pure helpers
// that the read collection and the orchestrator share. Imports from orchestrator are type-only.
// Rules: an actual provider value is copied and never invented. A W judgment (country, intent, shape,
// same-ID race) is a caller assertion and not a provider fact. The DB owns the effective result.

export type OrderMismatch = Extract<PayPalOrderAssessment, { kind: 'MISMATCH' }>;
type Source = PayPalEvidence['source'];

const ID = /^[A-Z0-9]{1,36}$/;
const KNOWN_ORDER_STATUSES = ['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'];
// G3: the exact assertion for a VOIDED ORDER whose ORDER fact cannot be built.
export const PARTIAL_VOIDED_ASSERTION: CallerAssertion = { code: 'UNRECORDABLE_PROVIDER_FACT',
  detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } };
export const UNREPRESENTABLE_ASSERTION: CallerAssertion = { code: 'UNREPRESENTABLE_CONTRADICTION', detail: {} };
// The exact assertion for a known adverse CAPTURE of a partial POST response that no CAPTURE fact records.
const PARTIAL_ADVERSE_CAPTURE_ASSERTION: CallerAssertion = { code: 'UNRECORDABLE_PROVIDER_FACT',
  detail: { fact_kind: 'CAPTURE', reason: 'ADVERSE_STATUS_PARTIAL' } };
// A recognised capture status that is neither COMPLETED nor PENDING: DECLINED, FAILED, REFUNDED, PARTIALLY_REFUNDED.
const adverseCapture = (capture: ObservedPayPalCapture) =>
  capture.status !== 'UNRECOGNIZED' && capture.status !== 'COMPLETED' && capture.status !== 'PENDING';

function matches(value: unknown, regex: RegExp): value is string { return typeof value === 'string' && regex.exec(value)?.[0] === value; }
function present(value: unknown) { return value !== undefined && value !== null; }
export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function captureList(body: unknown): unknown[] | null {
  const units = object(body)?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? object(units[0]) : null;
  const captures = object(unit?.payments)?.captures;
  return Array.isArray(captures) ? captures : null;
}
export function expectedOrder(c: ChargeContext, binding: ProviderChargeBinding, providerOrderId = c.providerOrderId): ExpectedPayPalOrder {
  return { orderId: c.orderId, providerOrderId, amountMinor: c.amountMinor, currency: 'USD',
    merchantId: binding.scope.merchant_id, billingCountry: binding.billingCountry };
}
export const asFact = (evidence: PayPalEvidence, bind = false): ResultFact => ({ evidence, bind });

// Capture IDs of the one purchase unit (G9 N-M1). A valid unit without payments or captures, or with an empty
// captures array, gives []. An undeterminable shape gives null. More than 32 raw captures gives exceeded.
export type CaptureIdSet = { ids: string[] | null; unparseable: number; exceeded: boolean };
export function captureIdSet(body: unknown): CaptureIdSet {
  const unknown: CaptureIdSet = { ids: null, unparseable: 0, exceeded: false };
  const units = object(body)?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? object(units[0]) : null;
  if (!unit) return unknown;
  if (unit.payments === undefined) return { ids: [], unparseable: 0, exceeded: false };
  const payments = object(unit.payments); if (!payments) return unknown;
  if (payments.captures === undefined) return { ids: [], unparseable: 0, exceeded: false };
  if (!Array.isArray(payments.captures)) return unknown;
  if (payments.captures.length > 32) return { ids: null, unparseable: 0, exceeded: true };
  const ids: string[] = []; let unparseable = 0;
  for (const value of payments.captures) {
    const capture = object(value);
    if (capture && matches(capture.id, ID)) { if (!ids.includes(capture.id)) ids.push(capture.id); }
    else if (!capture || present(capture.id)) unparseable++;
  }
  return { ids, unparseable, exceeded: false };
}

// The 16-key evidence of one actual ORDER or CAPTURE. Returns null when a required observed field is absent.
export function buildEvidence(c: ChargeContext, actorUserId: string, binding: ProviderChargeBinding, observed: ObservedPayPalOrder,
  source: Source, capture: ObservedPayPalCapture | null = null): PayPalEvidence | null {
  const externalId = capture ? capture.providerCaptureId : observed.providerOrderId;
  const status = capture ? capture.rawStatus : observed.rawStatus;
  if (!externalId || !status || !observed.merchantId) return null;
  try {
    return buildPayPalEvidence({ source, provider: 'PAYPAL', environment: binding.environment,
      identity_kind: capture ? 'CAPTURE' : 'ORDER', external_id: externalId,
      parent_external_id: capture ? observed.providerOrderId : null, order_id: c.orderId, user_id: actorUserId, quote_hash: c.quoteHash,
      order_reference: capture?.orderReference ?? observed.orderReference,
      // account_id is copied context, whereas merchant_id is the observed PayPal payee.
      scope: { account_id: binding.scope.account_id, merchant_id: observed.merchantId },
      amount_minor: capture ? capture.amountMinor ?? null : observed.amountMinor,
      currency: capture ? capture.currency ?? null : observed.currency, status });
  } catch { return null; }
}

// True when the observed ORDER tuple is the tuple of this order. Only then is a CAPTURE attributable to it.
export function orderTupleMatches(c: ChargeContext, binding: ProviderChargeBinding, observed: ObservedPayPalOrder) {
  return observed.providerOrderId === c.providerOrderId && observed.amountMinor === c.amountMinor && observed.currency === c.currency
    && observed.merchantId === binding.scope.merchant_id && observed.orderReference === `v2:${c.orderId}`;
}

// Actual captures with every evidence field, in response order, deduplicated by payload hash.
export function representableCaptures(c: ChargeContext, actorUserId: string, binding: ProviderChargeBinding,
  observed: ObservedPayPalOrder, source: Source, body: unknown): Array<{ evidence: PayPalEvidence; knownStatus: boolean }> {
  const raws = captureList(body); const out: Array<{ evidence: PayPalEvidence; knownStatus: boolean }> = [];
  if (!raws || raws.length > 32) return out;
  const seen = new Set<string>();
  for (let index = 0; index < observed.captures.length; index++) {
    const capture = observed.captures[index]; const raw = object(raws[index]);
    if (!raw || !capture.providerCaptureId || !capture.rawStatus || !capture.amountMinor || !capture.currency
      || (raw.custom_id !== undefined && !capture.orderReference)) continue;
    const e = buildEvidence(c, actorUserId, binding, observed, source, capture);
    if (!e || !e.order_reference || seen.has(e.payload_hash)) continue;
    seen.add(e.payload_hash); out.push({ evidence: e, knownStatus: capture.status !== 'UNRECOGNIZED' });
  }
  return out;
}

function partialPostResponse(body: unknown): boolean {
  const captures = captureList(body);
  if (captures && captures.length > 32) return false;
  const order = object(body); if (!order) return true;
  if (!present(order.purchase_units)) return true;
  if (!Array.isArray(order.purchase_units) || order.purchase_units.length !== 1) return false;
  const unit = object(order.purchase_units[0]); if (!unit) return false;
  const money = object(unit.amount); const payee = object(unit.payee); const payments = object(unit.payments);
  // Missing fields in an extra malformed capture do not turn a complete conflict
  // into a partial representation. Full multiple-capture handling remains closed.
  const capture = captures?.length === 1 ? object(captures[0]) : null;
  const amount = object(capture?.amount);
  return !present(order.id) || !present(order.status) || !present(order.intent) || !present(unit.custom_id)
    || !present(money?.value) || !present(money?.currency_code) || !present(payee?.merchant_id)
    || !present(unit.payments) || !present(payments?.captures)
    || (capture !== null && (!present(capture.id) || !present(capture.status)
      || !present(amount?.value) || !present(amount?.currency_code)));
}
function incompletePostResponse(body: unknown, observed: ObservedPayPalOrder, e: ExpectedPayPalOrder): boolean {
  const order = object(body); if (!order) return true;
  // Check every observed contradiction before considering any missing field.
  // A later complete GET must not erase a real conflicting POST observation.
  if ((present(order.id) && observed.providerOrderId !== e.providerOrderId)
    || (present(order.intent) && order.intent !== 'CAPTURE')
    || (present(order.status) && (!observed.rawStatus || !KNOWN_ORDER_STATUSES.includes(observed.rawStatus)))) return false;
  const source = object(order.payment_source); const paypal = object(source?.paypal); const payer = object(order.payer);
  if ((present(order.payment_source) && !source) || (present(source?.paypal) && !paypal) || (present(order.payer) && !payer)) return false;
  for (const value of [paypal?.address, payer?.address]) {
    if (value === undefined) continue;
    const address = object(value);
    if (!address || address.country_code !== e.billingCountry) return false;
  }
  if (!present(order.purchase_units)) return true;
  if (!Array.isArray(order.purchase_units) || order.purchase_units.length !== 1) return false;
  const unit = object(order.purchase_units[0]); if (!unit) return false;
  const money = object(unit.amount); const payee = object(unit.payee);
  if ((present(unit.custom_id) && observed.orderReference !== `v2:${e.orderId}`)
    || (present(unit.amount) && !money) || (present(money?.value) && observed.amountMinor !== e.amountMinor)
    || (present(money?.currency_code) && observed.currency !== e.currency)
    || (present(unit.payee) && !payee) || (present(payee?.merchant_id) && observed.merchantId !== e.merchantId)) return false;
  const payments = object(unit.payments); const captures = payments?.captures;
  if ((present(unit.payments) && !payments) || (present(captures) && (!Array.isArray(captures) || captures.length > 1))) return false;
  let missingCapture = false;
  if (Array.isArray(captures)) {
    for (let index = 0; index < captures.length; index++) {
      const raw = object(captures[index]); const capture = observed.captures[index];
      if (!raw || !capture) return false;
      const amount = object(raw.amount);
      if ((present(raw.id) && !capture.providerCaptureId)
        || (present(raw.status) && (!capture.rawStatus || capture.status === 'UNRECOGNIZED'))
        || (present(raw.amount) && !amount) || (present(amount?.value) && capture.amountMinor !== e.amountMinor)
        || (present(amount?.currency_code) && capture.currency !== e.currency)
        || (raw.custom_id !== undefined && raw.custom_id !== `v2:${e.orderId}`)) return false;
      missingCapture ||= !present(raw.id) || !present(raw.status) || !present(amount?.value) || !present(amount?.currency_code);
    }
  }
  return !present(order.id) || !present(order.status) || !present(order.intent) || !present(unit.custom_id)
    || !present(money?.value) || !present(money?.currency_code) || !present(payee?.merchant_id)
    || !present(unit.payments) || !present(captures) || missingCapture;
}

// Representable contradictory facts of a POST response, ORDER first, then CAPTURE in response order.
// keepAdverse=true also keeps an attributable capture whose actual status is a known adverse status.
function contradictoryFacts(c: ChargeContext, actorUserId: string, binding: ProviderChargeBinding, observed: ObservedPayPalOrder,
  source: Source, body: unknown, keepAdverse = false): PayPalEvidence[] {
  const captures = captureList(body);
  if (captures && captures.length > 32) return [];
  const order = buildEvidence(c, actorUserId, binding, observed, source);
  // A partial representation must supply the actual tuple. Missing fields are
  // transport recovery inputs, not permission to fill evidence from expectations.
  if (!order || order.amount_minor === null || order.currency === null || order.order_reference === null) return [];
  if (order.external_id !== c.providerOrderId || order.amount_minor !== c.amountMinor || order.currency !== c.currency
    || order.scope.merchant_id !== binding.scope.merchant_id || order.order_reference !== `v2:${c.orderId}`) return [order];
  const unknownOrder = !KNOWN_ORDER_STATUSES.includes(order.status);
  // Only the matching ORDER tuple can attribute CAPTURE facts to this order.
  // A missing CAPTURE link alone is not an observed provider contradiction.
  const facts: PayPalEvidence[] = unknownOrder ? [order] : [];
  for (const candidate of representableCaptures(c, actorUserId, binding, observed, source, body)) {
    const actual = candidate.evidence;
    if (unknownOrder || actual.amount_minor !== c.amountMinor || actual.currency !== c.currency
      || actual.order_reference !== `v2:${c.orderId}` || !candidate.knownStatus
      || (c.providerCaptureId !== null && actual.external_id !== c.providerCaptureId)
      || (keepAdverse && actual.status !== 'COMPLETED' && actual.status !== 'PENDING')) facts.push(actual);
  }
  return facts;
}

// W judgments that the 16-key evidence cannot express. They are caller assertions with an empty detail.
// A missing field is not a judgment. incomplete=true suppresses the shape judgment of a partial response.
export function judgmentAssertions(body: unknown, assessment: PayPalOrderAssessment, e: ExpectedPayPalOrder, incomplete: boolean): CallerAssertion[] {
  if (assessment.kind !== 'MISMATCH') return [];
  const order = object(body); const codes: CallerAssertionCode[] = [];
  const paypal = object(object(order?.payment_source)?.paypal); const payer = object(order?.payer);
  for (const value of [paypal?.address, payer?.address]) {
    if (value === undefined) continue;
    const address = object(value);
    if ((!address || address.country_code !== e.billingCountry) && !codes.includes('COUNTRY_MISMATCH')) codes.push('COUNTRY_MISMATCH');
  }
  if (order && present(order.intent) && order.intent !== 'CAPTURE') codes.push('INTENT_MISMATCH');
  if (!incomplete && ['SHAPE', 'PURCHASE_UNITS', 'CAPTURE_SHAPE'].includes(assessment.reason)) codes.push('SHAPE_CONTRADICTION');
  return codes.map(code => ({ code, detail: {} }));
}

// Ordered facts of a complete response that does not match this order. This is the former per-fact tape:
// the selected attributable capture first with bind=true, then the other actual facts with bind=false.
// sameIdRace is true when a complete AUTHORIZE POST reports the matching capture of this order.
// select=false suppresses the selection: every candidate keeps its response order and has bind=false.
// A protected GET uses it when several different capture IDs compete and no CAPTURE link exists.
export function mismatchFacts(c: ChargeContext, actorUserId: string, binding: ProviderChargeBinding, assessment: OrderMismatch,
  source: Source, body: unknown, select = true): { facts: ResultFact[]; sameIdRace: boolean } {
  const rawCaptures = captureList(body);
  // Do not partially keep either CAPTURE or ORDER evidence above the local work bound.
  if (rawCaptures && rawCaptures.length > 32) return { facts: [], sameIdRace: false };
  const observed = assessment.observed; const sameTuple = orderTupleMatches(c, binding, observed);
  if (c.contextId && source !== 'CREATE_RESPONSE' && ['COUNTRY', 'CAPTURE_SHAPE', 'SHAPE'].includes(assessment.reason) && sameTuple) {
    const candidates = representableCaptures(c, actorUserId, binding, observed, source, body);
    if (candidates.length) {
      const selected = !select ? undefined : candidates.find(candidate => candidate.knownStatus && candidate.evidence.amount_minor === c.amountMinor
        && candidate.evidence.currency === c.currency && candidate.evidence.order_reference === `v2:${c.orderId}`
        && (c.providerCaptureId === null || candidate.evidence.external_id === c.providerCaptureId));
      return { facts: [...(selected ? [asFact(selected.evidence, true)] : []),
        ...candidates.filter(candidate => candidate !== selected).map(candidate => asFact(candidate.evidence))], sameIdRace: false };
    }
  }
  if (source === 'SUBMIT_RESPONSE') {
    const contradictory = contradictoryFacts(c, actorUserId, binding, observed, source, body);
    if (contradictory.length) return { facts: contradictory.map(evidence => asFact(evidence)), sameIdRace: false };
  }
  if (!observed.rawStatus) return { facts: [], sameIdRace: false };
  const facts: ResultFact[] = [];
  // Country and shape have no evidence field. Keep only representable observations and never substitute a
  // false amount, scope or status.
  if (['ID', 'INTENT', 'CUSTOM_ID', 'AMOUNT', 'CURRENCY', 'PAYEE', 'CAPTURE_SHAPE'].includes(assessment.reason)) {
    const e = buildEvidence(c, actorUserId, binding, observed, source,
      assessment.reason === 'CAPTURE_SHAPE' && observed.captures.length === 1 ? observed.captures[0] : null);
    if (e && e.amount_minor !== null && e.currency !== null && e.order_reference !== null && c.contextId) facts.push(asFact(e));
  }
  let sameIdRace = false;
  if (source === 'SUBMIT_RESPONSE' && assessment.reason === 'INTENT' && object(body)?.intent === 'AUTHORIZE'
    && c.contextId && c.providerCaptureId === null && sameTuple) {
    for (const candidate of representableCaptures(c, actorUserId, binding, observed, source, body)) {
      const actual = candidate.evidence;
      if (!candidate.knownStatus || actual.amount_minor !== c.amountMinor || actual.currency !== c.currency
        || actual.order_reference !== `v2:${c.orderId}`) continue;
      facts.push(asFact(actual)); sameIdRace = true;
    }
  }
  return { facts, sameIdRace };
}

// Builds the exact S1 p_classification object. sender is the lease returned with the intent ACK, so a stale
// pre-claim context.attemptId is never used. actorUserId is the authenticated workflow actor.
export function classifySubmission(response: PayPalHttpResult, context: ChargeContext, binding: ProviderChargeBinding,
  sender: ChargeLease, actorUserId: string): SubmissionInput {
  const build = (kind: SubmissionKind, category: SubmissionCategory, httpStatus: number | null, bodyStatus: PayPalBodyStatus | null,
    ids: CaptureIdSet | null, facts: ResultFact[] = [], assertions: CallerAssertion[] = [], receive: number | null = null): SubmissionInput => ({
    contract_version: 'web-payment-submission-classification.v2', context_id: context.contextId as string,
    quote_hash: context.quoteHash, provider_request_key: sender.providerRequestKey,
    provider_order_id: context.providerOrderId as string, environment: binding.environment, kind, category,
    http_status: httpStatus, body_status: bodyStatus, post_capture_ids: ids?.ids ?? null,
    unparseable_capture_count: ids?.unparseable ?? 0, capture_count_exceeded: ids?.exceeded ?? false,
    facts, assertions, receive_fact_index: receive });
  if (response.kind !== 'RESPONSE' || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    return build('NO_RESPONSE', 'TRANSPORT_UNKNOWN', null, null, null);
  }
  const { status, bodyStatus } = response;
  if (status < 200 || (status >= 300 && status < 400)) return build('ADVERSE', 'HTTP_UNEXPECTED_STATUS', status, bodyStatus, null);
  if (status >= 500) return build('NO_RESPONSE', 'HTTP_5XX', status, bodyStatus, null);
  if (status === 408 || status === 429) return build('NO_RESPONSE', status === 408 ? 'HTTP_408' : 'HTTP_429', status, bodyStatus, null);
  if (status >= 400) return build('ADVERSE', 'HTTP_REJECTED_4XX', status, bodyStatus, null);
  if (bodyStatus !== 'PARSED') return build('NO_RESPONSE', 'BODY_UNREADABLE', status, bodyStatus, null);

  const body = response.body; const e = expectedOrder(context, binding);
  const assessment = assessPayPalOrder(body, e); const observed = assessment.observed; const ids = captureIdSet(body);
  const result = (kind: SubmissionKind, category: SubmissionCategory, facts: ResultFact[], assertions: CallerAssertion[] = [],
    receive: number | null = null) => build(kind, category, status, 'PARSED', ids, facts, assertions, receive);
  // An ADVERSE result with neither a fact nor a judgment still states that W saw a contradiction.
  const adverse = (facts: ResultFact[], assertions: CallerAssertion[]) => {
    const stated = facts.length || assertions.length ? assertions : [UNREPRESENTABLE_ASSERTION];
    return result('ADVERSE', stated.length ? 'RESPONSE_CONTRADICTION_UNREPRESENTABLE' : 'RESPONSE_ADVERSE_FACT', facts, stated);
  };
  if (ids.exceeded) return result('ADVERSE', 'WORK_BOUND_EXCEEDED', []);
  const order = buildEvidence(context, actorUserId, binding, observed, 'SUBMIT_RESPONSE');
  // A known VOIDED ORDER is ADVERSE before every CLEAN or NO_CAPTURE judgment (spec 4/10 section 5, G3).
  if (observed.rawStatus === 'VOIDED') {
    if (!order) return result('ADVERSE', 'RESPONSE_ORDER_VOIDED', [], [PARTIAL_VOIDED_ASSERTION]);
    const captures = orderTupleMatches(context, binding, observed)
      ? representableCaptures(context, actorUserId, binding, observed, 'SUBMIT_RESPONSE', body) : [];
    return result('ADVERSE', 'RESPONSE_ORDER_VOIDED', [asFact(order), ...captures.map(candidate => asFact(candidate.evidence))]);
  }
  if (assessment.kind === 'OK') {
    if (!order) return adverse([], []);
    const capture = assessment.captures[0];
    if (!capture) {
      return assessment.status === 'UNRECOGNIZED' ? result('ADVERSE', 'RESPONSE_ADVERSE_FACT', [asFact(order)])
        : result('NO_RESPONSE', 'NO_CAPTURE_UNCONTRADICTED', [asFact(order)]);
    }
    const captured = buildEvidence(context, actorUserId, binding, observed, 'SUBMIT_RESPONSE', capture);
    if (!captured) return adverse([asFact(order)], []);
    // A capture ID that differs from the existing link is an adverse fact. It never replaces the link.
    const linkedElsewhere = context.providerCaptureId !== null && captured.external_id !== context.providerCaptureId;
    if (assessment.status === 'UNRECOGNIZED' || linkedElsewhere || (capture.status !== 'COMPLETED' && capture.status !== 'PENDING')) {
      return result('ADVERSE', 'RESPONSE_ADVERSE_FACT', [asFact(order), asFact(captured, !linkedElsewhere)]);
    }
    const facts = [asFact(order), asFact(captured, true)];
    return capture.status === 'COMPLETED' ? result('CLEAN', 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', facts, [], 1)
      : result('CLEAN', 'RESPONSE_COMPLETE_CAPTURE_PENDING', facts);
  }
  const incomplete = incompletePostResponse(body, observed, e);
  if (incomplete || partialPostResponse(body)) {
    // A known adverse capture status is an actual observation. A missing field of the response does not erase it:
    // an attributable capture is a record-only fact, and a capture that no fact records is the exact assertion.
    const facts = contradictoryFacts(context, actorUserId, binding, observed, 'SUBMIT_RESPONSE', body, true).map(evidence => asFact(evidence));
    const unrecorded = observed.captures.some(capture => adverseCapture(capture) && !facts.some(item =>
      item.evidence.identity_kind === 'CAPTURE' && item.evidence.external_id === capture.providerCaptureId
      && item.evidence.status === capture.rawStatus));
    // A partial response with no observed contradiction is NO_RESPONSE. Its capture IDs are kept for the DB.
    if (!facts.length && !unrecorded && incomplete) return result('NO_RESPONSE', 'PARTIAL_UNCONTRADICTED', []);
    const judgments = [...judgmentAssertions(body, assessment, e, true), ...(unrecorded ? [PARTIAL_ADVERSE_CAPTURE_ASSERTION] : [])];
    if (facts.length && !judgments.length) return result('ADVERSE', 'RESPONSE_ADVERSE_FACT', facts);
    return adverse(facts, judgments);
  }
  const mismatch = mismatchFacts(context, actorUserId, binding, assessment, 'SUBMIT_RESPONSE', body);
  const judgments = judgmentAssertions(body, assessment, e, false);
  // Native RECORDED for both facts is not CLEAN evidence (spec 5/10 section 9). W keeps its own REVIEW.
  if (mismatch.sameIdRace) judgments.push({ code: 'SAME_ID_RACE_UNCONFIRMED', detail: {} });
  if (mismatch.facts.length && !judgments.length) return result('ADVERSE', 'RESPONSE_ADVERSE_FACT', mismatch.facts);
  return adverse(mismatch.facts, judgments);
}
