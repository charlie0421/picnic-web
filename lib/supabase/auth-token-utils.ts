'use client';

/**
 * 인증 토큰 감지/체크 유틸리티
 *
 * 쿠키에서 Supabase 인증 토큰을 감지하는 순수 함수들입니다.
 * AuthStore의 constructor에서 사용됩니다.
 *
 * NOTE: 보안 마이그레이션(@supabase/ssr cookie 기반)으로 localStorage 검사는 제거되었습니다.
 * 토큰은 SDK가 관리하는 sb-* cookie에만 존재합니다.
 */

const authDebug =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

const debugLog = (...args: unknown[]) => {
  if (authDebug) {
    console.log(...args);
  }
};

/**
 * Supabase URL에서 프로젝트 ID를 추출합니다.
 */
export function getSupabaseProjectIdFromUrl(url: string): string | null {
  const urlParts = url.split('.');
  const projectHost = urlParts[0];
  if (!projectHost) return null;
  const segments = projectHost.split('://');
  return segments.length > 1 ? (segments[1] || null) : (segments[0] || null);
}

/**
 * 쿠키에서 Supabase 인증 토큰을 확인합니다.
 */
export function checkCookieAuthToken(projectId: string): boolean {
  try {
    const cookies = document.cookie.split(';');
    const targetName = `sb-${projectId}-auth-token`;
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      // 정확히 인증 토큰 쿠키만 인정하고, code-verifier 등은 무시
      if (name === targetName && value) {
        debugLog(`🍪 [AuthTokenUtils] 쿠키에 토큰 (${name}): 있음`);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn('⚠️ [AuthTokenUtils] 쿠키 토큰 체크 중 오류:', error);
    return false;
  }
}

/**
 * 쿠키에서 저장된 Supabase 인증 토큰을 감지합니다.
 *
 * cookie 기반 세션 마이그레이션 이후, 모든 토큰은 sb-* cookie에만 존재합니다.
 * (XSS 시 탈취 가능한 localStorage 검사는 제거됨)
 *
 * @returns 토큰이 존재하면 true
 */
export function detectStoredAuthToken(): boolean {
  try {
    if (typeof document === 'undefined') return false;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const projectId = supabaseUrl ? getSupabaseProjectIdFromUrl(supabaseUrl) : null;

    // 프로젝트 ID가 있으면 정확한 cookie name으로 검사
    if (projectId) {
      const hasCookieToken = checkCookieAuthToken(projectId);
      debugLog(`🔍 [AuthTokenUtils] sb-${projectId}-auth-token cookie:`, hasCookieToken ? '있음' : '없음');
      if (hasCookieToken) return true;
    }

    // 폴백: 일반적인 sb-* cookie 패턴 검사 (code-verifier 제외)
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (
        name &&
        name.startsWith('sb-') &&
        name.includes('auth-token') &&
        !name.includes('auth-token-code-verifier') &&
        value
      ) {
        debugLog(`🍪 [AuthTokenUtils] 쿠키에 토큰 (${name}): 있음`);
        return true;
      }
    }

    debugLog('🔍 [AuthTokenUtils] 저장된 인증 cookie 없음');
    return false;
  } catch (error) {
    console.warn('⚠️ [AuthTokenUtils] 토큰 체크 중 오류:', error);
    return false;
  }
}
