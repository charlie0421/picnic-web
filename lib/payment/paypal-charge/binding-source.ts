import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeBindingSource, ProviderChargeBinding } from './orchestrator';
import { ChargeRepositoryError } from './repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const COUNTRY = /^[A-Z]{2}$/;
const SCOPE_VALUE = /^[A-Za-z0-9._:-]{1,200}$/;
const POSITIVE = /^[1-9][0-9]{0,18}$/;
const CREDENTIAL_REF = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
type BindingResult = Awaited<ReturnType<ChargeBindingSource['getProviderBinding']>>;

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new ChargeRepositoryError('RESPONSE');
}

function record(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  requireValue(Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)));
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

function bindingVersion(value: unknown): value is string {
  return matches(value, POSITIVE) && BigInt(value) <= BigInt('9223372036854775807');
}

function parseBinding(value: unknown, orderId: string): BindingResult {
  const data = record(value);
  requireValue(data.contract_version === 'web-payment-provider-binding.v1' && data.charge_authority === false);
  if (data.outcome === 'NOT_FOUND' || data.outcome === 'CONTEXT_REQUIRED'
    || data.outcome === 'VERIFICATION_BINDING_REQUIRED') {
    exactKeys(data, ['contract_version', 'outcome', 'charge_authority']);
    return { kind: data.outcome };
  }

  exactKeys(data, ['contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id', 'quote_id',
    'quote_hash', 'provider', 'environment', 'billing_country', 'scope', 'binding_id', 'binding_version',
    'binding_hash', 'credential_ref', 'expected_application']);
  requireValue(data.outcome === 'FOUND' && matches(data.order_id, UUID) && data.order_id === orderId
    && matches(data.context_id, UUID) && matches(data.quote_id, UUID) && matches(data.quote_hash, HASH)
    && data.provider === 'PAYPAL' && (data.environment === 'LIVE' || data.environment === 'SANDBOX')
    && matches(data.billing_country, COUNTRY) && matches(data.binding_id, UUID)
    && bindingVersion(data.binding_version) && matches(data.binding_hash, HASH)
    && matches(data.credential_ref, CREDENTIAL_REF));

  const scope = record(data.scope);
  exactKeys(scope, ['account_id', 'merchant_id']);
  requireValue(matches(scope.account_id, SCOPE_VALUE) && matches(scope.merchant_id, SCOPE_VALUE));
  const application = record(data.expected_application);
  exactKeys(application, ['paypal_client_id']);
  requireValue(matches(application.paypal_client_id, SCOPE_VALUE));

  const binding: ProviderChargeBinding = {
    orderId: data.order_id, contextId: data.context_id, provider: 'PAYPAL', environment: data.environment,
    billingCountry: data.billing_country, scope: { account_id: scope.account_id, merchant_id: scope.merchant_id },
    bindingId: data.binding_id, bindingVersion: data.binding_version, bindingHash: data.binding_hash,
    credentialRef: data.credential_ref, expectedPayPalClientId: application.paypal_client_id,
  };
  return binding;
}

export function createRpcChargeBindingSource(client: SupabaseClient): ChargeBindingSource {
  return {
    async getProviderBinding(actorUserId, orderId) {
      if (!matches(actorUserId, UUID) || !matches(orderId, UUID)) throw new ChargeRepositoryError('CONFIG');
      let response;
      try {
        response = await client.rpc('get_web_payment_provider_binding', {
          p_actor_user_id: actorUserId, p_order_id: orderId,
        }).retry(false).abortSignal(AbortSignal.timeout(10_000));
      } catch {
        throw new ChargeRepositoryError('RPC');
      }
      if (response.error) throw new ChargeRepositoryError('RPC');
      return parseBinding(response.data, orderId);
    },
  };
}
