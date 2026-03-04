'use client';

/**
 * 인증 관련 브라우저 스토리지 정리 유틸리티
 *
 * localStorage, sessionStorage, 쿠키 정리를 위한 순수 함수들입니다.
 * signOut, simpleSignOut, emergencySignOut에서 공통으로 사용됩니다.
 */

const supabaseDebug =
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

const debugLog = (...args: unknown[]) => {
  if (supabaseDebug) {
    console.log(...args);
  }
};

/**
 * localStorage에서 인증 관련 데이터를 제거합니다.
 * @param options.preserve 보존할 키 목록 (기본: picnic_last_login)
 */
export function clearAuthLocalStorage(options?: { preserve?: Set<string> }): void {
  const preserveKeys = options?.preserve ?? new Set(['picnic_last_login']);

  // 명시적 키 제거
  const authKeys = [
    'auth_session_active',
    'auth_provider',
    'auth_timestamp',
    'auth_success',
    'supabase.auth.token',
    'supabase.auth.expires_at',
    'supabase.auth.refresh_token',
    'sb-auth-token',
    'google_auth_state',
    'kakao_auth_state',
    'apple_auth_state',
    'user_profile_cache',
    'profile_cache_timestamp',
  ];

  let removedExplicitKeys = 0;
  authKeys.forEach(key => {
    try {
      if (!preserveKeys.has(key) && localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removedExplicitKeys++;
      }
    } catch (e) {
      console.warn(`⚠️ [StorageCleanup] localStorage 키 제거 실패: ${key}`, e);
    }
  });

  // 패턴 기반 키 제거
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      !preserveKeys.has(key) &&
      (
        key.includes('supabase') ||
        key.includes('auth') ||
        key.includes('login') ||
        key.includes('oauth') ||
        key.includes('sb-')
      )
    ) {
      keysToRemove.push(key);
    }
  }

  let removedPatternKeys = 0;
  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
      removedPatternKeys++;
    } catch (e) {
      console.warn(`⚠️ [StorageCleanup] localStorage 패턴 키 제거 실패: ${key}`, e);
    }
  });

  debugLog(`✅ [StorageCleanup] localStorage 정리 완료 (명시적: ${removedExplicitKeys}, 패턴: ${removedPatternKeys})`);
}

/**
 * sessionStorage에서 인증 관련 데이터를 제거합니다.
 */
export function clearAuthSessionStorage(): void {
  // 명시적 키 제거
  const sessionAuthKeys = [
    'redirect_url',
    'auth_redirect_url',
    'login_redirect',
    'oauth_state',
  ];

  let removedExplicit = 0;
  sessionAuthKeys.forEach(key => {
    try {
      if (sessionStorage.getItem(key) !== null) {
        sessionStorage.removeItem(key);
        removedExplicit++;
      }
    } catch (e) {
      console.warn(`⚠️ [StorageCleanup] sessionStorage 키 제거 실패: ${key}`, e);
    }
  });

  // 패턴 기반 키 제거
  const sessionKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (
      key.includes('auth') ||
      key.includes('redirect') ||
      key.includes('login') ||
      key.includes('oauth')
    )) {
      sessionKeysToRemove.push(key);
    }
  }

  let removedPattern = 0;
  sessionKeysToRemove.forEach(key => {
    try {
      sessionStorage.removeItem(key);
      removedPattern++;
    } catch (e) {
      console.warn(`⚠️ [StorageCleanup] sessionStorage 패턴 키 제거 실패: ${key}`, e);
    }
  });

  debugLog(`✅ [StorageCleanup] sessionStorage 정리 완료 (명시적: ${removedExplicit}, 패턴: ${removedPattern})`);
}

/**
 * 인증 관련 쿠키를 제거합니다.
 */
export function clearAuthCookies(): void {
  const cookiesToRemove = [
    'auth-token',
    'auth-refresh-token',
    'sb-auth-token',
    'supabase-auth-token',
    'oauth-state',
    'session-id',
    'user-session',
  ];

  // 명시적 쿠키 제거
  let removedExplicit = 0;
  cookiesToRemove.forEach(cookieName => {
    try {
      const domains = ['', `.${window.location.hostname}`, window.location.hostname];
      const paths = ['/', '/auth', '/api'];

      domains.forEach(domain => {
        paths.forEach(path => {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
        });
      });
      removedExplicit++;
    } catch (e) {
      console.warn(`⚠️ [StorageCleanup] 쿠키 제거 실패: ${cookieName}`, e);
    }
  });

  // 패턴 기반 쿠키 제거
  let removedPattern = 0;
  try {
    document.cookie.split(';').forEach((cookie) => {
      const cookieName = cookie.trim().split('=')[0];
      if (cookieName && (
        cookieName.includes('auth') ||
        cookieName.includes('supabase') ||
        cookieName.includes('login') ||
        cookieName.includes('oauth') ||
        cookieName.includes('sb-') ||
        cookieName.includes('session')
      )) {
        const domains = ['', `.${window.location.hostname}`, window.location.hostname, '.localhost'];
        const paths = ['/', '/auth', '/api', '/ja'];

        domains.forEach(domain => {
          paths.forEach(path => {
            try {
              document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; SameSite=Lax`;
              document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; SameSite=Strict`;
              document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; SameSite=None; Secure`;
              document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
            } catch (e) {
              // 무시
            }
          });
        });
        removedPattern++;
      }
    });
  } catch (e) {
    console.warn('⚠️ [StorageCleanup] 패턴 쿠키 제거 오류:', e);
  }

  debugLog(`✅ [StorageCleanup] 쿠키 정리 완료 (명시적: ${removedExplicit}, 패턴: ${removedPattern})`);
}

/**
 * 모든 브라우저 인증 상태를 한꺼번에 정리합니다.
 * localStorage, sessionStorage, 쿠키를 모두 정리합니다.
 */
export function clearBrowserAuthState(options?: { preserve?: Set<string> }): void {
  try { clearAuthLocalStorage(options); } catch (e) {
    console.warn('⚠️ [StorageCleanup] localStorage 정리 오류:', e);
  }
  try { clearAuthSessionStorage(); } catch (e) {
    console.warn('⚠️ [StorageCleanup] sessionStorage 정리 오류:', e);
  }
  try { clearAuthCookies(); } catch (e) {
    console.warn('⚠️ [StorageCleanup] 쿠키 정리 오류:', e);
  }
}
