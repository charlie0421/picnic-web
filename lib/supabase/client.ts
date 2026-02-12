'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';
import { emitSupabaseAuthRateLimit } from './events';

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

// 브라우저 클라이언트 타입을 미리 정의
type BrowserSupabaseClient = SupabaseClient<Database>;

// 🔧 Singleton 패턴으로 Multiple GoTrueClient 문제 해결
let browserSupabase: BrowserSupabaseClient | null = null;
let isCreatingClient = false;

// 로그아웃 진행 상태 추적을 위한 전역 변수
let isSigningOut = false;
// 429 Rate Limit 처리 중 플래그 (무한 루프 방지)
let isHandlingRateLimit = false;
type AutoRefreshState = 'started' | 'stopped' | 'unknown';
let autoRefreshState: AutoRefreshState = 'unknown';
let autoRefreshSubscription: { unsubscribe: () => void } | null = null;

const AUTH_REFRESH_ENDPOINT = '/auth/v1/token';
const RATE_LIMIT_THROTTLE_WINDOW_MS = 2000;
let lastRateLimitHandledAt = 0;

function getSupabaseProjectId(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const urlParts = supabaseUrl.split('.');
  if (!urlParts.length) return null;
  const projectHost = urlParts[0];
  if (!projectHost) return null;
  const segments = projectHost.split('://');
  return segments.length > 1 ? segments[1] : segments[0];
}

function getSupabaseAuthStorageKey(): string | null {
  const projectId = getSupabaseProjectId();
  if (!projectId) return null;
  return `sb-${projectId}-auth-token`;
}

function hasValidRefreshToken(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value !== 'null' && value !== 'undefined';
}

function readStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  const storageKey = getSupabaseAuthStorageKey();
  if (!storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const candidate =
      parsed?.currentSession?.refresh_token ??
      parsed?.refresh_token ??
      parsed?.session?.refresh_token ??
      parsed?.data?.session?.refresh_token ??
      null;
    if (hasValidRefreshToken(candidate)) {
      return candidate;
    }
  } catch (error) {
    if (supabaseDebug) {
      debugWarn('⚠️ [Client] 저장된 Supabase 세션 파싱 실패:', error);
    }
  }
  return null;
}

function hasPersistedRefreshToken(): boolean {
  return hasValidRefreshToken(readStoredRefreshToken());
}

function updateAutoRefreshBehavior(session?: Session | null) {
  if (!browserSupabase?.auth?.stopAutoRefresh || !browserSupabase.auth.startAutoRefresh) {
    return;
  }

  const hasRefreshToken = hasValidRefreshToken(session?.refresh_token) || hasPersistedRefreshToken();
  const desiredState: AutoRefreshState = hasRefreshToken ? 'started' : 'stopped';

  if (desiredState === autoRefreshState) {
    return;
  }

  if (desiredState === 'started') {
    browserSupabase.auth.startAutoRefresh();
    if (supabaseDebug) {
      debugLog('🔄 [Client] Refresh 토큰을 감지하여 자동 갱신을 재개합니다.');
    }
  } else {
    browserSupabase.auth.stopAutoRefresh();
    if (supabaseDebug) {
      debugWarn('⏹️ [Client] Refresh 토큰이 없어 자동 갱신을 중단합니다.');
    }
  }

  autoRefreshState = desiredState;
}

function ensureAutoRefreshListener() {
  if (!browserSupabase || autoRefreshSubscription) {
    return;
  }

  const { data } = browserSupabase.auth.onAuthStateChange((_event, session) => {
    updateAutoRefreshBehavior(session);
  });

  autoRefreshSubscription = data?.subscription ?? null;
}

function resolveRequestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  if (typeof input === 'object' && input && 'url' in input) {
    try {
      return (input as Request).url;
    } catch {
      return null;
    }
  }
  return null;
}

function getBodyAsString(init?: RequestInit): string | null {
  if (!init?.body) return null;
  if (typeof init.body === 'string') return init.body;
  if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams) {
    return init.body.toString();
  }
  return null;
}

