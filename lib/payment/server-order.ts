export type ServerOrderRequest = {
  productId: string;
  provider: 'paypal' | 'portone';
  billingCountry: string;
  requestId: string;
  acceptedPolicyVersion: string;
};

export type ServerOrderDto = {
  contractVersion: 'web-payment-order.v1';
  orderId: string;
  quoteId: string;
  replayed: boolean;
  quote: {
    productId: string;
    productName: string;
    provider: 'paypal' | 'portone';
    environment: 'LIVE' | 'SANDBOX' | 'TEST';
    billingCountry: string;
    amountMinor: string;
    currency: 'USD' | 'KRW';
    baseStar: string;
    productBonus: string;
    quantity: '1';
    issuedAt: string;
    expiresAt: string;
    acceptedPolicyVersion: string;
    productPolicyVersion: string;
    bonusPolicyVersion: string;
    bonusExpiryPolicyVersion: string;
    refundPolicyVersion: string;
    termsPolicyVersion: string;
    promotion: {
      state: 'CONDITIONAL';
      campaignCode: 'CANDY_BOOST_DAY';
      evaluationTimeBasis: 'VERIFIED_PROVIDER_COMPLETED_AT';
    };
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INPUT_KEYS = new Set(['productId', 'provider', 'billingCountry', 'requestId', 'acceptedPolicyVersion']);
const MAX_BIGINT = BigInt('9223372036854775807');

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isServerOrderUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function parseServerOrderRequest(value: unknown): ServerOrderRequest | null {
  if (!record(value) || Reflect.ownKeys(value).length !== INPUT_KEYS.size
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !INPUT_KEYS.has(key))) return null;
  if (!safeText(value.productId) || !safeText(value.billingCountry) || !safeText(value.acceptedPolicyVersion)
    || !isServerOrderUuid(value.requestId) || (value.provider !== 'paypal' && value.provider !== 'portone')) return null;
  // The API accepts an ASCII subset, not every Unicode identifier PostgreSQL
  // accepts under its collation. Strip only U+0020 and validate before casing.
  // Internal product spaces are preserved; product/price eligibility stays in DB.
  const productId = value.productId.replace(/^ +| +$/g, '');
  const billingCountry = value.billingCountry.replace(/^ +| +$/g, '');
  if (!/^[\u0020-\u007e]{1,10}$/.test(productId) || !/^[A-Za-z]{2}$/.test(billingCountry)) return null;
  return { productId: productId.toUpperCase(), provider: value.provider, billingCountry: billingCountry.toUpperCase(),
    requestId: value.requestId.toLowerCase(), acceptedPolicyVersion: value.acceptedPolicyVersion.trim() };
}

function integerString(value: unknown, positive: boolean): value is string {
  if (typeof value !== 'string' || value.length > 19 || !/^(0|[1-9][0-9]*)$/.test(value)) return false;
  const integer = BigInt(value);
  return integer <= MAX_BIGINT && (!positive || integer > BigInt(0));
}

/** Retain PostgreSQL microseconds: Date.parse alone would discard the last three digits. */
function timestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction = '', zone, sign, oh, om] = match;
  const year = Number(y), month = Number(mo), day = Number(d);
  const hour = Number(h), minute = Number(mi), second = Number(s);
  const offsetHour = zone === 'Z' ? 0 : Number(oh), offsetMinute = zone === 'Z' ? 0 : Number(om);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59
    || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  // Reject normalized impossible calendar dates, including non-leap February 29.
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) return null;
  const offset = (offsetHour * 60 + offsetMinute) * (sign === '-' ? -1 : 1);
  return BigInt(date.getTime() - offset * 60_000) * BigInt(1000) + BigInt(fraction.padEnd(6, '0'));
}

/** A quote describes a fixed offer; this DTO grants no charge or wallet permission. */
export function mapServerOrder(value: unknown, request: ServerOrderRequest): ServerOrderDto | null {
  if (!record(value) || !isServerOrderUuid(value.order_id) || !isServerOrderUuid(value.quote_id)
    || typeof value.replayed !== 'boolean' || !record(value.quote)) return null;
  const q = value.quote;
  if (q.contract_version !== 'web-payment-quote.v1' || q.product_id !== request.productId
    || q.provider !== request.provider.toUpperCase() || q.billing_country !== request.billingCountry
    || q.accepted_policy_version !== request.acceptedPolicyVersion || q.quantity !== '1'
    || typeof q.product_name !== 'string' || Array.from(q.product_name).length > 255) return null;
  if (q.provider === 'PAYPAL') {
    if ((q.environment !== 'LIVE' && q.environment !== 'SANDBOX') || q.currency !== 'USD') return null;
  } else if (q.provider === 'PORTONE') {
    if ((q.environment !== 'LIVE' && q.environment !== 'TEST') || q.currency !== 'KRW') return null;
  } else return null;
  if (!integerString(q.amount_minor, true) || !integerString(q.base_star, true) || !integerString(q.product_bonus, false)) return null;
  if (!safeText(q.accepted_policy_version) || !safeText(q.product_policy_version) || !safeText(q.bonus_policy_version)
    || !safeText(q.bonus_expiry_policy_version) || !safeText(q.refund_policy_version) || !safeText(q.terms_policy_version)) return null;
  const issued = timestampMicros(q.issued_at), expires = timestampMicros(q.expires_at);
  if (issued === null || expires === null || expires - issued !== BigInt(900_000_000)) return null;
  const promotion = q.promotion_policy;
  if (!record(promotion) || promotion.contract_version !== 'web-payment-promotion.v1'
    || promotion.state !== 'CONDITIONAL' || promotion.campaign_code !== 'CANDY_BOOST_DAY'
    || promotion.evaluation_time_basis !== 'VERIFIED_PROVIDER_COMPLETED_AT') return null;
  // Explicit projection prevents future RPC additions from becoming public fields.
  return { contractVersion: 'web-payment-order.v1', orderId: value.order_id, quoteId: value.quote_id,
    replayed: value.replayed, quote: {
      productId: request.productId, productName: q.product_name, provider: request.provider,
      environment: q.environment as ServerOrderDto['quote']['environment'], billingCountry: request.billingCountry,
      amountMinor: q.amount_minor, currency: q.currency as 'USD' | 'KRW', baseStar: q.base_star,
      productBonus: q.product_bonus, quantity: '1', issuedAt: q.issued_at as string, expiresAt: q.expires_at as string,
      acceptedPolicyVersion: q.accepted_policy_version, productPolicyVersion: q.product_policy_version,
      bonusPolicyVersion: q.bonus_policy_version, bonusExpiryPolicyVersion: q.bonus_expiry_policy_version,
      refundPolicyVersion: q.refund_policy_version, termsPolicyVersion: q.terms_policy_version,
      promotion: { state: 'CONDITIONAL', campaignCode: 'CANDY_BOOST_DAY', evaluationTimeBasis: 'VERIFIED_PROVIDER_COMPLETED_AT' },
    } };
}
