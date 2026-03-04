'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { emitSupabaseAuthRateLimit } from './events';
import {
  signOut as signOutImpl,
  simpleSignOut,
  emergencySignOut,
  getLogoutStatus,
  resetLogoutStatus,
  getIsSigningOut,
} from './sign-out';
import { registerDebugTools } from './debug-tools';

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

// Singleton 패턴으로 Multiple GoTrueClient 문제 해결
let browserSupabase: BrowserSupabaseClient | null = null;
let isCreatingClient = false;

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

function updateAutoRefreshBehavior(session?: { refresh_token?: string | null } | null) {
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
  if (isHandlingRateLimit) {
    debugWarn('⏹️ [Client] 이미 429 Rate Limit 처리 중 - 중복 실행 방지');
    return;
  }

  if (getIsSigningOut()) {
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
 */
export function createBrowserSupabaseClient(): BrowserSupabaseClient {
  // 강화된 Singleton 패턴: 이미 존재하면 즉시 반환
  if (browserSupabase) {
    ensureAutoRefreshListener();
    updateAutoRefreshBehavior();
    if (supabaseDebug && typeof window !== 'undefined') {
      const now = Date.now();
      const lastLogKey = '_supabase_last_reuse_log';
      const win = window as unknown as Record<string, unknown>;
      const lastLogTime = (win[lastLogKey] as number) || 0;

      if (now - lastLogTime > 5000) {
        debugLog('🔄 [Client] 기존 Supabase 클라이언트 재사용');
        win[lastLogKey] = now;
      }
    }

    return browserSupabase;
  }

  // 동시 생성 방지
  if (isCreatingClient) {
    debugLog('⏳ [Client] 다른 클라이언트 생성 중, 100ms 대기 후 재시도...');
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
        }
      },
      db: {
        schema: 'public',
      },
      realtime: {
        params: {
          eventsPerSecond: -1,
        },
        log_level: 'error',
        heartbeatIntervalMs: 60000,
        reconnectAfterMs: () => 30000,
      },
    }
  ) as unknown as BrowserSupabaseClient;

  ensureAutoRefreshListener();
  updateAutoRefreshBehavior();

  const clientEndTime = performance.now();
  const creationTime = clientEndTime - clientStartTime;

  isCreatingClient = false;

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

    const globalWindow = window as unknown as Record<string, unknown>;
    globalWindow.supabase = browserSupabase;
    globalWindow.createBrowserSupabaseClient = createBrowserSupabaseClient;

    // 디버그 도구 등록
    registerDebugTools(
      () => browserSupabase,
      { signOut, simpleSignOut, emergencySignOut },
    );
  }

  return browserSupabase;
}

/**
 * 현재 인증 사용자를 가져오는 편의 함수입니다.
 */
export async function getCurrentUser() {
  const supabase = createBrowserSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * 현재 인증 세션을 가져오는 편의 함수입니다.
 * 내부적으로 getUser()를 사용하며, 더 빠른 getCurrentUser()를 직접 사용하는 것을 권장합니다.
 */
export async function getCurrentSession() {
  const supabase = createBrowserSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    user,
    access_token: 'token-from-cookies',
    refresh_token: null,
    expires_at: null,
    token_type: 'bearer' as const
  };
}

// --- Re-export sign-out functions (기존 import 경로 호환) ---

/**
 * 종합적인 로그아웃 처리 함수입니다.
 * 모든 세션을 제거하고 스토리지를 완전히 정리합니다.
 */
export async function signOut() {
  // browserSupabase를 null로 리셋 (메모리 캐시 정리)
  const result = await signOutImpl(() => {
    const client = createBrowserSupabaseClient();
    return client;
  });
  // signOut 후 싱글톤 리셋
  browserSupabase = null;
  return result;
}

export { simpleSignOut, emergencySignOut, getLogoutStatus, resetLogoutStatus };
