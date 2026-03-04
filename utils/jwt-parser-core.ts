// JWT 토큰 디코딩 및 사용자 정보 추출 핵심 유틸리티

import type { User } from '@supabase/supabase-js';

export const jwtDebug =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

export const debugLog = (...args: unknown[]) => {
  if (jwtDebug) {
    console.log(...args);
  }
};

export const debugWarn = (...args: unknown[]) => {
  if (jwtDebug) {
    console.warn(...args);
  }
};

/**
 * JWT 토큰을 디코딩하여 payload 추출
 */
export function decodeJWTPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64 URL 디코딩
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // 패딩 추가
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);

    return JSON.parse(atob(padded));
  } catch (error) {
    debugWarn('🔍 [JWT Parser] JWT 디코딩 실패:', error);
    return null;
  }
}

/**
 * JWT 토큰에서 사용자 정보 추출
 */
export function extractUserFromJWT(token: string): User | null {
  try {
    const payload = decodeJWTPayload(token);
    if (!payload) return null;

    debugLog('🔍 [JWT Parser] JWT payload 확인:', {
      sub: payload.sub?.substring(0, 8) + '...',
      email: payload.email,
      exp: payload.exp,
      iat: payload.iat,
      provider: payload.app_metadata?.provider
    });

    // JWT payload에서 사용자 정보 추출
    const user: User = {
      id: payload.sub,
      email: payload.email,
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {},
      aud: payload.aud,
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: payload.updated_at || new Date().toISOString(),
      email_confirmed_at: payload.email_confirmed_at,
      phone_confirmed_at: payload.phone_confirmed_at,
      confirmation_sent_at: payload.confirmation_sent_at,
      recovery_sent_at: payload.recovery_sent_at,
      invited_at: payload.invited_at,
      action_link: payload.action_link,
      role: payload.role
    };

    // 토큰 만료 시간 확인
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      debugWarn('🔍 [JWT Parser] 토큰이 만료됨:', {
        exp: payload.exp,
        now,
        expired: payload.exp < now,
        expiredSecondsAgo: now - payload.exp
      });
      return null;
    }

    debugLog('✅ [JWT Parser] 사용자 정보 추출 성공:', {
      userId: user.id?.substring(0, 8) + '...',
      email: user.email,
      provider: user.app_metadata?.provider,
      exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A'
    });

    return user;
  } catch (error) {
    console.warn('🔍 [JWT Parser] 사용자 정보 추출 실패:', error);
    return null;
  }
}
