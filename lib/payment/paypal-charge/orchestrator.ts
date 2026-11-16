import 'server-only';
import type { LogEventCode } from '@/utils/log-event-codes';
import { assessPayPalOrder, buildPayPalEvidence, minorToPayPalValue, type ExpectedPayPalOrder,
  type ObservedPayPalCapture, type ObservedPayPalOrder, type PayPalEnvironment, type PayPalEvidence, type PayPalOrderAssessment, type PayPalScope } from './protocol';
import type { ChargeCommand, ChargeContext, ChargeLease, PreparedProviderContext, WebPaymentChargeRepository } from './repository';
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
  resolve(input: { provider: 'PAYPAL'; environment: PayPalEnvironment; credentialRef: string; bindingVersion: string; bindingHash: string }):
    Promise<{ clientId: string; clientSecret: string } | null>;
}
export const closedPayPalCredentialResolver: PayPalCredentialResolver = { async resolve() { return null; } };
type Stage = 'CONTEXT' | 'PREPARE' | 'BINDING' | 'CREDENTIAL' | 'TOKEN' | 'ENTRY' | 'CREATE' | 'LOOKUP' | 'CLAIM' | 'INTENT' | 'SUBMIT' | 'OBSERVE' | 'INTAKE';
export type PayPalChargeOutcome =
  | { kind: 'PROVIDER_ORDER_READY'; providerOrderId: string; replayed: boolean }
  | { kind: 'INTAKE_PENDING'; replayed: boolean }
  | { kind: 'STATUS'; paymentState: ChargeContext['paymentState']; settlementState: ChargeContext['settlementState']; reviewRequired: boolean }
  | { kind: 'BLOCKED'; reason: string } | { kind: 'UNAVAILABLE'; stage: Stage }
  | { kind: 'NOT_APPROVED' | 'ORDER_VOIDED' | 'IN_PROGRESS' | 'CAPTURE_PENDING' | 'CAPTURE_FAILED' | 'SUBMISSION_UNKNOWN'
      | 'NO_PROVIDER_ORDER' | 'REVIEW_REQUIRED' | 'NOT_FOUND' };
export type PayPalChargeDeps = { repository: WebPaymentChargeRepository; bindings: ChargeBindingSource;
  credentials: PayPalCredentialResolver; transport: PayPalTransport; entry: ProviderEntryGate; nowMs: () => number;
  log: (entry: { stage: Stage; level: 'warn' | 'error'; code: LogEventCode; orderId: string; httpStatus?: number }) => void };
export type PayPalChargeBrowserDto = { contractVersion: 'web-payment-charge.v1'; orderId: string; state: PayPalChargeOutcome['kind'];
  newOrderAllowed: false; providerOrderId?: string; paymentState?: ChargeContext['paymentState'];
  settlementState?: ChargeContext['settlementState']; reviewRequired?: boolean };
type Input = { actorUserId: string; orderId: string };
type Authorized = { binding: ProviderChargeBinding; accessToken: string };
type PostRecovery = { captureIds: string[]; reviewRequired: boolean };

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
} as const satisfies Record<Stage, LogEventCode>;

