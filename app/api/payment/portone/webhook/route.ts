import { NextRequest, NextResponse } from 'next/server';
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus';
import {
  createServiceRoleSupabaseClient,
  verifyWebhookSignature,
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
 * Unchanged:
 *   - Webhook signature verification (HMAC-SHA256 via PORTONE_WEBHOOK_SECRET)
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
 *   - 400              → malformed payload (PortOne will not retry — our bug)
 *   - 401              → bad signature
 *   - 403              → withdrawn user
 *   - 500 / 502        → transient failure; PortOne WILL retry, which is
 *                        what we want now that the RPC is transactional
 */
export async function POST(request: NextRequest) {
  try {
    // 웹훅 payload 파싱
    const body = await request.json();

    // READY 상태는 가능한 한 일찍 반환하여 불필요한 처리 방지
    const status = body.status || body.payment_status;
    const normalizedStatus = status?.toUpperCase();

    if (normalizedStatus === 'READY') {
      // Ready 상태는 결제 시작 알림일 뿐이므로, 즉시 성공 응답 반환
      // Supabase 클라이언트 생성이나 다른 처리를 하지 않음
      return NextResponse.json({ ok: true, message: 'Payment is ready, waiting for completion' });
    }

    // Supabase Service Role Client 생성
    // NOTE: service_role is required because process_portone_capture has
    // EXECUTE granted to service_role only (see migration 20260424000003).
    let supabase;
    try {
      supabase = createServiceRoleSupabaseClient();
    } catch (error) {
      console.error('[Webhook] Failed to create Supabase client:', error);
      return NextResponse.json(
        { error: 'Failed to initialize database', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }

    // 웹훅 서명 검증 (필수)
    const signature = request.headers.get('x-portone-signature') ||
                      request.headers.get('x-iamport-signature') ||
                      request.headers.get('portone-signature') ||
                      '';

    if (!verifyWebhookSignature(body, signature)) {
      console.error('[Webhook] Webhook signature verification failed');
      return NextResponse.json(
        { error: 'Invalid or missing signature' },
        { status: 401 }
      );
    }

    // 포트원 v2 웹훅에서 paymentId 및 tx_id 추출
    const paymentId = body.paymentId ||
                       body.payment_id ||
                       body.merchant_uid ||
                       body.merchantUid ||
                       body.id;

    // paymentId는 반드시 필요
    if (!paymentId) {
      console.error('[Webhook] Missing paymentId in webhook payload');
      return NextResponse.json(
        { error: 'Missing paymentId', receivedBody: body },
        { status: 400 }
      );
    }

    // READY가 아닌 다른 상태도 확인 (PAID가 아닌 경우)
    if (normalizedStatus !== 'PAID') {
      return NextResponse.json({ ok: true });
    }

    // 포트원 v2 API로 결제 정보 검증 (PAID 상태일 때만)
    // 금액/상태는 절대 웹훅 본문만 믿지 않고 SDK로 재검증한다.
    let paymentData;
    try {
      paymentData = await verifyPortOnePayment(paymentId);
    } catch (error) {
      console.error('[Webhook] Payment verification error:', error instanceof Error ? error.message : String(error));

      // Never fall back to unverified webhook data for payment processing.
      // Reject the webhook and let PortOne retry later.
      return NextResponse.json(
        { error: 'Payment verification failed', paymentId },
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
      console.error('[Webhook] Failed to parse custom data:', e);
      return NextResponse.json(
        { error: 'Invalid payment data', details: e instanceof Error ? e.message : 'Parse error' },
        { status: 400 }
      );
    }

    let userId = customData.userId || customData.user_id;
    const productId = customData.productId;
    const starCandy = customData.starCandy || 0;
    const bonusAmount = customData.bonusAmount || 0;

    // userId가 없으면 paymentData.customer.email로 사용자 찾기 (fallback)
    if (!userId && paymentData.customer?.email) {
      try {
        const { data: userByEmail } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('email', paymentData.customer.email)
          .maybeSingle();

        if (userByEmail?.user_id) {
          userId = userByEmail.user_id;
        }
      } catch (emailLookupError) {
        console.error('[Webhook] Failed to lookup user by email:', emailLookupError);
      }
    }

    // customData에서 필수 정보 확인
    if (!userId || !productId) {
      console.error('[Webhook] Missing userId or productId in custom data:', { paymentId });

      return NextResponse.json(
        {
          error: 'Missing required data - customData must include userId and productId',
          details: {
            paymentId,
            message: 'PortOne v2 payment verification should return customData. Please ensure customData is properly set in payment request.',
            webhookBodyKeys: Object.keys(body),
            customDataKeys: Object.keys(customData),
            paymentDataKeys: Object.keys(paymentData),
            customerEmail: paymentData.customer?.email,
          }
        },
        { status: 400 }
      );
    }

    // 탈퇴 회원 체크
    const { data: userProfile, error: userProfileError } = await supabase
      .from('user_profiles')
      .select('deleted_at')
      .eq('id', userId)
      .single();

    if (userProfileError) {
      console.error('[Webhook] Failed to check user profile:', userProfileError);
    }

    if (userProfile?.deleted_at) {
      console.warn(`[Webhook] User ${userId} is a withdrawn user, rejecting payment`);
      return NextResponse.json(
        { error: 'User is deleted or deactivated' },
        { status: 403 }
      );
    }

    // paymentData에서 실제 paymentId 가져오기 (포트원 v2: paymentId)
    const actualPaymentId = paymentData.paymentId || paymentId;
    const receiptHash = actualPaymentId;

    // 영수증 payload (RPC에 jsonb로 전달). 기존 createReceipt 헬퍼와 동일한
    // 필드 구성을 유지하여 receipt_data 컬럼 내용이 바뀌지 않도록 한다.
    const receiptData = {
      payment_id: actualPaymentId,
      paymentId: actualPaymentId,
      amount: paymentData.totalAmount,
      currency: paymentData.currency,
      payment_method: paymentData.method || 'port_one',
      status: paymentData.status,
      approvedAt: paymentData.approvedAt || null,
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
    // Cast: `process_portone_capture` is added by migration
    // 20260424000003_create_process_portone_capture_rpc.sql. The generated
    // Supabase types lag the migration until `npm run gen:types` is rerun
    // post-deploy, so we temporarily widen the rpc surface here.
    const { data: rpcResult, error: rpcError } = await (
      supabase.rpc as unknown as (
        fn: string,
        params: Record<string, unknown>
      ) => Promise<{ data: { receipt_id: number } | null; error: unknown }>
    )('process_portone_capture', {
      p_user_id: userId,
      p_payment_id: actualPaymentId,
      p_product_id: productId,
      p_star_candy: starCandy,
      p_bonus_amount: bonusAmount,
      p_total_amount: paymentData.totalAmount ?? 0,
      p_currency: paymentData.currency ?? null,
      p_status: paymentData.status ?? 'PAID',
      p_method: paymentData.method ?? 'port_one',
      p_environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
      p_receipt_data: receiptData,
      p_verification_data: paymentData,
      p_bonus_expiry: getStarCandyBonusExpiryISO(),
    });

    if (rpcError) {
      console.error('[Webhook] process_portone_capture failed:', rpcError);
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
    console.error('[Webhook] Processing error:', error instanceof Error ? error.message : String(error));

    // 500을 반환하여 PortOne이 재시도하도록 한다. 이제 모든 DB write 는
    // 단일 트랜잭션이므로 재시도해도 중복 적립이 발생하지 않는다 (receipts
    // 파셜 유니크 인덱스 + history pre-check 이중 방어).
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        // 개발 환경에서만 상세 정보 제공
        ...(process.env.NODE_ENV !== 'production' && {
          details: error instanceof Error ? error.stack : String(error)
        })
      },
      { status: 500 }
    );
  }
}
