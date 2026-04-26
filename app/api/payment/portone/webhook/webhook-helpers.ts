import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { PaymentClient } from '@portone/server-sdk';

// Port One API configuration (v2 API)
export const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';
export const PORTONE_WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET || '';

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
}

// Supabase Service Role Client (웹훅은 사용자 인증 없이 처리)
export function createServiceRoleSupabaseClient() {
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

// Verify webhook signature
export function verifyWebhookSignature(payload: any, signature: string): boolean {
  if (!PORTONE_WEBHOOK_SECRET) {
    console.error('[Webhook] PORTONE_WEBHOOK_SECRET is not configured - rejecting webhook');
    return false; // Never bypass signature verification
  }

  if (!signature) {
    console.error('[Webhook] No signature provided in webhook request');
    return false;
  }

  const calculatedSignature = createHmac('sha256', PORTONE_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  if (calculatedSignature.length !== signature.length) {
    return false;
  }

  const a = Buffer.from(calculatedSignature, 'hex');
  const b = Buffer.from(signature, 'hex');
  try {
    const { timingSafeEqual } = require('crypto');
    return timingSafeEqual(a, b);
  } catch {
    return calculatedSignature === signature;
  }
}

// Verify payment with Port One v2 API using paymentId (서버 SDK 사용)
export async function verifyPortOnePayment(paymentId: string): Promise<any> {
  if (!paymentClient) {
    console.error('[Webhook] Payment client not initialized:', {
      hasApiSecret: !!PORTONE_API_SECRET,
    });
    throw new Error('PORTONE_API_SECRET must be set in environment variables');
  }

  try {
    // 포트원 서버 SDK를 사용하여 결제 정보 조회
    const payment = await paymentClient.getPayment({ paymentId });
    return payment;
  } catch (error) {
    console.error('[Webhook] Payment verification failed:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// 영수증 저장
export async function createReceipt(
  supabase: SupabaseClient,
  params: {
    userId: string;
    productId: string;
    actualPaymentId: string;
    receiptHash: string;
    paymentData: any;
  }
) {
  const { userId, productId, actualPaymentId, receiptHash, paymentData } = params;

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

  return { receipt, receiptError };
}

// customData 파싱 (이중 stringify 대응)
export function parseCustomData(paymentData: any): Record<string, any> {
  // SDK 응답 구조에 맞게 customData 추출
  let customDataString = paymentData.customData ||
                        paymentData.metadata?.customData ||
                        paymentData.metadata?.custom_data ||
                        '';
  // customData가 문자열인 경우 파싱 시도
  if (typeof customDataString === 'string' && customDataString.trim()) {
    try {
      // 첫 번째 파싱 시도
      const firstParse = JSON.parse(customDataString);
      // 파싱 결과가 문자열이면 한 번 더 파싱 (이중 stringify된 경우)
      if (typeof firstParse === 'string') {
        return JSON.parse(firstParse);
      } else {
        return firstParse;
      }
    } catch (parseError) {
      // 파싱 실패 시 빈 객체로 처리
      console.warn('[Webhook] Failed to parse customData, using empty object:', parseError);
      return {};
    }
  } else {
    return {};
  }
}

// 보너스 별사탕 처리
export async function processStarCandyBonus(
  supabase: SupabaseClient,
  params: {
    userId: string;
    bonusAmount: number;
    transactionId: string;
    expiredAt: string;
  }
) {
  const { userId, bonusAmount, transactionId, expiredAt } = params;

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
    // Atomic increment of bonus balance
    const { error: bonusUpdateError } = await supabase
      .rpc('increment_star_candy_bonus', {
        p_user_id: userId,
        p_amount: bonusAmount,
      });

    if (bonusUpdateError) {
      console.error('Failed to update bonus balance:', bonusUpdateError);
    }
  }
}

// 별사탕 잔액 업데이트 및 히스토리 기록
export async function updateStarCandyBalance(
  supabase: SupabaseClient,
  params: {
    userId: string;
    starCandy: number;
    transactionId: string;
  }
) {
  const { userId, starCandy, transactionId } = params;

  // Atomic increment of star_candy balance to prevent race conditions
  const { error: profileError } = await supabase
    .rpc('increment_star_candy', {
      p_user_id: userId,
      p_amount: starCandy,
    });

  if (profileError) {
    console.error('Failed to update star_candy balance:', profileError);
    // 영수증은 이미 생성되었으므로 에러를 반환하지 않음
  }

  // 별사탕 히스토리 기록
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
}
