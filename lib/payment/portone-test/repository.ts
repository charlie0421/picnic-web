import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callWebPaymentServiceRpc, ChargeRepositoryError, createWebPaymentChargeRepository, type ObservationResult } from '../paypal-charge/repository';
import { parseBoundPaymentMethod, type ObservedPaymentMethod, type PortOneMethodEvidence } from './payment-method';
import { boundedId, record, UUID, type PortOneEnvironment, type PortOnePaidEvidence, type PortOneScope } from './protocol';

/** LEGACY keeps the v1 evidence contract. HOSTED orders record actual method facts and keep financial authority closed. */
export type PortOneVerification = { contract: 'LEGACY' }
  | { contract: 'HOSTED'; checkoutFlow: 'PG_HOSTED_V1' | 'KAKAOPAY_DIRECT_V1'; paymentMethod: ObservedPaymentMethod | null };
// Only a v2 binding can be LIVE. Its channel type always equals its environment.
export type PortOneTestBinding = { orderId: string; contextId: string; quoteId: string; quoteHash: string;
  provider: 'PORTONE'; environment: PortOneEnvironment; billingCountry: 'KR'; scope: PortOneScope;
  bindingId: string; bindingVersion: string; bindingHash: string; credentialRef: string; verification: PortOneVerification };
