import 'server-only';
import { createHash } from 'node:crypto';

export type PayPalEnvironment = 'LIVE' | 'SANDBOX';
export type PayPalScope = { account_id: string; merchant_id: string };
export type PayPalOrderStatus = 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
export type PayPalCaptureStatus = 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
export type ExpectedPayPalOrder = { orderId: string; providerOrderId: string | null; amountMinor: string;
  currency: 'USD'; merchantId: string; billingCountry: string };
export type ObservedPayPalCapture = { providerCaptureId: string | null; rawStatus: string | null;
  status: PayPalCaptureStatus | 'UNRECOGNIZED'; amountMinor: string | null; currency: string | null; orderReference: string | null };
export type ObservedPayPalOrder = { providerOrderId: string | null; rawStatus: string | null;
  amountMinor: string | null; currency: string | null; merchantId: string | null; orderReference: string | null;
  captures: ObservedPayPalCapture[] };
export type PayPalOrderAssessment =
  | { kind: 'OK'; providerOrderId: string; status: PayPalOrderStatus | 'UNRECOGNIZED'; rawStatus: string;
      captures: ObservedPayPalCapture[]; observed: ObservedPayPalOrder }
  | { kind: 'MISMATCH'; reason: 'SHAPE' | 'ID' | 'INTENT' | 'PURCHASE_UNITS' | 'CUSTOM_ID' | 'AMOUNT' | 'CURRENCY'
      | 'PAYEE' | 'CAPTURE_SHAPE' | 'COUNTRY'; observed: ObservedPayPalOrder };

export type PayPalEvidence = {
  source: 'CREATE_RESPONSE' | 'SUBMIT_RESPONSE' | 'LOOKUP'; key: string; payload_hash: string;
  provider: 'PAYPAL'; environment: PayPalEnvironment; identity_kind: 'ORDER' | 'CAPTURE'; external_id: string;
  parent_external_id: string | null; order_id: string; user_id: string; quote_hash: string;
  order_reference: string | null; scope: PayPalScope; amount_minor: string | null; currency: string | null; status: string;
};

