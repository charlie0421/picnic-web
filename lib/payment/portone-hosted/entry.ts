import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChargeRepositoryError } from '../paypal-charge/repository';
import type { ProviderEntryInput } from '../paypal-charge/provider-entry';
import type { PortOneEnvironment, PortOneScope } from '../portone-test/protocol';
import type { HostedFlow } from './config';

export type HostedEntryDecision =
  | { kind: 'AUTHORIZED'; orderId: string; contextId: string; createRequestKey: string; quoteHash: string; bindingHash: string;
      entryNotAfter: string; checkoutFlow: HostedFlow; environment: PortOneEnvironment; scope: PortOneScope }
  | { kind: 'NOT_FOUND' }
  | { kind: 'BLOCKED'; reason: string };
export interface HostedEntryGate { authorizeHostedEntry(input: ProviderEntryInput): Promise<HostedEntryDecision> }

const CONTRACT = 'web-payment-hosted-entry.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const REASON = /^[A-Z][A-Z_]{0,63}$/;
const TIMESTAMP = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/;
const AUTHORIZED_KEYS = ['contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id', 'create_request_key', 'quote_hash',
  'binding_hash', 'entry_not_after', 'checkout_flow', 'environment', 'scope'];

function requireValue(condition: unknown): asserts condition { if (!condition) throw new ChargeRepositoryError('RESPONSE'); }
function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.test(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  requireValue(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function calendarTimestamp(value: unknown): value is string {
  const match = typeof value === 'string' ? TIMESTAMP.exec(value) : null;
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// ORDER_LINKED belongs to the PayPal provider-entry contract. A hosted gate treats it as unavailable.
export function parseHostedEntry(value: unknown, input: ProviderEntryInput): HostedEntryDecision {
  const d = object(value);
  requireValue(d.contract_version === CONTRACT && d.charge_authority === false);
  if (d.outcome === 'NOT_FOUND') { exactKeys(d, ['contract_version', 'outcome', 'charge_authority']); return { kind: 'NOT_FOUND' }; }
  if (d.outcome === 'BLOCKED') {
    exactKeys(d, ['contract_version', 'outcome', 'charge_authority', 'safe_reason_code']);
    requireValue(matches(d.safe_reason_code, REASON));
    return { kind: 'BLOCKED', reason: d.safe_reason_code };
  }
  exactKeys(d, AUTHORIZED_KEYS);
  const scope = object(d.scope);
  exactKeys(scope, ['merchant_id', 'store_id', 'channel_id', 'channel_type']);
  const environment: PortOneEnvironment | null = d.environment === 'TEST' ? 'TEST' : d.environment === 'LIVE' ? 'LIVE' : null;
  const flow: HostedFlow | null = d.checkout_flow === 'PG_HOSTED_V1' ? 'PG_HOSTED_V1'
    : d.checkout_flow === 'KAKAOPAY_DIRECT_V1' ? 'KAKAOPAY_DIRECT_V1' : null;
  requireValue(d.outcome === 'AUTHORIZED' && environment && flow
    && matches(d.order_id, UUID) && d.order_id === input.orderId && matches(d.context_id, UUID) && d.context_id === input.contextId
    && matches(d.create_request_key, UUID) && d.create_request_key === input.createRequestKey
    && matches(d.binding_hash, HASH) && d.binding_hash === input.bindingHash && matches(d.quote_hash, HASH)
    && calendarTimestamp(d.entry_not_after) && matches(scope.merchant_id, ID) && matches(scope.store_id, ID)
    && matches(scope.channel_id, ID) && scope.channel_type === environment);
  return { kind: 'AUTHORIZED', orderId: d.order_id, contextId: d.context_id, createRequestKey: d.create_request_key,
    quoteHash: d.quote_hash, bindingHash: d.binding_hash, entryNotAfter: d.entry_not_after, checkoutFlow: flow, environment,
    scope: { merchant_id: scope.merchant_id as string, store_id: scope.store_id as string, channel_id: scope.channel_id as string,
      channel_type: environment } };
}

/** Service-only hosted entry decision. It never grants charge authority; CONFIRM still needs the native lease and intent. */
export function createHostedEntryGate(client: SupabaseClient): HostedEntryGate {
  return {
    async authorizeHostedEntry(input) {
      const snapshot = { actorUserId: input?.actorUserId, orderId: input?.orderId, contextId: input?.contextId,
        createRequestKey: input?.createRequestKey, bindingHash: input?.bindingHash };
      if (!matches(snapshot.actorUserId, UUID) || !matches(snapshot.orderId, UUID) || !matches(snapshot.contextId, UUID)
        || !matches(snapshot.createRequestKey, UUID) || !matches(snapshot.bindingHash, HASH)) throw new ChargeRepositoryError('CONFIG');
      let response;
      try {
        response = await client.rpc('authorize_web_payment_hosted_entry', { p_actor_user_id: snapshot.actorUserId,
          p_order_id: snapshot.orderId, p_context_id: snapshot.contextId, p_create_request_key: snapshot.createRequestKey,
          p_binding_hash: snapshot.bindingHash }).retry(false).abortSignal(AbortSignal.timeout(10_000));
      } catch { throw new ChargeRepositoryError('RPC'); }
      if (response.error || response.status !== 200) throw new ChargeRepositoryError('RPC');
      try { return parseHostedEntry(response.data, snapshot as ProviderEntryInput); }
      catch { throw new ChargeRepositoryError('RESPONSE'); }
    },
  };
}
