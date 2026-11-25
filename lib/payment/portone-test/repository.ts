import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callWebPaymentServiceRpc, ChargeRepositoryError, createWebPaymentChargeRepository, type ObservationResult } from '../paypal-charge/repository';
import type { PortOneTestScope } from './config';
import { boundedId, record, UUID, type PortOnePaidEvidence } from './protocol';

export type PortOneTestBinding = { orderId: string; contextId: string; quoteId: string; quoteHash: string;
  provider: 'PORTONE'; environment: 'TEST'; billingCountry: 'KR'; scope: PortOneTestScope;
  bindingId: string; bindingVersion: string; bindingHash: string; credentialRef: string };
const HASH = /^[0-9a-f]{64}$/;
function requireValue(value: unknown): asserts value { if (!value) throw new ChargeRepositoryError('RESPONSE'); }
export function createPortOneTestBindings(client: SupabaseClient) {
  return { async getProviderBinding(actorUserId: string, orderId: string): Promise<PortOneTestBinding | null> {
    if (!UUID.test(actorUserId) || !UUID.test(orderId)) throw new ChargeRepositoryError('CONFIG');
    const d = record(await callWebPaymentServiceRpc(client, 'get_web_payment_provider_binding', { p_actor_user_id: actorUserId, p_order_id: orderId }));
    requireValue(d && d.contract_version === 'web-payment-provider-binding.v1' && d.charge_authority === false);
    if (['NOT_FOUND', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED'].includes(String(d.outcome))) {
      requireValue(Object.keys(d).length === 3); return null;
    }
    const keys = ['contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id', 'quote_id', 'quote_hash', 'provider',
      'environment', 'billing_country', 'scope', 'binding_id', 'binding_version', 'binding_hash', 'credential_ref', 'expected_application'];
    const scope = record(d.scope);
    requireValue(Object.keys(d).length === keys.length && keys.every(key => Object.hasOwn(d, key))
      && d.outcome === 'FOUND' && d.order_id === orderId && typeof d.context_id === 'string' && UUID.test(d.context_id)
      && typeof d.quote_id === 'string' && UUID.test(d.quote_id) && typeof d.quote_hash === 'string' && HASH.test(d.quote_hash)
      && d.provider === 'PORTONE' && d.environment === 'TEST' && d.billing_country === 'KR'
      && typeof d.binding_id === 'string' && UUID.test(d.binding_id)
      && typeof d.binding_version === 'string' && /^[1-9][0-9]{0,18}$/.test(d.binding_version)
      && BigInt(d.binding_version) <= BigInt('9223372036854775807') && typeof d.binding_hash === 'string' && HASH.test(d.binding_hash)
      && typeof d.credential_ref === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(d.credential_ref)
      && d.expected_application === null && scope && Object.keys(scope).length === 4
      && boundedId(scope.merchant_id) && boundedId(scope.store_id) && boundedId(scope.channel_id) && scope.channel_type === 'TEST');
    return { orderId, contextId: d.context_id, quoteId: d.quote_id, quoteHash: d.quote_hash,
      provider: 'PORTONE', environment: 'TEST', billingCountry: 'KR', scope: { merchant_id: scope.merchant_id as string,
        store_id: scope.store_id as string, channel_id: scope.channel_id as string, channel_type: 'TEST' },
      bindingId: d.binding_id, bindingVersion: d.binding_version, bindingHash: d.binding_hash, credentialRef: d.credential_ref };
  } };
}
export function createPortOneTestRepository(client: SupabaseClient) {
  const native = createWebPaymentChargeRepository(client, 'CONFIRM');
  return {
    getChargeContext: native.getChargeContext, prepareProviderContext: native.prepareProviderContext,
    claimCharge: native.claimCharge, recordSubmissionIntent: native.recordSubmissionIntent, receivePurchase: native.receivePurchase,
    async bindPaidObservation(contextId: string, evidence: PortOnePaidEvidence): Promise<ObservationResult> {
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
