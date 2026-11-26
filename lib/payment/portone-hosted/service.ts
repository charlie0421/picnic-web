import 'server-only';
import { createHmac } from 'node:crypto';
import type { ChargeContext, ChargeLease, WebPaymentChargeRepository } from '../paypal-charge/repository';
import { buildPortOneMethodEvidence, readPaidPaymentMethod, type ObservedPaymentMethod } from '../portone-test/payment-method';
import { assessPortOnePayment, buildPortOnePaidEvidence, live, UUID, type PortOneChannelFacts, type PortOneEnvironment,
  type PortOneScope } from '../portone-test/protocol';
import type { createPortOneTestBindings, PortOneTestBinding } from '../portone-test/repository';
import type { PortOneTestTransport } from '../portone-test/transport';
import type { HostedBuyer, HostedChannel, HostedChannels, HostedFlow, HostedGiftCertificateType, HostedPayMethod } from './config';
import { createHostedContinuation, verifyHostedContinuation } from './continuation';
import type { HostedEntryGate } from './entry';
import { HOSTED_EVENT_CONTRACT, type createPortOneHostedRepository, type HostedAvailability } from './repository';

export type HostedInput = { actorUserId: string; orderId: string };
export type HostedConfirmInput = HostedInput & { paymentId: string; txId: string; paymentToken: string; continuation: string };
/** Public SDK settings only. Secrets, merchant ids and binding facts stay on the server. */
export type HostedSdkSettings = { storeId: string; channelKey: string; paymentId: string; totalAmount: number; currency: 'KRW';
  payMethod: HostedPayMethod; easyPayProvider: string | null; buyer: HostedBuyer; productType: 'DIGITAL' | 'REAL';
  virtualAccountValidHours: number | null; giftCertificateType: HostedGiftCertificateType | null; isTestChannel: boolean };
// AWAITING_DEPOSIT and REFUND_PENDING are pending. CANCELLED, REFUNDED and FAILED end the attempt. Review is BLOCKED.
// EXPIRED: nothing was submitted and the quote deadline has passed, so this order can never be paid.
type ClosedState = 'PENDING' | 'GRANTED' | 'BLOCKED' | 'UNAVAILABLE' | 'NOT_SUBMITTED'
  | 'AWAITING_DEPOSIT' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED' | 'FAILED' | 'EXPIRED';
export type HostedResult = { state: ClosedState; orderId: string }
  | { state: 'READY'; orderId: string; environment: PortOneEnvironment; productId: string; expiresAt: string; continuation: string;
      sdk: HostedSdkSettings };
type Repository = Pick<WebPaymentChargeRepository, 'getChargeContext' | 'prepareProviderContext' | 'claimCharge' | 'recordSubmissionIntent'>
  & Pick<ReturnType<typeof createPortOneHostedRepository>, 'bindPaidObservation' | 'receiveHostedEvent' | 'getHostedOrderStatus'>;
export type HostedDeps = { repository: Repository; bindings: Pick<ReturnType<typeof createPortOneTestBindings>, 'getProviderBinding'>;
  entry: HostedEntryGate; channels: HostedChannels; transport: PortOneTestTransport; availability: HostedAvailability | null;
  continuationSecret: string | null; nowMs: () => number };
type Bound = { context: ChargeContext; binding: PortOneTestBinding; channel: HostedChannel; flow: HostedFlow };

// A mobile return may complete shortly after the entry window. The order and entry checks still decide.
const CONTINUATION_GRACE_MS = 15 * 60_000;
const closed = (input: HostedInput, state: ClosedState): HostedResult => ({ state, orderId: input.orderId });
const scopeOf = (channel: HostedChannel): PortOneScope => ({ merchant_id: channel.merchant_id, store_id: channel.store_id,
  channel_id: channel.channel_id, channel_type: channel.environment });
