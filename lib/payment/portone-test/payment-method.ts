import 'server-only';
import { createHash } from 'node:crypto';
import type { Payment } from '@portone/server-sdk';
import { record, type PortOnePaidEvidence } from './protocol';

// SDK 0.17.0 PaymentMethod variants without the Unrecognized fallback.
type KnownPaymentMethod = Exclude<Payment.PaymentMethod, { readonly type: symbol }>;
// `satisfies` fails the build if the SDK adds, removes or renames a known variant.
const TYPES = {
  PaymentMethodCard: 'CARD', PaymentMethodEasyPay: 'EASY_PAY', PaymentMethodTransfer: 'TRANSFER',
  PaymentMethodVirtualAccount: 'VIRTUAL_ACCOUNT', PaymentMethodMobile: 'MOBILE',
  PaymentMethodGiftCertificate: 'GIFT_CERTIFICATE', PaymentMethodConvenienceStore: 'CONVENIENCE_STORE',
} as const satisfies Record<KnownPaymentMethod['type'], string>;
export type PaymentMethodType = (typeof TYPES)[keyof typeof TYPES];
/** Type-only method facts. Card, account, phone and other detail fields never leave the provider read. */
export type ObservedPaymentMethod = { type: PaymentMethodType; easy_pay_provider?: string };
export type PortOneMethodEvidence = Omit<PortOnePaidEvidence, 'payload_hash'> & { payment_method: ObservedPaymentMethod; payload_hash: string };

const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.values(TYPES));
const PROVIDER = /^[A-Z][A-Z0-9_]{0,39}(?![\s\S])/;
const BOUND_KEYS = ['type', 'easy_pay_provider', 'source', 'trust'];

function method(type: PaymentMethodType, provider: unknown): ObservedPaymentMethod | null {
  if (provider === undefined) return { type };
  return type === 'EASY_PAY' && typeof provider === 'string' && PROVIDER.test(provider) ? { type, easy_pay_provider: provider } : null;
}

/** Reads the method of a server-verified PAID payment. Omitted or unrecognized metadata returns null; it is never CARD. */
export function readPaidPaymentMethod(payment: unknown): ObservedPaymentMethod | null {
  const value = record(record(payment)?.method);
  if (!value || typeof value.type !== 'string' || !Object.hasOwn(TYPES, value.type)) return null;
  const known = value as KnownPaymentMethod;
  return method(TYPES[known.type], known.type === 'PaymentMethodEasyPay' ? (known.provider as unknown) : undefined);
}

/** Parses the binding v2 `payment_method`. Returns undefined when the DTO is malformed. */
export function parseBoundPaymentMethod(value: unknown): ObservedPaymentMethod | null | undefined {
  if (value === null) return null;
  const d = record(value);
  if (!d || d.source !== 'LOOKUP' || d.trust !== 'SERVER_REPORTED' || typeof d.type !== 'string' || !KNOWN_TYPES.has(d.type)) return undefined;
  const hasProvider = Object.hasOwn(d, 'easy_pay_provider');
  const keys = Object.keys(d);
  if (keys.length !== (hasProvider ? 4 : 3) || !keys.every(key => BOUND_KEYS.includes(key))) return undefined;
  return method(d.type as PaymentMethodType, hasProvider ? d.easy_pay_provider : undefined) ?? undefined;
}

/**
 * Metadata observation for a hosted PAID read. The key extends the financial base key with the observed
 * method only (`PAYMENT:<paymentId>:PAID:<TYPE>[:<PROVIDER>]`), so an exact replay is idempotent and a late
 * provider gets its own key. The DB decides method conflicts. The base observation keeps financial conflicts.
 */
export function buildPortOneMethodEvidence(base: PortOnePaidEvidence, observed: ObservedPaymentMethod): PortOneMethodEvidence {
  const paymentMethod: ObservedPaymentMethod = observed.easy_pay_provider === undefined
    ? { type: observed.type } : { type: observed.type, easy_pay_provider: observed.easy_pay_provider };
  const slot = paymentMethod.easy_pay_provider === undefined ? paymentMethod.type : `${paymentMethod.type}:${paymentMethod.easy_pay_provider}`;
  // Same field order as the base, with payment_method last and the base hash removed.
  const draft: Partial<PortOneMethodEvidence> = { ...base, key: `${base.key}:${slot}`, payment_method: paymentMethod };
  delete draft.payload_hash;
  const facts = draft as Omit<PortOneMethodEvidence, 'payload_hash'>;
  return { ...facts, payload_hash: createHash('sha256').update(JSON.stringify(facts)).digest('hex') };
}
