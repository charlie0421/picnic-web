'use client';

/**
 * 로그아웃 관련 함수
 *
 * signOut, simpleSignOut, emergencySignOut 등 모든 로그아웃 변형을 관리합니다.
 * 순환 의존성을 방지하기 위해 Supabase 클라이언트를 getClient 콜백으로 주입받습니다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { clearBrowserAuthState, clearAuthLocalStorage, clearAuthCookies } from './storage-cleanup';

type BrowserSupabaseClient = SupabaseClient<Database>;

const supabaseDebug =
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

const debugLog = (...args: unknown[]) => {
  if (supabaseDebug) {
    console.log(...args);
  }
};

const debugWarn = (...args: unknown[]) => {
  if (supabaseDebug) {
    console.warn(...args);
  }
};

// 로그아웃 진행 상태
let isSigningOut = false;

/**
 * 종합적인 로그아웃 처리 함수입니다.
 * 모든 세션을 제거하고 스토리지를 완전히 정리합니다.
 *
 * @param getClient Supabase 클라이언트를 lazy resolve하는 콜백 (순환 의존성 방지)
 */
export async function signOut(getClient: () => BrowserSupabaseClient) {
  // 중복 실행 방지
  if (isSigningOut) {
    debugLog('🔄 [SignOut] 이미 로그아웃 진행 중 - 중복 호출 방지');
    return { success: true, message: '로그아웃이 이미 진행 중입니다.' };
  }

  const supabase = getClient();

  try {
    isSigningOut = true;
    debugLog('🚪 [SignOut] 종합 로그아웃 시작');

    // 1. 서버사이드 세션 무효화 API 호출
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        debugLog('✅ [SignOut] 서버사이드 세션 무효화 완료');
      } else {
        debugWarn('⚠️ [SignOut] 서버사이드 세션 무효화 실패 (계속 진행)');
      }
    } catch (e) {
      debugWarn('⚠️ [SignOut] 서버사이드 세션 무효화 오류 (계속 진행):', e);
    }

    // 2. Supabase 세션 제거 (타임아웃 적용, local scope)
    try {
      debugLog('🔄 [SignOut] Supabase 세션 제거 시작 (local scope)...');

      const signOutPromise = supabase.auth.signOut({ scope: 'local' });
      const timeoutPromise = new Promise<{ error: { message: string } }>((_, reject) => {
        setTimeout(() => reject(new Error('Supabase 로그아웃 타임아웃 (5초)')), 5000);
      });

      try {
        const result = await Promise.race([signOutPromise, timeoutPromise]);
        if ('error' in result && result.error) {
          debugWarn('⚠️ [SignOut] Supabase 로그아웃 오류 (계속 진행):', result.error);
        } else {
          debugLog('✅ [SignOut] Supabase 세션 제거 완료');
        }
      } catch (timeoutError) {
        debugWarn('⚠️ [SignOut] Supabase 로그아웃 타임아웃 (계속 진행):', timeoutError);
      }
    } catch (e) {
      debugWarn('⚠️ [SignOut] Supabase 로그아웃 예외 (계속 진행):', e);
    }

    // 3-5. 스토리지 및 쿠키 정리
    try {
      debugLog('🔄 [SignOut] 브라우저 인증 상태 정리 시작...');
      clearBrowserAuthState({ preserve: new Set(['picnic_last_login']) });

      try {
        const preserved = { picnic_last_login: localStorage.getItem('picnic_last_login') };
        debugLog('🧪 [SignOut] after cleanup, preserved snapshot:', preserved);
      } catch {}
    } catch (e) {
      console.warn('⚠️ [SignOut] 브라우저 인증 상태 정리 오류 (계속 진행):', e);
    }

    // 6. 메모리 캐시 정리
    try {
      debugLog('🔄 [SignOut] 메모리 캐시 정리 시작...');

      if (typeof window !== 'undefined') {
        const globalVarsToDelete = [
          '__supabase_client',
          '__auth_user',
          '__user_profile',
          '__auth_session',
          'googleAuth',
          'kakaoAuth',
        ];

        let deletedVars = 0;
        const globalWin = window as unknown as Record<string, unknown>;
        globalVarsToDelete.forEach(varName => {
          try {
            if (globalWin[varName] !== undefined) {
              delete globalWin[varName];
              deletedVars++;
            }
          } catch (e) {
            // 삭제 오류 무시
          }
        });
        debugLog(`🗑️ [SignOut] 전역 변수 ${deletedVars}개 정리 완료`);
      }

      debugLog('✅ [SignOut] 메모리 캐시 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] 메모리 캐시 정리 오류 (계속 진행):', e);
    }

    // 7. 리다이렉트 URL 정리
    try {
      debugLog('🔄 [SignOut] 리다이렉트 데이터 정리 시작...');
      const { clearAllAuthData } = await import('@/utils/auth-redirect');
      clearAllAuthData();
      debugLog('✅ [SignOut] 리다이렉트 데이터 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] 리다이렉트 데이터 정리 오류 (계속 진행):', e);
    }

    // 9. 최종 로깅
    debugLog('🎉 [SignOut] 모든 로그아웃 단계 완료!');
    debugLog('✅ [SignOut] 종합 로그아웃 완료');

    // 10. 페이지 리다이렉트
    debugLog('🔄 [SignOut] 마이페이지로 리다이렉트...');
    setTimeout(() => {
      window.location.href = '/ko/mypage';
    }, 500);

    return {
      success: true,
      message: '모든 인증 데이터가 성공적으로 정리되었습니다. 홈페이지로 이동합니다.'
    };

  } catch (error) {
    console.error('❌ [SignOut] 종합 로그아웃 중 치명적 오류:', error);

    // 치명적 오류가 발생해도 기본 정리는 시도
    try {
      const preserve = new Set(['picnic_last_login']);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && !preserve.has(key)) {
          try { localStorage.removeItem(key); } catch {}
        }
      }
      try {
        const snapshot = { picnic_last_login: localStorage.getItem('picnic_last_login') };
        debugLog('🧪 [SignOut] emergency cleanup preserved snapshot:', snapshot);
      } catch {}
      sessionStorage.clear();
      debugLog('🔧 [SignOut] 응급 스토리지 정리 완료(최근 로그인 보존)');
    } catch (e) {
      console.error('💥 [SignOut] 응급 정리마저 실패:', e);
    }

    // 오류가 발생해도 리다이렉트
    debugLog('🔄 [SignOut] 오류 후 마이페이지로 리다이렉트...');
    setTimeout(() => {
      window.location.href = '/ko/mypage';
    }, 300);

    return {
      success: false,
      error,
      message: '로그아웃 중 오류가 발생했지만 기본 정리는 완료되었습니다. 홈페이지로 이동합니다.'
    };
  } finally {
    isSigningOut = false;
    debugLog('🔄 [SignOut] 로그아웃 상태 리셋');
  }
}

