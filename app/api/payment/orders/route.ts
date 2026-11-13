import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isServerOrderUuid, parseServerOrderRequest } from '@/lib/payment/server-order';
import { createServerOrder, ServerOrderError } from '@/lib/payment/server-order-repository';
import { logSafeError, logSafeWarn } from '@/utils/log-safe-error';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization' },
  });
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if (origin !== request.nextUrl.origin || (site !== null && site !== 'same-origin')) {
      return respond({ error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 403);
    }
    const media = request.headers.get('content-type');
    if (!media || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)
      || request.headers.has('content-encoding')) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
    const input = parseServerOrderRequest(await readBoundedJson(request));
    if (!input) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
    const client = await createSupabaseServerClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error) {
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
      }
      throw new ServerOrderError('AUTH');
    }
    if (!user) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
    if (!isServerOrderUuid(user.id)) throw new ServerOrderError('AUTH');
    // The RPC checks deletion under its wallet-user lock. A profile-read failure
    // must not be converted to a claim that the account was deleted.
    return respond(await createServerOrder({ ...input, actorUserId: user.id }));
  } catch (error) {
    const known = error instanceof ServerOrderError ? error : null;
    const code = known?.code ?? 'WEB_PAYMENT_ORDER_UNAVAILABLE';
    const status = known?.status ?? 503;
    if (status >= 500) {
      if (known?.eventCode === 'payment.order.business.unavailable') {
        logSafeWarn(known.eventCode, new Error(code));
      } else {
        logSafeError(known?.eventCode ?? 'payment.order.failed', new Error(code));
      }
    }
    return respond({ error: code }, status);
  }
}
