import { createClient } from '@supabase/supabase-js';
import { logSafeError } from '@/utils/log-safe-error';
import { PaymentClient, Webhook } from '@portone/server-sdk';

// Port One API configuration (v2 API)
export const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';

// 포트원 서버 SDK 클라이언트 생성
export const paymentClient = PORTONE_API_SECRET
  ? PaymentClient({ secret: PORTONE_API_SECRET })
  : null;

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

export type PortOneWebhookVerification =
  | { ok: true; webhook: unknown }
  | { ok: false; reason: 'secret_missing' | 'invalid_signature' };

/**
 * PortOne V2 웹훅 서명 검증 (Standard Webhooks, #77).
 *
 * rawBody 는 받은 본문 그대로여야 한다. 파싱 후 다시 직렬화하면 키 순서·공백이 달라져 서명이 맞지 않는다.
 * 시크릿 형식 오류(InvalidInputError)와 본문 JSON 오류는 던진다 — 호출부가 500 으로 재시도를 유도한다.
 */
export async function verifyPortOneWebhook(
  rawBody: string,
  headers: Headers,
): Promise<PortOneWebhookVerification> {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) {
    logSafeError('payment.portone.webhook.secret.missing', undefined);
    return { ok: false, reason: 'secret_missing' };
  }

  try {
    const webhook = await Webhook.verify(secret, rawBody, Object.fromEntries(headers));
    return { ok: true, webhook };
  } catch (error) {
    if (error instanceof Webhook.WebhookVerificationError) {
      return { ok: false, reason: 'invalid_signature' };
    }
    throw error;
  }
}

/**
 * 서명을 통과한 웹훅 본문에서 적립을 시도할 결제 ID 를 고른다.
 *
 * - 2024-04-25 형식: { type: 'Transaction.Paid', data: { paymentId } } 만 처리한다.
 * - 2024-01-01 형식: { payment_id, status: 'Paid' } 만 처리한다.
 * 그 밖의 이벤트는 { paymentId: null, ignored: true } 이다. 본문의 상태는 고르는 데만 쓰고,
 * 적립 여부는 항상 SDK 로 다시 조회한 결제 상태로 정한다.
 */
export function selectPaidPaymentId(webhook: unknown): { ignored: true } | { ignored: false; paymentId: string | null } {
  if (typeof webhook !== 'object' || webhook === null) return { ignored: true };
  const body = webhook as Record<string, unknown>;

  if (typeof body.type === 'string') {
    if (body.type !== 'Transaction.Paid') return { ignored: true };
    const data = body.data as Record<string, unknown> | undefined;
    return { ignored: false, paymentId: typeof data?.paymentId === 'string' && data.paymentId ? data.paymentId : null };
  }

  if (typeof body.status === 'string' && body.status.toUpperCase() === 'PAID') {
    return { ignored: false, paymentId: typeof body.payment_id === 'string' && body.payment_id ? body.payment_id : null };
  }

  return { ignored: true };
}

// Verify payment with Port One v2 API using paymentId (서버 SDK 사용)
export async function verifyPortOnePayment(paymentId: string): Promise<any> {
  if (!paymentClient) {
    logSafeError('payment.portone.webhook.client.missing', undefined);
    throw new Error('PORTONE_API_SECRET must be set in environment variables');
  }

  try {
    // 포트원 서버 SDK를 사용하여 결제 정보 조회
    const payment = await paymentClient.getPayment({ paymentId });
    return payment;
  } catch (error) {
    logSafeError('payment.portone.webhook.provider.failed', error, { paymentId });
    throw error;
  }
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
      logSafeError('payment.portone.webhook.custom_data.parse_failed', parseError);
      return {};
    }
  } else {
    return {};
  }
}
