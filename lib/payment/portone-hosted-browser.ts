import { isServerOrderUuid, parseServerOrderRequest, type ServerOrderRequest } from './server-order';

export type HostedEnvironment = 'TEST' | 'LIVE';
export type HostedQuote = { orderId: string; name: string; amount: number; expiresAt: string; environment: HostedEnvironment };
/** Session state for one tab. It never holds a payment token or the continuation. */
export type HostedAttempt = { input: ServerOrderRequest; quote?: HostedQuote; launched: boolean };
export type HostedPayMethod = 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'MOBILE' | 'GIFT_CERTIFICATE' | 'EASY_PAY';
export type HostedSdk = { storeId: string; channelKey: string; paymentId: string; totalAmount: number; currency: 'KRW';
  payMethod: HostedPayMethod; easyPayProvider: string | null; buyer: 'NONE' | 'NAME_EMAIL_PHONE'; productType: 'DIGITAL' | 'REAL';
  virtualAccountValidHours: number | null; giftCertificateType: 'BOOKNLIFE' | 'SMART_MUNSANG' | 'CULTURELAND' | null; isTestChannel: boolean };
export type HostedCheckout = { orderId: string; environment: HostedEnvironment; expiresAt: string; continuation: string; sdk: HostedSdk };
export type HostedState = 'GRANTED' | 'PENDING' | 'BLOCKED' | 'UNAVAILABLE' | 'NOT_SUBMITTED'
  | 'AWAITING_DEPOSIT' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED' | 'FAILED' | 'EXPIRED';
export type HostedBuyer = { fullName: string; email: string; phoneNumber: string };
export type HostedResponse = { kind: 'CONFIRM'; txId: string; paymentToken: string } | { kind: 'NOT_PAID' } | { kind: 'UNKNOWN' };

const PAY_METHODS: readonly string[] = ['CARD', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'MOBILE', 'GIFT_CERTIFICATE', 'EASY_PAY'];
const STATES: readonly string[] = ['GRANTED', 'PENDING', 'BLOCKED', 'UNAVAILABLE', 'NOT_SUBMITTED',
  'AWAITING_DEPOSIT', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED', 'EXPIRED'];
const LANGUAGES: readonly string[] = ['ko', 'en', 'ja', 'zh-cn', 'zh-tw', 'id', 'es', 'bn', 'tl', 'th', 'vi', 'my'];
const SDK_KEYS = ['storeId', 'channelKey', 'paymentId', 'totalAmount', 'currency', 'payMethod', 'easyPayProvider', 'buyer', 'productType',
  'virtualAccountValidHours', 'giftCertificateType', 'isTestChannel'];
const GIFT_TYPES: readonly unknown[] = ['BOOKNLIFE', 'SMART_MUNSANG', 'CULTURELAND'];
const PAYMENT_ID = /^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9._:-]{1,200}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []) {
  const present = Object.keys(value);
  if (!keys.every(key => Object.hasOwn(value, key)) || present.some(key => !keys.includes(key) && !optional.includes(key))) {
    throw new Error('INVALID_RESPONSE');
  }
}
function text(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}
function future(value: unknown): value is string {
  return text(value, 64) && Date.parse(value) > Date.now();
}
function validQuote(value: unknown): value is HostedQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const q = value as Record<string, unknown>;
  return Object.keys(q).length === 5 && isServerOrderUuid(q.orderId) && text(q.name, 255) && Number.isSafeInteger(q.amount)
    && (q.amount as number) > 0 && text(q.expiresAt, 64) && Number.isFinite(Date.parse(q.expiresAt)) && (q.environment === 'TEST' || q.environment === 'LIVE');
}

export class HostedQuoteRefused extends Error {}
/**
 * The server says this payment option is closed for this visitor now, for example a TEST order for a non-admin,
 * closed orders or an unopened hosted downstream. The visitor can retry later or choose another method.
 */
export class HostedUnavailable extends Error {}