const facts = (channel: HostedChannel): PortOneChannelFacts => ({ ...scopeOf(channel), channelKey: channel.channelKey });
function sameScope(a: PortOneScope, b: Record<string, unknown>) {
  return Object.keys(b).length === 4 && a.merchant_id === b.merchant_id && a.store_id === b.store_id
    && a.channel_id === b.channel_id && a.channel_type === b.channel_type;
}
function validContext(context: ChargeContext, input: HostedInput) {
  return context.orderId === input.orderId && context.provider === 'PORTONE' && (context.environment === 'TEST' || context.environment === 'LIVE')
    && context.currency === 'KRW' && context.quantity === '1' && !context.actorDeleted
    && Number.isSafeInteger(Number(context.amountMinor)) && Number(context.amountMinor) > 0;
}
async function owned(deps: HostedDeps, input: HostedInput): Promise<ChargeContext | null> {
  if (!UUID.test(input.actorUserId) || !UUID.test(input.orderId)) return null;
  const result = await deps.repository.getChargeContext(input.actorUserId, input.orderId);
  return result.kind === 'FOUND' && validContext(result.context, input) ? result.context : null;
}
function state(context: ChargeContext): ClosedState {
  if (context.reviewRequired) return 'BLOCKED';
  if (context.settlementState === 'GRANTED') return 'GRANTED';
  return context.submissionIntentRecorded || context.paymentState === 'SUBMISSION_UNKNOWN'
    || context.settlementState === 'INTAKE_PENDING' ? 'PENDING' : 'NOT_SUBMITTED';
}
/**
 * The owned hosted status from the DB. A non-null state wins over the charge context, so a refund after a grant is
 * never shown as GRANTED. A failed or malformed read throws: callers report UNAVAILABLE and never release checkout.
 */
async function hostedOverride(deps: HostedDeps, input: HostedInput): Promise<ClosedState | null> {
  const status = await deps.repository.getHostedOrderStatus(input.actorUserId, input.orderId);
  if (!status || status.state === null) return null;
  return status.state === 'REVIEW' ? 'BLOCKED' : status.state;
}
// The order's own quote deadline confirms expiry only while nothing is submitted. Submitted orders stay lookup-only.
function openState(deps: HostedDeps, context: ChargeContext): ClosedState {
  const value = state(context);
  return value === 'NOT_SUBMITTED' && !live(context.quoteExpiresAt, deps.nowMs()) ? 'EXPIRED' : value;
}
async function currentState(deps: HostedDeps, input: HostedInput, context: ChargeContext): Promise<ClosedState> {
  return (await hostedOverride(deps, input)) ?? openState(deps, context);
}
async function opened(deps: HostedDeps, environment: PortOneEnvironment): Promise<boolean> {
  try { return (await deps.availability?.isOpen(environment)) === true; } catch { return false; }
}

/**
 * Resolves the frozen hosted binding and its server credential. ENTRY also needs the channel to accept checkout;
 * RECOVERY keeps working after checkout closes. Returns 'UNAVAILABLE' when the channel is not provisioned.
 */
async function loadBound(deps: HostedDeps, input: HostedInput, context: ChargeContext, purpose: 'ENTRY' | 'RECOVERY'): Promise<Bound | 'UNAVAILABLE' | null> {
  const binding = await deps.bindings.getProviderBinding(input.actorUserId, input.orderId);
  const verification = binding?.verification;
  if (!binding || verification?.contract !== 'HOSTED' || binding.orderId !== context.orderId
    || binding.contextId !== context.contextId || binding.quoteId !== context.quoteId || binding.quoteHash !== context.quoteHash
    || binding.provider !== 'PORTONE' || binding.environment !== context.environment || binding.billingCountry !== 'KR'
    || binding.scope.channel_type !== binding.environment || context.contextId === null || !UUID.test(context.contextId)
    || context.paymentId !== `web_${context.contextId}` || !context.verificationBindingPresent) return null;
  const flow = verification.checkoutFlow;
  const channel = deps.channels.resolve({ credentialRef: binding.credentialRef, environment: binding.environment,
    bindingVersion: binding.bindingVersion, checkoutFlow: flow });
  if (!channel || (purpose === 'ENTRY' && !channel.acceptsCheckout)) return 'UNAVAILABLE';
  if (!sameScope(binding.scope, scopeOf(channel))) return null;
  return { context, binding, channel, flow };
}

