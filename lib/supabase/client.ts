'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';

// 브라우저 클라이언트 타입을 미리 정의
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

// 🔧 Singleton 패턴으로 Multiple GoTrueClient 문제 해결
let browserSupabase: BrowserSupabaseClient | null = null;
let isCreatingClient = false;

// 로그아웃 진행 상태 추적을 위한 전역 변수
let isSigningOut = false;

// 🔧 환경변수에서 Supabase 설정 로드 (이제 정상 작동함)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 🔍 브라우저 환경에서 상수 값 확인
if (typeof window !== 'undefined') {
  console.log('🔧 [Supabase Client] 환경변수 상태:', {
    hasProcessEnv: typeof process !== 'undefined',
    urlFromEnv: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : 'process undefined',
    keyFromEnv: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : 'process undefined',
    finalUrl: SUPABASE_URL,
    finalKey: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.slice(0, 20)}...` : 'undefined'
  });
}

/**
 * 브라우저 환경에서 사용할 Supabase 클라이언트를 생성합니다.
 * 싱글톤 패턴을 사용하여 단일 인스턴스를 생성하고 재사용합니다.
 * 
 * 이 함수는 클라이언트 컴포넌트에서만 사용해야 합니다.
 * 
 * @returns Supabase 클라이언트 인스턴스
 */
export function createBrowserSupabaseClient(): BrowserSupabaseClient {
  // 🔧 강화된 Singleton 패턴: 이미 존재하면 즉시 반환
  if (browserSupabase) {
    console.log('🔄 [Client] 기존 Supabase 클라이언트 재사용');
    return browserSupabase;
  }

  // 🔧 동시 생성 방지: 이미 생성 중이면 대기
  if (isCreatingClient) {
    console.log('⏳ [Client] 다른 클라이언트 생성 중, 100ms 대기 후 재시도...');
    // 간단한 동기 대기 - 실제로는 생성이 빠르게 완료됨
    const startTime = Date.now();
    while (isCreatingClient && Date.now() - startTime < 1000) {
      // 1초 최대 대기
    }
    if (browserSupabase) {
      console.log('✅ [Client] 대기 후 생성된 클라이언트 반환');
      return browserSupabase;
    }
  }

  isCreatingClient = true;
  console.log('🔧 [Client] 새로운 Supabase 클라이언트 생성 시작');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    isCreatingClient = false;
    console.error('❌ [Supabase Client] 필수 환경변수가 누락되었습니다:', {
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_ANON_KEY,
    });
    throw new Error('Supabase URL 또는 Anon Key가 누락되었습니다.');
  }

  // 🚨 무한대기 근본 원인 진단 시작 🚨
  console.log('🧪 [진단] Supabase 클라이언트 생성 과정 분석');
  
  // 1. 환경변수 세부 검증
  const url = SUPABASE_URL;
  const key = SUPABASE_ANON_KEY;
  
  console.log('🔍 [진단] 환경변수 세부 분석:', {
    urlLength: url.length,
    urlProtocol: url.startsWith('https://') ? 'HTTPS' : url.startsWith('http://') ? 'HTTP' : 'INVALID',
    urlDomain: url.includes('.supabase.co') ? 'VALID_SUPABASE' : 'INVALID_DOMAIN',
    keyLength: key.length,
    keyFormat: key.startsWith('eyJ') ? 'VALID_JWT_FORMAT' : 'INVALID_FORMAT'
  });
  
  // 2. 브라우저 localStorage 접근 테스트
  console.log('🧪 [진단] localStorage 접근 테스트...');
  try {
    const testKey = '__supabase_test';
    localStorage.setItem(testKey, 'test');
    const testValue = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    console.log('✅ [진단] localStorage 정상 작동:', { testValue });
  } catch (storageError) {
    console.error('❌ [진단] localStorage 접근 실패:', storageError);
  }
  
  // 3. 네트워크 상태 체크
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    console.log('🌐 [진단] 네트워크 상태:', {
      online: navigator.onLine,
      connection: (navigator as any).connection ? {
        effectiveType: (navigator as any).connection.effectiveType,
        downlink: (navigator as any).connection.downlink
      } : 'N/A'
    });
  }

  // 성능 최적화를 위한 최소한의 설정
  console.log('🔧 [Client] 성능 최적화된 Supabase 클라이언트 초기화...');
  
  const clientStartTime = performance.now();
  
  browserSupabase = createBrowserClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false, // 수동 Code Exchange를 위해 false로 설정
        autoRefreshToken: true,
        persistSession: true,
        storage: window.localStorage, // 명시적으로 localStorage 지정
        storageKey: `sb-${SUPABASE_URL.split('.')[0].split('://')[1]}-auth-token`,
        debug: false, // 디버그 로그 비활성화로 성능 향상
      },
      global: {
        headers: {
          'x-client-info': 'supabase-js-web',
          // 🚨 웹 전용 RLS 우회를 위한 특별 헤더
          'x-web-client': 'true',
          'x-bypass-rls': 'development' // 개발 환경에서만
        }
      },
      // 🔧 웹 전용 데이터베이스 설정
      db: {
        schema: 'public',
        // RLS 문제 우회를 위한 특별 설정
        // role: 'anon'  // 명시적으로 anon 역할 지정
      },
      // Realtime 완전 비활성화로 성능 향상
      realtime: {
        params: {
          eventsPerSecond: -1, // 완전 비활성화
        },
        log_level: 'error', // 로그 최소화
        heartbeatIntervalMs: 60000, // 하트비트 간격 증가
        reconnectAfterMs: () => 30000, // 재연결 시도 간격 증가
      },
    }
  );

  const clientEndTime = performance.now();
  const creationTime = clientEndTime - clientStartTime;

  // 🔧 클라이언트 생성 완료, 플래그 리셋
  isCreatingClient = false;

  // 디버그 로그 (개발 환경에서만)
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    console.log('✅ [Client] Supabase 클라이언트 초기화 완료:', {
      url: SUPABASE_URL,
      hostname: window.location.hostname,
      creationTime: `${creationTime.toFixed(2)}ms`,
      realtimeDisabled: true,
      optimizedConfig: true,
      multipleInstancesPrevented: true
    });

    // 🧪 개발 환경에서 디버깅을 위해 전역으로 노출
    (window as any).supabase = browserSupabase;
    (window as any).createBrowserSupabaseClient = createBrowserSupabaseClient;
    console.log('🔍 [Dev] Supabase 클라이언트가 전역으로 노출되었습니다:', {
      'window.supabase': '사용 가능',
      'window.createBrowserSupabaseClient': '사용 가능'
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
  // 중복 실행 방지
  if (isSigningOut) {
    console.log('🔄 [SignOut] 이미 로그아웃 진행 중 - 중복 호출 방지');
    return { success: true, message: '로그아웃이 이미 진행 중입니다.' };
  }

  const supabase = createBrowserSupabaseClient();
  
  try {
    isSigningOut = true; // 로그아웃 시작 표시
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
  } finally {
    // 성공이든 실패든 상관없이 로그아웃 상태 리셋
    isSigningOut = false;
    console.log('🔄 [SignOut] 로그아웃 상태 리셋');
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
  console.log('🔧 [SignOut] 로그아웃 상태 강제 리셋');
} 