function isRefreshTokenRequest(url: string | null, init?: RequestInit): boolean {
  if (!url) return false;
  if (!url.includes(AUTH_REFRESH_ENDPOINT)) return false;
  if (url.includes('grant_type=refresh_token')) return true;
  const bodyString = getBodyAsString(init);
  if (bodyString?.includes('grant_type=refresh_token')) {
    return true;
  }
  return false;
}

function triggerSupabaseRefreshRateLimitHandling() {
  // 🔧 무한 루프 방지: 이미 429 처리 중이거나 로그아웃 중이면 중단
  if (isHandlingRateLimit) {
    debugWarn('⏹️ [Client] 이미 429 Rate Limit 처리 중 - 중복 실행 방지');
    return;
  }

  if (isSigningOut) {
    debugWarn('⏹️ [Client] 로그아웃 진행 중 - 429 처리 건너뜀');
    return;
  }

  isHandlingRateLimit = true;

  if (supabaseDebug) {
    debugWarn('⚠️ [Client] Refresh 토큰 요청이 429를 반환했습니다. 강제 로그아웃을 진행합니다.');
  }

  if (typeof window !== 'undefined') {
    emitSupabaseAuthRateLimit();
  }

  void (async () => {
    try {
      await signOut();
    } catch (error) {
      debugWarn('⚠️ [Client] 강제 로그아웃 처리 중 오류가 발생했습니다:', error);
    } finally {
      // 처리 완료 후 플래그 리셋
      isHandlingRateLimit = false;
    }
  })();
}

const supabaseAuthFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  try {
    const requestUrl = resolveRequestUrl(input);
    const shouldHandleRateLimit = isRefreshTokenRequest(requestUrl, init) && response.status === 429;

    if (shouldHandleRateLimit) {
      const now = Date.now();
      if (now - lastRateLimitHandledAt > RATE_LIMIT_THROTTLE_WINDOW_MS) {
        lastRateLimitHandledAt = now;
        triggerSupabaseRefreshRateLimitHandling();
      } else if (supabaseDebug) {
        debugWarn('⏱️ [Client] 429 처리 스로틀링으로 인해 로그아웃이 중복 실행되지 않습니다.');
      }
    }
  } catch (error) {
    if (supabaseDebug) {
      debugWarn('⚠️ [Client] 429 처리 로직에서 오류가 발생했습니다:', error);
    }
  }

  return response;
};