async function request(path: string, body?: unknown, statuses: readonly number[] = [200]) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'same-origin',
    redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!statuses.includes(response.status)) {
    const code = path === '/api/payment/orders' ? (await response.json().catch(() => null))?.error : undefined;
    if (response.status === 409 && code === 'WEB_PAYMENT_POLICY_CHANGED') throw new HostedQuoteRefused();
    if ((response.status === 403 && code === 'WEB_PAYMENT_NOT_AVAILABLE')
      || (response.status === 503 && code === 'WEB_PAYMENT_ORDER_UNAVAILABLE')) throw new HostedUnavailable();
    throw new Error('REQUEST_REFUSED');
  }
  return object(await response.json());
}

/** Creates the server order. The server freezes environment, channel and price; the browser only reads them. */
export async function readHostedQuote(input: ServerOrderRequest): Promise<HostedQuote> {
  if (input.provider !== 'portone') throw new Error('INVALID_INPUT');
  const data = await request('/api/payment/orders', input);
  const q = object(data.quote);
  if (data.contractVersion !== 'web-payment-order.v1' || !isServerOrderUuid(data.orderId) || q.productId !== input.productId
    || q.provider !== 'portone' || (q.environment !== 'TEST' && q.environment !== 'LIVE') || q.billingCountry !== input.billingCountry
    || q.currency !== 'KRW' || q.acceptedPolicyVersion !== input.acceptedPolicyVersion
    || typeof q.amountMinor !== 'string' || !/^[1-9][0-9]{0,15}$/.test(q.amountMinor)) throw new Error('INVALID_QUOTE');
  const quote = { orderId: data.orderId, name: q.productName, amount: Number(q.amountMinor), expiresAt: q.expiresAt, environment: q.environment };
  if (!validQuote(quote)) throw new Error('INVALID_QUOTE');
  return quote;
}

const base = (orderId: string) => `/api/payment/orders/${orderId}/portone/hosted/`;

export async function readHostedCheckout(quote: HostedQuote, productId: string): Promise<HostedCheckout> {
  const entry = await request(base(quote.orderId) + 'checkout', {}, [200, 409, 503]);
  if (entry.state === 'UNAVAILABLE' && entry.orderId === quote.orderId) throw new HostedUnavailable();
  return validateCheckout(entry, quote, productId);
}

function validateCheckout(entry: Record<string, unknown>, quote: HostedQuote, productId: string): HostedCheckout {
  exact(entry, ['state', 'orderId', 'environment', 'productId', 'expiresAt', 'continuation', 'sdk']);
  const sdk = object(entry.sdk);
  exact(sdk, SDK_KEYS);
  const hours = sdk.virtualAccountValidHours;
  if (entry.state !== 'READY' || entry.orderId !== quote.orderId || entry.environment !== quote.environment || entry.productId !== productId
    || !future(entry.expiresAt) || !future(quote.expiresAt) || typeof entry.continuation !== 'string'
    || !/^v1\.[0-9]{1,12}\.[A-Za-z0-9_-]{1,64}$/.test(entry.continuation)
    || !text(sdk.storeId, 200) || !ID.test(sdk.storeId) || !text(sdk.channelKey, 200) || !ID.test(sdk.channelKey)
    || typeof sdk.paymentId !== 'string' || !PAYMENT_ID.test(sdk.paymentId) || sdk.totalAmount !== quote.amount || sdk.currency !== 'KRW'
    || typeof sdk.payMethod !== 'string' || !PAY_METHODS.includes(sdk.payMethod)
    || (sdk.easyPayProvider !== null && !(typeof sdk.easyPayProvider === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(sdk.easyPayProvider)
      && sdk.payMethod === 'EASY_PAY'))
    || (sdk.giftCertificateType !== null && !(GIFT_TYPES.includes(sdk.giftCertificateType) && sdk.payMethod === 'GIFT_CERTIFICATE'))
    || (sdk.buyer !== 'NONE' && sdk.buyer !== 'NAME_EMAIL_PHONE') || (sdk.productType !== 'DIGITAL' && sdk.productType !== 'REAL')
    || (hours !== null && (sdk.payMethod !== 'VIRTUAL_ACCOUNT' || !Number.isSafeInteger(hours) || (hours as number) < 1 || (hours as number) > 720))
    || sdk.isTestChannel !== (quote.environment === 'TEST')) throw new Error('ENTRY_REFUSED');
  return { orderId: quote.orderId, environment: quote.environment, expiresAt: entry.expiresAt as string, continuation: entry.continuation,
    sdk: sdk as HostedSdk };
}

