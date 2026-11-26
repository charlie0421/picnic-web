import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PayPalEvidence } from './protocol';
import {
  OBSERVATION_REASON_CODES, parseIntakeWire, parsePreIntentResult, parseReadCompletionResult, parseReadOpenResult,
  parseSubmissionResult, type CallerAssertion, type PreIntentResult, type ReadActorKind, type ReadCompletionInput,
  type ReadCompletionResult, type ReadOpenResult, type SenderCapability, type SubmissionInput, type SubmissionResult,
} from './durability-contract';

export type ChargeContext = { chargeAuthority: false; orderId: string; provider: 'PAYPAL' | 'PORTONE';
  environment: 'LIVE' | 'SANDBOX' | 'TEST'; rowVersion: string; paymentState: 'NOT_SUBMITTED' | 'SUBMISSION_UNKNOWN';
  settlementState: 'NOT_INTAKE' | 'INTAKE_PENDING' | 'GRANTED'; actorDeleted: boolean; quoteId: string;
  quoteHash: string; productId: string; amountMinor: string; currency: 'USD' | 'KRW'; quantity: '1'; quoteExpiresAt: string;
  contextId: string | null; verificationBindingPresent: boolean; providerOrderId: string | null;
  providerCaptureId: string | null; paymentId: string | null; attemptId: string | null;
  submissionIntentRecorded: boolean; reviewRequired: boolean };
export type PreparedProviderContext = { kind: 'PREPARED'; replayed: boolean; contextId: string; orderId: string;
  quoteId: string; quoteHash: string; provider: 'PAYPAL' | 'PORTONE'; environment: 'LIVE' | 'SANDBOX' | 'TEST';
  scope: Record<string, string>; settingsVersion: string; createRequestKey: string; paymentId: string | null };
export type ChargeLease = { attemptId: string; leaseToken: string; fencingVersion: string; rowVersion: string;
  providerRequestKey: string; submitNotAfter: string; quoteHash: string };
export type ChargeCommand = { kind: 'SUBMIT'; reason: 'LEASE_CLAIMED' | 'INTENT_RECORDED'; lease: ChargeLease }
  | { kind: 'LOOKUP_ONLY'; attemptId: string | null; providerRequestKey: string | null; rowVersion: string; quoteHash: string }
  | { kind: 'BLOCKED'; reason: string; rowVersion: string | null };
export type ObservationResult = { kind: 'RECORDED'; observationId: string; replayed: boolean }
  | { kind: 'REVIEW_REQUIRED'; reason: string; observationId: string; replayed: boolean };
export type IntakeResult = { kind: 'INTAKE_PENDING'; replayed: boolean; orderId: string; inboxId: string;
  receiptId: string; coverage: 'SCOPE_ONLY'; grantEligible: false }
  | { kind: 'NOT_COMPLETED'; grantEligible: false } | { kind: 'REVIEW_REQUIRED'; reason: string; grantEligible: false };
export interface WebPaymentChargeRepository {
  getChargeContext(actorUserId: string, orderId: string): Promise<{ kind: 'NOT_FOUND' } | { kind: 'FOUND'; context: ChargeContext }>;
  prepareProviderContext(actorUserId: string, orderId: string): Promise<PreparedProviderContext | { kind: 'REFUSED'; code: string }>;
  bindProviderIdentity(contextId: string, evidence: PayPalEvidence): Promise<ObservationResult>;
  recordObservation(contextId: string, evidence: PayPalEvidence): Promise<ObservationResult>;
  claimCharge(actorUserId: string, orderId: string, expectedVersion: string): Promise<ChargeCommand>;
  recordSubmissionIntent(actorUserId: string, orderId: string, expectedVersion: string, lease: ChargeLease): Promise<ChargeCommand>;
  // Defined for compatibility. W2 workflows stop calling it; durable results receive inside S1/S3.
  receivePurchase(orderId: string, observationId: string): Promise<IntakeResult>;
  // S1-S4 durable result RPCs. Inputs are sent unchanged; outputs are closed unions.
  recordSubmissionResult(actorUserId: string, orderId: string, sender: SenderCapability,
    input: SubmissionInput): Promise<SubmissionResult>;
  openReadCycle(actorUserId: string, orderId: string, actorKind: ReadActorKind): Promise<ReadOpenResult>;
  completeReadCycle(cycleId: string, cycleToken: string, input: ReadCompletionInput): Promise<ReadCompletionResult>;
  recordPreIntentAssertions(actorUserId: string, orderId: string, assertions: CallerAssertion[]): Promise<PreIntentResult>;
}

