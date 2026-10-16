import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextRequest, NextResponse } from 'next/server';
import { logSafeError } from '@/utils/log-safe-error';
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus';
import {
  createServiceRoleSupabaseClient,
  verifyPortOneWebhook,
  selectPaidPaymentId,
  verifyPortOnePayment,
  parseCustomData,
} from './webhook-helpers';

/**
 * SUMMARY (v2 — atomic RPC refactor, 2026-04-24)
 * -----------------------------------------------
 * The prior implementation performed four sequential writes against the DB:
 *   (1) receipts INSERT
 *   (2) star_candy_history INSERT
 *   (3) user_profiles.star_candy UPDATE (via increment_star_candy RPC)
 *   (4) star_candy_bonus_history INSERT + user_profiles.star_candy_bonus UPDATE
 *
 * If any of (2)-(4) failed AFTER (1) succeeded, the webhook swallowed the
 * error (kept 200) while the receipt row survived — and the receipts partial
 * unique index then rejected every retry as "already processed", leaving
 * users permanently uncredited. PortOne's own retry loop could not recover
 * the situation because our idempotency key had already been consumed.
 *
 * This refactor replaces (1)-(4) with a single rpc('process_portone_capture')
 * call. The RPC runs all four writes in a single PL/pgSQL transaction; any
 * internal failure rolls back the receipt insert too, so the user's next
 * webhook retry can succeed. Two idempotency layers (history pre-check +
 * receipts unique-index trap) both surface as a NULL return, which we map to
 * a 200 OK so PortOne stops retrying an already-credited payment.
 *
 * v3 (2026-10-17, #77 · audit B-P1/B-P2):
 *   - Signature: Standard Webhooks via @portone/server-sdk Webhook.verify on
 *     the raw body (webhook-id / webhook-timestamp / webhook-signature).
 *     The old HMAC-hex-of-JSON.stringify scheme could never match PortOne V2.
 *   - Body: 2024-04-25 envelope { type, data: { paymentId } } (and the older
 *     2024-01-01 { payment_id, status }). Only Transaction.Paid proceeds.
 *   - Amounts: star_candy / web_bonus_amount come from the products table and
 *     the paid amount must equal web_price_krw in KRW — the same rule as the
 *     PayPal capture route. customData supplies only userId and productId,
 *     because the browser writes customData.
 *
 * Unchanged:
 *   - Server-side SDK re-verification (paymentClient.getPayment) — we never
 *     trust amount/status from the webhook body
 *   - customData parsing from the SDK response (not the webhook body)
 *   - Withdrawn-user rejection (403)
 *   - Service-role Supabase client (required because the RPC is GRANTed to
 *     service_role only)
 *
 * Response-code policy for PortOne (important — semantics differ from a
 * user-facing endpoint):
 *   - 200 + ok:true    → "done, do not retry" (success OR idempotent no-op)
 *   - 400              → malformed payload, unknown product, amount mismatch
 *                        (PortOne will not retry — needs manual handling)
 *   - 401              → bad or missing signature
 *   - 500              → also when PORTONE_WEBHOOK_SECRET is not set
 *   - 403              → withdrawn user
 *   - 500 / 502        → transient failure; PortOne WILL retry, which is
 *                        what we want now that the RPC is transactional
 */
