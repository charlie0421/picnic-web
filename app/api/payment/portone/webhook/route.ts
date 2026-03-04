import { NextRequest, NextResponse } from 'next/server';
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus';
import {
  createServiceRoleSupabaseClient,
  verifyWebhookSignature,
  verifyPortOnePayment,
  parseCustomData,
  createReceipt,
  updateStarCandyBalance,
  processStarCandyBonus,
} from './webhook-helpers';

/**
 * 포트원 웹훅 처리
 * 포트원 서버에서 결제 완료 시 자동으로 호출됩니다.
 *
 * 웹훅 payload 구조 (포트원 문서 참고):
 * - merchant_uid: 우리가 생성한 paymentId
 * - imp_uid: 포트원 결제 고유 ID
 * - status: 결제 상태
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
    // 포트원 v2 웹훅 payload 구조 확인 필요
    const paymentId = body.paymentId ||
                       body.payment_id ||
                       body.merchant_uid ||
                       body.merchantUid ||
                       body.id;
    const txId = body.tx_id || body.txId;

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
    // paymentId를 사용하여 검증 (txId는 포트원 SDK에서 직접 조회할 수 없을 수 있음)
    let paymentData;

    if (!paymentId) {
      console.error('[Webhook] No paymentId found for verification');
      return NextResponse.json(
        { error: 'No paymentId found' },
        { status: 400 }
      );
    }

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

    // 중복 처리 방지: receipt_hash로 확인
    const receiptHash = actualPaymentId;
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('id, status')
      .eq('receipt_hash', receiptHash)
      .maybeSingle();

    if (existingReceipt) {
      return NextResponse.json({ ok: true, message: 'Already processed' });
    }

    // 영수증 저장
    const { receipt, receiptError } = await createReceipt(supabase, {
      userId,
      productId,
      actualPaymentId,
      receiptHash,
      paymentData,
    });

    if (receiptError) {
      // 중복 키 에러는 이미 처리된 것으로 간주
      if (receiptError.code === '23505') {
        return NextResponse.json({ ok: true, message: 'Already processed' });
      }

      console.error('Failed to create/update receipt:', receiptError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // 별사탕 잔액 업데이트 및 히스토리 기록
    const transactionId = `PURCHASE_${receiptHash}`;
    await updateStarCandyBalance(supabase, {
      userId,
      starCandy,
      transactionId,
    });

    // 보너스 별사탕 처리
    if (bonusAmount > 0) {
      const expiredAt = getStarCandyBonusExpiryISO();
      await processStarCandyBonus(supabase, {
        userId,
        bonusAmount,
        transactionId,
        expiredAt,
      });
    }

    return NextResponse.json({ ok: true, receipt_id: receipt.id });

  } catch (error) {
    console.error('[Webhook] Processing error:', error instanceof Error ? error.message : String(error));

    // 웹훅은 200 OK를 반환하여 재시도 방지 (에러는 로그로만 기록)
    // 하지만 실제 에러 정보는 로그에 기록
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
