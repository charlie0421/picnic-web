import 'server-only';
import type { NextRequest } from 'next/server';
import { ADMIN_FLAG_COLUMNS, isAdminProfile } from '@/lib/auth/is-admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isLocalPortOneDatabase } from '@/lib/payment/portone-test-local';
import { boundedId, UUID } from './protocol';
import { createPortOneTestDependencies } from './runtime';
import { checkoutPortOneTest, confirmPortOneTest, getPortOneTestStatus, type PortOneTestResult } from './service';

type Action = 'checkout' | 'confirm' | 'status';
function respond(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization' } });
}
function allowedOrigin(request: NextRequest, post: boolean) {
  const site = request.headers.get('sec-fetch-site'); const origin = request.headers.get('origin');
  return ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)
    && (site === null || site === 'same-origin') && (origin === request.nextUrl.origin || (!post && origin === null));
}
async function readText(request: NextRequest): Promise<string | null> {
  const media = request.headers.get('content-type');
  if (!media || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(media)
    || request.headers.has('content-encoding') || !request.body) return null;
  const reader = request.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { let text = ''; let bytes = 0;
        while (true) { const part = await reader.read(); if (part.done) return text + decoder.decode();
          bytes += part.value.byteLength; if (bytes > 4096) return null;
          text += decoder.decode(part.value, { stream: true }); }
      })(),
      new Promise<null>(resolve => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); resolve(null); }, 5000); }),
    ]);
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}
async function parsePost(request: NextRequest, action: Action): Promise<{ txId?: string; paymentToken?: string } | null> {
  const text = await readText(request);
  if (text === null) return null;
  if (action === 'checkout') return /^[ \t\r\n]*\{[ \t\r\n]*\}[ \t\r\n]*$/.test(text) ? {} : null;
  const string = '"(?:[^"\\\\\\u0000-\\u001f]|\\\\["\\\\/bfnrt]|\\\\u[0-9a-fA-F]{4})*"';
  const ws = '[ \\t\\r\\n]*';
  const tx = `"txId"${ws}:${ws}${string}`;
  const token = `"paymentToken"${ws}:${ws}${string}`;
  const shape = new RegExp(`^${ws}\\{${ws}(?:${tx}${ws},${ws}${token}|${token}${ws},${ws}${tx})${ws}\\}${ws}$`);
  if (!shape.test(text)) return null;
  try {
    const d = JSON.parse(text) as Record<string, unknown>;
    return boundedId(d.txId) && typeof d.paymentToken === 'string' && /^[\x21-\x7e]{1,2048}$/.test(d.paymentToken)
      ? { txId: d.txId, paymentToken: d.paymentToken } : null;
  } catch { return null; }
}
function project(result: PortOneTestResult): PortOneTestResult {
  if (result.state === 'READY') return { state: 'READY', orderId: result.orderId, paymentId: result.paymentId, storeId: result.storeId,
    channelKey: result.channelKey, method: result.method, productId: result.productId, totalAmount: result.totalAmount,
    currency: 'KRW', expiresAt: result.expiresAt };
  return { state: result.state, orderId: result.orderId };
}
export function createPortOneTestOrderHandler(action: Action) {
  return async (request: NextRequest, context: { params: Promise<{ orderId: string }> }): Promise<Response> => {
    let id: string | undefined;
    try {
      const post = action !== 'status';
      if (!allowedOrigin(request, post)) return respond({ error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 403);
      if (request.method !== (post ? 'POST' : 'GET')) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 405);
      const { orderId } = await context.params;
      if (!UUID.test(orderId) || request.nextUrl.search) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
      id = orderId;
      const body = post ? await parsePost(request, action) : {};
      if (!body) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
      if (!isLocalPortOneDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL)) return respond({ state: 'UNAVAILABLE', orderId: id }, 503);
      const session = await createSupabaseServerClient();
      const { data, error } = await session.auth.getUser();
      if (error) {
        if (error.status && [400, 401, 403].includes(error.status)) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
        throw new Error('PORTONE_TEST_UNAVAILABLE');
      }
      if (!data.user) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
      if (!UUID.test(data.user.id)) throw new Error('PORTONE_TEST_UNAVAILABLE');
      const input = { actorUserId: data.user.id, orderId: id };
      if (post) {
        const profile = await session.from('user_profiles').select(ADMIN_FLAG_COLUMNS).eq('id', input.actorUserId).maybeSingle();
        if (profile.error) throw new Error('PORTONE_TEST_UNAVAILABLE');
        if (!isAdminProfile(profile.data)) return respond({ state: 'BLOCKED', orderId: id }, 403);
      }
      const deps = createPortOneTestDependencies();
      const result = action === 'checkout' ? await checkoutPortOneTest(deps, input)
        : action === 'confirm' ? await confirmPortOneTest(deps, { ...input, txId: body.txId!, paymentToken: body.paymentToken! })
        : await getPortOneTestStatus(deps, input);
      return respond(project(result), result.state === 'UNAVAILABLE' ? 503 : result.state === 'BLOCKED' ? 409 : 200);
    } catch { return respond(id ? { state: 'UNAVAILABLE', orderId: id } : { error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 503); }
  };
}
