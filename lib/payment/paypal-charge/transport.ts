import 'server-only';
import { minorToPayPalValue, type PayPalEnvironment } from './protocol';

export type PayPalHttpResult = { kind: 'RESPONSE'; status: number; body: unknown } | { kind: 'TRANSPORT_UNKNOWN' };
type RequestBase = { environment: PayPalEnvironment; signal?: AbortSignal };
type Authorized = RequestBase & { accessToken: string };
export interface PayPalTransport {
  requestToken(input: RequestBase & { credential: { clientId: string; clientSecret: string } }): Promise<{ accessToken: string } | null>;
  createOrder(input: Authorized & { requestKey: string; orderId: string; amountMinor: string }): Promise<PayPalHttpResult>;
  getOrder(input: Authorized & { providerOrderId: string }): Promise<PayPalHttpResult>;
  captureOrder(input: Authorized & { providerOrderId: string; requestKey: string }): Promise<PayPalHttpResult>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Z0-9]{1,36}$/;
const UNKNOWN: PayPalHttpResult = { kind: 'TRANSPORT_UNKNOWN' };
function host(environment: unknown): string | null {
  return environment === 'LIVE' ? 'https://api-m.paypal.com' : environment === 'SANDBOX' ? 'https://api-m.sandbox.paypal.com' : null;
}
function headerValue(value: unknown): value is string {
  return valid(value, /^[\x21-\x7e]{1,8192}$/);
}
function valid(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 256 * 1024) { await reader.cancel(); return null; }
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    try { await reader.cancel(); } catch { /* The stream may already be closed. */ }
    return null;
  } finally { reader.releaseLock(); }
}

export function createPayPalFetchTransport(fetchImpl: typeof fetch): PayPalTransport {
  if (typeof fetchImpl !== 'function') throw new Error('PAYPAL_FETCH_REQUIRED');
  async function request(base: RequestBase, path: string, init: RequestInit, timeoutMs: number): Promise<PayPalHttpResult> {
    const origin = host(base.environment); if (!origin) return UNKNOWN;
    try {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = base.signal ? AbortSignal.any([deadline, base.signal]) : deadline;
      const response = await fetchImpl(`${origin}${path}`, { ...init, signal, redirect: 'error', cache: 'no-store' });
      return { kind: 'RESPONSE', status: response.status, body: await boundedJson(response) };
    } catch { return UNKNOWN; }
  }
  const authorizedHeaders = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  return {
    async requestToken(input) {
      if (!host(input.environment) || !headerValue(input.credential?.clientId) || !headerValue(input.credential?.clientSecret)) return null;
      const result = await request(input, '/v1/oauth2/token', { method: 'POST', headers: {
        authorization: `Basic ${Buffer.from(`${input.credential.clientId}:${input.credential.clientSecret}`, 'utf8').toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      }, body: 'grant_type=client_credentials' }, 10_000);
      if (result.kind !== 'RESPONSE' || result.status < 200 || result.status >= 300
        || !result.body || typeof result.body !== 'object' || Array.isArray(result.body)) return null;
      const body = result.body as Record<string, unknown>;
      return body.token_type === 'Bearer' && headerValue(body.access_token) ? { accessToken: body.access_token } : null;
    },
    async createOrder(input) {
      const value = minorToPayPalValue(input.amountMinor);
      if (!host(input.environment) || !headerValue(input.accessToken) || !valid(input.requestKey, UUID) || !valid(input.orderId, UUID) || !value) return UNKNOWN;
      return request(input, '/v2/checkout/orders', { method: 'POST', headers: { ...authorizedHeaders(input.accessToken),
        'PayPal-Request-Id': input.requestKey, Prefer: 'return=representation' },
        body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ custom_id: `v2:${input.orderId}`, amount: { currency_code: 'USD', value } }] }) }, 15_000);
    },
    async getOrder(input) {
      if (!host(input.environment) || !headerValue(input.accessToken) || !valid(input.providerOrderId, ID)) return UNKNOWN;
      return request(input, `/v2/checkout/orders/${input.providerOrderId}`, { method: 'GET', headers: authorizedHeaders(input.accessToken) }, 10_000);
    },
    async captureOrder(input) {
      if (!host(input.environment) || !headerValue(input.accessToken) || !valid(input.providerOrderId, ID) || !valid(input.requestKey, UUID)) return UNKNOWN;
      return request(input, `/v2/checkout/orders/${input.providerOrderId}/capture`, { method: 'POST', headers: { ...authorizedHeaders(input.accessToken),
        'PayPal-Request-Id': input.requestKey, Prefer: 'return=representation' }, body: '{}' }, 20_000);
    },
  };
}
