import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PaymentClient } from '@portone/server-sdk';

// Port One API configuration (v2 API)
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';

// 포트원 서버 SDK 클라이언트 생성
const paymentClient = PORTONE_API_SECRET 
  ? PaymentClient({ secret: PORTONE_API_SECRET })
  : null;

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
  customer?: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
}

// Verify payment with Port One v2 API using paymentId (서버 SDK 사용)
async function verifyPortOnePayment(paymentId: string): Promise<PortOneV2PaymentResponse> {
  if (!paymentClient) {
    console.error('[Verify] Payment client not initialized:', {
      hasApiSecret: !!PORTONE_API_SECRET,
    });
    throw new Error('PORTONE_API_SECRET must be set in environment variables');
  }

  console.log('[Verify] Verifying payment with PortOne SDK:', { 
    paymentId,
    hasClient: !!paymentClient,
  });
  
  try {
    // 포트원 서버 SDK를 사용하여 결제 정보 조회
    // paymentId는 merchant_uid로 사용됨
    const payment = await paymentClient.getPayment({ paymentId });
    
    console.log('[Verify] PortOne SDK verification completed:', {
      paymentId: (payment as any).id || paymentId,
      status: (payment as any).status,
      amount: (payment as any).totalAmount,
    });
    
    return payment as unknown as PortOneV2PaymentResponse;
  } catch (error) {
    console.error('[Verify] Payment verification failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}


export async function POST(request: NextRequest) {
  try {
    // 디버깅: 요청 헤더와 쿠키 정보 로깅
    const cookieHeader = request.headers.get('cookie');
    const authHeader = request.headers.get('authorization');
    console.log('[Verify] Request headers:', {
      hasCookie: !!cookieHeader,
      cookieLength: cookieHeader?.length || 0,
      cookiePreview: cookieHeader ? cookieHeader.substring(0, 100) + '...' : 'none',
      hasAuthHeader: !!authHeader,
      host: request.headers.get('host'),
      referer: request.headers.get('referer'),
    });

    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Verify] Authentication failed:', {
        error: authError?.message,
        errorCode: authError?.status,
        errorName: authError?.name,
        hasUser: !!user,
        userId: user?.id,
        // 쿠키 정보도 함께 로깅
        cookieHeader: cookieHeader ? cookieHeader.substring(0, 200) : 'none',
        supabaseCookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })),
      });
      return NextResponse.json(
        { error: 'Unauthorized', message: authError?.message || 'Authentication required' },
        { status: 401 }
      );
    }

    console.log('[Verify] Authentication successful:', {
      userId: user.id,
      email: user.email,
    });

    const body = await request.json();
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // 웹훅이 이미 처리했는지 확인 (중복 처리 방지)
    console.log('[Verify] Step 1: Checking if webhook already processed payment (receipt check #1)');
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('id, status')
      .eq('receipt_hash', paymentId)
      .maybeSingle();

    console.log('[Verify] Step 1 result:', {
      found: !!existingReceipt,
      status: existingReceipt?.status,
      paymentId,
    });

    if (existingReceipt && existingReceipt.status === 'completed') {
      // 이미 웹훅에서 처리되었으므로 성공 응답 반환
      // 영수증에서 상품 정보와 사용자 잔액 조회
      const { data: receiptData } = await supabase
        .from('receipts')
        .select('receipt_data, product_id')
        .eq('id', existingReceipt.id)
        .single();

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('star_candy, star_candy_bonus')
        .eq('id', user.id)
        .single();

      let customData: { productId?: string; starCandy?: number; bonusAmount?: number } = {};
      let amount = 0;
      let currency = 'KRW';
      
      if (receiptData?.receipt_data) {
        try {
          const receipt = typeof receiptData.receipt_data === 'string' 
            ? JSON.parse(receiptData.receipt_data) 
            : receiptData.receipt_data;
          
          // amount와 currency 추출
          amount = receipt.amount || receipt.payment_details?.totalAmount || receipt.totalAmount || 0;
          currency = receipt.currency || receipt.payment_details?.currency || receipt.currency || 'KRW';
          
          const paymentDetails = receipt.payment_details || receipt;
          const customDataString = paymentDetails.customData || paymentDetails.metadata?.customData || '';
          if (customDataString) {
            try {
              const parsed = typeof customDataString === 'string' 
                ? JSON.parse(customDataString) 
                : customDataString;
              customData = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            } catch (e) {
              console.warn('[Verify] Failed to parse customData from receipt:', e);
            }
          }
        } catch (e) {
          console.warn('[Verify] Failed to parse receipt_data:', e);
        }
      }

      return NextResponse.json({
        verified: true,
        receipt_id: existingReceipt.id,
        message: 'Payment already processed by webhook',
        payment: {
          productId: receiptData?.product_id || customData.productId,
          starCandy: customData.starCandy || 0,
          bonusAmount: customData.bonusAmount || 0,
          amount,
          currency,
        },
        balance: {
          starCandy: userProfile?.star_candy || 0,
          starCandyBonus: userProfile?.star_candy_bonus || 0,
          total: (userProfile?.star_candy || 0) + (userProfile?.star_candy_bonus || 0),
        },
      });
    }

    // Verify payment with Port One v2 API using paymentId
    console.log('[Verify] Step 2: Verifying payment status with PortOne SDK');
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
      console.log('[Verify] Payment is READY (not completed yet). Step 1 already checked receipt, returning READY status.');
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

    // PAID 상태이지만 웹훅이 아직 처리하지 않은 경우
    // 웹훅이 처리할 때까지 기다리도록 클라이언트에 알림
    // 검증 API는 읽기 전용으로만 사용하고, 실제 처리는 웹훅에서만 수행
    console.log('[Verify] Step 3: Payment is PAID, checking receipts table (receipt check #2) for webhook processing status');
    
    // 웹훅이 처리했는지 다시 확인 (Race condition 방지)
    const { data: finalCheckReceipt } = await supabase
      .from('receipts')
      .select('id, status, receipt_data, product_id')
      .eq('receipt_hash', paymentId)
      .maybeSingle();

    console.log('[Verify] Step 3 result (receipt check #2 for PAID):', {
      found: !!finalCheckReceipt,
      status: finalCheckReceipt?.status,
      paymentId,
    });

    if (finalCheckReceipt && finalCheckReceipt.status === 'completed') {
      // 웹훅이 이미 처리했으므로 성공 응답 반환
      console.log('[Verify] Payment is PAID and already processed by webhook');
      
      const { data: receiptData } = await supabase
        .from('receipts')
        .select('receipt_data, product_id')
        .eq('id', finalCheckReceipt.id)
        .single();

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('star_candy, star_candy_bonus')
        .eq('id', user.id)
        .single();

      let customData: { productId?: string; starCandy?: number; bonusAmount?: number } = {};
      let amount = 0;
      let currency = 'KRW';
      
      if (receiptData?.receipt_data) {
        try {
          const receipt = typeof receiptData.receipt_data === 'string' 
            ? JSON.parse(receiptData.receipt_data) 
            : receiptData.receipt_data;
          
          amount = receipt.amount || receipt.payment_details?.totalAmount || receipt.totalAmount || 0;
          currency = receipt.currency || receipt.payment_details?.currency || receipt.currency || 'KRW';
          
          const paymentDetails = receipt.payment_details || receipt;
          const customDataString = paymentDetails.customData || paymentDetails.metadata?.customData || '';
          if (customDataString) {
            try {
              const parsed = typeof customDataString === 'string' 
                ? JSON.parse(customDataString) 
                : customDataString;
              customData = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            } catch (e) {
              console.warn('[Verify] Failed to parse customData from receipt:', e);
            }
          }
        } catch (e) {
          console.warn('[Verify] Failed to parse receipt_data:', e);
        }
      }

      return NextResponse.json({
        verified: true,
        receipt_id: finalCheckReceipt.id,
        message: 'Payment already processed by webhook',
        payment: {
          productId: receiptData?.product_id || customData.productId,
          starCandy: customData.starCandy || 0,
          bonusAmount: customData.bonusAmount || 0,
          amount,
          currency,
        },
        balance: {
          starCandy: userProfile?.star_candy || 0,
          starCandyBonus: userProfile?.star_candy_bonus || 0,
          total: (userProfile?.star_candy || 0) + (userProfile?.star_candy_bonus || 0),
        },
      });
    }

    // PAID 상태이지만 웹훅이 아직 처리하지 않은 경우
    // 웹훅이 처리할 때까지 기다리도록 클라이언트에 알림
    // 검증 API는 receipt를 생성하지 않고, 웹훅만 처리하도록 함
    console.log('[Verify] Payment is PAID but webhook has not processed yet. Waiting for webhook...');
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