export class ChargeRepositoryError extends Error {
  constructor(readonly stage: 'CONFIG' | 'RPC' | 'RESPONSE') { super('WEB_PAYMENT_CHARGE_UNAVAILABLE'); }
}
class PrepareRefusal extends Error {
  constructor(readonly code: string) { super('WEB_PAYMENT_PREPARE_REFUSED'); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const PROVIDER_ID = /^[A-Z0-9]{1,36}$/;
const POSITIVE = /^[1-9][0-9]{0,18}$/;
const SCOPE_VALUE = /^[A-Za-z0-9._:-]{1,200}$/;
const PREPARE_REFUSALS = new Set(['WEB_PAYMENT_ORDER_NOT_FOUND', 'WEB_PAYMENT_USER_DELETED', 'WEB_PAYMENT_ORDERS_CLOSED',
  'WEB_PAYMENT_QUOTE_EXPIRED', 'WEB_PAYMENT_PROVIDER_SCOPE_CHANGED', 'WEB_PAYMENT_PROVIDER_SCOPE_UNAVAILABLE',
  'WEB_PAYMENT_BINDING_CHANGED', 'WEB_PAYMENT_BINDING_SCOPE_MISMATCH', 'WEB_PAYMENT_TEST_ADMIN_REQUIRED']);
const BLOCKED_REASONS = new Set(['INPUT_INVALID', 'ACTION_INVALID', 'ACTOR_NOT_FOUND', 'ORDER_NOT_FOUND', 'ACTOR_DELETED',
  'VERSION_MISMATCH', 'ORDER_STATE_INVALID', 'SETTINGS_UNAVAILABLE', 'ENVIRONMENT_MISMATCH', 'CHARGE_CLOSED',
  'COUNTRY_NOT_ALLOWED', 'ACTOR_NOT_ALLOWED', 'POLICY_UNAVAILABLE', 'POLICY_NOT_ACCEPTED', 'QUOTE_INVALID', 'QUOTE_EXPIRED',
  'PRODUCT_UNAVAILABLE', 'ATTEMPT_BINDING_INVALID', 'REVIEW_REQUIRED', 'CONTEXT_REQUIRED', 'CONTEXT_INVALID',
  'VERIFICATION_BINDING_REQUIRED', 'VERIFICATION_BINDING_INVALID', 'VERIFICATION_BINDING_CHANGED', 'PROVIDER_SCOPE_CHANGED',
  'PROVIDER_ORDER_LINK_REQUIRED', 'LEASE_MISMATCH', 'LEASE_EXPIRED', 'LEASE_ACTIVE']);
const OBSERVATION_REASONS = OBSERVATION_REASON_CODES;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ChargeRepositoryError('RESPONSE');
  return value as Record<string, unknown>;
}
function requireValue(condition: unknown): asserts condition { if (!condition) throw new ChargeRepositoryError('RESPONSE'); }
function matches(value: unknown, regex: RegExp): value is string { return typeof value === 'string' && regex.exec(value)?.[0] === value; }
function positive(value: unknown): value is string {
  return matches(value, POSITIVE) && BigInt(value) <= BigInt('9223372036854775807');
}
function nullable(value: unknown, regex: RegExp): value is string | null { return value === null || matches(value, regex); }
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  requireValue(Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)));
}
function allowedKeys(value: Record<string, unknown>, keys: string[]) { requireValue(Object.keys(value).every(key => keys.includes(key))); }
function timestamp(value: unknown): value is string {
  if (!matches(value, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/)) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}
function providerEnvironment(provider: unknown, environment: unknown) {
  return (provider === 'PAYPAL' && (environment === 'LIVE' || environment === 'SANDBOX'))
    || (provider === 'PORTONE' && (environment === 'LIVE' || environment === 'TEST'));
}

