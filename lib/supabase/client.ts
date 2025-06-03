'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { clearAllAuthData } from '@/utils/auth-redirect';

// 브라우저 클라이언트 타입을 미리 정의
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let browserSupabase: BrowserSupabaseClient | null = null;
let supabaseInstance: any = null;
let authFailureCount = 0;
const MAX_AUTH_FAILURES = 3;

// 401 에러 감지 및 자동 로그아웃 처리
const handleAuthError = async (error: any, context: string = 'unknown') => {
  console.warn(`🚫 [Supabase] 인증 오류 감지 (${context}):`, error);
  
  authFailureCount++;
  
  if (authFailureCount >= MAX_AUTH_FAILURES) {
    console.error(`🚨 [Supabase] 연속 인증 실패 ${authFailureCount}회 - 강제 로그아웃`);
    
    try {
      // 강제 로그아웃 수행
      const { emergencyLogout } = await import('@/lib/auth/logout');
      await emergencyLogout();
      
      // 로그인 페이지로 이동
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.href = '/login?reason=auth_expired';
        }, 1000);
      }
    } catch (logoutError) {
      console.error('💥 [Supabase] 강제 로그아웃 실패:', logoutError);
      
      // 응급 처리
      if (typeof window !== 'undefined') {
        clearAllAuthData();
        window.location.href = '/login?reason=auth_error';
      }
    }
  }
};

// 인증 성공 시 실패 카운트 리셋
const resetAuthFailureCount = () => {
  if (authFailureCount > 0) {
    console.log('✅ [Supabase] 인증 성공 - 실패 카운트 리셋');
    authFailureCount = 0;
  }
};

/**
 * 브라우저 환경에서 사용할 Supabase 클라이언트를 생성합니다.
 * 싱글톤 패턴을 사용하여 단일 인스턴스를 생성하고 재사용합니다.
 * 
 * 이 함수는 클라이언트 컴포넌트에서만 사용해야 합니다.
 * 
 * @returns Supabase 클라이언트 인스턴스
 */
export function createBrowserSupabaseClient(): BrowserSupabaseClient {
  if (browserSupabase) {
    return browserSupabase;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.');
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.');
  }

  browserSupabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        autoRefreshToken: true,
        persistSession: true,
        storage: {
          getItem: (key: string) => {
            // 로컬 스토리지에서 가져오기
            const localValue = globalThis.localStorage?.getItem(key) ?? null;
            if (localValue) return localValue;

            // 쿠키에서 시도 (백업)
            const cookies = document.cookie.split('; ');
            for (const cookie of cookies) {
              const [cookieName, cookieValue] = cookie.split('=');
              if (cookieName === key) return decodeURIComponent(cookieValue);
            }
            return null;
          },
          setItem: (key: string, value: string) => {
            try {
              // 로컬 스토리지에 저장
              globalThis.localStorage?.setItem(key, value);

              // 쿠키에도 저장 (백업)
              const date = new Date();
              date.setTime(date.getTime() + 8 * 60 * 60 * 1000); // 8시간 유효
              const cookieOptions = `; expires=${date.toUTCString()}; path=/`;
              document.cookie = `${key}=${encodeURIComponent(value)}${cookieOptions}`;
            } catch (e) {
              console.warn('스토리지 저장 오류:', e);
            }
          },
          removeItem: (key: string) => {
            try {
              // 로컬 스토리지에서 제거
              globalThis.localStorage?.removeItem(key);

              // 쿠키에서도 제거
              document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            } catch (e) {
              console.warn('스토리지 제거 오류:', e);
            }
          }
        }
      },
      realtime: {
        // Realtime 기능 활성화
        params: {
          eventsPerSecond: 10, // 초당 최대 이벤트 수 제한
        },
        // 연결 상태 로깅 (개발 환경에서만)
        log_level: process.env.NODE_ENV === 'development' ? 'info' : 'error',
        // 자동 재연결 설정
        reconnectAfterMs: (tries: number) => {
          // 지수 백오프: 1초, 2초, 4초, 8초, 최대 30초
          const delay = Math.min(1000 * Math.pow(2, tries), 30000);
          console.log(`🔄 [Supabase] Realtime 재연결 시도 #${tries + 1}, ${delay}ms 후`);
          return delay;
        },
        // 하트비트 간격 (30초)
        heartbeatIntervalMs: 30000,
        // 연결 타임아웃 (10초) - timeout 속성 사용
        timeout: 10000,
      },
    }
  ) as BrowserSupabaseClient;

  // 디버그 로그 (개발 환경에서만)
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    console.log('브라우저 Supabase 클라이언트 초기화 완료 (Realtime 활성화)', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hostname: window.location.hostname
    });
  }

  // Auth 상태 변화 리스너 (강화됨)
  browserSupabase.auth.onAuthStateChange(async (event: any, session: any) => {
    console.log('🔄 [Supabase] Auth 상태 변화:', event, session ? 'session exists' : 'no session');
    
    switch (event) {
      case 'SIGNED_IN':
        console.log('✅ [Supabase] 로그인 성공');
        resetAuthFailureCount();
        break;
        
      case 'SIGNED_OUT':
        console.log('🚪 [Supabase] 로그아웃 완료');
        authFailureCount = 0;
        break;
        
      case 'TOKEN_REFRESHED':
        console.log('🔄 [Supabase] 토큰 갱신 성공');
        resetAuthFailureCount();
        break;
        
      case 'PASSWORD_RECOVERY':
        console.log('🔑 [Supabase] 비밀번호 복구');
        break;
        
      case 'USER_UPDATED':
        console.log('👤 [Supabase] 사용자 정보 업데이트');
        break;
        
      default:
        console.log(`🔍 [Supabase] 알 수 없는 Auth 이벤트: ${event}`);
    }
  });

  return browserSupabase;
}