export const POST = withSafeErrors('payment.portone.webhook.post.unhandled', async function POST(request: NextRequest) {
  try {
    // 서명은 받은 원문 그대로 검증한다. 파싱 후 다시 직렬화하면 서명이 맞지 않는다(#77).
    const rawBody = await request.text();
    const verification = await verifyPortOneWebhook(rawBody, request.headers);
    if (!verification.ok) {
      if (verification.reason === 'secret_missing') {
        return NextResponse.json({ error: 'Webhook is not configured' }, { status: 500 });
      }
      logSafeError('payment.portone.webhook.signature.failed', undefined);
      return NextResponse.json(
        { error: 'Invalid or missing signature' },
        { status: 401 }
      );
    }

    // 결제 완료 이벤트만 처리한다. 나머지는 할 일이 없으므로 200 으로 재시도를 멈춘다.
    const selected = selectPaidPaymentId(verification.webhook);
    if (selected.ignored) {
      return NextResponse.json({ ok: true });
    }

    const paymentId = selected.paymentId;
    if (!paymentId) {
      logSafeError('payment.portone.webhook.payment_id.missing', undefined);
      return NextResponse.json(
        { error: 'Missing paymentId' },
        { status: 400 }
      );
    }

    // Supabase Service Role Client 생성
    // NOTE: service_role is required because process_portone_capture has
    // EXECUTE granted to service_role only (see migration 20260424000003).
    let supabase;
    try {
      supabase = createServiceRoleSupabaseClient();
    } catch (error) {
      logSafeError('payment.portone.webhook.database.failed', error);
      return NextResponse.json(
        { error: 'Failed to initialize database' },
        { status: 500 }
      );
    }

    // 포트원 v2 API로 결제 정보 검증 (PAID 상태일 때만)
    // 금액/상태는 절대 웹훅 본문만 믿지 않고 SDK로 재검증한다.
    let paymentData;
    try {
      paymentData = await verifyPortOnePayment(paymentId);
    } catch (error) {
      logSafeError('payment.portone.webhook.verification.failed', error, { paymentId });

      // Never fall back to unverified webhook data for payment processing.
      // Reject the webhook and let PortOne retry later.
      return NextResponse.json(
        { error: 'Payment verification failed' },
        { status: 502 }
      );
    }

    if (!paymentData) {
      return NextResponse.json(
        { error: 'Payment verification failed - no data returned' },
        { status: 400 }
      );
    }

    // 결제 완료 상태 확인 (포트원 v2 SDK: 'PAID')
    const paymentStatus = paymentData.status?.toUpperCase();
    if (paymentStatus !== 'PAID') {
      return NextResponse.json({ ok: true });
    }

    // customData에서 사용자 및 상품 정보 추출
    let customData;
    try {
      customData = parseCustomData(paymentData);
    } catch (e) {
      logSafeError('payment.portone.webhook.custom_data.failed', e, { paymentId });
      return NextResponse.json(
        { error: 'Invalid payment data' },
        { status: 400 }
      );
    }

    const userId = customData.userId || customData.user_id;
    const productId = customData.productId;

    // SECURITY: Email-based user lookup fallback was removed. user_profiles.email
    // is not unique-constrained and is set by the user on registration; allowing
    // it to identify the credit recipient meant a duplicate-email account or an
    // attacker who can influence paymentData.customer.email could redirect a
    // legitimate payment's star_candy to a different account. The PortOne checkout
    // flow MUST embed a verified userId in customData; missing → 400.

    // customData에서 필수 정보 확인
    if (!userId || !productId) {
      logSafeError('payment.portone.webhook.metadata.missing', undefined, { paymentId });

      return NextResponse.json(
        {
          error: 'Missing required data - customData must include userId and productId',

        },
        { status: 400 }
      );
    }

    // 지급량은 DB 상품이 정한다(audit B-P1). customData 는 브라우저가 쓰므로 지급량을 믿지 않는다.
    // 결제 금액·통화가 상품 가격과 다르면 적립하지 않는다 — PayPal capture 와 같은 규칙.
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, web_price_krw, star_candy, web_bonus_amount')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      logSafeError('payment.portone.webhook.product.failed', productError, { paymentId, productId, errorCode: productError.code });
      // 상품을 확인할 수 없으면 적립하지 않는다 — 500 이면 PortOne 이 재시도한다
      return NextResponse.json({ error: 'Failed to verify product' }, { status: 500 });
    }

    const paidAmount = paymentData.amount?.total;
    if (
      !product ||
      product.web_price_krw == null ||
      paidAmount !== product.web_price_krw ||
      paymentData.currency !== 'KRW'
    ) {
      logSafeError('payment.portone.webhook.amount.failed', undefined, {
        paymentId,
        userId,
        productId,
        amount: paidAmount,
        currency: paymentData.currency,
      });
      return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 });
    }

    const starCandy = product.star_candy ?? 0;
    const bonusAmount = product.web_bonus_amount ?? 0;

    // 탈퇴 회원 체크
    const { data: userProfile, error: userProfileError } = await supabase
      .from('user_profiles')
      .select('deleted_at')
      .eq('id', userId)
      .single();

    // 프로필 행 없음(PGRST116)은 탈퇴가 아니므로 진행한다. 그 외 조회 오류만 차단한다.
    if (userProfileError && userProfileError.code !== 'PGRST116') {
      logSafeError('payment.portone.webhook.profile.failed', userProfileError, { paymentId, userId, errorCode: userProfileError.code });
      // 탈퇴 여부를 확인할 수 없으면 적립하지 않는다 — 500 이면 PortOne 이 재시도한다(fail-closed)
      return NextResponse.json({ error: 'Failed to verify user status' }, { status: 500 });
    }

    if (userProfile?.deleted_at) {
      return NextResponse.json(
        { error: 'User is deleted or deactivated' },
        { status: 403 }
      );
    }

    // SDK 결제 객체의 결제 ID 는 id 필드다(PaidPayment.id).
    const actualPaymentId = paymentData.id || paymentId;
    const paymentMethod = paymentData.method?.type ?? 'port_one';

    // 영수증 payload (RPC에 jsonb로 전달). receipt_data 의 키 구성은 예전과 같고,
    // 값만 SDK 결제 객체의 실제 필드(amount.total, method.type, paidAt)에서 읽는다.
    const receiptData = {
      payment_id: actualPaymentId,
      paymentId: actualPaymentId,
      amount: paidAmount,
      currency: paymentData.currency,
      payment_method: paymentMethod,
      status: paymentData.status,
      approvedAt: paymentData.paidAt || null,
      payment_details: paymentData,
    };

    // Atomic processing: receipt insert + star_candy history + balance
    // increment (and bonus equivalents) all happen inside a single PL/pgSQL
    // transaction via process_portone_capture. This closes the prior failure
    // mode where the receipt row was inserted but a downstream balance update
    // failed silently, leaving the user permanently uncredited (the receipt's
    // unique index would reject every retry as "already processed"). Now any
    // internal failure rolls back the receipt insert too, restoring retry
    // safety.
    //
    // SECURITY: The RPC is SECURITY DEFINER and trusts caller-supplied
    // amounts (it has no internal authorization check). EXECUTE is granted to
    // service_role only — granting it to `authenticated` would let any
    // logged-in user POST directly to /rest/v1/rpc/process_portone_capture
    // and credit themselves arbitrary star_candy. We therefore invoke it via
    // the service-role client created above; `createServiceRoleSupabaseClient`
    // already uses SUPABASE_SERVICE_ROLE_KEY (see webhook-helpers.ts).
    //
    // process_portone_capture is now in generated Database types after
    // npm run gen:types, so the temporary `as unknown as ...` widening cast
    // has been removed.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'process_portone_capture',
      {
        p_user_id: userId,
        p_payment_id: actualPaymentId,
        p_product_id: productId,
        p_star_candy: starCandy,
        p_bonus_amount: bonusAmount,
        p_total_amount: paidAmount,
        p_currency: paymentData.currency,
        p_status: paymentData.status ?? 'PAID',
        p_method: paymentMethod,
        p_environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        p_receipt_data: receiptData,
        p_verification_data: paymentData,
        p_bonus_expiry: getStarCandyBonusExpiryISO(),
      },
    );

    if (rpcError) {
      logSafeError('payment.portone.webhook.capture.failed', rpcError, { paymentId: actualPaymentId, userId, productId, errorCode: rpcError.code });
      // 500 so PortOne retries — the RPC either rolled back cleanly (nothing
      // to reconcile) or failed before any write, so retry is safe.
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // RPC returns NULL when either idempotency layer short-circuits
    // (history pre-check or receipts unique-index trap). Treat as already
    // processed and return 200 so PortOne stops retrying.
    if (rpcResult == null) {
      return NextResponse.json({ ok: true, message: 'Already processed' });
    }

    return NextResponse.json({ ok: true, receipt_id: rpcResult.receipt_id });

  } catch (error) {
    logSafeError('payment.portone.webhook.failed', error);

    // 500을 반환하여 PortOne이 재시도하도록 한다. 이제 모든 DB write 는
    // 단일 트랜잭션이므로 재시도해도 중복 적립이 발생하지 않는다 (receipts
    // 파셜 유니크 인덱스 + history pre-check 이중 방어).
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
});