async function authorize(deps: HostedDeps, input: HostedInput): Promise<(Bound & { entryNotAfter: string }) | 'UNAVAILABLE' | null> {
  const before = await owned(deps, input);
  if (!before || before.reviewRequired || !live(before.quoteExpiresAt, deps.nowMs())) return null;
  if (!deps.continuationSecret || !await opened(deps, before.environment as PortOneEnvironment)) return 'UNAVAILABLE';
  const prepared = await deps.repository.prepareProviderContext(input.actorUserId, input.orderId);
  if (prepared.kind !== 'PREPARED' || prepared.provider !== 'PORTONE' || prepared.environment !== before.environment
    || prepared.orderId !== input.orderId || prepared.quoteId !== before.quoteId || prepared.quoteHash !== before.quoteHash
    || prepared.paymentId !== `web_${prepared.contextId}` || (before.contextId !== null && before.contextId !== prepared.contextId)) return null;
  const context = await owned(deps, input);
  if (!context || context.contextId !== prepared.contextId || context.paymentId !== prepared.paymentId
    || context.quoteHash !== prepared.quoteHash || context.environment !== before.environment) return null;
  const bound = await loadBound(deps, input, context, 'ENTRY');
  if (bound === 'UNAVAILABLE' || bound === null) return bound;
  if (!sameScope(bound.binding.scope, prepared.scope)) return null;
  const entry = await deps.entry.authorizeHostedEntry({ actorUserId: input.actorUserId, orderId: input.orderId,
    contextId: prepared.contextId, createRequestKey: prepared.createRequestKey, bindingHash: bound.binding.bindingHash });
  if (entry.kind !== 'AUTHORIZED' || entry.orderId !== input.orderId || entry.contextId !== prepared.contextId
    || entry.createRequestKey !== prepared.createRequestKey || entry.bindingHash !== bound.binding.bindingHash
    || entry.quoteHash !== context.quoteHash || entry.environment !== context.environment || entry.checkoutFlow !== bound.flow
    || !sameScope(bound.binding.scope, entry.scope) || !live(entry.entryNotAfter, deps.nowMs())
    || !live(context.quoteExpiresAt, deps.nowMs())) return null;
  return { ...bound, entryNotAfter: entry.entryNotAfter };
}

// The dedicated KakaoPay channel rejects an affirmative contradiction. Absent or unrecognized metadata stays unknown.
// The integrated PG window accepts whatever instrument it actually presented.
function contradictsFlow(flow: HostedFlow, method: ObservedPaymentMethod | null): boolean {
  return flow === 'KAKAOPAY_DIRECT_V1' && method !== null
    && (method.type !== 'EASY_PAY' || (method.easy_pay_provider !== undefined && method.easy_pay_provider !== 'KAKAOPAY'));
}

/** Records verified PAID facts only. Intake, grant and refund belong to the DB worker that re-verifies the provider. */
async function lookup(deps: HostedDeps, input: HostedInput, bound: Bound, txId?: string): Promise<void> {
  const value = await deps.transport.getPayment(bound.channel, bound.context.paymentId!);
  // A qualifying discount is accepted under the exact gross/paid/discount equation. The evidence keeps the gross order
  // amount; the DB worker re-verifies the paid and discount split before intake or refund.
  const observed = assessPortOnePayment(value, bound.context, facts(bound.channel), txId, { allowIssued: true, allowDiscount: true });
  if (!observed || observed.status !== 'PAID') return;
  const method = readPaidPaymentMethod(value);
  if (contradictsFlow(bound.flow, method)) return;
  const base = buildPortOnePaidEvidence(observed, bound.context, input.actorUserId);
  const recorded = await deps.repository.bindPaidObservation(bound.context.contextId!, base);
  if (recorded.kind !== 'RECORDED' || !method) return;
  await deps.repository.bindPaidObservation(bound.context.contextId!, buildPortOneMethodEvidence(base, method));
}

// The same logical return has the same delivery id, so retries replay one hint.
async function hint(deps: HostedDeps, input: HostedInput, bound: Bound, origin: string): Promise<void> {
  if (!deps.continuationSecret) return;
  const digest = createHmac('sha256', deps.continuationSecret)
    .update(['portone-hosted-return.v1', input.actorUserId, bound.context.paymentId, origin].join('|')).digest('hex');
  try {
    await deps.repository.receiveHostedEvent({ contract_version: HOSTED_EVENT_CONTRACT, source: 'RETURN', environment: bound.channel.environment,
      store_id: bound.channel.store_id, payment_id: bound.context.paymentId!, delivery_id: `return:${digest}`, event_type: 'RETURN',
      actor_user_id: input.actorUserId });
  } catch { /* The DB worker rechecks the provider when browser hints are lost. */ }
}