/**
 * 현재 인증 사용자를 가져오는 편의 함수입니다.
 * 
 * @returns 현재 인증된 사용자 또는 null
 */
export async function getCurrentUser() {
  const supabase = createBrowserSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * 현재 인증 세션을 가져오는 편의 함수입니다.
 * 
 * @returns 현재 인증 세션 또는 null
 */
export async function getCurrentSession() {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * 종합적인 로그아웃 처리 함수입니다.
 * 모든 세션을 제거하고 스토리지를 완전히 정리합니다.
 * 
 * @returns 로그아웃 결과
 */
export async function signOut() {
  const supabase = createBrowserSupabaseClient();
  
  console.log('🚪 [Supabase] 로그아웃 프로세스 시작');
  
  try {
    // 1. Supabase auth sign out
    const { error } = await supabase.auth.signOut({
      scope: 'global'
    });

    if (error) {
      console.warn('⚠️ [SignOut] Supabase 로그아웃 오류 (계속 진행):', error.message);
    } else {
      console.log('✅ [SignOut] Supabase 로그아웃 완료');
    }

    // 2. 실패 카운트 리셋
    authFailureCount = 0;

    // 3. 모든 인증 관련 localStorage 데이터 제거
    try {
      const authKeys = [
        // 기본 인증 키들
        'auth_session_active',
        'auth_provider',
        'auth_timestamp',
        'auth_success',
        
        // Supabase 관련 키들
        'supabase.auth.token',
        'supabase.auth.expires_at',
        'supabase.auth.refresh_token',
        'sb-auth-token',
        
        // WeChat 관련 키들
        'wechat_auth_token',
        'wechat_auth_state',
        'wechat_login_state',
        
        // 기타 소셜 로그인 키들
        'google_auth_state',
        'kakao_auth_state',
        'apple_auth_state',
        
        // 사용자 프로필 캐시
        'user_profile_cache',
        'profile_cache_timestamp',
      ];

      // 명시적 키 제거
      authKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`⚠️ [SignOut] localStorage 키 제거 실패: ${key}`, e);
        }
      });

      // 패턴 기반 키 제거 (supabase, auth 포함)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('login') ||
          key.includes('wechat') ||
          key.includes('oauth')
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`⚠️ [SignOut] localStorage 패턴 키 제거 실패: ${key}`, e);
        }
      });

      console.log('✅ [SignOut] localStorage 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] localStorage 정리 오류 (계속 진행):', e);
    }

    // 4. sessionStorage 정리
    try {
      const sessionKeys = [
        'redirectUrl',
        'loginRedirect',
        'authRedirect',
        'auth_redirect_url'
      ];

      sessionKeys.forEach(key => {
        try {
          sessionStorage.removeItem(key);
        } catch (e) {
          console.warn(`⚠️ [SignOut] sessionStorage 키 제거 실패: ${key}`, e);
        }
      });

      console.log('✅ [SignOut] sessionStorage 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] sessionStorage 정리 오류 (계속 진행):', e);
    }

    // 5. Supabase 인스턴스 초기화
    browserSupabase = null;

    console.log('✅ [SignOut] 전체 로그아웃 프로세스 완료');

  } catch (error) {
    console.error('💥 [SignOut] 로그아웃 프로세스 오류:', error);
    
    // 에러 발생 시에도 최소한의 정리 수행
    authFailureCount = 0;
    browserSupabase = null;
    
    try {
      clearAllAuthData();
    } catch (e) {
      console.warn('⚠️ [SignOut] 응급 정리 실패:', e);
    }
  }
}

// 인증 실패 통계 조회 (디버깅용)
export function getAuthFailureStats() {
  return {
    failureCount: authFailureCount,
    maxFailures: MAX_AUTH_FAILURES,
    isAtRisk: authFailureCount >= MAX_AUTH_FAILURES - 1
  };
}

export function getSupabaseClient() {
  return createBrowserSupabaseClient();
}

export default function createClient() {
  return createBrowserSupabaseClient();
} 