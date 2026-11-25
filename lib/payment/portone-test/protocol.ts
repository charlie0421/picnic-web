import 'server-only';
import { createHash } from 'node:crypto';
import type { ChargeContext } from '../paypal-charge/repository';

export type PortOneEnvironment = 'TEST' | 'LIVE';
export type PortOneScope = { merchant_id: string; store_id: string; channel_id: string; channel_type: PortOneEnvironment };
/** The frozen channel facts a provider read must match. The legacy TEST config and hosted channels both satisfy it. */
export type PortOneChannelFacts = Readonly<PortOneScope & { channelKey: string }>;
export type PortOnePaidEvidence = { source: 'LOOKUP'; key: string; payload_hash: string; provider: 'PORTONE'; environment: PortOneEnvironment;
  identity_kind: 'PAYMENT'; external_id: string; parent_external_id: null; order_id: string; user_id: string; quote_hash: string;
  order_reference: string; scope: PortOneScope; amount_minor: string; currency: 'KRW'; status: 'PAID'; provider_completed_at: string };
export type VerifiedPayment = { status: 'READY' | 'PAID' | 'VIRTUAL_ACCOUNT_ISSUED'; paymentId: string; transactionId: string; merchantId: string;
  storeId: string; channelId: string; channelType: PortOneEnvironment; amount: number; currency: 'KRW'; orderReference: string; paidAt: string | null };
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
// Match the entire identifier, including the end of the input.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/;
export function boundedId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}(?![\s\S])/.test(value);
}
export function live(value: string, now: number): boolean { return Number.isFinite(Date.parse(value)) && Date.parse(value) > now; }
// The legacy drill requires paid === total. A hosted caller may allow a provider discount (wallet points or coupons) only
// under the exact equation paid + discount === total, with integer amounts, 0 <= discount <= total and nothing cancelled.
function paidAmountValid(amount: Record<string, unknown>, allowDiscount: boolean): boolean {
  if (amount.cancelled !== 0) return false;
  if (!allowDiscount) return amount.paid === amount.total;
  const total = amount.total as number;
  const discount = amount.discount === undefined ? 0 : amount.discount;
  return Number.isSafeInteger(discount) && (discount as number) >= 0 && (discount as number) <= total
    && Number.isSafeInteger(amount.paid) && amount.paid === total - (discount as number);
}
// `allowIssued` lets a caller see an issued virtual account. Issuance is never PAID and never payment evidence.
export function assessPortOnePayment(value: unknown, context: ChargeContext, config: PortOneChannelFacts, txId?: string,
  options: { allowIssued?: boolean; allowDiscount?: boolean } = {}): VerifiedPayment | null {
  const d = record(value); const channel = record(d?.channel); const amount = record(d?.amount);
  if (!d || !channel || !amount || d.id !== context.paymentId || !boundedId(d.transactionId)
    || (txId !== undefined && d.transactionId !== txId) || d.version !== 'V2'
    || (d.status !== 'READY' && d.status !== 'PAID' && !(options.allowIssued && d.status === 'VIRTUAL_ACCOUNT_ISSUED'))
    || d.merchantId !== config.merchant_id || d.storeId !== config.store_id
    || channel.id !== config.channel_id || channel.type !== config.channel_type || channel.key !== config.channelKey
    || d.currency !== 'KRW' || !Number.isSafeInteger(amount.total) || amount.total !== Number(context.amountMinor)
    || typeof d.customData !== 'string' || d.customData.length > 512) return null;
  let custom: Record<string, unknown> | null;
  try { custom = record(JSON.parse(d.customData)); } catch { return null; }
  if (!custom || Object.keys(custom).length !== 2 || custom.version !== 'v2' || custom.order_id !== context.orderId) return null;
  // The provider serializes this exact two-field object as a string. Reject duplicate keys too.
  const escapedOrder = context.orderId;
  const referenceShape = new RegExp(`^\\s*\\{\\s*(?:"version"\\s*:\\s*"v2"\\s*,\\s*"order_id"\\s*:\\s*"${escapedOrder}"|"order_id"\\s*:\\s*"${escapedOrder}"\\s*,\\s*"version"\\s*:\\s*"v2")\\s*\\}\\s*$`);
  if (!referenceShape.test(d.customData)) return null;
  if (d.status === 'PAID' && (typeof d.paidAt !== 'string' || d.paidAt.length > 64
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(d.paidAt)
    || !Number.isFinite(Date.parse(d.paidAt)) || !paidAmountValid(amount, options.allowDiscount === true))) return null;
  return { status: d.status, paymentId: context.paymentId!, transactionId: d.transactionId, merchantId: d.merchantId as string,
    storeId: d.storeId as string, channelId: channel.id as string, channelType: config.channel_type, amount: amount.total as number,
    currency: 'KRW', orderReference: `v2:${custom.order_id}`, paidAt: d.status === 'PAID' ? d.paidAt as string : null };
}
export function buildPortOnePaidEvidence(observed: VerifiedPayment, context: ChargeContext, actorUserId: string): PortOnePaidEvidence {
  if (observed.status !== 'PAID' || !observed.paidAt) throw new Error('PORTONE_TEST_UNAVAILABLE');
  const facts: Omit<PortOnePaidEvidence, 'payload_hash'> = { source: 'LOOKUP', key: `PAYMENT:${observed.paymentId}:PAID`,
    provider: 'PORTONE', environment: observed.channelType, identity_kind: 'PAYMENT', external_id: observed.paymentId, parent_external_id: null,
    order_id: context.orderId, user_id: actorUserId, quote_hash: context.quoteHash, order_reference: observed.orderReference,
    scope: { merchant_id: observed.merchantId, store_id: observed.storeId, channel_id: observed.channelId, channel_type: observed.channelType },
    amount_minor: String(observed.amount), currency: observed.currency, status: 'PAID', provider_completed_at: observed.paidAt };
  return { ...facts, payload_hash: createHash('sha256').update(JSON.stringify(facts)).digest('hex') };
}