const ORDER_STATUSES: readonly string[] = ['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'];
const CAPTURE_STATUSES: readonly string[] = ['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'FAILED'];
const ID = /^[A-Z0-9]{1,36}$/;
const BOUNDED = /^[A-Za-z0-9._:-]{1,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function matching(value: unknown, pattern: RegExp): string | null {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value ? value : null;
}

export function minorToPayPalValue(amountMinor: string): string | null {
  if (!matching(amountMinor, /^[1-9][0-9]{0,18}$/)) return null;
  const padded = amountMinor.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

export function payPalValueToMinor(value: unknown): string | null {
  if (typeof value !== 'string' || !matching(value, /^(0|[1-9][0-9]{0,16})\.[0-9]{2}$/)) return null;
  const minor = value.replace('.', '').replace(/^0+/, '');
  return minor && minor.length <= 19 ? minor : null;
}

function observedOrder(body: unknown): ObservedPayPalOrder {
  const order = object(body); const units = order?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? object(units[0]) : null;
  const amount = object(unit?.amount); const payee = object(unit?.payee); const payments = object(unit?.payments);
  // Local observation work bound, independent of PayPal's larger schema limit.
  // Assessment still rejects every multiple-capture response below this bound.
  const captures = Array.isArray(payments?.captures) && payments.captures.length <= 32 ? payments.captures : [];
  return { providerOrderId: matching(order?.id, ID), rawStatus: matching(order?.status, BOUNDED),
    amountMinor: payPalValueToMinor(amount?.value), currency: matching(amount?.currency_code, /^[A-Z]{3}$/),
    merchantId: matching(payee?.merchant_id, BOUNDED),
    orderReference: matching(unit?.custom_id, /^v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    captures: captures.map((value): ObservedPayPalCapture => {
      const capture = object(value); const money = object(capture?.amount); const rawStatus = matching(capture?.status, BOUNDED);
      return { providerCaptureId: matching(capture?.id, ID), rawStatus,
        status: rawStatus && CAPTURE_STATUSES.includes(rawStatus) ? rawStatus as PayPalCaptureStatus : 'UNRECOGNIZED',
        amountMinor: payPalValueToMinor(money?.value), currency: matching(money?.currency_code, /^[A-Z]{3}$/),
        orderReference: matching(capture?.custom_id, /^v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) };
    }) };
}

export function assessPayPalOrder(body: unknown, expected: ExpectedPayPalOrder): PayPalOrderAssessment {
  const observed = observedOrder(body); const order = object(body);
  const mismatch = (reason: Extract<PayPalOrderAssessment, { kind: 'MISMATCH' }>['reason']): PayPalOrderAssessment =>
    ({ kind: 'MISMATCH', reason, observed });
  if (!order || !observed.rawStatus) return mismatch('SHAPE');
  if (!observed.providerOrderId || (expected.providerOrderId !== null && observed.providerOrderId !== expected.providerOrderId)) return mismatch('ID');
  if (order.intent !== 'CAPTURE') return mismatch('INTENT');
  if (!Array.isArray(order.purchase_units) || order.purchase_units.length !== 1 || !object(order.purchase_units[0])) return mismatch('PURCHASE_UNITS');
  const unit = object(order.purchase_units[0])!;
  if (observed.orderReference !== `v2:${expected.orderId}`) return mismatch('CUSTOM_ID');
  if (observed.amountMinor !== expected.amountMinor) return mismatch('AMOUNT');
  if (observed.currency !== expected.currency) return mismatch('CURRENCY');
  if (observed.merchantId !== expected.merchantId) return mismatch('PAYEE');
  const payments = object(unit.payments);
  if (unit.payments !== undefined && !payments) return mismatch('CAPTURE_SHAPE');
  if (payments && payments.captures !== undefined && (!Array.isArray(payments.captures) || payments.captures.length > 1)) return mismatch('CAPTURE_SHAPE');
  for (const capture of observed.captures) {
    if (!capture.providerCaptureId || !capture.rawStatus || capture.amountMinor !== expected.amountMinor || capture.currency !== expected.currency) return mismatch('CAPTURE_SHAPE');
  }
  if (Array.isArray(payments?.captures)) {
    for (const value of payments.captures) {
      const capture = object(value);
      if (!capture || (capture.custom_id !== undefined && capture.custom_id !== `v2:${expected.orderId}`)) return mismatch('CAPTURE_SHAPE');
    }
  }
  // Missing account country remains unverified. Shipping and locale are not country evidence.
  const paymentSource = object(order.payment_source); const paypal = object(paymentSource?.paypal); const payer = object(order.payer);
  if ((order.payment_source !== undefined && !paymentSource) || (paymentSource?.paypal !== undefined && !paypal)
    || (order.payer !== undefined && !payer)) return mismatch('SHAPE');
  for (const addressValue of [paypal?.address, payer?.address]) {
    if (addressValue === undefined) continue;
    const address = object(addressValue);
    if (!address || address.country_code !== expected.billingCountry || !matching(address.country_code, /^[A-Z]{2}$/)) return mismatch('COUNTRY');
  }
  return { kind: 'OK', providerOrderId: observed.providerOrderId,
    status: ORDER_STATUSES.includes(observed.rawStatus) ? observed.rawStatus as PayPalOrderStatus : 'UNRECOGNIZED',
    rawStatus: observed.rawStatus, captures: observed.captures, observed };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

export function buildPayPalEvidence(input: Omit<PayPalEvidence, 'key' | 'payload_hash'>): PayPalEvidence {
  const evidence = { source: input.source, provider: input.provider, environment: input.environment,
    identity_kind: input.identity_kind, external_id: input.external_id, parent_external_id: input.parent_external_id,
    order_id: input.order_id, user_id: input.user_id, quote_hash: input.quote_hash, order_reference: input.order_reference,
    scope: { account_id: input.scope?.account_id, merchant_id: input.scope?.merchant_id },
    amount_minor: input.amount_minor, currency: input.currency, status: input.status,
    key: `${input.identity_kind}:${input.external_id}:${input.status}` };
  if (!['CREATE_RESPONSE', 'SUBMIT_RESPONSE', 'LOOKUP'].includes(evidence.source) || evidence.provider !== 'PAYPAL'
    || !['LIVE', 'SANDBOX'].includes(evidence.environment) || !['ORDER', 'CAPTURE'].includes(evidence.identity_kind)
    || !matching(evidence.external_id, ID) || !matching(evidence.status, BOUNDED) || !matching(evidence.key, BOUNDED)
    || !matching(evidence.order_id, UUID) || !matching(evidence.user_id, UUID) || !matching(evidence.quote_hash, HASH)
    || !matching(evidence.scope.account_id, BOUNDED) || !matching(evidence.scope.merchant_id, BOUNDED)
    || (evidence.parent_external_id !== null && !matching(evidence.parent_external_id, ID))
    || (evidence.order_reference !== null && !matching(evidence.order_reference, /^v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))
    || (evidence.amount_minor !== null && !matching(evidence.amount_minor, /^[0-9]{1,19}$/))
    || (evidence.currency !== null && !matching(evidence.currency, /^[A-Z]{3}$/))) throw new Error('INVALID_PAYPAL_EVIDENCE');
  return { ...evidence, payload_hash: createHash('sha256').update(canonical(evidence), 'utf8').digest('hex') };
}
