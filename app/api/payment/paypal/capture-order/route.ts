import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus';

const PAYPAL_API_URL = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

// Get PayPal access token
async function getPayPalAccessToken(): Promise<string> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error('Failed to get PayPal access token');
  }

  return data.access_token;
}

// Whitelist of PayPal capture-orders v2 fields safe to persist in receipts.
//
// Why a whitelist (not a strip-list): the v2 response embeds PII in several
// places (payer.email_address, payer.name, purchase_units[].shipping.name /
// .address, purchase_units[].payments.captures[].payee.email_address, etc.).
// Stripping known paths is fragile — any new PayPal field would leak by
// default. We extract only what audit/debugging actually needs:
// identifiers, status, timestamps, and the amount tuple. Anything missing
// (full payer record, shipping, payee) can be re-fetched from PayPal by
// capture_id from an ops console when needed.
function extractSafeCaptureFields(captureData: any) {
  return {
    id: captureData?.id,
    status: captureData?.status,
    create_time: captureData?.create_time,
    update_time: captureData?.update_time,
    intent: captureData?.intent,
    purchase_units: captureData?.purchase_units?.map((unit: any) => ({
      reference_id: unit?.reference_id,
      amount: unit?.amount, // { currency_code, value }
      custom_id: unit?.custom_id,
      // payee, shipping, payer intentionally omitted (PII / non-essential)
      payments: {
        captures: unit?.payments?.captures?.map((cap: any) => ({
          id: cap?.id,
          status: cap?.status,
          amount: cap?.amount,
          create_time: cap?.create_time,
          update_time: cap?.update_time,
          // payee intentionally omitted
        })),
      },
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderID } = body;

    if (!orderID) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Capture the order
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await response.json();

    if (!response.ok) {
      console.error('PayPal capture failed:', captureData);
      return NextResponse.json(
        { error: 'Failed to capture PayPal order' },
        { status: 500 }
      );
    }

    // Verify the payment was successful
    if (captureData.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 400 }
      );
    }

    // Extract custom data — only productId/userId are trusted from custom_id.
    // Defensive guard: PayPal v2 contract guarantees purchase_units[0] for a
    // single-unit order, but if the field is ever missing or empty we should
    // 400 cleanly rather than throw a TypeError on the next line.
    const purchaseUnit = captureData.purchase_units?.[0];
    if (!purchaseUnit) {
      console.error('PayPal capture missing purchase_units:', { orderID });
      return NextResponse.json(
        { error: 'Invalid PayPal response' },
        { status: 400 }
      );
    }
    let customData: { productId?: string; userId?: string };
    try {
      customData = JSON.parse(purchaseUnit.custom_id || '{}');
    } catch {
      console.error('Invalid custom_id payload:', purchaseUnit.custom_id);
      return NextResponse.json(
        { error: 'Invalid payment metadata' },
        { status: 400 }
      );
    }

    const { productId, userId } = customData;

    if (!productId || !userId) {
      return NextResponse.json(
        { error: 'Invalid payment metadata' },
        { status: 400 }
      );
    }

    // Prevent payment hijacking: the captured order's userId must match the authenticated user
    if (userId !== user.id) {
      console.error('User mismatch on capture', { orderID, customUserId: userId, authUserId: user.id });
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Server-authoritative product lookup — re-derive amounts from DB, never trust custom_id
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, web_price_usd, star_candy, web_bonus_amount')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      console.error('Product lookup failed on capture:', productError);
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    if (!product || product.web_price_usd == null) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Tamper detection: PayPal-captured amount/currency must match DB price
    const expectedValue = product.web_price_usd.toFixed(2);
    if (
      purchaseUnit.amount?.value !== expectedValue ||
      purchaseUnit.amount?.currency_code !== 'USD'
    ) {
      console.error('Amount mismatch on capture', {
        orderID,
        expected: expectedValue,
        actual: purchaseUnit.amount,
      });
      return NextResponse.json(
        { error: 'Payment amount mismatch' },
        { status: 400 }
      );
    }

    const starCandy = product.star_candy ?? 0;
    const bonusAmount = product.web_bonus_amount ?? 0;

    // Fast-path idempotency check — maybeSingle avoids PGRST116 false-error path.
    // Authoritative idempotency is enforced below via the receipts_web_completed_unique
    // partial index; this lookup just lets us short-circuit before doing extra work.
    //
    // Scope: must match the partial unique index (platform='web', status='completed').
    // Without these filters, a row with the same receipt_hash on another platform
    // (iOS/Android) or with status='duplicate' would (a) yield a false-positive
    // "already processed" response, and (b) cause maybeSingle to fail with a
    // multi-row error if more than one such row exists.
    const { data: existingReceipt, error: existingReceiptError } = await supabase
      .from('receipts')
      .select('id')
      .eq('receipt_hash', orderID)
      .eq('platform', 'web')
      .eq('status', 'completed')
      .maybeSingle();

    if (existingReceiptError) {
      console.error('Receipt lookup failed:', existingReceiptError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    if (existingReceipt) {
      return NextResponse.json(
        { error: 'Payment already processed' },
        { status: 400 }
      );
    }

    // PII hardening: PayPal capture-orders v2 responses contain payer/shipping/
    // payee data we have no business persisting (email addresses, full name,
    // address, merchant payee). We use a strict whitelist instead of stripping
    // known fields so future PayPal additions cannot silently leak new PII into
    // our receipts table. Anything we'd ever need for ops/refund flows can be
    // re-fetched from PayPal by capture_id.
    const safeCaptureData = extractSafeCaptureFields(captureData);

    // Atomic processing: receipt insert + star_candy history + balance increment
    // (and bonus equivalents) all happen inside a single PL/pgSQL transaction
    // via process_paypal_capture. This closes the prior failure mode where the
    // receipt row was inserted but a downstream balance update failed silently,
    // leaving the user permanently uncredited (the receipt's unique index would
    // reject every retry as "already processed"). Now any internal failure
    // rolls back the receipt insert too, restoring retry safety.
    //
    // SECURITY: The RPC is SECURITY DEFINER and trusts caller-supplied amounts
    // (it has no internal authorization check). EXECUTE is granted to
    // service_role only — granting it to `authenticated` would let any
    // logged-in user POST directly to /rest/v1/rpc/process_paypal_capture and
    // credit themselves arbitrary star_candy. We therefore invoke it with a
    // dedicated service-role client; the user-bound `supabase` above is only
    // used for auth and product lookups (both still enforce RLS).
    // Cast: `process_paypal_capture` is added by migration
    // 20260424000002_create_process_paypal_capture_rpc.sql. The generated
    // Supabase types lag the migration until `npm run gen:types` is rerun
    // post-deploy, so we temporarily widen the rpc surface here.
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: rpcResult, error: rpcError } = await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        params: Record<string, unknown>
      ) => Promise<{ data: { receipt_id: number } | null; error: unknown }>
    )('process_paypal_capture', {
      p_user_id: user.id,
      p_order_id: orderID,
      p_capture_id: captureData.id,
      p_product_id: productId,
      p_star_candy: starCandy,
      p_bonus_amount: bonusAmount,
      p_amount: purchaseUnit.amount.value,
      p_currency: purchaseUnit.amount.currency_code,
      p_status: captureData.status,
      p_environment: process.env.PAYPAL_ENV === 'production' ? 'production' : 'sandbox',
      p_payment_details: safeCaptureData,
      p_verification_data: safeCaptureData,
      p_bonus_expiry: getStarCandyBonusExpiryISO(),
    });

    if (rpcError) {
      console.error('process_paypal_capture failed:', rpcError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // RPC returns NULL when the receipts unique index trips — i.e. another
    // concurrent capture (or earlier successful retry) already credited this
    // orderID. Treat as idempotent.
    if (rpcResult == null) {
      return NextResponse.json(
        { error: 'Payment already processed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      receipt_id: rpcResult.receipt_id,
      message: 'Payment captured and processed successfully',
    });

  } catch (error) {
    console.error('Capture order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