/**
 * Same-order reopen when this tab has no stored quote, for example after a login on return. The owned server checkout
 * is the only source: it re-runs every entry check and releases settings only while this order is not submitted.
 * The display name comes from the page's product list; price, environment and channel come from the server.
 */
export async function readHostedCheckoutForOrder(orderId: string, productName: (productId: string) => string | null):
  Promise<{ entry: HostedCheckout; quote: HostedQuote; productId: string }> {
  if (!isServerOrderUuid(orderId)) throw new Error('INVALID_ORDER');
  const raw = await request(base(orderId) + 'checkout', {}, [200, 409, 503]);
  if (raw.state === 'UNAVAILABLE' && raw.orderId === orderId) throw new HostedUnavailable();
  const sdk = object(raw.sdk);
  const environment = raw.environment;
  if (raw.state !== 'READY' || raw.orderId !== orderId || (environment !== 'TEST' && environment !== 'LIVE')
    || typeof raw.productId !== 'string' || !/^[ -~]{1,10}$/.test(raw.productId)
    || !Number.isSafeInteger(sdk.totalAmount) || (sdk.totalAmount as number) <= 0 || !future(raw.expiresAt)) throw new Error('ENTRY_REFUSED');
  const name = productName(raw.productId);
  const quote: HostedQuote = { orderId, name: name && text(name, 255) ? name : raw.productId, amount: sdk.totalAmount as number,
    expiresAt: raw.expiresAt, environment };
  // The full checkout validation (exact keys, route, wallet, gift kind, test channel) still applies.
  const entry = validateCheckout(raw, quote, raw.productId);
  return { entry, quote, productId: raw.productId };
}

function validBuyer(buyer: HostedBuyer | undefined): buyer is HostedBuyer {
  return !!buyer && buyer.fullName.trim().length > 0 && buyer.fullName.trim().length <= 80
    && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(buyer.email.trim()) && buyer.email.trim().length <= 254
    && /^\+?[0-9][0-9 -]{6,22}[0-9]$/.test(buyer.phoneNumber.trim());
}

/**
 * PortOne V2 requestPayment argument. The server chose the launch route; the browser adds only the display name,
 * buyer fields the channel needs, and the bounded return address. No confirmUrl: confirmation is the server's single POST.
 */
