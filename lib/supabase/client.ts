'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';

// 브라우저 클라이언트 타입을 미리 정의
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let browserSupabase: BrowserSupabaseClient | null = null;

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
          return Math.min(1000 * Math.pow(2, tries), 30000);
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
  
  try {
    console.log('🚪 [SignOut] 종합 로그아웃 시작');

    // 1. 서버사이드 세션 무효화 API 호출 (먼저 시도)
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ [SignOut] 서버사이드 세션 무효화 완료');
      } else {
        console.warn('⚠️ [SignOut] 서버사이드 세션 무효화 실패 (계속 진행)');
      }
    } catch (e) {
      console.warn('⚠️ [SignOut] 서버사이드 세션 무효화 오류 (계속 진행):', e);
    }

    // 2. Supabase 세션 제거
    try {
      const { error } = await supabase.auth.signOut({
        scope: 'global'
      });

      if (error) {
        console.warn('⚠️ [SignOut] Supabase 로그아웃 오류 (계속 진행):', error);
      } else {
        console.log('✅ [SignOut] Supabase 세션 제거 완료');
      }
    } catch (e) {
      console.warn('⚠️ [SignOut] Supabase 로그아웃 예외 (계속 진행):', e);
    }

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

    // 4. 모든 인증 관련 sessionStorage 데이터 제거
    try {
      const sessionAuthKeys = [
        'redirect_url',
        'auth_redirect_url',
        'login_redirect',
        'oauth_state',
        'wechat_auth_code',
      ];

      // 명시적 키 제거
      sessionAuthKeys.forEach(key => {
        try {
          sessionStorage.removeItem(key);
        } catch (e) {
          console.warn(`⚠️ [SignOut] sessionStorage 키 제거 실패: ${key}`, e);
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
          key.includes('oauth') ||
          key.includes('wechat')
        )) {
          sessionKeysToRemove.push(key);
        }
      }
      
      sessionKeysToRemove.forEach(key => {
        try {
          sessionStorage.removeItem(key);
        } catch (e) {
          console.warn(`⚠️ [SignOut] sessionStorage 패턴 키 제거 실패: ${key}`, e);
        }
      });

      console.log('✅ [SignOut] sessionStorage 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] sessionStorage 정리 오류 (계속 진행):', e);
    }

    // 5. 모든 인증 관련 쿠키 제거
    try {
      const cookiesToRemove = [
        'auth-token',
        'auth-refresh-token',
        'sb-auth-token',
        'supabase-auth-token',
        'wechat-auth',
        'oauth-state',
        'session-id',
        'user-session',
      ];

      // 명시적 쿠키 제거
      cookiesToRemove.forEach(cookieName => {
        try {
          // 여러 경로와 도메인에서 제거 시도
          const domains = ['', `.${window.location.hostname}`, window.location.hostname];
          const paths = ['/', '/auth', '/api'];
          
          domains.forEach(domain => {
            paths.forEach(path => {
              document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
            });
          });
        } catch (e) {
          console.warn(`⚠️ [SignOut] 쿠키 제거 실패: ${cookieName}`, e);
        }
      });

      // 패턴 기반 쿠키 제거
      try {
        document.cookie.split(';').forEach((cookie) => {
          const cookieName = cookie.trim().split('=')[0];
          if (cookieName && (
            cookieName.includes('auth') || 
            cookieName.includes('supabase') ||
            cookieName.includes('login') ||
            cookieName.includes('oauth') ||
            cookieName.includes('wechat')
          )) {
            const domains = ['', `.${window.location.hostname}`, window.location.hostname];
            const paths = ['/', '/auth', '/api'];
            
            domains.forEach(domain => {
              paths.forEach(path => {
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
              });
            });
          }
        });
      } catch (e) {
        console.warn('⚠️ [SignOut] 패턴 쿠키 제거 오류:', e);
      }

      console.log('✅ [SignOut] 쿠키 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] 쿠키 정리 오류 (계속 진행):', e);
    }

    // 6. 메모리 캐시 정리 (window 객체에서 전역 변수들 정리)
    try {
      // 전역 인증 관련 변수들 정리
      if (typeof window !== 'undefined') {
        // Supabase 클라이언트 캐시 정리
        browserSupabase = null;
        
        // 전역 변수 정리
        const globalVarsToDelete = [
          '__supabase_client',
          '__auth_user',
          '__user_profile',
          '__auth_session',
          'wechatAuth',
          'googleAuth',
          'kakaoAuth',
        ];
        
        globalVarsToDelete.forEach(varName => {
          try {
            delete (window as any)[varName];
          } catch (e) {
            // 삭제 오류 무시
          }
        });
      }

      console.log('✅ [SignOut] 메모리 캐시 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] 메모리 캐시 정리 오류 (계속 진행):', e);
    }

    // 7. WeChat SDK 로그아웃 시도 (WeChat이 활성화된 경우)
    try {
      if (typeof window !== 'undefined' && (window as any).WeixinJSBridge) {
        console.log('🔄 [SignOut] WeChat SDK 로그아웃 시도');
        // WeChat SDK 특별 처리 (필요시)
      }
    } catch (e) {
      console.warn('⚠️ [SignOut] WeChat SDK 로그아웃 오류 (계속 진행):', e);
    }

    // 8. 리다이렉트 URL 정리 (auth-redirect.ts의 clearAllAuthData 호출)
    try {
      // 동적 import로 clearAllAuthData 함수 사용
      const { clearAllAuthData } = await import('@/utils/auth-redirect');
      clearAllAuthData();
      console.log('✅ [SignOut] 리다이렉트 데이터 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] 리다이렉트 데이터 정리 오류 (계속 진행):', e);
    }

    // 9. 최종 상태 체크 및 로깅
    console.log('✅ [SignOut] 종합 로그아웃 완료');
    
    return { 
      success: true,
      message: '모든 인증 데이터가 성공적으로 정리되었습니다.'
    };
    
  } catch (error) {
    console.error('❌ [SignOut] 종합 로그아웃 중 치명적 오류:', error);
    
    // 치명적 오류가 발생해도 기본 정리는 시도
    try {
      localStorage.clear();
      sessionStorage.clear();
      console.log('🔧 [SignOut] 응급 스토리지 전체 정리 완료');
    } catch (e) {
      console.error('💥 [SignOut] 응급 정리마저 실패:', e);
    }
    
    return { 
      success: false, 
      error,
      message: '로그아웃 중 오류가 발생했지만 기본 정리는 완료되었습니다.'
    };
  }
} 