function parseContext(value: unknown, orderId: string): { kind: 'NOT_FOUND' } | { kind: 'FOUND'; context: ChargeContext } {
  const d = record(value);
  requireValue(d.contract_version === 'web-payment-charge-context.v1' && d.charge_authority === false);
  if (d.outcome === 'NOT_FOUND') {
    exactKeys(d, ['contract_version', 'outcome', 'charge_authority']); return { kind: 'NOT_FOUND' };
  }
  exactKeys(d, ['contract_version', 'outcome', 'charge_authority', 'order_id', 'provider', 'environment', 'row_version',
    'payment_state', 'settlement_state', 'actor_deleted', 'quote_id', 'quote_hash', 'product_id', 'amount_minor', 'currency',
    'quantity', 'quote_expires_at', 'context_id', 'verification_binding_present', 'provider_order_id', 'provider_capture_id',
    'payment_id', 'attempt_id', 'submission_intent_recorded', 'review_required']);
  requireValue(d.outcome === 'FOUND' && matches(d.order_id, UUID) && d.order_id === orderId && providerEnvironment(d.provider, d.environment)
    && positive(d.row_version) && typeof d.payment_state === 'string' && ['NOT_SUBMITTED', 'SUBMISSION_UNKNOWN'].includes(d.payment_state)
    && typeof d.settlement_state === 'string' && ['NOT_INTAKE', 'INTAKE_PENDING', 'GRANTED'].includes(d.settlement_state) && typeof d.actor_deleted === 'boolean'
    && matches(d.quote_id, UUID) && matches(d.quote_hash, HASH) && typeof d.product_id === 'string' && d.product_id.length > 0 && d.product_id.length <= 200
    && positive(d.amount_minor) && d.currency === (d.provider === 'PAYPAL' ? 'USD' : 'KRW') && d.quantity === '1' && timestamp(d.quote_expires_at)
    && nullable(d.context_id, UUID) && typeof d.verification_binding_present === 'boolean' && nullable(d.provider_order_id, PROVIDER_ID)
    && nullable(d.provider_capture_id, PROVIDER_ID) && nullable(d.payment_id, /^web_[0-9a-f-]{36}$/) && nullable(d.attempt_id, UUID)
    && typeof d.submission_intent_recorded === 'boolean' && typeof d.review_required === 'boolean');
  requireValue(d.context_id !== null || (!d.verification_binding_present && d.provider_order_id === null && d.provider_capture_id === null && d.payment_id === null));
  requireValue(d.provider === 'PAYPAL' ? d.payment_id === null
    : d.provider_order_id === null && d.provider_capture_id === null && (d.context_id === null ? d.payment_id === null : d.payment_id === `web_${d.context_id}`));
  return { kind: 'FOUND', context: { chargeAuthority: false, orderId: d.order_id, provider: d.provider as ChargeContext['provider'],
    environment: d.environment as ChargeContext['environment'], rowVersion: d.row_version, paymentState: d.payment_state as ChargeContext['paymentState'],
    settlementState: d.settlement_state as ChargeContext['settlementState'], actorDeleted: d.actor_deleted,
    quoteId: d.quote_id, quoteHash: d.quote_hash, productId: d.product_id, amountMinor: d.amount_minor, currency: d.currency as 'USD' | 'KRW',
    quantity: '1', quoteExpiresAt: d.quote_expires_at, contextId: d.context_id, verificationBindingPresent: d.verification_binding_present,
    providerOrderId: d.provider_order_id, providerCaptureId: d.provider_capture_id, paymentId: d.payment_id, attemptId: d.attempt_id,
    submissionIntentRecorded: d.submission_intent_recorded, reviewRequired: d.review_required } };
}

function parsePrepared(value: unknown): PreparedProviderContext {
  const d = record(value);
  exactKeys(d, ['outcome', 'replayed', 'context_id', 'order_id', 'quote_id', 'quote_hash', 'provider', 'environment', 'scope', 'settings_version', 'create_request_key', 'payment_id']);
  const scope = record(d.scope);
  const keys = d.provider === 'PAYPAL' ? ['account_id', 'merchant_id'] : ['merchant_id', 'store_id', 'channel_id', 'channel_type'];
  exactKeys(scope, keys);
  requireValue(d.outcome === 'PREPARED' && typeof d.replayed === 'boolean' && matches(d.context_id, UUID) && matches(d.order_id, UUID)
    && matches(d.quote_id, UUID) && matches(d.quote_hash, HASH) && providerEnvironment(d.provider, d.environment)
    && keys.every(key => matches(scope[key], SCOPE_VALUE)) && positive(d.settings_version) && matches(d.create_request_key, UUID)
    && (d.provider === 'PAYPAL' ? d.payment_id === null : d.payment_id === `web_${d.context_id}` && scope.channel_type === d.environment));
  return { kind: 'PREPARED', replayed: d.replayed, contextId: d.context_id, orderId: d.order_id, quoteId: d.quote_id,
    quoteHash: d.quote_hash, provider: d.provider as PreparedProviderContext['provider'], environment: d.environment as PreparedProviderContext['environment'],
    scope: { ...scope } as Record<string, string>, settingsVersion: d.settings_version, createRequestKey: d.create_request_key, paymentId: d.payment_id as string | null };
}

