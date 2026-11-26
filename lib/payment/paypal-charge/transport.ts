import 'server-only';
import { minorToPayPalValue, type PayPalEnvironment } from './protocol';

// bodyStatus states why body is or is not available. Every non-PARSED status keeps body:null.
// PARSED can also carry body:null when the response is the JSON literal null.
export type PayPalBodyStatus = 'PARSED' | 'EMPTY' | 'OVERSIZE' | 'INVALID_UTF8' | 'INVALID_JSON' | 'STREAM_ERROR';
export type PayPalHttpResult = { kind: 'RESPONSE'; status: number; body: unknown; bodyStatus: PayPalBodyStatus }
  | { kind: 'TRANSPORT_UNKNOWN' };
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

const MAX_BODY_BYTES = 256 * 1024;
type BoundedBody = { body: unknown; bodyStatus: PayPalBodyStatus };
const nullBody = (bodyStatus: Exclude<PayPalBodyStatus, 'PARSED'>): BoundedBody => ({ body: null, bodyStatus });

async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try { await reader.cancel(); } catch { /* The stream may already be closed or errored. */ }
}

// Never throws. Reads at most MAX_BODY_BYTES, then decodes the whole buffer once so that a
// multi-byte character split across chunks is valid.
async function boundedJson(response: Response): Promise<BoundedBody> {
  if (!response.body) return nullBody('EMPTY');
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = response.body.getReader(); } catch { return nullBody('STREAM_ERROR'); }
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try { next = await reader.read(); } catch { await cancelQuietly(reader); return nullBody('STREAM_ERROR'); }
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await cancelQuietly(reader); return nullBody('OVERSIZE'); }
      chunks.push(next.value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* The lock may already be released. */ }
  }
  if (bytes === 0) return nullBody('EMPTY');
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { return nullBody('INVALID_UTF8'); }
  try { return { body: JSON.parse(text), bodyStatus: 'PARSED' }; } catch { return nullBody('INVALID_JSON'); }
}

export function createPayPalFetchTransport(fetchImpl: typeof fetch): PayPalTransport {
  if (typeof fetchImpl !== 'function') throw new Error('PAYPAL_FETCH_REQUIRED');
  async function request(base: RequestBase, path: string, init: RequestInit, timeoutMs: number): Promise<PayPalHttpResult> {
    const origin = host(base.environment); if (!origin) return UNKNOWN;
    try {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = base.signal ? AbortSignal.any([deadline, base.signal]) : deadline;
      const response = await fetchImpl(`${origin}${path}`, { ...init, signal, redirect: 'error', cache: 'no-store' });
      const { body, bodyStatus } = await boundedJson(response);
      return { kind: 'RESPONSE', status: response.status, body, bodyStatus };
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
