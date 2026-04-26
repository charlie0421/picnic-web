import { NextRequest } from 'next/server';
import { PaymentClient } from '@portone/server-sdk';

// Port One API configuration (v2 API)
export const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';

// 포트원 서버 SDK 클라이언트 생성
export const paymentClient = PORTONE_API_SECRET
  ? PaymentClient({ secret: PORTONE_API_SECRET })
  : null;

// 포트원 v2 API 응답 형식
export interface PortOneV2PaymentResponse {
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
export async function verifyPortOnePayment(paymentId: string): Promise<PortOneV2PaymentResponse> {
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
export function decodeJWTPayload(token: string): any | null {
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

export function getAccessTokenFromCookies(request: NextRequest): string | null {
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

export function isTokenValidWithoutRefresh(request: NextRequest): { isValid: boolean; userId?: string; error?: string } {
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

/**
 * 영수증에서 상품 정보와 사용자 잔액을 조회하여 응답 객체를 빌드합니다.
 * 두 곳에서 동일한 로직이 사용되므로 DRY 원칙에 따라 추출된 헬퍼입니다.
 */
export async function buildReceiptResponse(
  supabase: any,
  receiptId: string,
  productId: string | null,
  userId: string
): Promise<{
  receipt_id: string;
  message: string;
  payment: { productId: string | undefined; starCandy: number; bonusAmount: number; amount: number; currency: string };
  balance: { starCandy: number; starCandyBonus: number; total: number };
}> {
  const { data: receiptData } = await supabase
    .from('receipts')
    .select('receipt_data, product_id')
    .eq('id', receiptId)
    .single();

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('star_candy, star_candy_bonus')
    .eq('id', userId)
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

  return {
    receipt_id: receiptId,
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
  };
}
