import 'server-only';
import type { ChargeContext, ChargeLease, WebPaymentChargeRepository } from '../paypal-charge/repository';
import type { ProviderEntryGate } from '../paypal-charge/provider-entry';
import type { PortOneTestConfig } from './config';
import { assessPortOnePayment, buildPortOnePaidEvidence, live, record, UUID } from './protocol';
import type { createPortOneTestBindings, createPortOneTestRepository, PortOneTestBinding } from './repository';
import type { PortOneTestTransport } from './transport';
import type { PortOneTestSettlementPort } from './settlement';

export type PortOneTestInput = { actorUserId: string; orderId: string };
export type PortOneTestResult = { state: 'PENDING' | 'GRANTED' | 'BLOCKED' | 'UNAVAILABLE' | 'NOT_SUBMITTED'; orderId: string }
  | { state: 'READY'; orderId: string; paymentId: string; storeId: string; channelKey: string; method: 'CARD' | 'KAKAOPAY';
      productId: string; totalAmount: number; currency: 'KRW'; expiresAt: string };
export type PortOneTestDeps = { repository: Pick<WebPaymentChargeRepository, 'getChargeContext' | 'prepareProviderContext' | 'claimCharge' | 'recordSubmissionIntent' | 'receivePurchase'>
    & Pick<ReturnType<typeof createPortOneTestRepository>, 'bindPaidObservation'>;
  bindings: ReturnType<typeof createPortOneTestBindings>; entry: ProviderEntryGate; config: PortOneTestConfig | null;
  transport: PortOneTestTransport; nowMs: () => number; settlement?: PortOneTestSettlementPort | null };