// 🔧 환경변수에서 Supabase 설정 로드 (이제 정상 작동함)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 🔍 브라우저 환경에서 상수 값 확인
if (supabaseDebug && typeof window !== 'undefined') {
  debugLog('🔧 [Supabase Client] 환경변수 상태:', {
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
    ensureAutoRefreshListener();
    updateAutoRefreshBehavior();
    // 로그 출력을 더 제한적으로: 개발 환경에서만, 5초마다 최대 1번
    if (supabaseDebug && typeof window !== 'undefined') {
      const now = Date.now();
      const lastLogKey = '_supabase_last_reuse_log';
      const win = window as unknown as Record<string, unknown>;
      const lastLogTime = (win[lastLogKey] as number) || 0;

      if (now - lastLogTime > 5000) { // 5초마다 최대 1번으로 변경
        debugLog('🔄 [Client] 기존 Supabase 클라이언트 재사용');
        win[lastLogKey] = now;
      }
    }
    
    return browserSupabase;
  }

  // 🔧 동시 생성 방지: 이미 생성 중이면 대기
  if (isCreatingClient) {
    debugLog('⏳ [Client] 다른 클라이언트 생성 중, 100ms 대기 후 재시도...');
    // 간단한 동기 대기 - 실제로는 생성이 빠르게 완료됨
    const startTime = Date.now();
    while (isCreatingClient && Date.now() - startTime < 1000) {
      // 1초 최대 대기
    }
    if (browserSupabase) {
      debugLog('✅ [Client] 대기 후 생성된 클라이언트 반환');
      return browserSupabase;
    }
  }

  isCreatingClient = true;
  debugLog('🔧 [Client] 새로운 Supabase 클라이언트 생성 시작');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    isCreatingClient = false;
    console.error('❌ [Supabase Client] 필수 환경변수가 누락되었습니다:', {
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_ANON_KEY,
    });
    throw new Error('Supabase URL 또는 Anon Key가 누락되었습니다.');
  }

  // 🚨 무한대기 근본 원인 진단 시작 🚨
  debugLog('🧪 [진단] Supabase 클라이언트 생성 과정 분석');
  
  // 1. 환경변수 세부 검증
  const url = SUPABASE_URL;
  const key = SUPABASE_ANON_KEY;
  
  debugLog('🔍 [진단] 환경변수 세부 분석:', {
    urlLength: url.length,
    urlProtocol: url.startsWith('https://') ? 'HTTPS' : url.startsWith('http://') ? 'HTTP' : 'INVALID',
    urlDomain: url.includes('.supabase.co') ? 'VALID_SUPABASE' : 'INVALID_DOMAIN',
    keyLength: key.length,
    keyFormat: key.startsWith('eyJ') ? 'VALID_JWT_FORMAT' : 'INVALID_FORMAT'
  });
  
  // 2. 브라우저 localStorage 접근 테스트
  debugLog('🧪 [진단] localStorage 접근 테스트...');
  try {
    const testKey = '__supabase_test';
    localStorage.setItem(testKey, 'test');
    const testValue = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    debugLog('✅ [진단] localStorage 정상 작동:', { testValue });
  } catch (storageError) {
    console.error('❌ [진단] localStorage 접근 실패:', storageError);
  }
  
  // 3. 네트워크 상태 체크
  if (supabaseDebug && typeof navigator !== 'undefined' && 'onLine' in navigator) {
    const nav = navigator as unknown as Record<string, unknown>;
    const conn = nav.connection as Record<string, unknown> | undefined;
    debugLog('🌐 [진단] 네트워크 상태:', {
      online: navigator.onLine,
      connection: conn ? {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink
      } : 'N/A'
    });
  }

  // 성능 최적화를 위한 최소한의 설정
  debugLog('🔧 [Client] 성능 최적화된 Supabase 클라이언트 초기화...');
  
  const clientStartTime = performance.now();
  
  browserSupabase = createBrowserClient<Database, 'public'>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
        storage: window.localStorage,
        storageKey: `sb-${SUPABASE_URL.split('.')[0].split('://')[1]}-auth-token`,
        debug: false,
      },
      global: {
        fetch: supabaseAuthFetch,
        headers: {
          'x-client-info': 'supabase-js-web',
          // 커스텀 헤더 제거: Edge Functions CORS 프리플라이트 차단 방지
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
  ) as unknown as BrowserSupabaseClient;

  ensureAutoRefreshListener();
  updateAutoRefreshBehavior();

  const clientEndTime = performance.now();
  const creationTime = clientEndTime - clientStartTime;

  // 🔧 클라이언트 생성 완료, 플래그 리셋
  isCreatingClient = false;

  // 디버그 로그 (개발 환경에서만)
  if (typeof window !== 'undefined') {
    if (supabaseDebug) {
      debugLog('✅ [Client] Supabase 클라이언트 초기화 완료:', {
        url: SUPABASE_URL,
        hostname: window.location.hostname,
        creationTime: `${creationTime.toFixed(2)}ms`,
        realtimeDisabled: true,
        optimizedConfig: true,
        multipleInstancesPrevented: true,
      });
    }

    // 🧪 개발 환경에서 디버깅을 위해 전역으로 노출
    const globalWindow = window as unknown as Record<string, unknown>;
    globalWindow.supabase = browserSupabase;
    globalWindow.createBrowserSupabaseClient = createBrowserSupabaseClient;

    // 🔧 로그아웃 디버깅 도구들 전역 노출
    globalWindow.debugLogout = {
      // 포괄적인 로그아웃 (기존)
      signOut: signOut,
      
      // Next.js 15 호환 간단 로그아웃 (NEW)
      simpleSignOut: simpleSignOut,
      
      // 응급 로그아웃 (NEW)
      emergencySignOut: emergencySignOut,
      
      // 로그아웃 상태 확인
      checkStatus: () => {
        if (supabaseDebug) {
          debugLog('🔍 로그아웃 디버깅 도구 실행 중...');
        }
        
        // localStorage 확인
        const localStorageKeys: Array<{key: string, value: string}> = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('auth') || key.includes('supabase') || key.includes('sb-'))) {
            const value = localStorage.getItem(key);
            localStorageKeys.push({ key, value: (value?.slice(0, 50) || '') + '...' });
          }
        }
        
        // sessionStorage 확인
        const sessionStorageKeys: Array<{key: string, value: string | null}> = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.includes('auth') || key.includes('logout') || key.includes('redirect'))) {
            sessionStorageKeys.push({ key, value: sessionStorage.getItem(key) });
          }
        }
        
        // 쿠키 확인
        const authCookies = document.cookie.split(';').filter(cookie => {
          const name = cookie.trim().split('=')[0];
          return name && (name.includes('auth') || name.includes('sb-') || name.includes('supabase'));
        });
        
        if (supabaseDebug) {
          debugLog('🔍 로그아웃 상태 디버깅 결과:', {
            localStorageKeys,
            sessionStorageKeys,
            authCookies,
            isSigningOut,
          });
        }
        
        return { localStorageKeys, sessionStorageKeys, authCookies, isSigningOut };
      },
      
      // 강제 스토리지 정리
      forceClean: () => {
        if (supabaseDebug) {
          debugLog('🧹 강제 스토리지 정리 시작...');
        }
        
        // localStorage 정리
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('auth') || key.includes('supabase') || key.includes('sb-'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // sessionStorage 정리
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
      
      // 단순 Supabase 로그아웃 (기존)
      supabaseOnly: async () => {
        if (supabaseDebug) {
          debugLog('🚪 단순 Supabase 로그아웃...');
        }
        try {
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
 * ⚠️ 내부적으로 getUser()를 사용하며, 더 빠른 getCurrentUser()를 직접 사용하는 것을 권장합니다.
 * 
 * @returns 현재 인증 세션 또는 null (호환성을 위해 세션 형태로 반환)
 */
export async function getCurrentSession() {
  const supabase = createBrowserSupabaseClient();
  
  // getUser()로 사용자 정보 확인 (더 빠름)
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }
  
  // 호환성을 위해 간단한 세션 객체 생성
  return {
    user,
    access_token: 'token-from-cookies',
    refresh_token: null,
    expires_at: null,
    token_type: 'bearer' as const
  };
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
    debugLog('🔄 [SignOut] 이미 로그아웃 진행 중 - 중복 호출 방지');
    return { success: true, message: '로그아웃이 이미 진행 중입니다.' };
  }

  const supabase = createBrowserSupabaseClient();
  
  try {
    isSigningOut = true; // 로그아웃 시작 표시
    debugLog('🚪 [SignOut] 종합 로그아웃 시작');

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
        debugLog('✅ [SignOut] 서버사이드 세션 무효화 완료');
      } else {
        debugWarn('⚠️ [SignOut] 서버사이드 세션 무효화 실패 (계속 진행)');
      }
    } catch (e) {
      debugWarn('⚠️ [SignOut] 서버사이드 세션 무효화 오류 (계속 진행):', e);
    }

    // 2. Supabase 세션 제거 (타임아웃 적용)
    // 🔧 scope: 'local' 사용 - 429 무한 루프 방지
    // 'global'은 Supabase 서버에 추가 요청을 보내 또 429를 유발할 수 있음
    try {
      debugLog('🔄 [SignOut] Supabase 세션 제거 시작 (local scope)...');

      // 타임아웃을 위한 Promise.race 사용
      const signOutPromise = supabase.auth.signOut({
        scope: 'local'  // 🔧 global → local: 서버 호출 없이 로컬만 정리
      });
      
      const timeoutPromise = new Promise<{ error: { message: string } }>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Supabase 로그아웃 타임아웃 (5초)'));
        }, 5000);
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
        // 타임아웃이 발생해도 계속 진행
      }
    } catch (e) {
      debugWarn('⚠️ [SignOut] Supabase 로그아웃 예외 (계속 진행):', e);
    }

    // 3. 모든 인증 관련 localStorage 데이터 제거
    try {
      debugLog('🔄 [SignOut] localStorage 정리 시작...');
      
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

        // 기타 소셜 로그인 키들
        'google_auth_state',
        'kakao_auth_state',
        'apple_auth_state',
        
        // 사용자 프로필 캐시
        'user_profile_cache',
        'profile_cache_timestamp',
      ];

      // 명시적 키 제거
      let removedExplicitKeys = 0;
      authKeys.forEach(key => {
        try {
          if (localStorage.getItem(key) !== null) {
            localStorage.removeItem(key);
            removedExplicitKeys++;
          }
        } catch (e) {
          console.warn(`⚠️ [SignOut] localStorage 키 제거 실패: ${key}`, e);
        }
      });
      debugLog(`🗑️ [SignOut] 명시적 키 ${removedExplicitKeys}개 제거 완료`);

      // 패턴 기반 키 제거 (supabase, auth 포함)
      // 단, 최근 로그인 정보는 보존: 'picnic_last_login', 'picnic_last_login_hint'
      const preserveKeys = new Set(['picnic_last_login']);
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
            key.includes('oauth')
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
          console.warn(`⚠️ [SignOut] localStorage 패턴 키 제거 실패: ${key}`, e);
        }
      });

      try {
        const preserved = {
          picnic_last_login: localStorage.getItem('picnic_last_login'),
        };
        debugLog('🧪 [SignOut] after LS cleanup, preserved snapshot:', preserved);
      } catch {}

      debugLog(`✅ [SignOut] localStorage 정리 완료 (명시적: ${removedExplicitKeys}, 패턴: ${removedPatternKeys})`);
    } catch (e) {
      console.warn('⚠️ [SignOut] localStorage 정리 오류 (계속 진행):', e);
    }

    // 4. 모든 인증 관련 sessionStorage 데이터 제거
    try {
      debugLog('🔄 [SignOut] sessionStorage 정리 시작...');
      
      const sessionAuthKeys = [
        'redirect_url',
        'auth_redirect_url',
        'login_redirect',
        'oauth_state',
      ];

      // 명시적 키 제거
      let removedSessionExplicitKeys = 0;
      sessionAuthKeys.forEach(key => {
        try {
          if (sessionStorage.getItem(key) !== null) {
            sessionStorage.removeItem(key);
            removedSessionExplicitKeys++;
          }
        } catch (e) {
          console.warn(`⚠️ [SignOut] sessionStorage 키 제거 실패: ${key}`, e);
        }
      });
      debugLog(`🗑️ [SignOut] sessionStorage 명시적 키 ${removedSessionExplicitKeys}개 제거 완료`);

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
      
      let removedSessionPatternKeys = 0;
      sessionKeysToRemove.forEach(key => {
        try {
          sessionStorage.removeItem(key);
          removedSessionPatternKeys++;
        } catch (e) {
          console.warn(`⚠️ [SignOut] sessionStorage 패턴 키 제거 실패: ${key}`, e);
        }
      });

      debugLog(`✅ [SignOut] sessionStorage 정리 완료 (명시적: ${removedSessionExplicitKeys}, 패턴: ${removedSessionPatternKeys})`);
    } catch (e) {
      console.warn('⚠️ [SignOut] sessionStorage 정리 오류 (계속 진행):', e);
    }

    // 5. 모든 인증 관련 쿠키 제거
    try {
      debugLog('🔄 [SignOut] 쿠키 정리 시작...');
      
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
      let removedExplicitCookies = 0;
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
          removedExplicitCookies++;
        } catch (e) {
          console.warn(`⚠️ [SignOut] 쿠키 제거 실패: ${cookieName}`, e);
        }
      });
      debugLog(`🗑️ [SignOut] 명시적 쿠키 ${removedExplicitCookies}개 제거 완료`);

      // 패턴 기반 쿠키 제거
      let removedPatternCookies = 0;
      try {
        document.cookie.split(';').forEach((cookie) => {
          const cookieName = cookie.trim().split('=')[0];
          if (cookieName && (
            cookieName.includes('auth') || 
            cookieName.includes('supabase') ||
            cookieName.includes('login') ||
            cookieName.includes('oauth')
          )) {
            const domains = ['', `.${window.location.hostname}`, window.location.hostname];
            const paths = ['/', '/auth', '/api'];
            
            domains.forEach(domain => {
              paths.forEach(path => {
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
              });
            });
            removedPatternCookies++;
          }
        });
      } catch (e) {
        console.warn('⚠️ [SignOut] 패턴 쿠키 제거 오류:', e);
      }

      debugLog(`✅ [SignOut] 쿠키 정리 완료 (명시적: ${removedExplicitCookies}, 패턴: ${removedPatternCookies})`);
    } catch (e) {
      console.warn('⚠️ [SignOut] 쿠키 정리 오류 (계속 진행):', e);
    }

    // 6. 메모리 캐시 정리 (window 객체에서 전역 변수들 정리)
    try {
      debugLog('🔄 [SignOut] 메모리 캐시 정리 시작...');
      
      // 전역 인증 관련 변수들 정리
      if (typeof window !== 'undefined') {
        // Supabase 클라이언트 캐시 정리
        browserSupabase = null;
        debugLog('🗑️ [SignOut] Supabase 클라이언트 캐시 정리 완료');
        
        // 전역 변수 정리
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

    // 7. 리다이렉트 URL 정리 (auth-redirect.ts의 clearAllAuthData 호출)
    try {
      debugLog('🔄 [SignOut] 리다이렉트 데이터 정리 시작...');
      // 동적 import로 clearAllAuthData 함수 사용
      const { clearAllAuthData } = await import('@/utils/auth-redirect');
      clearAllAuthData();
      debugLog('✅ [SignOut] 리다이렉트 데이터 정리 완료');
    } catch (e) {
      console.warn('⚠️ [SignOut] 리다이렉트 데이터 정리 오류 (계속 진행):', e);
    }

    // 9. 최종 상태 체크 및 로깅
    debugLog('🎉 [SignOut] 모든 로그아웃 단계 완료!');
    debugLog('✅ [SignOut] 종합 로그아웃 완료');
    
    // 10. 페이지 리다이렉트 (포괄적 로그아웃도 리다이렉트 추가)
    debugLog('🔄 [SignOut] 마이페이지로 리다이렉트...');
    setTimeout(() => {
      window.location.href = '/ko/mypage';
    }, 500); // 조금 더 긴 지연으로 모든 정리가 완료되도록
    
    return { 
      success: true,
      message: '모든 인증 데이터가 성공적으로 정리되었습니다. 홈페이지로 이동합니다.'
    };
    
  } catch (error) {
    console.error('❌ [SignOut] 종합 로그아웃 중 치명적 오류:', error);
    
    // 치명적 오류가 발생해도 기본 정리는 시도 (최근 로그인 정보 보존)
    try {
      const preserve = new Set(['picnic_last_login']);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && !preserve.has(key)) {
          try { localStorage.removeItem(key); } catch {}
        }
      }
      try {
        const snapshot = {
          picnic_last_login: localStorage.getItem('picnic_last_login'),
        };
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
    // 성공이든 실패든 상관없이 로그아웃 상태 리셋
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

/**
 * Next.js 15 호환 간단 로그아웃 함수
 * 복잡한 세션 처리를 우회하고 하드 리프레시를 사용합니다.
 */
export async function simpleSignOut() {
  debugLog('🚀 [SimpleSignOut] Next.js 15 호환 간단 로그아웃 시작');
  
  try {
    // 1. 서버사이드 세션 무효화 (가장 중요)
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        debugLog('✅ [SimpleSignOut] 서버사이드 세션 무효화 완료');
      } else {
        debugWarn('⚠️ [SimpleSignOut] 서버사이드 세션 무효화 실패 (계속 진행)');
      }
    } catch (e) {
      debugWarn('⚠️ [SimpleSignOut] 서버 무효화 오류 (계속 진행):', e);
    }

    // 2. 핵심 스토리지 정리
    try {
      // localStorage 핵심 키만 제거
      const criticalKeys = [
        'supabase.auth.token',
        'auth_session_active', 
        'auth_provider',
        'user_profile_cache'
      ];
      
      criticalKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // 무시
        }
      });

      // 패턴 기반 핵심 정리
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.includes('sb-') || key.includes('supabase') || key.includes('auth'))) {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            // 무시
          }
        }
      }

      debugLog('✅ [SimpleSignOut] 핵심 스토리지 정리 완료');
    } catch (e) {
      debugWarn('⚠️ [SimpleSignOut] 스토리지 정리 오류 (계속 진행):', e);
    }

    // 2.5. 핵심 쿠키 강화 정리 (가장 중요!)
    try {
      debugLog('🍪 [SimpleSignOut] 쿠키 강화 정리 시작...');
      
      // Supabase 인증 쿠키들 (패턴 기반으로 찾아서 제거)
      const allCookies = document.cookie.split(';');
      let removedCookies = 0;
      
      allCookies.forEach(cookie => {
        const cookieName = cookie.trim().split('=')[0];
        if (cookieName && (
          cookieName.includes('sb-') ||
          cookieName.includes('supabase') ||
          cookieName.includes('auth-token') ||
          cookieName.includes('auth_token') ||
          cookieName.includes('session')
        )) {
          // 여러 경로와 도메인에서 제거 시도
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
          removedCookies++;
          debugLog(`🗑️ [SimpleSignOut] 쿠키 제거: ${cookieName}`);
        }
      });

      debugLog(`✅ [SimpleSignOut] 쿠키 강화 정리 완료 (${removedCookies}개)`);
    } catch (e) {
      debugWarn('⚠️ [SimpleSignOut] 쿠키 정리 오류 (계속 진행):', e);
    }

    // 3. 브라우저 캐시 정리
    try {
      browserSupabase = null;
      debugLog('✅ [SimpleSignOut] 브라우저 캐시 정리 완료');
    } catch (e) {
      debugWarn('⚠️ [SimpleSignOut] 캐시 정리 오류:', e);
    }

    // 4. 하드 리프레시로 완전 초기화 (Next.js 15 세션 이슈 우회)
    debugLog('🔄 [SimpleSignOut] 하드 리프레시로 완전 초기화 시작...');
    
    // 작은 지연 후 리프레시 (스토리지 정리가 완료되도록)
    setTimeout(() => {
      window.location.href = '/ko/mypage';
    }, 100);

    return { 
      success: true,
      message: '간단 로그아웃 완료 - 페이지를 새로고침합니다.'
    };

  } catch (error) {
    console.error('❌ [SimpleSignOut] 간단 로그아웃 실패:', error);
    
    // 실패해도 강제 리프레시
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
      const snapshot = {
        picnic_last_login: localStorage.getItem('picnic_last_login'),
      };
      debugLog('🧪 [EmergencySignOut] preserved snapshot:', snapshot);
    } catch {}
    sessionStorage.clear();
  } catch (e) {
    // 무시
  }
  
  // 즉시 리다이렉트
  window.location.replace('/ko/mypage');
} 