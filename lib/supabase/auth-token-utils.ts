'use client';

/**
 * 인증 토큰 감지/체크 유틸리티
 *
 * localStorage 및 쿠키에서 Supabase 인증 토큰을 감지하는 순수 함수들입니다.
 * AuthStore의 constructor에서 사용됩니다.
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
 * localStorage 및 쿠키에서 저장된 인증 토큰을 감지합니다.
 *
 * @returns 토큰이 존재하면 true
 */
export function detectStoredAuthToken(): boolean {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;

    const projectId = getSupabaseProjectIdFromUrl(supabaseUrl);

    if (projectId) {
      const authKey = `sb-${projectId}-auth-token`;

      // 1단계: localStorage 확인
      const hasLocalStorageToken = localStorage.getItem(authKey);
      debugLog(`🔍 [AuthTokenUtils] localStorage에 토큰 (${authKey}):`, hasLocalStorageToken ? '있음' : '없음');

      // 2단계: 쿠키 확인
      const hasCookieToken = checkCookieAuthToken(projectId);

      const hasAnyToken = !!hasLocalStorageToken || hasCookieToken;
      debugLog(`🔍 [AuthTokenUtils] 토큰 총합:`, {
        localStorage: !!hasLocalStorageToken,
        cookie: hasCookieToken,
        hasAnyToken
      });

      return hasAnyToken;
    }

    // 프로젝트 ID를 추출할 수 없는 경우 모든 Supabase 키 확인
    let hasLocalStorage = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const hasToken = localStorage.getItem(key);
        debugLog(`🔍 [AuthTokenUtils] localStorage에 토큰 (${key}):`, hasToken ? '있음' : '없음');
        if (hasToken) hasLocalStorage = true;
      }
    }

    // 일반적인 쿠키 패턴 확인 (code-verifier 제외)
    let hasCookie = false;
    try {
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
          hasCookie = true;
          break;
        }
      }
    } catch (error) {
      console.warn('⚠️ [AuthTokenUtils] 일반 쿠키 확인 중 오류:', error);
    }

    const hasAnyToken = hasLocalStorage || hasCookie;
    debugLog(`🔍 [AuthTokenUtils] 전체 토큰 상태:`, {
      localStorage: hasLocalStorage,
      cookie: hasCookie,
      hasAnyToken
    });

    return hasAnyToken;
  } catch (error) {
    console.warn('⚠️ [AuthTokenUtils] 토큰 체크 중 오류:', error);
    return false;
  }
}