const HASH = /^[0-9a-f]{64}$/;
const CLOSED = ['NOT_FOUND', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED'];
const V1_KEYS = ['contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id', 'quote_id', 'quote_hash', 'provider',
  'environment', 'billing_country', 'scope', 'binding_id', 'binding_version', 'binding_hash', 'credential_ref', 'expected_application'];
const V2_KEYS = [...V1_KEYS, 'binding_contract_version', 'checkout_flow', 'payment_method'];
function requireValue(value: unknown): asserts value { if (!value) throw new ChargeRepositoryError('RESPONSE'); }

// The same envelope as the shared service RPC. Only PostgREST PGRST202 (function not in the schema) is reported
// as absent. Every other failure, including permission and transport errors, closes as RPC.
async function readOptionalRpc(client: SupabaseClient, name: string, args: Record<string, unknown>):
  Promise<{ absent: true } | { absent: false; data: unknown }> {
  let response;
  try { response = await client.rpc(name, args).retry(false).abortSignal(AbortSignal.timeout(10_000)); }
  catch { throw new ChargeRepositoryError('RPC'); }
  if (response.error) {
    if (response.error.code === 'PGRST202') return { absent: true };
    throw new ChargeRepositoryError('RPC');
  }
  return { absent: false, data: response.data };
}

// The exact UTF-8 Postgres jsonb::text of the v1 verification binding document that the DB trigger hashes:
// keys sorted by length then bytes, ": " and ", " separators. Each value is re-checked against a charset with no
// quote, backslash or control character, so the template needs no escaping.
const DOCUMENT_VALUE = /^[A-Za-z0-9._:-]{1,200}$/;
function legacyBindingDocument(binding: PortOneTestBinding): string {
  const s = binding.scope;
  requireValue([binding.bindingId, binding.credentialRef, binding.bindingVersion, s.store_id, s.channel_id, s.merchant_id]
    .every(value => DOCUMENT_VALUE.test(value)));
  return `{"provider": "PORTONE", "binding_id": "${binding.bindingId}", "environment": "TEST", `
    + `"credential_ref": "${binding.credentialRef}", "expected_scope": {"store_id": "${s.store_id}", `
    + `"channel_id": "${s.channel_id}", "merchant_id": "${s.merchant_id}", "channel_type": "TEST"}, `
    + `"binding_version": "${binding.bindingVersion}", "contract_version": "web-payment-verification-binding.v1", `
    + `"expected_application": null}`;
}
function parseBinding(value: unknown, orderId: string, version: 'v1' | 'v2'): PortOneTestBinding | null {
  const d = record(value);
  requireValue(d && d.contract_version === `web-payment-provider-binding.${version}` && d.charge_authority === false);
  if (CLOSED.includes(String(d.outcome))) {
    requireValue(Object.keys(d).length === 3); return null;
  }
  const keys = version === 'v1' ? V1_KEYS : V2_KEYS;
  const scope = record(d.scope);
  const environment: PortOneEnvironment | null = d.environment === 'TEST' ? 'TEST'
    : version === 'v2' && d.environment === 'LIVE' ? 'LIVE' : null;
  requireValue(Object.keys(d).length === keys.length && keys.every(key => Object.hasOwn(d, key))
    && d.outcome === 'FOUND' && d.order_id === orderId && typeof d.context_id === 'string' && UUID.test(d.context_id)
    && typeof d.quote_id === 'string' && UUID.test(d.quote_id) && typeof d.quote_hash === 'string' && HASH.test(d.quote_hash)
    && d.provider === 'PORTONE' && environment !== null && d.billing_country === 'KR'
    && typeof d.binding_id === 'string' && UUID.test(d.binding_id)
    && typeof d.binding_version === 'string' && /^[1-9][0-9]{0,18}$/.test(d.binding_version)
    && BigInt(d.binding_version) <= BigInt('9223372036854775807') && typeof d.binding_hash === 'string' && HASH.test(d.binding_hash)
    && typeof d.credential_ref === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(d.credential_ref)
    && d.expected_application === null && scope && Object.keys(scope).length === 4
    && boundedId(scope.merchant_id) && boundedId(scope.store_id) && boundedId(scope.channel_id) && scope.channel_type === environment);
  let verification: PortOneVerification = { contract: 'LEGACY' };
  if (version === 'v2') {
    if (d.binding_contract_version === 'web-payment-verification-binding.v1') {
      requireValue(d.checkout_flow === null && d.payment_method === null);
    } else {
      // A hosted order is never downgraded: an unknown contract, flow or method closes the read.
      requireValue(d.binding_contract_version === 'web-payment-verification-binding.v2'
        && (d.checkout_flow === 'PG_HOSTED_V1' || d.checkout_flow === 'KAKAOPAY_DIRECT_V1'));
      const paymentMethod = parseBoundPaymentMethod(d.payment_method);
      requireValue(paymentMethod !== undefined);
      verification = { contract: 'HOSTED', checkoutFlow: d.checkout_flow, paymentMethod };
    }
  }
  // LIVE exists only for hosted orders. The legacy contract stays a TEST drill.
  requireValue(environment === 'TEST' || verification.contract === 'HOSTED');
  return { orderId, contextId: d.context_id, quoteId: d.quote_id, quoteHash: d.quote_hash,
    provider: 'PORTONE', environment, billingCountry: 'KR', scope: { merchant_id: scope.merchant_id as string,
      store_id: scope.store_id as string, channel_id: scope.channel_id as string, channel_type: environment },
    bindingId: d.binding_id, bindingVersion: d.binding_version, bindingHash: d.binding_hash, credentialRef: d.credential_ref, verification };
}

export function createPortOneTestBindings(client: SupabaseClient) {
  return { async getProviderBinding(actorUserId: string, orderId: string): Promise<PortOneTestBinding | null> {
    if (!UUID.test(actorUserId) || !UUID.test(orderId)) throw new ChargeRepositoryError('CONFIG');
    const args = { p_actor_user_id: actorUserId, p_order_id: orderId };
    const v2 = await readOptionalRpc(client, 'get_web_payment_provider_binding_v2', args);
    if (!v2.absent) return parseBinding(v2.data, orderId, 'v2');
    // PGRST202 only means the v2 function is absent from the PostgREST schema cache. The DB may already hold a
    // hosted binding, and v1 returns it in the v1 shape with its v2-derived hash. A FOUND v1 binding is legacy only
    // when its returned hash proves the exact canonical v1 document.
    const legacy = parseBinding(await callWebPaymentServiceRpc(client, 'get_web_payment_provider_binding', args), orderId, 'v1');
    if (legacy) {
      requireValue(createHash('sha256').update(legacyBindingDocument(legacy), 'utf8').digest('hex') === legacy.bindingHash);
    }
    return legacy;
  } };
}
export function createPortOneTestRepository(client: SupabaseClient) {
  const native = createWebPaymentChargeRepository(client, 'CONFIRM');
  return {
    getChargeContext: native.getChargeContext, prepareProviderContext: native.prepareProviderContext,
    claimCharge: native.claimCharge, recordSubmissionIntent: native.recordSubmissionIntent, receivePurchase: native.receivePurchase,
    // PAID LOOKUP evidence, with or without type-only method facts, uses only the identity binding RPC.
    async bindPaidObservation(contextId: string, evidence: PortOnePaidEvidence | PortOneMethodEvidence): Promise<ObservationResult> {
      const d = record(await callWebPaymentServiceRpc(client, 'bind_web_payment_provider_identity', { p_context_id: contextId, p_evidence: evidence }));
      requireValue(d && Object.keys(d).length === 5 && d.trust === 'SERVER_REPORTED' && typeof d.observation_id === 'string'
        && UUID.test(d.observation_id) && typeof d.replayed === 'boolean');
      if (d.outcome === 'RECORDED' && d.reason_code === null) return { kind: 'RECORDED', observationId: d.observation_id, replayed: d.replayed };
      requireValue(d.outcome === 'REVIEW_REQUIRED' && boundedId(d.reason_code));
      return { kind: 'REVIEW_REQUIRED', reason: d.reason_code, observationId: d.observation_id, replayed: d.replayed };
    },
    async getWebhookOrder(paymentId: string): Promise<{ actorUserId: string; orderId: string } | null> {
      const result = await callWebPaymentServiceRpc(client, 'get_portone_test_webhook_order', { p_payment_id: paymentId });
      if (result === null) return null;
      const d = record(result);
      requireValue(d && Object.keys(d).length === 2 && typeof d.order_id === 'string' && UUID.test(d.order_id)
        && typeof d.user_id === 'string' && UUID.test(d.user_id));
      return { actorUserId: d.user_id, orderId: d.order_id };
    },
  };
}
