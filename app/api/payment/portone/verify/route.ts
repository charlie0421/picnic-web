import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, isWithdrawnUser } from '@/lib/supabase/server';
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

  try {
    // 포트원 서버 SDK를 사용하여 결제 정보 조회
    // paymentId는 merchant_uid로 사용됨
    const payment = await paymentClient.getPayment({ paymentId });
    
    return payment as unknown as PortOneV2PaymentResponse;
  } catch (error) {
    console.error('[Verify] Payment verification failed:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}


/**
 * 쿠키에서 JWT 토큰을 읽어서 만료 시간만 확인 (토큰 갱신 없이)
 * Supabase 쿠키에서 access_token을 추출하여 만료 시간 확인
 */
function decodeJWTPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch (error) {
    return null;
  }
}

function getAccessTokenFromCookies(request: NextRequest): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  // Supabase 프로젝트 ID 추출
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  
  const urlParts = supabaseUrl.split('.');
  const projectId = urlParts[0]?.split('://')[1];
  if (!projectId) return null;

  // 쿠키에서 access_token 찾기
  const cookiePattern = `sb-${projectId}-auth-token`;
  const cookies = cookieHeader.split(';');
  
  // 분할된 쿠키 조합 시도
  const chunks: { [key: string]: string } = {};
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name && name.startsWith(cookiePattern) && value) {
      const chunkMatch = name.match(/\.(\d+)$/);
      if (chunkMatch) {
        chunks[chunkMatch[1]] = decodeURIComponent(value);
      } else if (name === cookiePattern) {
        // 분할되지 않은 쿠키
        return decodeURIComponent(value);
      }
    }
  }

  // 분할된 쿠키 조합
  if (Object.keys(chunks).length > 0) {
    const sortedKeys = Object.keys(chunks).sort((a, b) => parseInt(a) - parseInt(b));
    const combined = sortedKeys.map(key => chunks[key]).join('');
    try {
      const parsed = JSON.parse(combined);
      return parsed.access_token || null;
    } catch {
      return null;
    }
  }

  return null;
}

function isTokenValidWithoutRefresh(request: NextRequest): { isValid: boolean; userId?: string; error?: string } {
  try {
    const accessToken = getAccessTokenFromCookies(request);
    if (!accessToken) {
      return { isValid: false, error: 'No access token found' };
    }

    const payload = decodeJWTPayload(accessToken);
    if (!payload) {
      return { isValid: false, error: 'Invalid token format' };
    }

    // 토큰 만료 시간 확인
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { isValid: false, error: 'Token expired' };
    }

    // 토큰이 유효하면 사용자 ID 반환 (갱신 없이)
    return { isValid: true, userId: payload.sub };
  } catch (error) {
    return { isValid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

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