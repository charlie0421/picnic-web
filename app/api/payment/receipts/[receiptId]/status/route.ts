import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isWithdrawnUser } from '@/lib/supabase/server';
import { parsePurchaseLookup } from '@/lib/payment/purchase-status';
import { PurchaseStatusUnavailable, readOwnedPurchaseStatus } from '@/lib/payment/purchase-status-repository';
import { logSafeError } from '@/utils/log-safe-error';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization',
  } });
}

/** Read-only recovery remains available regardless of new-sale availability switches. */
export async function GET(request: NextRequest, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error && (!error.status || error.status >= 500)) {
      return respond({ error: 'PURCHASE_STATUS_UNAVAILABLE' }, 503);
    }
    if (error || !user) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
    if (await isWithdrawnUser(user.id, { failClosed: true })) return respond({ error: 'ACCOUNT_UNAVAILABLE' }, 403);
    const { receiptId } = await context.params;
    const lookup = parsePurchaseLookup(receiptId, request.nextUrl.searchParams);
    if (!lookup) return respond({ error: 'INVALID_PURCHASE_LOOKUP' }, 400);
    const dto = await readOwnedPurchaseStatus({ ...lookup, actorUserId: user.id }, client);
    return dto ? respond(dto) : respond({ error: 'PURCHASE_NOT_FOUND' }, 404);
  } catch (error) {
    logSafeError(error instanceof PurchaseStatusUnavailable ? error.eventCode : 'payment.receipt_status.failed', error);
    return respond({ error: 'PURCHASE_STATUS_UNAVAILABLE' }, 503);
  }
}