function parseObservation(value: unknown): ObservationResult {
  const d = record(value); exactKeys(d, ['outcome', 'reason_code', 'trust', 'observation_id', 'replayed']);
  requireValue(d.trust === 'SERVER_REPORTED' && matches(d.observation_id, UUID) && typeof d.replayed === 'boolean');
  if (d.outcome === 'RECORDED' && d.reason_code === null) return { kind: 'RECORDED', observationId: d.observation_id, replayed: d.replayed };
  requireValue(d.outcome === 'REVIEW_REQUIRED' && typeof d.reason_code === 'string' && OBSERVATION_REASONS.has(d.reason_code));
  return { kind: 'REVIEW_REQUIRED', reason: d.reason_code, observationId: d.observation_id, replayed: d.replayed };
}

function parseCommand(value: unknown, submissionIntent: boolean): ChargeCommand {
  const d = record(value);
  if (d.decision === 'BLOCKED') {
    allowedKeys(d, ['decision', 'safe_reason_code', 'row_version']);
    requireValue(typeof d.safe_reason_code === 'string' && BLOCKED_REASONS.has(d.safe_reason_code)
      && (d.row_version === undefined || positive(d.row_version)) && (d.safe_reason_code !== 'VERSION_MISMATCH' || positive(d.row_version)));
    return { kind: 'BLOCKED', reason: d.safe_reason_code, rowVersion: d.row_version as string | undefined ?? null };
  }
  if (d.decision === 'LOOKUP_ONLY') {
    allowedKeys(d, ['decision', 'safe_reason_code', 'attempt_id', 'provider_request_key', 'fencing_version', 'row_version', 'quote_hash']);
    requireValue(d.safe_reason_code === 'SUBMISSION_UNKNOWN' && positive(d.row_version) && matches(d.quote_hash, HASH)
      && (d.attempt_id === undefined || matches(d.attempt_id, UUID)) && (d.provider_request_key === undefined || matches(d.provider_request_key, UUID))
      && (d.fencing_version === undefined || positive(d.fencing_version)));
    return { kind: 'LOOKUP_ONLY', attemptId: d.attempt_id as string | undefined ?? null,
      providerRequestKey: d.provider_request_key as string | undefined ?? null, rowVersion: d.row_version, quoteHash: d.quote_hash };
  }
  exactKeys(d, ['decision', 'safe_reason_code', 'attempt_id', 'lease_token', 'fencing_version', 'row_version', 'provider_request_key', 'submit_not_after', 'quote_hash']);
  const expectedReason = submissionIntent ? 'INTENT_RECORDED' : 'LEASE_CLAIMED';
  requireValue(d.decision === 'SUBMIT' && d.safe_reason_code === expectedReason
    && matches(d.attempt_id, UUID) && matches(d.lease_token, UUID) && positive(d.fencing_version) && positive(d.row_version)
    && matches(d.provider_request_key, UUID) && timestamp(d.submit_not_after) && matches(d.quote_hash, HASH));
  return { kind: 'SUBMIT', reason: expectedReason, lease: { attemptId: d.attempt_id, leaseToken: d.lease_token,
    fencingVersion: d.fencing_version, rowVersion: d.row_version, providerRequestKey: d.provider_request_key,
    submitNotAfter: d.submit_not_after, quoteHash: d.quote_hash } };
}

// Every parse failure, including an unexpected runtime error inside a parser, closes as RESPONSE
// with a fixed message. The wire value never enters the error.
export function projectWireResponse<T>(parse: () => T): T {
  try { return parse(); } catch { throw new ChargeRepositoryError('RESPONSE'); }
}

// Native receive result, including the durable INTAKE_HELD refusal.
function parseIntake(value: unknown, orderId: string): IntakeResult {
  return projectWireResponse(() => parseIntakeWire(value, orderId));
}