type Bound = { context: ChargeContext; binding: PortOneTestBinding; config: PortOneTestConfig };
const response = (input: PortOneTestInput, state: Exclude<PortOneTestResult['state'], 'READY'>): PortOneTestResult => ({ state, orderId: input.orderId });
function validInput(input: PortOneTestInput) { return UUID.test(input.actorUserId) && UUID.test(input.orderId); }
function validContext(context: ChargeContext, input: PortOneTestInput) {
  return context.orderId === input.orderId && context.provider === 'PORTONE' && context.environment === 'TEST'
    && context.currency === 'KRW' && context.quantity === '1' && !context.actorDeleted
    && Number.isSafeInteger(Number(context.amountMinor)) && Number(context.amountMinor) > 0;
}
function boundMatches(context: ChargeContext, binding: PortOneTestBinding, config: PortOneTestConfig) {
  return binding.orderId === context.orderId && binding.contextId === context.contextId && binding.quoteId === context.quoteId
    && binding.quoteHash === context.quoteHash && binding.provider === 'PORTONE' && binding.environment === 'TEST'
    && binding.billingCountry === 'KR' && binding.bindingVersion === config.bindingVersion && binding.credentialRef === config.credentialRef
    && binding.scope.merchant_id === config.merchant_id && binding.scope.store_id === config.store_id
    && binding.scope.channel_id === config.channel_id && binding.scope.channel_type === config.channel_type
    && context.contextId !== null && UUID.test(context.contextId) && context.paymentId === `web_${context.contextId}`
    && context.verificationBindingPresent;
}
async function owned(deps: PortOneTestDeps, input: PortOneTestInput): Promise<ChargeContext | null> {
  if (!validInput(input)) return null;
  const result = await deps.repository.getChargeContext(input.actorUserId, input.orderId);
  return result.kind === 'FOUND' && validContext(result.context, input) ? result.context : null;
}
async function loadBinding(deps: PortOneTestDeps, input: PortOneTestInput, context: ChargeContext): Promise<Bound | null> {
  if (!deps.config) return null;
  const binding = await deps.bindings.getProviderBinding(input.actorUserId, input.orderId);
  if (!binding || !boundMatches(context, binding, deps.config)) return null;
  await deps.settlement?.assertScope(input, context, deps.config, binding);
  return { context, binding, config: deps.config };
}
async function authorize(deps: PortOneTestDeps, input: PortOneTestInput): Promise<(Bound & { entryNotAfter: string }) | null> {
  const before = await owned(deps, input);
  if (!before || !deps.config || before.reviewRequired || !live(before.quoteExpiresAt, deps.nowMs())) return null;
  await deps.settlement?.assertScope(input, before, deps.config);
  const prepared = await deps.repository.prepareProviderContext(input.actorUserId, input.orderId);
  if (prepared.kind !== 'PREPARED' || prepared.provider !== 'PORTONE' || prepared.environment !== 'TEST'
    || prepared.orderId !== input.orderId || prepared.quoteId !== before.quoteId || prepared.quoteHash !== before.quoteHash
    || prepared.paymentId !== `web_${prepared.contextId}`
    || (before.contextId !== null && before.contextId !== prepared.contextId)) return null;
  const context = await owned(deps, input);
  if (!context || context.contextId !== prepared.contextId || context.paymentId !== prepared.paymentId
    || context.quoteHash !== prepared.quoteHash || context.quoteId !== prepared.quoteId) return null;
  const bound = await loadBinding(deps, input, context);
  if (!bound || Object.keys(prepared.scope).length !== 4
    || Object.entries(bound.binding.scope).some(([key, value]) => prepared.scope[key] !== value)) return null;
  const entry = await deps.entry.authorizeProviderEntry({ actorUserId: input.actorUserId, orderId: input.orderId,
    contextId: prepared.contextId, createRequestKey: prepared.createRequestKey, bindingHash: bound.binding.bindingHash });
  if (entry.kind !== 'AUTHORIZED' || entry.orderId !== input.orderId || entry.contextId !== prepared.contextId
    || entry.createRequestKey !== prepared.createRequestKey || entry.bindingHash !== bound.binding.bindingHash
    || entry.quoteHash !== context.quoteHash || !live(entry.entryNotAfter, deps.nowMs())
    || !live(context.quoteExpiresAt, deps.nowMs())) return null;
  return { ...bound, entryNotAfter: entry.entryNotAfter };
}
function state(context: ChargeContext): Exclude<PortOneTestResult['state'], 'READY'> {
  if (context.reviewRequired) return 'BLOCKED';
  if (context.settlementState === 'GRANTED') return 'GRANTED';
  return context.submissionIntentRecorded || context.paymentState === 'SUBMISSION_UNKNOWN'
    || context.settlementState === 'INTAKE_PENDING' ? 'PENDING' : 'NOT_SUBMITTED';
}
export async function getPortOneTestStatus(deps: PortOneTestDeps, input: PortOneTestInput): Promise<PortOneTestResult> {
  try { const context = await owned(deps, input); return response(input, context ? state(context) : 'BLOCKED'); }
  catch { return response(input, 'UNAVAILABLE'); }
}
export async function checkoutPortOneTest(deps: PortOneTestDeps, input: PortOneTestInput): Promise<PortOneTestResult> {
  try {
    const context = await owned(deps, input);
    if (!context) return response(input, 'BLOCKED');
    if (state(context) !== 'NOT_SUBMITTED') return response(input, state(context));
    if (!deps.config) return response(input, 'UNAVAILABLE');
    const bound = await authorize(deps, input);
    if (!bound) return response(input, 'BLOCKED');
    // Do not release SDK configuration when a concurrent request has recorded intent.
    if (state(bound.context) !== 'NOT_SUBMITTED') return response(input, state(bound.context));
    return { state: 'READY', orderId: input.orderId, paymentId: bound.context.paymentId!, storeId: bound.config.store_id,
      channelKey: bound.config.channelKey, method: bound.config.method, productId: bound.context.productId,
      totalAmount: Number(bound.context.amountMinor), currency: 'KRW',
      expiresAt: Date.parse(bound.entryNotAfter) < Date.parse(bound.context.quoteExpiresAt) ? bound.entryNotAfter : bound.context.quoteExpiresAt };
  } catch { return response(input, 'UNAVAILABLE'); }
}
async function acceptPaid(deps: PortOneTestDeps, input: PortOneTestInput, bound: Bound, value: unknown, txId?: string): Promise<boolean> {
  const observed = assessPortOnePayment(value, bound.context, bound.config, txId);
  if (!observed || observed.status !== 'PAID' || (deps.settlement && !isScopedCard(value))) return false;
  await deps.settlement?.assertScope(input, bound.context, bound.config, bound.binding);
  const evidence = buildPortOnePaidEvidence(observed, bound.context, input.actorUserId);
  const observation = await deps.repository.bindPaidObservation(bound.context.contextId!, evidence);
  if (observation.kind !== 'RECORDED') return false;
  const intake = await deps.repository.receivePurchase(input.orderId, observation.observationId);
  if (intake.kind !== 'INTAKE_PENDING') return false;
  if (deps.settlement) {
    if (intake.orderId !== input.orderId || typeof intake.inboxId !== 'string' || !UUID.test(intake.inboxId)) return false;
    await deps.settlement.publishPaid({ version: 1, type: 'paid', orderId: input.orderId,
      paymentId: bound.context.paymentId!, inboxId: intake.inboxId });
  }
  return true;
}
function isScopedCard(value: unknown): boolean {
  const d = record(value);
  return record(d?.channel)?.pgProvider === 'INICIS_V2' && record(d?.method)?.type === 'PaymentMethodCard';
}
async function lookup(deps: PortOneTestDeps, input: PortOneTestInput, bound: Bound, txId?: string): Promise<boolean> {
  const value = await deps.transport.getPayment(bound.config, bound.context.paymentId!);
  return acceptPaid(deps, input, bound, value, txId);
}
function sameLease(claim: ChargeLease, intent: ChargeLease, bound: Bound, now: number): boolean {
  return ['attemptId', 'leaseToken', 'fencingVersion', 'providerRequestKey', 'submitNotAfter', 'quoteHash']
    .every(key => claim[key as keyof ChargeLease] === intent[key as keyof ChargeLease])
    && intent.quoteHash === bound.context.quoteHash && /^[1-9][0-9]{0,18}$/.test(intent.rowVersion)
    && BigInt(intent.rowVersion) > BigInt(claim.rowVersion) && live(intent.submitNotAfter, now)
    && live(bound.context.quoteExpiresAt, now);
}
export async function confirmPortOneTest(deps: PortOneTestDeps, input: PortOneTestInput & { txId: string; paymentToken: string }): Promise<PortOneTestResult> {
  try {
    const initial = await owned(deps, input);
    if (!initial) return response(input, 'BLOCKED');
    if (initial.settlementState === 'GRANTED' || initial.reviewRequired) return response(input, state(initial));
    if (!deps.config) return response(input, 'UNAVAILABLE');
    if (initial.submissionIntentRecorded || initial.paymentState === 'SUBMISSION_UNKNOWN' || initial.settlementState === 'INTAKE_PENDING') {
      if (!initial.submissionIntentRecorded) return response(input, 'BLOCKED');
      const recovery = await loadBinding(deps, input, initial);
      if (!recovery) return response(input, 'BLOCKED');
      try { await lookup(deps, input, recovery, input.txId); } catch { /* An uncertain submission stays pending. */ }
      return getPortOneTestStatus(deps, input);
    }
    const bound = await authorize(deps, input);
    if (!bound) return response(input, 'BLOCKED');
    const value = await deps.transport.getPayment(bound.config, bound.context.paymentId!);
    const observed = assessPortOnePayment(value, bound.context, bound.config, input.txId);
    if (!observed || (deps.settlement && !isScopedCard(value))) return response(input, 'BLOCKED');
    // An already-paid order with no native submission intent has no authorized manual confirmation to reconcile.
    if (observed.status === 'PAID') return response(input, 'BLOCKED');
    if (!live(bound.entryNotAfter, deps.nowMs()) || !live(bound.context.quoteExpiresAt, deps.nowMs())) return response(input, 'BLOCKED');
    await deps.settlement?.pinTransaction(input.orderId, bound.context.paymentId!, observed.transactionId);
    await deps.settlement?.assertScope(input, bound.context, bound.config, bound.binding);
    const claimed = await deps.repository.claimCharge(input.actorUserId, input.orderId, bound.context.rowVersion);
    if (claimed.kind === 'LOOKUP_ONLY' || (claimed.kind === 'BLOCKED' && claimed.reason === 'LEASE_ACTIVE')) {
      if (claimed.kind === 'LOOKUP_ONLY') { try { await lookup(deps, input, bound, input.txId); } catch { /* No new submit. */ } }
      const latest = await getPortOneTestStatus(deps, input);
      return latest.state === 'NOT_SUBMITTED' ? response(input, 'PENDING') : latest;
    }
    if (claimed.kind !== 'SUBMIT' || claimed.reason !== 'LEASE_CLAIMED' || claimed.lease.quoteHash !== bound.context.quoteHash
      || !live(claimed.lease.submitNotAfter, deps.nowMs())) return response(input, 'BLOCKED');
    await deps.settlement?.assertScope(input, bound.context, bound.config, bound.binding);
    const intent = await deps.repository.recordSubmissionIntent(input.actorUserId, input.orderId, claimed.lease.rowVersion, claimed.lease);
    if (intent.kind === 'LOOKUP_ONLY') {
      try { await lookup(deps, input, bound, input.txId); } catch { /* Only independent reads can recover this intent. */ }
      const latest = await getPortOneTestStatus(deps, input);
      return latest.state === 'NOT_SUBMITTED' ? response(input, 'PENDING') : latest;
    }
    if (intent.kind === 'BLOCKED' && intent.reason === 'LEASE_ACTIVE') return response(input, 'PENDING');
    if (intent.kind !== 'SUBMIT' || intent.reason !== 'INTENT_RECORDED'
      || !sameLease(claimed.lease, intent.lease, bound, deps.nowMs()) || !live(bound.entryNotAfter, deps.nowMs())) return response(input, 'BLOCKED');
    await deps.settlement?.assertScope(input, bound.context, bound.config, bound.binding);
    // The native intent is committed before this single attempt. Any failure becomes lookup-only forever.
    try { await deps.transport.confirmPayment(bound.config, bound.context.paymentId!, { storeId: bound.config.store_id,
      txId: input.txId, paymentToken: input.paymentToken, totalAmount: Number(bound.context.amountMinor), currency: 'KRW', isTest: true }); }
    catch { /* A timeout or non-2xx response never permits a retry. */ }
    try { await lookup(deps, input, bound, input.txId); } catch { /* Independent recovery can continue later. */ }
    const latest = await getPortOneTestStatus(deps, input);
    return latest.state === 'NOT_SUBMITTED' ? response(input, 'PENDING') : latest;
  } catch { return response(input, 'UNAVAILABLE'); }
}
// Signed webhooks may only read and accept actual provider PAID facts. They never claim or confirm.
export async function reconcilePortOneTestPaid(deps: PortOneTestDeps, input: PortOneTestInput, paymentId: string): Promise<boolean> {
  const context = await owned(deps, input);
  if (!context || context.paymentId !== paymentId || context.reviewRequired || !context.submissionIntentRecorded) return false;
  const bound = await loadBinding(deps, input, context);
  return bound ? lookup(deps, input, bound) : false;
}
