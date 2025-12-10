import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { PaymentClient } from '@portone/server-sdk';
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus';

// Port One API configuration (v2 API)
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';
const PORTONE_WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET || '';

// 포트원 서버 SDK 클라이언트 생성
const paymentClient = PORTONE_API_SECRET 
  ? PaymentClient({ secret: PORTONE_API_SECRET })
  : null;

// Supabase Service Role Client (웹훅은 사용자 인증 없이 처리)
function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// 포트원 v2 API 응답 형식
interface PortOneV2PaymentResponse {
  id: string;
  storeId: string;
  channelKey: string;
  paymentId: string; // merchant_uid
  orderName: string;
  totalAmount: number;
  currency: string;
  method: string;
  status: 'READY' | 'PAID' | 'CANCELLED' | 'FAILED';
  requestedAt: string;
  approvedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  failReason?: string;
  cancelReason?: string;
  metadata?: {
    customData?: string;
    [key: string]: any;
  };
  customData?: string; // 직접 필드로도 올 수 있음
}

// Verify payment with Port One v2 API using paymentId (서버 SDK 사용)
async function verifyPortOnePayment(paymentId: string): Promise<any> {
  if (!paymentClient) {
    console.error('[Webhook] Payment client not initialized:', {
      hasApiSecret: !!PORTONE_API_SECRET,
    });
    throw new Error('PORTONE_API_SECRET must be set in environment variables');
  }

  console.log('[Webhook] Verifying payment with SDK:', { 
    paymentId,
    hasClient: !!paymentClient,
  });
  
  try {
    // 포트원 서버 SDK를 사용하여 결제 정보 조회
    const payment = await paymentClient.getPayment({ paymentId });
    
    console.log('[Webhook] Payment verified successfully:', {
      paymentId,
      status: payment.status,
    });
    
    return payment;
  } catch (error) {
    console.error('[Webhook] Payment verification failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// Verify webhook signature
function verifyWebhookSignature(payload: any, signature: string): boolean {
  if (!PORTONE_WEBHOOK_SECRET) {
    console.warn('PORTONE_WEBHOOK_SECRET not set, skipping signature verification');
    return true; // 개발 환경에서는 시크릿이 없을 수 있음
  }

  const calculatedSignature = createHmac('sha256', PORTONE_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  return calculatedSignature === signature;
}

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
    
    // 웹훅 상태 로깅 (디버깅용)
    console.log('[Webhook] Webhook received with status:', {
      status,
      normalizedStatus,
      paymentId: body.paymentId || body.payment_id || body.merchant_uid || body.id,
      timestamp: new Date().toISOString(),
    });
    
    if (normalizedStatus === 'READY') {
      // Ready 상태는 결제 시작 알림일 뿐이므로, 즉시 성공 응답 반환
      // Supabase 클라이언트 생성이나 다른 처리를 하지 않음
      console.log('[Webhook] READY status webhook - returning early without processing');
      return NextResponse.json({ ok: true, message: 'Payment is ready, waiting for completion' });
    }
    
    // READY가 아닌 경우에만 로깅 및 처리 진행
    console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));
    console.log('[Webhook] Headers:', Object.fromEntries(request.headers.entries()));
    
    // Supabase Service Role Client 생성
    let supabase;
    try {
      supabase = createServiceRoleSupabaseClient();
      console.log('[Webhook] Supabase client created successfully');
    } catch (error) {
      console.error('[Webhook] Failed to create Supabase client:', error);
      return NextResponse.json(
        { error: 'Failed to initialize database', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
    
    // 웹훅 서명 검증 (포트원에서 제공하는 경우)
    const signature = request.headers.get('x-portone-signature') || 
                      request.headers.get('x-iamport-signature') ||
                      request.headers.get('portone-signature') ||
                      '';
    
    if (signature && !verifyWebhookSignature(body, signature)) {
      console.error('[Webhook] Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
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

    console.log('[Webhook] Extracted values:', {
      paymentId,
      txId,
      status,
      bodyKeys: Object.keys(body),
    });

    // paymentId는 반드시 필요
    if (!paymentId) {
      console.error('[Webhook] Missing paymentId in webhook payload. Full body:', JSON.stringify(body, null, 2));
      return NextResponse.json(
        { error: 'Missing paymentId', receivedBody: body },
        { status: 400 }
      );
    }
    
    // READY가 아닌 다른 상태도 확인 (PAID가 아닌 경우)
    if (normalizedStatus !== 'PAID') {
      console.log(`[Webhook] Payment status is ${status}, skipping processing`);
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
      console.log('[Webhook] Verifying payment with paymentId:', paymentId);
      if (txId) {
        console.log('[Webhook] txId available (for reference):', txId);
      }
      paymentData = await verifyPortOnePayment(paymentId);
      console.log('[Webhook] Payment verification successful with paymentId');
    } catch (error) {
      console.error('[Webhook] Payment verification error:', {
        error: error instanceof Error ? error.message : String(error),
        paymentId,
        txId: txId || 'not provided', // 참고용으로만 로깅
      });
      
      // 검증 실패 시 웹훅 데이터를 직접 사용
      // 포트원 v2 웹훅은 customData를 포함하지 않을 수 있으므로
      // payment_id를 사용하여 클라이언트에서 전달한 정보를 복원해야 함
      console.warn('[Webhook] Payment verification failed, using webhook data directly');
      console.log('[Webhook] Full webhook body for debugging:', JSON.stringify(body, null, 2));
      
      paymentData = {
        id: paymentId,
        paymentId: paymentId,
        status: normalizedStatus,
        totalAmount: body.amount || body.totalAmount || 0,
        currency: body.currency || 'KRW',
        method: body.method || 'port_one',
        customData: body.customData || body.metadata?.customData || body.custom_data || '',
        metadata: body.metadata || {},
      };
      
      // 웹훅 페이로드에서 직접 customData 추출 시도
      if (!paymentData.customData && body.customData) {
        paymentData.customData = body.customData;
      }
    }

    if (!paymentData) {
      console.error('[Webhook] Payment verification returned null');
      return NextResponse.json(
        { error: 'Payment verification failed - no data returned' },
        { status: 400 }
      );
    }

    // 결제 완료 상태 확인 (포트원 v2 SDK: 'PAID')
    const paymentStatus = paymentData.status?.toUpperCase();
    if (paymentStatus !== 'PAID') {
      console.log(`[Webhook] Payment not completed. Status: ${paymentData.status}`);
      return NextResponse.json({ ok: true });
    }

    // customData에서 사용자 및 상품 정보 추출
    // 포트원 v2 SDK는 metadata.customData 또는 customData 필드에 저장
    // 포트원 SDK가 customData를 이중으로 stringify하는 경우가 있으므로 이중 파싱 처리
    let customData;
    try {
      // SDK 응답 구조에 맞게 customData 추출
      let customDataString = paymentData.customData || 
                            paymentData.metadata?.customData ||
                            paymentData.metadata?.custom_data ||
                            '';
      console.log('[Webhook] Payment data customData (raw):', customDataString);
      console.log('[Webhook] Payment data structure:', {
        hasCustomData: !!paymentData.customData,
        hasMetadata: !!paymentData.metadata,
        metadataKeys: paymentData.metadata ? Object.keys(paymentData.metadata) : [],
      });
      
      // customData가 문자열인 경우 파싱 시도
      if (typeof customDataString === 'string' && customDataString.trim()) {
        try {
          // 첫 번째 파싱 시도
          const firstParse = JSON.parse(customDataString);
          // 파싱 결과가 문자열이면 한 번 더 파싱 (이중 stringify된 경우)
          if (typeof firstParse === 'string') {
            console.log('[Webhook] customData is double-stringified, parsing again');
            customData = JSON.parse(firstParse);
          } else {
            customData = firstParse;
          }
        } catch (parseError) {
          // 파싱 실패 시 빈 객체로 처리
          console.warn('[Webhook] Failed to parse customData, using empty object:', parseError);
          customData = {};
        }
      } else {
        customData = {};
      }
      
      console.log('[Webhook] Parsed customData:', customData);
    } catch (e) {
      console.error('[Webhook] Failed to parse custom data:', e);
      console.error('[Webhook] Raw paymentData.customData:', paymentData.customData);
      return NextResponse.json(
        { error: 'Invalid payment data', details: e instanceof Error ? e.message : 'Parse error' },
        { status: 400 }
      );
    }

    let userId = customData.userId || customData.user_id;
    const productId = customData.productId;
    const starCandy = customData.starCandy || 0;
    const bonusAmount = customData.bonusAmount || 0;

    console.log('[Webhook] Extracted custom data:', {
      userId,
      productId,
      starCandy,
      bonusAmount,
    });

    // userId가 없으면 paymentData.customer.email로 사용자 찾기 (fallback)
    if (!userId && paymentData.customer?.email) {
      console.log('[Webhook] userId not found in customData, attempting to find user by email:', paymentData.customer.email);
      try {
        const { data: userByEmail } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('email', paymentData.customer.email)
          .maybeSingle();
        
        if (userByEmail?.user_id) {
          userId = userByEmail.user_id;
          console.log('[Webhook] Found user by email:', userId);
        } else {
          console.warn('[Webhook] User not found by email:', paymentData.customer.email);
        }
      } catch (emailLookupError) {
        console.error('[Webhook] Failed to lookup user by email:', emailLookupError);
      }
    }

    // customData에서 필수 정보 확인
    if (!userId || !productId) {
      console.error('[Webhook] Missing userId or productId in custom data');
      console.error('[Webhook] Full webhook body:', JSON.stringify(body, null, 2));
      console.error('[Webhook] Full customData:', JSON.stringify(customData, null, 2));
      console.error('[Webhook] Full paymentData:', JSON.stringify(paymentData, null, 2));
      console.error('[Webhook] Payment data structure:', {
        hasCustomData: !!paymentData.customData,
        hasMetadata: !!paymentData.metadata,
        metadataKeys: paymentData.metadata ? Object.keys(paymentData.metadata) : [],
        customerEmail: paymentData.customer?.email,
      });

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

    console.log('[Webhook] Using payment identifier:', {
      paymentId: actualPaymentId,
    });

    // 중복 처리 방지: receipt_hash로 확인
    const receiptHash = actualPaymentId;
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('id, status')
      .eq('receipt_hash', receiptHash)
      .maybeSingle();

    if (existingReceipt) {
      // 이미 완료된 결제는 중복 처리 방지
      console.log(`[Webhook] Receipt already exists for paymentId: ${receiptHash}`);
      return NextResponse.json({ ok: true, message: 'Already processed' });
    }

    // 영수증 데이터 생성 (포트원 v2 API 응답 형식)
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

    // 영수증 저장
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        product_id: productId,
        receipt_data: JSON.stringify(receiptData),
        receipt_hash: receiptHash,
        status: 'completed',
        platform: 'web',
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        verification_data: paymentData,
      })
      .select()
      .single();

    if (receiptError) {
      // 중복 키 에러는 이미 처리된 것으로 간주
      if (receiptError.code === '23505') {
        console.log(`Duplicate receipt detected: ${actualPaymentId}`);
        return NextResponse.json({ ok: true, message: 'Already processed' });
      }
      
      console.error('Failed to create/update receipt:', receiptError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // 사용자 프로필에서 별사탕 잔액 업데이트
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('star_candy')
      .eq('id', userId)
      .single();

    if (currentProfile) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          star_candy: (currentProfile.star_candy || 0) + starCandy,
        })
        .eq('id', userId);

      if (profileError) {
        console.error('Failed to update user profile:', profileError);
        // 영수증은 이미 생성되었으므로 에러를 반환하지 않음
      }
    }

    // 별사탕 히스토리 기록
    const transactionId = `PURCHASE_${receiptHash}`;
    const { error: historyError } = await supabase
      .from('star_candy_history')
      .insert({
        user_id: userId,
        amount: starCandy,
        type: 'PURCHASE',
        transaction_id: transactionId,
      });

    if (historyError) {
      console.error('Failed to record star candy history:', historyError);
    }

    // 보너스 별사탕 처리
    if (bonusAmount > 0) {
      const expiredAt = getStarCandyBonusExpiryISO();

      const { error: bonusError } = await supabase
        .from('star_candy_bonus_history')
        .insert({
          user_id: userId,
          amount: bonusAmount,
          remain_amount: bonusAmount,
          type: 'PURCHASE',
          transaction_id: transactionId,
          expired_dt: expiredAt,
        });

      if (bonusError) {
        console.error('Failed to record bonus:', bonusError);
      } else {
        // 보너스 잔액 업데이트
        const { data: profileForBonus } = await supabase
          .from('user_profiles')
          .select('star_candy_bonus')
          .eq('id', userId)
          .single();

        if (profileForBonus) {
          const { error: bonusUpdateError } = await supabase
            .from('user_profiles')
            .update({
              star_candy_bonus: (profileForBonus.star_candy_bonus || 0) + bonusAmount,
            })
            .eq('id', userId);

          if (bonusUpdateError) {
            console.error('Failed to update bonus balance:', bonusUpdateError);
          }
        }
      }
    }

    console.log(`[Webhook] Processed successfully for paymentId: ${receiptHash}`);
    return NextResponse.json({ ok: true, receipt_id: receipt.id });

  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    console.error('[Webhook] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Webhook] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    });
    
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


