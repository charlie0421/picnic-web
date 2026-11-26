import { isServerOrderUuid, parseServerOrderRequest, type ServerOrderRequest } from './server-order';

import { isLocalPortOneDatabase } from './portone-test-local';

export type TestQuote = { orderId: string; name: string; amount: number; expiresAt: string };
export type TestAttempt = { input: ServerOrderRequest; quote?: TestQuote; submitted: boolean };
export type TestState = 'GRANTED' | 'PENDING' | 'BLOCKED' | 'UNAVAILABLE' | 'NOT_SUBMITTED';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}

function text(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function validQuote(value: unknown): value is TestQuote {
  if (!value || typeof value !== 'object') return false;
  const q = object(value);
  return isServerOrderUuid(q.orderId) && text(q.name, 255) && typeof q.amount === 'number' &&
    Number.isSafeInteger(q.amount) && q.amount > 0 && text(q.expiresAt, 64) && Number.isFinite(Date.parse(q.expiresAt));
}

export function restoreTestAttempt(key: string): TestAttempt | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  const stored = object(JSON.parse(raw));
  const input = parseServerOrderRequest(stored.input);
  if (input?.provider !== 'portone' || input.billingCountry !== 'KR' || typeof stored.submitted !== 'boolean' ||
    (stored.quote !== undefined && !validQuote(stored.quote)) || (stored.submitted && !stored.quote)) throw new Error('INVALID_ATTEMPT');
  return { input, submitted: stored.submitted, quote: stored.quote as TestQuote | undefined };
}

export class TestQuoteRefused extends Error {}

async function request(path: string, body?: unknown) {
  const response = await fetch(path, {method:body === undefined ? 'GET':'POST', cache:'no-store', credentials:'same-origin',
    redirect:'error', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(15000),
    ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})});
  if (!response.ok) {
    if (path === '/api/payment/orders' && response.status === 409 &&
      (await response.json().catch(() => null))?.error === 'WEB_PAYMENT_POLICY_CHANGED') throw new TestQuoteRefused();
    throw new Error('REQUEST_REFUSED');
  }
  return object(await response.json());
}

export async function readTestQuote(input: ServerOrderRequest): Promise<TestQuote> {
  if (!isLocalPortOneDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error('LOCAL_DATABASE_REQUIRED');
  const data = await request('/api/payment/orders', input);
  const q = object(data.quote);
  if (data.contractVersion !== 'web-payment-order.v1' || !isServerOrderUuid(data.orderId) || q.productId !== input.productId ||
    q.provider !== 'portone' || q.environment !== 'TEST' || q.billingCountry !== 'KR' || q.currency !== 'KRW' ||
    q.acceptedPolicyVersion !== input.acceptedPolicyVersion || typeof q.amountMinor !== 'string' || !/^[1-9][0-9]*$/.test(q.amountMinor))
    throw new Error('INVALID_QUOTE');
  const quote = {orderId:data.orderId, name:q.productName, amount:Number(q.amountMinor), expiresAt:q.expiresAt};
  if (!validQuote(quote)) throw new Error('INVALID_QUOTE');
  return quote;
}

const base = (id: string) => '/api/payment/orders/' + id + '/portone/';

export async function readTestEntry(quote: TestQuote, productId: string) {
  const entry = await request(base(quote.orderId) + 'checkout', {});
  if (entry.state !== 'READY' || entry.orderId !== quote.orderId || entry.productId !== productId ||
    entry.currency !== 'KRW' || entry.totalAmount !== quote.amount || !text(entry.paymentId, 200) ||
    !entry.paymentId.startsWith('web_') || !isServerOrderUuid(entry.paymentId.slice(4)) ||
    !text(entry.storeId, 200) || !text(entry.channelKey, 200) || (entry.method !== 'CARD' && entry.method !== 'KAKAOPAY') ||
    !text(entry.expiresAt, 64) || !(Date.parse(entry.expiresAt) > Date.now()) || !(Date.parse(quote.expiresAt) > Date.now()))
    throw new Error('ENTRY_REFUSED');
  return { paymentId:entry.paymentId, storeId:entry.storeId, channelKey:entry.channelKey, method:entry.method };
}

export function readTestToken(value: unknown, paymentId: string) {
  const result = object(value);
  if (result.code != null || result.paymentId !== paymentId || !text(result.txId, 200) || !text(result.paymentToken, 2048))
    throw new Error('NO_CONFIRMATION');
  return { txId:result.txId, paymentToken:result.paymentToken };
}

export async function readTestState(orderId: string, confirmation?: {txId:string; paymentToken:string}): Promise<TestState> {
  const result = await request(base(orderId) + (confirmation ? 'confirm' : 'status'), confirmation);
  if (result.orderId !== orderId || (result.state !== 'GRANTED' && result.state !== 'PENDING' && result.state !== 'BLOCKED' &&
    result.state !== 'UNAVAILABLE' && result.state !== 'NOT_SUBMITTED')) throw new Error('INVALID_STATUS');
  return result.state;
}