async function recover(deps: HostedDeps, input: HostedInput, context: ChargeContext, origin: string, txId?: string): Promise<HostedResult> {
  if (!context.submissionIntentRecorded) return closed(input, state(context) === 'NOT_SUBMITTED' ? 'NOT_SUBMITTED' : 'BLOCKED');
  const bound = await loadBound(deps, input, context, 'RECOVERY');
  if (bound === 'UNAVAILABLE') return closed(input, 'UNAVAILABLE');
  if (!bound) return closed(input, 'BLOCKED');
  try { await lookup(deps, input, bound, txId); } catch { /* An uncertain outcome stays pending. */ }
  await hint(deps, input, bound, origin);
  return getPortOneHostedStatus(deps, input);
}

export async function getPortOneHostedStatus(deps: HostedDeps, input: HostedInput): Promise<HostedResult> {
  try {
    const context = await owned(deps, input);
    return closed(input, context ? await currentState(deps, input, context) : 'BLOCKED');
  } catch { return closed(input, 'UNAVAILABLE'); }
}

export async function checkoutPortOneHosted(deps: HostedDeps, input: HostedInput): Promise<HostedResult> {
  try {
    const context = await owned(deps, input);
    if (!context) return closed(input, 'BLOCKED');
    // A recorded hosted outcome (deposit wait, cancellation, refund, failure or review) never releases a fresh launch.
    const override = await hostedOverride(deps, input);
    if (override) return closed(input, override);
    if (openState(deps, context) !== 'NOT_SUBMITTED') return closed(input, openState(deps, context));
    const bound = await authorize(deps, input);
    if (bound === 'UNAVAILABLE') return closed(input, 'UNAVAILABLE');
    if (!bound) return closed(input, 'BLOCKED');
    // Never release SDK settings after a concurrent request has recorded intent.
    if (state(bound.context) !== 'NOT_SUBMITTED') return closed(input, state(bound.context));
    const expiresAt = Date.parse(bound.entryNotAfter) < Date.parse(bound.context.quoteExpiresAt) ? bound.entryNotAfter : bound.context.quoteExpiresAt;
    const c = bound.channel;
    return { state: 'READY', orderId: input.orderId, environment: c.environment, productId: bound.context.productId, expiresAt,
      continuation: createHostedContinuation(deps.continuationSecret!, { actorUserId: input.actorUserId, orderId: input.orderId,
        paymentId: bound.context.paymentId! }, Date.parse(expiresAt) + CONTINUATION_GRACE_MS),
      sdk: { storeId: c.store_id, channelKey: c.channelKey, paymentId: bound.context.paymentId!, totalAmount: Number(bound.context.amountMinor),
        currency: 'KRW', payMethod: c.payMethod, easyPayProvider: c.easyPayProvider, buyer: c.buyer, productType: c.productType,
        virtualAccountValidHours: c.virtualAccountValidHours, giftCertificateType: c.giftCertificateType, isTestChannel: c.environment === 'TEST' } };
  } catch { return closed(input, 'UNAVAILABLE'); }
}

function sameLease(claim: ChargeLease, intent: ChargeLease, bound: Bound, now: number): boolean {
  return (['attemptId', 'leaseToken', 'fencingVersion', 'providerRequestKey', 'submitNotAfter', 'quoteHash'] as const)
    .every(key => claim[key] === intent[key]) && intent.quoteHash === bound.context.quoteHash
    && /^[1-9][0-9]{0,18}$/.test(intent.rowVersion) && BigInt(intent.rowVersion) > BigInt(claim.rowVersion)
    && live(intent.submitNotAfter, now) && live(bound.context.quoteExpiresAt, now);
}

