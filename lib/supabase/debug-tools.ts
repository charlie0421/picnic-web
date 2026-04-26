'use client';

/**
 * 개발 환경용 로그아웃 디버깅 도구
 *
 * window.debugLogout으로 접근 가능한 디버깅 유틸리티를 등록합니다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type BrowserSupabaseClient = SupabaseClient<Database>;

const supabaseDebug =
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

const debugLog = (...args: unknown[]) => {
  if (supabaseDebug) {
    console.log(...args);
  }
};

interface SignOutFns {
  signOut: () => Promise<unknown>;
  simpleSignOut: () => Promise<unknown>;
  emergencySignOut: () => void;
}

export function registerDebugTools(
  getBrowserSupabase: () => BrowserSupabaseClient | null,
  signOutFns: SignOutFns,
): void {
  if (typeof window === 'undefined') return;

  const globalWindow = window as unknown as Record<string, unknown>;

  globalWindow.debugLogout = {
    signOut: signOutFns.signOut,
    simpleSignOut: signOutFns.simpleSignOut,
    emergencySignOut: signOutFns.emergencySignOut,

    checkStatus: () => {
      if (supabaseDebug) {
        debugLog('🔍 로그아웃 디버깅 도구 실행 중...');
      }

      const localStorageKeys: Array<{key: string, value: string}> = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth') || key.includes('supabase') || key.includes('sb-'))) {
          const value = localStorage.getItem(key);
          localStorageKeys.push({ key, value: (value?.slice(0, 50) || '') + '...' });
        }
      }

      const sessionStorageKeys: Array<{key: string, value: string | null}> = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('auth') || key.includes('logout') || key.includes('redirect'))) {
          sessionStorageKeys.push({ key, value: sessionStorage.getItem(key) });
        }
      }

      const authCookies = document.cookie.split(';').filter(cookie => {
        const name = cookie.trim().split('=')[0];
        return name && (name.includes('auth') || name.includes('sb-') || name.includes('supabase'));
      });

      if (supabaseDebug) {
        debugLog('🔍 로그아웃 상태 디버깅 결과:', {
          localStorageKeys,
          sessionStorageKeys,
          authCookies,
        });
      }

      return { localStorageKeys, sessionStorageKeys, authCookies };
    },

    forceClean: () => {
      if (supabaseDebug) {
        debugLog('🧹 강제 스토리지 정리 시작...');
      }

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth') || key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('auth') || key.includes('logout') || key.includes('redirect'))) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));

      if (supabaseDebug) {
        debugLog('✅ 강제 스토리지 정리 완료');
      }
      return { removed: keysToRemove.length + sessionKeysToRemove.length };
    },

    supabaseOnly: async () => {
      if (supabaseDebug) {
        debugLog('🚪 단순 Supabase 로그아웃...');
      }
      try {
        const browserSupabase = getBrowserSupabase();
        if (!browserSupabase) {
          throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        }
        const result = await browserSupabase.auth.signOut();
        if (supabaseDebug) {
          debugLog('✅ 단순 로그아웃 완료:', result);
        }
        return result;
      } catch (error) {
        console.error('❌ 단순 로그아웃 실패:', error);
        return { error };
      }
    }
  };

  if (supabaseDebug) {
    debugLog('🔍 [Dev] Next.js 15 호환 로그아웃 디버깅 도구가 전역으로 노출되었습니다:', {
      '🚀 window.debugLogout.simpleSignOut()': 'Next.js 15 호환 간단 로그아웃',
      '🚨 window.debugLogout.emergencySignOut()': '응급 로그아웃 (즉시 리다이렉트)',
      '🚪 window.debugLogout.signOut()': '포괄적인 로그아웃 (기존)',
      '🔍 window.debugLogout.checkStatus()': '로그아웃 상태 확인',
      '🧹 window.debugLogout.forceClean()': '강제 스토리지 정리',
      '🔧 window.debugLogout.supabaseOnly()': '단순 Supabase 로그아웃',
    });
  }
}
