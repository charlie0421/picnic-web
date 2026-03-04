import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, isWithdrawnUser } from '@/lib/supabase/server';
import {
  verifyPortOnePayment,
  isTokenValidWithoutRefresh,
  buildReceiptResponse,
} from './verify-helpers';

export async function POST(request: NextRequest) {
  try {
    // 토큰 갱신 없이 인증 확인 (폴링 시 불필요한 토큰 갱신 방지)
    const tokenCheck = isTokenValidWithoutRefresh(request);
    const supabase = await createServerSupabaseClient();
    let user: { id: string; email?: string } | null = null;

    if (tokenCheck.isValid && tokenCheck.userId) {
      // 토큰이 유효하면 JWT에서 추출한 userId 사용 (토큰 갱신 방지)
      // 하지만 실제 user 객체가 필요한 경우를 위해 Supabase 호출
      // 토큰이 유효하면 getUser()는 갱신을 시도하지 않음
      const { data: { user: verifiedUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !verifiedUser) {
        console.error('[Verify] Auth failed:', authError?.message);
        return NextResponse.json(
          { error: 'Unauthorized', message: authError?.message || 'Authentication required' },
          { status: 401 }
        );
      }
      user = verifiedUser;
    } else {
      // 토큰이 만료되었거나 없으면 Supabase로 재확인 (이 경우에만 갱신 시도)
      const { data: { user: verifiedUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !verifiedUser) {
        console.error('[Verify] Auth failed:', authError?.message);
        return NextResponse.json(
          { error: 'Unauthorized', message: authError?.message || 'Authentication required' },
          { status: 401 }
        );
      }
      user = verifiedUser;
    }

    // 탈퇴 회원 체크
    const isWithdrawn = await isWithdrawnUser(user.id);
    if (isWithdrawn) {
      return NextResponse.json(
        { error: 'User is deleted or deactivated' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // 웹훅이 이미 처리했는지 확인 (중복 처리 방지)
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('id, status')
      .eq('receipt_hash', paymentId)
      .maybeSingle();

    if (existingReceipt && existingReceipt.status === 'completed') {
      // 이미 웹훅에서 처리되었으므로 성공 응답 반환
      const result = await buildReceiptResponse(supabase, existingReceipt.id, null, user.id);
      return NextResponse.json({
        verified: true,
        ...result,
      });
    }

    // Verify payment with Port One v2 API using paymentId
    const paymentData = await verifyPortOnePayment(paymentId);

    if (!paymentData) {
      return NextResponse.json(
        { error: 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Check if payment is successful (PortOne v2: PAID)
    const normalizedStatus = paymentData.status?.toUpperCase();

    // READY 상태인 경우, 결제가 아직 완료되지 않았으므로 웹훅이 처리할 가능성이 없음
    // Step 1에서 이미 receipt를 확인했으므로 추가 확인 없이 바로 반환
    if (normalizedStatus === 'READY') {
      return NextResponse.json(
        {
          verified: false,
          status: 'READY',
          message: 'Payment is still processing. Please wait for webhook to complete.',
        },
        { status: 200 } // 200으로 반환하여 클라이언트가 에러로 처리하지 않도록 함
      );
    }

    if (normalizedStatus !== 'PAID') {
      return NextResponse.json(
        { error: `Payment not completed. Status: ${paymentData.status}` },
        { status: 400 }
      );
    }

    // 웹훅이 처리했는지 다시 확인 (Race condition 방지)
    const { data: finalCheckReceipt } = await supabase
      .from('receipts')
      .select('id, status, receipt_data, product_id')
      .eq('receipt_hash', paymentId)
      .maybeSingle();

    if (finalCheckReceipt && finalCheckReceipt.status === 'completed') {
      const result = await buildReceiptResponse(supabase, finalCheckReceipt.id, null, user.id);
      return NextResponse.json({
        verified: true,
        ...result,
      });
    }

    return NextResponse.json(
      {
        verified: false,
        status: 'PAID',
        message: 'Payment is completed but webhook processing is pending. Please wait a moment and try again.',
      },
      { status: 200 } // 200으로 반환하여 클라이언트가 에러로 처리하지 않도록 함
    );

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