export async function confirmPortOneHosted(deps: HostedDeps, input: HostedConfirmInput): Promise<HostedResult> {
  try {
    if (!deps.continuationSecret || !verifyHostedContinuation(deps.continuationSecret, input.continuation,
      { actorUserId: input.actorUserId, orderId: input.orderId, paymentId: input.paymentId }, deps.nowMs())) return closed(input, 'BLOCKED');
    const initial = await owned(deps, input);
    if (!initial || initial.paymentId !== input.paymentId) return closed(input, 'BLOCKED');
    // A duplicate mobile return after a recorded outcome reports it and never posts another confirmation.
    const override = await hostedOverride(deps, input);
    if (override) return closed(input, override);
    if (initial.settlementState === 'GRANTED' || initial.reviewRequired) return closed(input, state(initial));
    // Replays, reloads and app-switch returns after intent are lookup-only. There is never a second POST.
    if (state(initial) !== 'NOT_SUBMITTED') return recover(deps, input, initial, `confirm:${input.txId}`, input.txId);
    if (openState(deps, initial) === 'EXPIRED') return closed(input, 'EXPIRED');
    const bound = await authorize(deps, input);
    if (bound === 'UNAVAILABLE') return closed(input, 'UNAVAILABLE');
    if (!bound || bound.context.paymentId !== input.paymentId) return closed(input, 'BLOCKED');
    const value = await deps.transport.getPayment(bound.channel, input.paymentId);
    const observed = assessPortOnePayment(value, bound.context, facts(bound.channel), input.txId);
    if (!observed || contradictsFlow(bound.flow, readPaidPaymentMethod(value))) return closed(input, 'BLOCKED');
    // An already-paid order without native intent has no authorized manual confirmation to reconcile.
    if (observed.status === 'PAID') return closed(input, 'BLOCKED');
    if (!live(bound.entryNotAfter, deps.nowMs()) || !live(bound.context.quoteExpiresAt, deps.nowMs())) return closed(input, 'BLOCKED');
    const claimed = await deps.repository.claimCharge(input.actorUserId, input.orderId, bound.context.rowVersion);
    if (claimed.kind === 'LOOKUP_ONLY' || (claimed.kind === 'BLOCKED' && claimed.reason === 'LEASE_ACTIVE')) {
      const latest = await owned(deps, input);
      if (latest && claimed.kind === 'LOOKUP_ONLY') return recover(deps, input, latest, `confirm:${input.txId}`, input.txId);
      return closed(input, 'PENDING');
    }
    if (claimed.kind !== 'SUBMIT' || claimed.reason !== 'LEASE_CLAIMED' || claimed.lease.quoteHash !== bound.context.quoteHash
      || !live(claimed.lease.submitNotAfter, deps.nowMs())) return closed(input, 'BLOCKED');
    const intent = await deps.repository.recordSubmissionIntent(input.actorUserId, input.orderId, claimed.lease.rowVersion, claimed.lease);
    if (intent.kind === 'LOOKUP_ONLY') {
      const latest = await owned(deps, input);
      return latest ? recover(deps, input, latest, `confirm:${input.txId}`, input.txId) : closed(input, 'PENDING');
    }
    if (intent.kind === 'BLOCKED' && intent.reason === 'LEASE_ACTIVE') return closed(input, 'PENDING');
    if (intent.kind !== 'SUBMIT' || intent.reason !== 'INTENT_RECORDED' || !sameLease(claimed.lease, intent.lease, bound, deps.nowMs())
      || !live(bound.entryNotAfter, deps.nowMs())) return closed(input, 'BLOCKED');
    // The native intent is committed before this single attempt. Any failure becomes lookup-only forever.
    try {
      await deps.transport.confirmPayment(bound.channel, input.paymentId, { storeId: bound.channel.store_id, txId: input.txId,
        paymentToken: input.paymentToken, totalAmount: Number(bound.context.amountMinor), currency: 'KRW',
        ...(bound.channel.environment === 'TEST' ? { isTest: true as const } : {}) });
    } catch { /* A timeout or non-2xx response never permits a retry. */ }
    const latest = await owned(deps, input);
    if (!latest) return closed(input, 'PENDING');
    const result = await recover(deps, input, latest, `confirm:${input.txId}`, input.txId);
    return result.state === 'NOT_SUBMITTED' ? closed(input, 'PENDING') : result;
  } catch { return closed(input, 'UNAVAILABLE'); }
}

/** Lookup-only recovery for an unknown outcome, for example after an app switch. It never confirms or opens entry. */
export async function lookupPortOneHosted(deps: HostedDeps, input: HostedInput): Promise<HostedResult> {
  try {
    const context = await owned(deps, input);
    if (!context) return closed(input, 'BLOCKED');
    // Ended or refunding attempts need no provider read. A deposit wait is re-read in case the deposit arrived.
    const override = await hostedOverride(deps, input);
    if (override && override !== 'AWAITING_DEPOSIT') return closed(input, override);
    if (!override && (context.settlementState === 'GRANTED' || context.reviewRequired || state(context) === 'NOT_SUBMITTED')) {
      return closed(input, openState(deps, context));
    }
    return await recover(deps, input, context, 'lookup');
  } catch { return closed(input, 'UNAVAILABLE'); }
}