function matches(value: unknown, regex: RegExp): value is string { return typeof value === 'string' && regex.exec(value)?.[0] === value; }
function positive(value: unknown): value is string { return matches(value, POSITIVE) && BigInt(value) <= BigInt('9223372036854775807'); }
function log(d: Pick<PayPalChargeDeps, 'log'>, stage: Stage, orderId: string, httpStatus?: number) {
  try { d.log({ stage, level: ['CONTEXT', 'CREATE', 'SUBMIT', 'INTAKE'].includes(stage) ? 'error' : 'warn', code: EVENTS[stage], orderId,
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
  let credential;
  try { credential = await d.credentials.resolve({ provider: 'PAYPAL', environment: binding.environment,
    credentialRef: binding.credentialRef, bindingVersion: binding.bindingVersion, bindingHash: binding.bindingHash }); }
  catch { return { outcome: unavailable(d, 'CREDENTIAL', i.orderId) }; }
  // Resolver output attests no hash. Only the returned client ID can be compared here.
  if (!credential || credential.clientId !== binding.expectedPayPalClientId || !credentialValue(credential.clientId)
    || !credentialValue(credential.clientSecret)) return { outcome: unavailable(d, 'CREDENTIAL', i.orderId) };
  let token;
  try { token = await d.transport.requestToken({ environment: binding.environment, credential }); }
  catch { return { outcome: unavailable(d, 'TOKEN', i.orderId) }; }
  if (!token || !credentialValue(token.accessToken)) return { outcome: unavailable(d, 'TOKEN', i.orderId) };
  return { authorized: { binding, accessToken: token.accessToken } };
}

function expected(c: ChargeContext, binding: ProviderChargeBinding, providerOrderId = c.providerOrderId): ExpectedPayPalOrder {
  return { orderId: c.orderId, providerOrderId, amountMinor: c.amountMinor, currency: 'USD',
    merchantId: binding.scope.merchant_id, billingCountry: binding.billingCountry };
}
function successful(result: PayPalHttpResult): result is Extract<PayPalHttpResult, { kind: 'RESPONSE' }> {
  return result.kind === 'RESPONSE' && Number.isInteger(result.status) && result.status >= 200 && result.status < 300;
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function captureList(body: unknown): unknown[] | null {
  const units = object(body)?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? object(units[0]) : null;
  const captures = object(unit?.payments)?.captures;
  return Array.isArray(captures) ? captures : null;
}
function partialPostResponse(body: unknown): boolean {
  const captures = captureList(body);
  if (captures && captures.length > 32) return false;
  const order = object(body); if (!order) return true;
  const present = (value: unknown) => value !== undefined && value !== null;
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
function postCaptureIds(body: unknown, c: ChargeContext): string[] {
  const order = object(body); const captures = captureList(body);
  if (!order || !matches(order.id, ID) || order.id !== c.providerOrderId || !captures || captures.length > 32) return [];
  const ids: string[] = [];
  for (const value of captures) {
    const capture = object(value);
    if (capture && matches(capture.id, ID)) ids.push(capture.id);
  }
  return ids;
}
function incompletePostResponse(body: unknown, observed: ObservedPayPalOrder, e: ExpectedPayPalOrder): boolean {
  const order = object(body); if (!order) return true;
  const present = (value: unknown) => value !== undefined && value !== null;
  // Check every observed contradiction before considering any missing field.
  // A later complete GET must not erase a real conflicting POST observation.
  if ((present(order.id) && observed.providerOrderId !== e.providerOrderId)
    || (present(order.intent) && order.intent !== 'CAPTURE')
    || (present(order.status) && (!observed.rawStatus
      || !['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'].includes(observed.rawStatus)))) return false;
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
async function lookup(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized):
  Promise<{ assessment: PayPalOrderAssessment; body: unknown } | { outcome: PayPalChargeOutcome }> {
  let result;
  try { result = await d.transport.getOrder({ environment: a.binding.environment, accessToken: a.accessToken, providerOrderId: c.providerOrderId! }); }
  catch { return { outcome: unavailable(d, 'LOOKUP', i.orderId) }; }
  if (!successful(result) || result.body === null) return { outcome: unavailable(d, 'LOOKUP', i.orderId, result.kind === 'RESPONSE' ? result.status : undefined) };
  return { assessment: assessPayPalOrder(result.body, expected(c, a.binding)), body: result.body };
}

function evidence(c: ChargeContext, i: Input, binding: ProviderChargeBinding, observed: ObservedPayPalOrder,
  source: PayPalEvidence['source'], capture: ObservedPayPalCapture | null = null): PayPalEvidence | null {
  const item = capture;
  const externalId = capture ? item?.providerCaptureId : observed.providerOrderId;
  const status = capture ? item?.rawStatus : observed.rawStatus;
  if (!externalId || !status || !observed.merchantId) return null;
  try {
    return buildPayPalEvidence({ source, provider: 'PAYPAL', environment: binding.environment,
      identity_kind: capture ? 'CAPTURE' : 'ORDER', external_id: externalId,
      parent_external_id: capture ? observed.providerOrderId : null, order_id: c.orderId, user_id: i.actorUserId, quote_hash: c.quoteHash,
      order_reference: item?.orderReference ?? observed.orderReference,
      // account_id is copied context, whereas merchant_id is the observed PayPal payee.
      scope: { account_id: binding.scope.account_id, merchant_id: observed.merchantId },
      amount_minor: capture ? item?.amountMinor ?? null : observed.amountMinor,
      currency: capture ? item?.currency ?? null : observed.currency, status });
  } catch { return null; }
}

function contradictoryFacts(c: ChargeContext, i: Input, binding: ProviderChargeBinding, observed: ObservedPayPalOrder,
  source: PayPalEvidence['source'], body: unknown): PayPalEvidence[] {
  const captures = captureList(body);
  if (captures && captures.length > 32) return [];
  const order = evidence(c, i, binding, observed, source);
  // A partial representation must supply the actual tuple. Missing fields are
  // transport recovery inputs, not permission to fill evidence from expectations.
  if (!order || order.amount_minor === null || order.currency === null || order.order_reference === null) return [];
  if (order.external_id !== c.providerOrderId || order.amount_minor !== c.amountMinor || order.currency !== c.currency
    || order.scope.merchant_id !== binding.scope.merchant_id || order.order_reference !== `v2:${c.orderId}`
    || !['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'].includes(order.status)) return [order];
  // Only the matching ORDER tuple can attribute CAPTURE facts to this order.
  // A missing CAPTURE link alone is not an observed provider contradiction.
  const facts: PayPalEvidence[] = []; const seen = new Set<string>();
  for (let index = 0; index < observed.captures.length; index++) {
    const capture = observed.captures[index]; const raw = object(captures?.[index]);
    if (!raw || !capture.providerCaptureId || !capture.rawStatus || !capture.amountMinor || !capture.currency
      || (raw.custom_id !== undefined && !capture.orderReference)) continue;
    const actual = evidence(c, i, binding, observed, source, capture);
    if (!actual || !actual.order_reference || seen.has(actual.payload_hash)) continue;
    if (actual.amount_minor !== c.amountMinor || actual.currency !== c.currency
      || actual.order_reference !== `v2:${c.orderId}` || capture.status === 'UNRECOGNIZED'
      || (c.providerCaptureId !== null && actual.external_id !== c.providerCaptureId)) {
      seen.add(actual.payload_hash); facts.push(actual);
    }
  }
  return facts;
}

async function recordFacts(d: PayPalChargeDeps, c: ChargeContext, facts: PayPalEvidence[]): Promise<void> {
  if (!c.contextId) return;
  for (const fact of facts) {
    try { await d.repository.recordObservation(c.contextId, fact); }
    catch { /* Record failure cannot authorize recovery, binding or intake. */ }
  }
}

async function mismatch(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  assessment: Extract<PayPalOrderAssessment, { kind: 'MISMATCH' }>, source: PayPalEvidence['source'], body: unknown): Promise<PayPalChargeOutcome> {
  const rawCaptures = captureList(body);
  if (rawCaptures && rawCaptures.length > 32) {
    // Do not partially persist either CAPTURE or ORDER evidence above the local work bound.
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const observed = assessment.observed;
  if (c.contextId && source !== 'CREATE_RESPONSE' && ['COUNTRY', 'CAPTURE_SHAPE', 'SHAPE'].includes(assessment.reason)
    && observed.providerOrderId === c.providerOrderId && observed.amountMinor === c.amountMinor && observed.currency === c.currency
    && observed.merchantId === a.binding.scope.merchant_id && observed.orderReference === `v2:${c.orderId}`) {
    const seen = new Set<string>(); const candidates: Array<{ evidence: PayPalEvidence; knownStatus: boolean }> = [];
    for (let index = 0; index < observed.captures.length; index++) {
      const capture = observed.captures[index]; const raw = object(rawCaptures?.[index]);
      if (!raw || !capture.providerCaptureId || !capture.rawStatus || !capture.amountMinor || !capture.currency
        || (raw.custom_id !== undefined && !capture.orderReference)) continue;
      const e = evidence(c, i, a.binding, observed, source, capture);
      if (!e || !e.order_reference || seen.has(e.payload_hash)) continue;
      seen.add(e.payload_hash); candidates.push({ evidence: e, knownStatus: capture.status !== 'UNRECOGNIZED' });
    }
    if (candidates.length) {
      const selected = candidates.find(candidate => candidate.knownStatus && candidate.evidence.amount_minor === c.amountMinor
        && candidate.evidence.currency === c.currency && candidate.evidence.order_reference === `v2:${c.orderId}`
        && (c.providerCaptureId === null || candidate.evidence.external_id === c.providerCaptureId));
      if (selected) {
        try { await d.repository.bindProviderIdentity(c.contextId, selected.evidence); }
        catch {
          // Commit is unknown. Preserve the same actual evidence once through native
          // replay/IDENTITY_NOT_BOUND semantics; never bind a replacement candidate.
          try { await d.repository.recordObservation(c.contextId, selected.evidence); } catch { /* Remain in local REVIEW. */ }
        }
      }
      for (const candidate of candidates) {
        if (candidate === selected) continue;
        try { await d.repository.recordObservation(c.contextId, candidate.evidence); }
        catch { /* A failed observation must not discard the later actual candidates. */ }
      }
      log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
    }
  }
  if (source === 'SUBMIT_RESPONSE') {
    const facts = contradictoryFacts(c, i, a.binding, observed, source, body);
    if (facts.length) {
      await recordFacts(d, c, facts);
      log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
    }
  }
  if (!observed.rawStatus) return unavailable(d, source === 'CREATE_RESPONSE' ? 'CREATE' : 'LOOKUP', i.orderId);
  // Country/shape have no dedicated sticky-review reason in the existing 17-key DB contract.
  // Persist only representable observations; never substitute a false amount, scope or status.
  if (['ID', 'INTENT', 'CUSTOM_ID', 'AMOUNT', 'CURRENCY', 'PAYEE', 'CAPTURE_SHAPE'].includes(assessment.reason)) {
    const e = evidence(c, i, a.binding, observed, source,
      assessment.reason === 'CAPTURE_SHAPE' && observed.captures.length === 1 ? observed.captures[0] : null);
    if (e && e.amount_minor !== null && e.currency !== null && e.order_reference !== null && c.contextId) {
      try { await d.repository.recordObservation(c.contextId, e); } catch { /* Local refusal remains closed if persistence fails. */ }
    }
  }
  log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
}

async function captureObserved(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  assessment: Extract<PayPalOrderAssessment, { kind: 'OK' }>, source: 'LOOKUP' | 'SUBMIT_RESPONSE'): Promise<PayPalChargeOutcome> {
  const capture = assessment.captures[0];
  const e = evidence(c, i, a.binding, assessment.observed, source, capture ?? null);
  if (!capture || !e || !c.contextId) return { kind: 'SUBMISSION_UNKNOWN' };
  if (c.providerCaptureId !== null && e.external_id !== c.providerCaptureId) {
    try { await d.repository.recordObservation(c.contextId, e); } catch { /* Never replace the existing capture link. */ }
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
  if (capture.status === 'REFUNDED' || capture.status === 'PARTIALLY_REFUNDED') {
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  let intake;
  try { intake = await d.repository.receivePurchase(c.orderId, observation.observationId); }
  catch { return unavailable(d, 'INTAKE', i.orderId); }
  if (intake.kind === 'INTAKE_PENDING') return { kind: 'INTAKE_PENDING', replayed: intake.replayed };
  log(d, 'INTAKE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
}

async function recordRecoveryCaptures(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  observed: ObservedPayPalOrder, body: unknown): Promise<void> {
  const orderFacts = contradictoryFacts(c, i, a.binding, observed, 'LOOKUP', body)
    .filter(fact => fact.identity_kind === 'ORDER');
  if (orderFacts.length) await recordFacts(d, c, orderFacts);
  // Status alone does not invalidate capture attribution. The ORDER tuple below
  // must still match before any actual CAPTURE is recorded.
  const captures = captureList(body);
  if (!c.contextId || !captures || captures.length > 32 || observed.providerOrderId !== c.providerOrderId
    || observed.amountMinor !== c.amountMinor || observed.currency !== c.currency
    || observed.merchantId !== a.binding.scope.merchant_id || observed.orderReference !== `v2:${c.orderId}`) return;
  const seen = new Set<string>();
  for (let index = 0; index < observed.captures.length; index++) {
    const capture = observed.captures[index]; const raw = object(captures[index]);
    if (!raw || !capture.providerCaptureId || !capture.rawStatus || !capture.amountMinor || !capture.currency
      || (raw.custom_id !== undefined && !capture.orderReference)) continue;
    const e = evidence(c, i, a.binding, observed, 'LOOKUP', capture);
    if (!e || !e.order_reference || seen.has(e.payload_hash)) continue;
    seen.add(e.payload_hash);
    try { await d.repository.recordObservation(c.contextId, e); }
    catch { /* Preserve later actual observations even when this record fails. */ }
  }
}

async function lookupOutcome(d: PayPalChargeDeps, i: Input, c: ChargeContext, a: Authorized,
  recovering = false, post?: PostRecovery): Promise<PayPalChargeOutcome> {
  const result = await lookup(d, i, c, a);
  if ('outcome' in result) return post?.reviewRequired ? { kind: 'REVIEW_REQUIRED' }
    : recovering ? { kind: 'SUBMISSION_UNKNOWN' } : result.outcome;
  const assessment = result.assessment;
  // Check the entire bounded GET before either the ordinary or mismatch path can
  // bind any candidate. A different ID never replaces observed POST evidence.
  if (post?.captureIds.length && assessment.observed.captures.some(capture =>
    capture.providerCaptureId !== null && !post.captureIds.includes(capture.providerCaptureId))) {
    await recordRecoveryCaptures(d, i, c, a, assessment.observed, result.body);
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const context = post?.reviewRequired ? { ...c, reviewRequired: true } : c;
  if (assessment.kind === 'MISMATCH') {
    const outcome = await mismatch(d, i, context, a, assessment, 'LOOKUP', result.body);
    return post?.reviewRequired ? { kind: 'REVIEW_REQUIRED' } : outcome;
  }
  if (assessment.captures.length) {
    const outcome = await captureObserved(d, i, context, a, assessment, 'LOOKUP');
    return post?.reviewRequired ? { kind: 'REVIEW_REQUIRED' } : outcome;
  }
  if (post?.reviewRequired) { log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' }; }
  if (recovering) return { kind: 'SUBMISSION_UNKNOWN' };
  if (assessment.status === 'UNRECOGNIZED') {
    const e = evidence(c, i, a.binding, assessment.observed, 'LOOKUP');
    if (e && c.contextId) { try { await d.repository.recordObservation(c.contextId, e); } catch { /* No charge is allowed. */ } }
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  if (assessment.status === 'VOIDED') return { kind: 'ORDER_VOIDED' };
  return { kind: assessment.status === 'COMPLETED' || recovery(c) ? 'SUBMISSION_UNKNOWN' : 'NOT_APPROVED' };
}

async function reconcileContext(d: PayPalChargeDeps, i: Input, c: ChargeContext): Promise<PayPalChargeOutcome> {
  if (!c.providerOrderId) return { kind: 'NO_PROVIDER_ORDER' };
  const auth = await authorize(d, i, c);
  if ('outcome' in auth) return c.reviewRequired ? { kind: 'REVIEW_REQUIRED' } : auth.outcome;
  const outcome = await lookupOutcome(d, i, c, auth.authorized);
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
  const assessment = assessPayPalOrder(response.body, expected(contextual, auth.authorized.binding, null));
  if (assessment.kind === 'MISMATCH') return mismatch(d, enteredInput, contextual, auth.authorized, assessment, 'CREATE_RESPONSE', response.body);
  if (assessment.status === 'UNRECOGNIZED') {
    const actual = evidence(contextual, enteredInput, auth.authorized.binding, assessment.observed, 'CREATE_RESPONSE');
    if (actual) { try { await d.repository.recordObservation(contextId, actual); } catch { /* Local REVIEW remains closed. */ } }
    log(d, 'OBSERVE', orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const e = evidence(contextual, enteredInput, auth.authorized.binding, assessment.observed, 'CREATE_RESPONSE');
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
  if (recovery(c)) return reconcileContext(d, i, c);
  const refusal = freshRefusal(d, c); if (refusal) { log(d, 'CLAIM', i.orderId); return refusal; }
  const auth = await authorize(d, i, c); if ('outcome' in auth) return auth.outcome;
  const a = auth.authorized;
  const original = await lookup(d, i, c, a); if ('outcome' in original) return original.outcome;
  const assessment = original.assessment;
  if (assessment.kind === 'MISMATCH') return mismatch(d, i, c, a, assessment, 'LOOKUP', original.body);
  if (assessment.captures.length) return captureObserved(d, i, c, a, assessment, 'LOOKUP');
  if (assessment.status === 'UNRECOGNIZED') {
    const e = evidence(c, i, a.binding, assessment.observed, 'LOOKUP');
    if (e && c.contextId) { try { await d.repository.recordObservation(c.contextId, e); } catch { /* Refusal remains local. */ } }
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
    if (command.quoteHash === c.quoteHash) return lookupOutcome(d, i, c, a, true);
    log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
  }
  const lease = command.lease;
  if (!usableClaim(c, lease)) return unavailable(d, 'CLAIM', i.orderId);
  const remainingMs = Date.parse(lease.submitNotAfter) - now(d);
  if (!Number.isFinite(remainingMs) || remainingMs < 10_000) { log(d, 'CLAIM', i.orderId); return { kind: 'IN_PROGRESS' }; }
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
  // After durable intent, ambiguity can cause one GET only. No branch sends another POST.
  if (!successful(response) || response.body === null) { log(d, 'SUBMIT', i.orderId); return lookupOutcome(d, i, c, a, true); }
  const result = assessPayPalOrder(response.body, expected(c, a.binding));
  if (result.kind === 'MISMATCH') {
    const incomplete = incompletePostResponse(response.body, result.observed, expected(c, a.binding));
    if (incomplete || partialPostResponse(response.body)) {
      const facts = contradictoryFacts(c, i, a.binding, result.observed, 'SUBMIT_RESPONSE', response.body);
      if (facts.length) {
        await recordFacts(d, c, facts);
        log(d, 'OBSERVE', i.orderId); return { kind: 'REVIEW_REQUIRED' };
      }
      log(d, 'SUBMIT', i.orderId);
      return lookupOutcome(d, i, c, a, true, {
        captureIds: postCaptureIds(response.body, c), reviewRequired: !incomplete,
      });
    }
    return mismatch(d, i, c, a, result, 'SUBMIT_RESPONSE', response.body);
  }
  if (!result.captures.length) { log(d, 'SUBMIT', i.orderId); return lookupOutcome(d, i, c, a, true); }
  return captureObserved(d, i, c, a, result, 'SUBMIT_RESPONSE');
}

export async function reconcilePayPalOrder(d: PayPalChargeDeps, i: Input): Promise<PayPalChargeOutcome> {
  const loaded = await owner(d, i); return 'outcome' in loaded ? loaded.outcome : reconcileContext(d, i, loaded.context);
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