// 로그아웃 상태 확인을 위한 디버그 함수
export function getLogoutStatus() {
  return {
    isSigningOut,
    timestamp: new Date().toISOString()
  };
}

// 강제 로그아웃 상태 리셋 (개발용)
export function resetLogoutStatus() {
  isSigningOut = false;
  debugLog('🔧 [SignOut] 로그아웃 상태 강제 리셋');
}

// isSigningOut 상태를 외부(client.ts)에서 읽을 수 있도록 제공
export function getIsSigningOut(): boolean {
  return isSigningOut;
}

/**
 * Next.js 15 호환 간단 로그아웃 함수
 * 복잡한 세션 처리를 우회하고 하드 리프레시를 사용합니다.
 */
export async function simpleSignOut() {
  debugLog('🚀 [SimpleSignOut] Next.js 15 호환 간단 로그아웃 시작');

  try {
    // 1. 서버사이드 세션 무효화
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        debugLog('✅ [SimpleSignOut] 서버사이드 세션 무효화 완료');
      } else {
        debugWarn('⚠️ [SimpleSignOut] 서버사이드 세션 무효화 실패 (계속 진행)');
      }
    } catch (e) {
      debugWarn('⚠️ [SimpleSignOut] 서버 무효화 오류 (계속 진행):', e);
    }

    // 2. 핵심 스토리지 + 쿠키 정리
    try {
      clearAuthLocalStorage();
      clearAuthCookies();
      debugLog('✅ [SimpleSignOut] 스토리지 및 쿠키 정리 완료');
    } catch (e) {
      debugWarn('⚠️ [SimpleSignOut] 스토리지 정리 오류 (계속 진행):', e);
    }

    // 3. 하드 리프레시로 완전 초기화
    debugLog('🔄 [SimpleSignOut] 하드 리프레시로 완전 초기화 시작...');
    setTimeout(() => {
      window.location.href = '/ko/mypage';
    }, 100);

    return {
      success: true,
      message: '간단 로그아웃 완료 - 페이지를 새로고침합니다.'
    };

  } catch (error) {
    console.error('❌ [SimpleSignOut] 간단 로그아웃 실패:', error);
    window.location.href = '/ko/mypage';

    return {
      success: false,
      error,
      message: '로그아웃 중 오류 발생 - 강제 새로고침합니다.'
    };
  }
}

/**
 * 응급 로그아웃 함수 (최후의 수단)
 * 모든 처리를 건너뛰고 즉시 리다이렉트합니다.
 */
export function emergencySignOut() {
  debugLog('🚨 [EmergencySignOut] 응급 로그아웃 실행');

  try {
    // 최소한의 정리만 시도 (최근 로그인 정보 보존)
    const preserve = new Set(['picnic_last_login']);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !preserve.has(key)) {
        try { localStorage.removeItem(key); } catch {}
      }
    }
    try {
      const snapshot = { picnic_last_login: localStorage.getItem('picnic_last_login') };
      debugLog('🧪 [EmergencySignOut] preserved snapshot:', snapshot);
    } catch {}
    sessionStorage.clear();
  } catch (e) {
    // 무시
  }

  // 즉시 리다이렉트
  window.location.replace('/ko/mypage');
}
