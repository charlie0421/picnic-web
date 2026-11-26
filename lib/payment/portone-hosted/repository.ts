import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callWebPaymentServiceRpc, ChargeRepositoryError } from '../paypal-charge/repository';
import { createPortOneTestRepository } from '../portone-test/repository';
import type { PortOneEnvironment } from '../portone-test/protocol';

export const HOSTED_EVENT_CONTRACT = 'web-payment-portone-hosted-event.v1';
export type HostedWebhookEventType = 'TRANSACTION_READY' | 'TRANSACTION_PAY_PENDING' | 'TRANSACTION_VIRTUAL_ACCOUNT_ISSUED'
  | 'TRANSACTION_PAID' | 'TRANSACTION_FAILED' | 'TRANSACTION_PARTIAL_CANCELLED' | 'TRANSACTION_CANCELLED'
  | 'TRANSACTION_CANCEL_PENDING' | 'OTHER';
type EventBase = { contract_version: typeof HOSTED_EVENT_CONTRACT; environment: PortOneEnvironment; store_id: string; payment_id: string;
  delivery_id: string };
/** An unverified hint. The DB worker independently verifies provider facts before any effect. */
export type HostedEvent = (EventBase & { source: 'WEBHOOK'; event_type: HostedWebhookEventType })
  | (EventBase & { source: 'RETURN'; event_type: 'RETURN'; actor_user_id: string });
export type HostedEventReceipt = { outcome: 'ACCEPTED' | 'IGNORED'; reasonCode: null | 'UNKNOWN_PAYMENT' | 'SCOPE_MISMATCH' | 'NOT_OWNER'
  | 'DELIVERY_CONFLICT'; replayed: boolean; orderId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAYMENT_ID = /^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[A-Za-z0-9._:-]{1,200}$/;
const WEBHOOK_TYPES: readonly string[] = ['TRANSACTION_READY', 'TRANSACTION_PAY_PENDING', 'TRANSACTION_VIRTUAL_ACCOUNT_ISSUED',
  'TRANSACTION_PAID', 'TRANSACTION_FAILED', 'TRANSACTION_PARTIAL_CANCELLED', 'TRANSACTION_CANCELLED', 'TRANSACTION_CANCEL_PENDING', 'OTHER'];
const REASONS: readonly string[] = ['UNKNOWN_PAYMENT', 'SCOPE_MISMATCH', 'NOT_OWNER', 'DELIVERY_CONFLICT'];
const RECEIPT_KEYS = ['contract_version', 'outcome', 'reason_code', 'replayed', 'order_id', 'trust', 'grant_eligible'];

function requireValue(condition: unknown): asserts condition { if (!condition) throw new ChargeRepositoryError('RESPONSE'); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.test(value); }

function validEvent(event: HostedEvent): boolean {
  const base = ['contract_version', 'source', 'environment', 'store_id', 'payment_id', 'delivery_id', 'event_type'];
  const common = event?.contract_version === HOSTED_EVENT_CONTRACT && (event.environment === 'TEST' || event.environment === 'LIVE')
    && matches(event.store_id, KEY) && matches(event.payment_id, PAYMENT_ID) && matches(event.delivery_id, KEY);
  if (!common) return false;
  if (event.source === 'WEBHOOK') return exact(event, base) && WEBHOOK_TYPES.includes(event.event_type);
  return event.source === 'RETURN' && exact(event, [...base, 'actor_user_id']) && event.event_type === 'RETURN'
    && matches(event.actor_user_id, UUID);
}

function parseReceipt(value: unknown): HostedEventReceipt {
  requireValue(exact(value, RECEIPT_KEYS) && value.contract_version === 'web-payment-portone-hosted-event-receipt.v1'
    && value.trust === 'UNVERIFIED_HINT' && value.grant_eligible === false && typeof value.replayed === 'boolean'
    && (value.order_id === null || matches(value.order_id, UUID)));
  if (value.outcome === 'ACCEPTED') {
    requireValue(value.reason_code === null);
    return { outcome: 'ACCEPTED', reasonCode: null, replayed: value.replayed, orderId: value.order_id as string | null };
  }
  requireValue(value.outcome === 'IGNORED' && typeof value.reason_code === 'string' && REASONS.includes(value.reason_code));
  return { outcome: 'IGNORED', reasonCode: value.reason_code as HostedEventReceipt['reasonCode'], replayed: value.replayed,
    orderId: value.order_id as string | null };
}

/** Owned historical hosted status. A null state means the ordinary charge context decides. */
export type HostedOrderStatus = { state: null | 'AWAITING_DEPOSIT' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED' | 'FAILED' | 'REVIEW' };
const ORDER_STATES: readonly unknown[] = [null, 'AWAITING_DEPOSIT', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED', 'REVIEW'];

export function createPortOneHostedRepository(client: SupabaseClient) {
  const native = createPortOneTestRepository(client);
  return {
    getChargeContext: native.getChargeContext, prepareProviderContext: native.prepareProviderContext, claimCharge: native.claimCharge,
    recordSubmissionIntent: native.recordSubmissionIntent, bindPaidObservation: native.bindPaidObservation,
    // Null means not owned or not a routed hosted order. Malformed or failed reads throw; callers never guess.
    async getHostedOrderStatus(actorUserId: string, orderId: string): Promise<HostedOrderStatus | null> {
      if (!matches(actorUserId, UUID) || !matches(orderId, UUID)) throw new ChargeRepositoryError('CONFIG');
      const d = await callWebPaymentServiceRpc(client, 'get_portone_hosted_order_status', { p_actor_user_id: actorUserId, p_order_id: orderId });
      if (d === null) return null;
      requireValue(exact(d, ['contract_version', 'order_id', 'state']) && d.contract_version === 'web-payment-portone-hosted-status.v1'
        && d.order_id === orderId && ORDER_STATES.includes(d.state));
      return { state: d.state as HostedOrderStatus['state'] };
    },
    // Hints never carry method, status or payload facts. ACCEPTED means the hint and its work are durable, not that money moved.
    async receiveHostedEvent(event: HostedEvent): Promise<HostedEventReceipt> {
      if (!validEvent(event)) throw new ChargeRepositoryError('CONFIG');
      return parseReceipt(await callWebPaymentServiceRpc(client, 'receive_portone_hosted_event', { p_event: event }));
    },
  };
}

/** Opening a payable hosted checkout needs a local opt-in and the DB report that hosted recovery is enabled. */
export interface HostedAvailability { isOpen(environment: PortOneEnvironment): Promise<boolean> }
export function createHostedAvailability(client: SupabaseClient,
  env: Readonly<Record<string, string | undefined>> = process.env): HostedAvailability {
  const local = new Set((env.PORTONE_HOSTED_DOWNSTREAM_ENVIRONMENTS ?? '').split(',').map(item => item.trim()));
  return {
    async isOpen(environment) {
      if (!local.has(environment)) return false;
      const d = await callWebPaymentServiceRpc(client, 'get_portone_hosted_availability', { p_environment: environment });
      requireValue(exact(d, ['contract_version', 'environment', 'recovery_enabled', 'charge_authority'])
        && d.contract_version === 'web-payment-portone-hosted-availability.v1' && d.environment === environment
        && typeof d.recovery_enabled === 'boolean' && d.charge_authority === false);
      return d.recovery_enabled;
    },
  };
}
