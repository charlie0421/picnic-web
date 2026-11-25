import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChargeRepositoryError } from './repository';

export type ProviderEntryBlockedReason =
  | 'INPUT_INVALID' | 'PROVIDER_UNSUPPORTED' | 'CONTEXT_REQUIRED' | 'VERIFICATION_BINDING_REQUIRED'
  | 'CONTEXT_MISMATCH' | 'BINDING_MISMATCH' | 'ORDER_STATE_INVALID' | 'ACTOR_DELETED'
  | 'SETTINGS_UNAVAILABLE' | 'ENVIRONMENT_MISMATCH' | 'ORDERS_CLOSED' | 'CHARGE_CLOSED'
  | 'COUNTRY_NOT_ALLOWED' | 'ACTOR_NOT_ALLOWED' | 'POLICY_UNAVAILABLE' | 'POLICY_NOT_ACCEPTED'
  | 'QUOTE_EXPIRED' | 'PRODUCT_UNAVAILABLE' | 'REVIEW_REQUIRED' | 'VERIFICATION_BINDING_CHANGED'
  | 'PROVIDER_SCOPE_CHANGED' | 'SETTINGS_CHANGED';

export type ProviderEntryInput = {
  actorUserId: string; orderId: string; contextId: string; createRequestKey: string; bindingHash: string;
};

export type ProviderEntryDecision =
  | { kind: 'AUTHORIZED'; orderId: string; contextId: string; createRequestKey: string;
      quoteHash: string; bindingHash: string; entryNotAfter: string }
  | { kind: 'ORDER_LINKED' }
  | { kind: 'NOT_FOUND' }
  | { kind: 'BLOCKED'; reason: ProviderEntryBlockedReason };

export interface ProviderEntryGate {
  authorizeProviderEntry(input: ProviderEntryInput): Promise<ProviderEntryDecision>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const TIMESTAMP = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/;
const BLOCKED_REASONS = new Set<ProviderEntryBlockedReason>([
  'INPUT_INVALID', 'PROVIDER_UNSUPPORTED', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED',
  'CONTEXT_MISMATCH', 'BINDING_MISMATCH', 'ORDER_STATE_INVALID', 'ACTOR_DELETED',
  'SETTINGS_UNAVAILABLE', 'ENVIRONMENT_MISMATCH', 'ORDERS_CLOSED', 'CHARGE_CLOSED',
  'COUNTRY_NOT_ALLOWED', 'ACTOR_NOT_ALLOWED', 'POLICY_UNAVAILABLE', 'POLICY_NOT_ACCEPTED',
  'QUOTE_EXPIRED', 'PRODUCT_UNAVAILABLE', 'REVIEW_REQUIRED', 'VERIFICATION_BINDING_CHANGED', 'PROVIDER_SCOPE_CHANGED', 'SETTINGS_CHANGED',
]);

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new ChargeRepositoryError('RESPONSE');
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

function record(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  requireValue(Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)));
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP.exec(value);
  if (!match || match[0] !== value) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Calendar arithmetic avoids date normalization and Date.UTC's remapping of years 0..99.
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

function blockedReason(value: unknown): value is ProviderEntryBlockedReason {
  return typeof value === 'string' && BLOCKED_REASONS.has(value as ProviderEntryBlockedReason);
}

function parseEntry(value: unknown, input: ProviderEntryInput): ProviderEntryDecision {
  const data = record(value);
  requireValue(data.contract_version === 'web-payment-provider-entry.v1' && data.charge_authority === false);
  if (data.outcome === 'NOT_FOUND' || data.outcome === 'ORDER_LINKED') {
    exactKeys(data, ['contract_version', 'outcome', 'charge_authority']);
    return { kind: data.outcome };
  }
  if (data.outcome === 'BLOCKED') {
    exactKeys(data, ['contract_version', 'outcome', 'charge_authority', 'safe_reason_code']);
    requireValue(blockedReason(data.safe_reason_code));
    return { kind: 'BLOCKED', reason: data.safe_reason_code };
  }
  exactKeys(data, ['contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id',
    'create_request_key', 'quote_hash', 'binding_hash', 'entry_not_after']);
  requireValue(data.outcome === 'AUTHORIZED'
    && matches(data.order_id, UUID) && data.order_id === input.orderId
    && matches(data.context_id, UUID) && data.context_id === input.contextId
    && matches(data.create_request_key, UUID) && data.create_request_key === input.createRequestKey
    && matches(data.binding_hash, HASH) && data.binding_hash === input.bindingHash
    && matches(data.quote_hash, HASH) && timestamp(data.entry_not_after));
  return { kind: 'AUTHORIZED', orderId: data.order_id, contextId: data.context_id,
    createRequestKey: data.create_request_key, quoteHash: data.quote_hash,
    bindingHash: data.binding_hash, entryNotAfter: data.entry_not_after };
}

export function createRpcProviderEntryGate(client: SupabaseClient): ProviderEntryGate {
  return {
    async authorizeProviderEntry(input) {
      let snapshot: ProviderEntryInput;
      try {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
          throw new ChargeRepositoryError('CONFIG');
        }
        snapshot = {
          actorUserId: input.actorUserId, orderId: input.orderId, contextId: input.contextId,
          createRequestKey: input.createRequestKey, bindingHash: input.bindingHash,
        };
        if (!matches(snapshot.actorUserId, UUID) || !matches(snapshot.orderId, UUID)
          || !matches(snapshot.contextId, UUID) || !matches(snapshot.createRequestKey, UUID)
          || !matches(snapshot.bindingHash, HASH)) throw new ChargeRepositoryError('CONFIG');
      } catch {
        throw new ChargeRepositoryError('CONFIG');
      }
      let response;
      try {
        response = await client.rpc('authorize_web_payment_provider_entry', {
          p_actor_user_id: snapshot.actorUserId, p_order_id: snapshot.orderId, p_context_id: snapshot.contextId,
          p_create_request_key: snapshot.createRequestKey, p_binding_hash: snapshot.bindingHash,
        }).retry(false).abortSignal(AbortSignal.timeout(10_000));
      } catch {
        throw new ChargeRepositoryError('RPC');
      }
      if (response.error || response.status !== 200) throw new ChargeRepositoryError('RPC');
      return parseEntry(response.data, snapshot);
    },
  };
}
