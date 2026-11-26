import 'server-only';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { boundedId, UUID } from '../portone-test/protocol';
import { createPortOneHostedDependencies } from './runtime';
import { checkoutPortOneHosted, confirmPortOneHosted, getPortOneHostedStatus, lookupPortOneHosted, type HostedResult } from './service';

type Action = 'checkout' | 'confirm' | 'status' | 'lookup';
type ConfirmBody = { paymentId: string; txId: string; paymentToken: string; continuation: string };
const PAYMENT_ID = /^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONFIRM_KEYS = ['paymentId', 'txId', 'paymentToken', 'continuation'];

function respond(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization',
    'Referrer-Policy': 'no-referrer' } });
}
function sameOrigin(request: NextRequest, post: boolean) {
  const site = request.headers.get('sec-fetch-site'); const origin = request.headers.get('origin');
  return (site === null || site === 'same-origin') && (origin === request.nextUrl.origin || (!post && origin === null));
}
async function readText(request: NextRequest): Promise<string | null> {
  const media = request.headers.get('content-type');
  if (!media || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(media)
    || request.headers.has('content-encoding') || !request.body) return null;
  const reader = request.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let text = ''; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      bytes += part.value.byteLength;
      if (bytes > 4096) return null;
      text += decoder.decode(part.value, { stream: true });
    }
  } catch { return null; }
  finally { void reader.cancel().catch(() => undefined); }
}
// Every confirmation field is a flat string. Counting colons outside strings rejects duplicate keys that JSON.parse would merge.
function topLevelColons(text: string): number {
  let inString = false; let escape = false; let colons = 0;
  for (const char of text) {
    if (escape) { escape = false; continue; }
    if (inString && char === '\\') { escape = true; continue; }
    if (char === '"') inString = !inString;
    else if (!inString && char === ':') colons++;
  }
  return colons;
}
async function parseBody(request: NextRequest, action: Action): Promise<ConfirmBody | Record<string, never> | null> {
  if (action === 'status') return {};
  const text = await readText(request);
  if (text === null) return null;
  if (action !== 'confirm') return /^[ \t\r\n]*\{[ \t\r\n]*\}[ \t\r\n]*$/.test(text) ? {} : null;
  try {
    const d: unknown = JSON.parse(text);
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const v = d as Record<string, unknown>;
    if (Object.keys(v).length !== CONFIRM_KEYS.length || !CONFIRM_KEYS.every(key => typeof v[key] === 'string')
      || topLevelColons(text) !== CONFIRM_KEYS.length) return null;
    const body = v as ConfirmBody;
    return PAYMENT_ID.test(body.paymentId) && boundedId(body.txId) && /^[\x21-\x7e]{1,2048}$/.test(body.paymentToken)
      && /^[A-Za-z0-9._-]{1,200}$/.test(body.continuation) ? body : null;
  } catch { return null; }
}
// Explicit projection: only public SDK settings and the bounded continuation leave the server.
function project(result: HostedResult): HostedResult {
  if (result.state !== 'READY') return { state: result.state, orderId: result.orderId };
  const s = result.sdk;
  return { state: 'READY', orderId: result.orderId, environment: result.environment, productId: result.productId, expiresAt: result.expiresAt,
    continuation: result.continuation, sdk: { storeId: s.storeId, channelKey: s.channelKey, paymentId: s.paymentId,
      totalAmount: s.totalAmount, currency: 'KRW', payMethod: s.payMethod, easyPayProvider: s.easyPayProvider, buyer: s.buyer,
      productType: s.productType, virtualAccountValidHours: s.virtualAccountValidHours, giftCertificateType: s.giftCertificateType,
      isTestChannel: s.isTestChannel } };
}

/** Normal production entry. The DB decides eligibility (TEST admin, or an eligible LIVE user); no local admin gate here. */
export function createPortOneHostedOrderHandler(action: Action) {
  return async (request: NextRequest, context: { params: Promise<{ orderId: string }> }): Promise<Response> => {
    let id: string | undefined;
    try {
      const post = action !== 'status';
      if (!sameOrigin(request, post)) return respond({ error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 403);
      if (request.method !== (post ? 'POST' : 'GET')) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 405);
      const { orderId } = await context.params;
      if (!UUID.test(orderId) || request.nextUrl.search) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
      id = orderId;
      const body = await parseBody(request, action);
      if (!body) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
      const session = await createSupabaseServerClient();
      const { data, error } = await session.auth.getUser();
      if (error) {
        if (error.status && [400, 401, 403].includes(error.status)) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
        throw new Error('PORTONE_HOSTED_UNAVAILABLE');
      }
      if (!data.user) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
      if (!UUID.test(data.user.id)) throw new Error('PORTONE_HOSTED_UNAVAILABLE');
      const input = { actorUserId: data.user.id, orderId: id };
      const deps = createPortOneHostedDependencies();
      const result = action === 'checkout' ? await checkoutPortOneHosted(deps, input)
        : action === 'confirm' ? await confirmPortOneHosted(deps, { ...input, ...(body as ConfirmBody) })
        : action === 'lookup' ? await lookupPortOneHosted(deps, input) : await getPortOneHostedStatus(deps, input);
      return respond(project(result), result.state === 'UNAVAILABLE' ? 503 : result.state === 'BLOCKED' ? 409 : 200);
    } catch { return respond(id ? { state: 'UNAVAILABLE', orderId: id } : { error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 503); }
  };
}