// Shared safe service RPC envelope: one request, no SDK retry, a ten-second deadline, sanitized errors.
async function serviceRpc(client: SupabaseClient, name: string, args: Record<string, unknown>, prepare: boolean): Promise<unknown> {
  let response;
  try { response = await client.rpc(name, args).retry(false).abortSignal(AbortSignal.timeout(10_000)); }
  catch { throw new ChargeRepositoryError('RPC'); }
  if (response.error) {
    const error = response.error;
    if (prepare && error.code === 'P0001' && PREPARE_REFUSALS.has(error.message)) throw new PrepareRefusal(error.message);
    throw new ChargeRepositoryError('RPC');
  }
  return response.data;
}
export function callWebPaymentServiceRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  return serviceRpc(client, name, args, false);
}

export function createWebPaymentChargeRepository(client: SupabaseClient, action: 'CAPTURE' | 'CONFIRM' = 'CAPTURE'): WebPaymentChargeRepository {
  const rpc = (name: string, args: Record<string, unknown>, prepare = false) => serviceRpc(client, name, args, prepare);
  const actorArgs = (actorUserId: string, orderId: string) => ({ p_actor_user_id: actorUserId, p_order_id: orderId });
  return {
    async getChargeContext(actorUserId, orderId) {
      return parseContext(await rpc('get_web_payment_charge_context', actorArgs(actorUserId, orderId)), orderId);
    },
    async prepareProviderContext(actorUserId, orderId) {
      try { return parsePrepared(await rpc('prepare_web_payment_provider_context', actorArgs(actorUserId, orderId), true)); }
      catch (error) {
        if (error instanceof PrepareRefusal) return { kind: 'REFUSED', code: error.code };
        throw error;
      }
    },
    async bindProviderIdentity(contextId, evidence) { return parseObservation(await rpc('bind_web_payment_provider_identity', { p_context_id: contextId, p_evidence: evidence })); },
    async recordObservation(contextId, evidence) { return parseObservation(await rpc('record_web_payment_observation', { p_context_id: contextId, p_evidence: evidence })); },
    async claimCharge(actorUserId, orderId, expectedVersion) {
      return parseCommand(await rpc('claim_web_payment_charge', { ...actorArgs(actorUserId, orderId), p_expected_version: expectedVersion, p_action: action }), false);
    },
    async recordSubmissionIntent(actorUserId, orderId, expectedVersion, lease) {
      return parseCommand(await rpc('record_web_payment_submission_intent', { ...actorArgs(actorUserId, orderId), p_expected_version: expectedVersion,
        p_action: action, p_attempt_id: lease.attemptId, p_lease_token: lease.leaseToken, p_fencing_version: lease.fencingVersion }), true);
    },
    async receivePurchase(orderId, observationId) { return parseIntake(await rpc('receive_web_payment_purchase', { p_order_id: orderId, p_observation_id: observationId }), orderId); },
    // S1. Only the fixed intent sender tuple is sent; other lease fields stay in memory.
    async recordSubmissionResult(actorUserId, orderId, sender, input) {
      const data = await rpc('record_web_payment_submission_result', { ...actorArgs(actorUserId, orderId),
        p_attempt_id: sender.attemptId, p_lease_token: sender.leaseToken, p_fencing_version: sender.fencingVersion,
        p_classification: input });
      return projectWireResponse(() => parseSubmissionResult(data, orderId));
    },
    // S2. The OPENED cycle token is returned to the caller's memory only.
    async openReadCycle(actorUserId, orderId, actorKind) {
      const data = await rpc('open_web_payment_read_cycle', { ...actorArgs(actorUserId, orderId), p_actor_kind: actorKind });
      return projectWireResponse(() => parseReadOpenResult(data));
    },
    // S3. A COMPLETED result must name the requested cycle.
    async completeReadCycle(cycleId, cycleToken, input) {
      const data = await rpc('complete_web_payment_read_cycle', { p_cycle_id: cycleId, p_cycle_token: cycleToken, p_completion: input });
      return projectWireResponse(() => parseReadCompletionResult(data, cycleId));
    },
    // S4.
    async recordPreIntentAssertions(actorUserId, orderId, assertions) {
      const data = await rpc('record_web_payment_preintent_assertions', { ...actorArgs(actorUserId, orderId), p_assertions: assertions });
      return projectWireResponse(() => parsePreIntentResult(data));
    },
  };
}

export function createServiceChargeRepository(): WebPaymentChargeRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ChargeRepositoryError('CONFIG');
  try {
    return createWebPaymentChargeRepository(createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (target, init) => fetch(target, { ...init, cache: 'no-store' }) },
    }));
  } catch { throw new ChargeRepositoryError('CONFIG'); }
}