export function buildHostedPaymentRequest(entry: HostedCheckout, quote: HostedQuote,
  options: { origin: string; language: string; buyer?: HostedBuyer; mobile?: boolean }) {
  if (!/^https?:\/\/[^/?#]+$/.test(options.origin) || entry.orderId !== quote.orderId) throw new Error('INVALID_ENTRY');
  const s = entry.sdk;
  if (s.buyer === 'NAME_EMAIL_PHONE' && !validBuyer(options.buyer)) throw new Error('BUYER_REQUIRED');
  // KG requires a gift certificate kind on mobile and lets the PG window choose on PC. Without a configured kind,
  // a mobile gift certificate launch is unavailable rather than guessed.
  const sendGiftType = s.payMethod === 'GIFT_CERTIFICATE' && options.mobile === true;
  if (sendGiftType && s.giftCertificateType === null) throw new HostedUnavailable();
  const language = LANGUAGES.includes(options.language) ? options.language : 'ko';
  const query = new URLSearchParams({ order: entry.orderId, c: entry.continuation, lang: language }).toString();
  return {
    storeId: s.storeId, channelKey: s.channelKey, paymentId: s.paymentId, orderName: quote.name, totalAmount: s.totalAmount,
    currency: 'KRW', payMethod: s.payMethod, productType: s.productType === 'DIGITAL' ? 'PRODUCT_TYPE_DIGITAL' : 'PRODUCT_TYPE_REAL',
    windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' }, customData: { version: 'v2', order_id: entry.orderId },
    redirectUrl: `${options.origin}/portone-return.html?${query}`,
    ...(s.buyer === 'NAME_EMAIL_PHONE' && options.buyer ? { customer: { fullName: options.buyer.fullName.trim(),
      email: options.buyer.email.trim(), phoneNumber: options.buyer.phoneNumber.trim() } } : {}),
    ...(s.easyPayProvider ? { easyPay: { easyPayProvider: s.easyPayProvider } } : {}),
    ...(s.virtualAccountValidHours !== null ? { virtualAccount: { accountExpiry: { validHours: s.virtualAccountValidHours } } } : {}),
    ...(sendGiftType ? { giftCertificate: { giftCertificateType: s.giftCertificateType } } : {}),
  };
}

/** Reads the PC SDK result. A provider code is not paid; a missing result is unknown and resolved by server lookup. */
export function readHostedResponse(value: unknown, paymentId: string): HostedResponse {
  if (value === undefined || value === null) return { kind: 'UNKNOWN' };
  const result = object(value);
  if (result.paymentId !== undefined && result.paymentId !== paymentId) throw new Error('PAYMENT_MISMATCH');
  if (result.code !== undefined && result.code !== null) return { kind: 'NOT_PAID' };
  if (result.paymentId === paymentId && text(result.txId, 200) && ID.test(result.txId)
    && typeof result.paymentToken === 'string' && /^[\x21-\x7e]{1,2048}$/.test(result.paymentToken)) {
    return { kind: 'CONFIRM', txId: result.txId, paymentToken: result.paymentToken };
  }
  return { kind: 'UNKNOWN' };
}

export function restoreHostedAttempt(storage: Storage, key: string): HostedAttempt | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const stored = object(JSON.parse(raw));
  exact(stored, ['input', 'launched'], ['quote']);
  const input = parseServerOrderRequest(stored.input);
  if (input?.provider !== 'portone' || input.billingCountry !== 'KR' || typeof stored.launched !== 'boolean'
    || (stored.quote !== undefined && !validQuote(stored.quote)) || (stored.launched && !stored.quote)) throw new Error('INVALID_ATTEMPT');
  return { input, launched: stored.launched, ...(stored.quote ? { quote: stored.quote as HostedQuote } : {}) };
}
export function saveHostedAttempt(storage: Storage, key: string, attempt: HostedAttempt) {
  storage.setItem(key, JSON.stringify({ input: attempt.input, launched: attempt.launched, ...(attempt.quote ? { quote: attempt.quote } : {}) }));
}

function readState(result: Record<string, unknown>, orderId: string): HostedState {
  if (result.orderId !== orderId || typeof result.state !== 'string' || !STATES.includes(result.state)) throw new Error('INVALID_STATUS');
  return result.state as HostedState;
}
// BLOCKED and UNAVAILABLE come back as 409 and 503 with the same closed body.
export async function confirmHosted(orderId: string, body: { paymentId: string; txId: string; paymentToken: string; continuation: string }) {
  return readState(await request(base(orderId) + 'confirm', body, [200, 409, 503]), orderId);
}
export async function lookupHosted(orderId: string) { return readState(await request(base(orderId) + 'lookup', {}, [200, 409, 503]), orderId); }
export async function readHostedStatus(orderId: string) { return readState(await request(base(orderId) + 'status', undefined, [200, 409, 503]), orderId); }
