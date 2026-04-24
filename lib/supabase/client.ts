'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';
import {
  signOut as signOutImpl,
  simpleSignOut,
  emergencySignOut,
  getLogoutStatus,
  resetLogoutStatus,
} from './sign-out';
import { registerDebugTools } from './debug-tools';
import {
  supabaseDebug,
  debugLog,
  browserSupabase,
  isCreatingClient,
  setBrowserSupabase,
  setIsCreatingClient,
  ensureAutoRefreshListener,
  updateAutoRefreshBehavior,
  supabaseAuthFetch,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  setSignOutCallback,
  type BrowserSupabaseClient,
} from './client-internals';

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

  setIsCreatingClient(true);
  debugLog('🔧 [Client] 새로운 Supabase 클라이언트 생성 시작');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setIsCreatingClient(false);
    console.error('❌ [Supabase Client] 필수 환경변수가 누락되었습니다:', {
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_ANON_KEY,
    });
    throw new Error('Supabase URL 또는 Anon Key가 누락되었습니다.');
  }

  debugLog('🔧 [Client] 성능 최적화된 Supabase 클라이언트 초기화...');

  const clientStartTime = performance.now();

  const newClient = createBrowserClient<Database, 'public'>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
        // 보안: localStorage(XSS 토큰 탈취 위험)에서 @supabase/ssr 기본 cookie 저장소로 마이그레이션.
        // storage / storageKey 오버라이드 없음 → SSR과 동일한 cookie 기반 세션 사용.
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

  setBrowserSupabase(newClient);
  ensureAutoRefreshListener();
  updateAutoRefreshBehavior();

  const clientEndTime = performance.now();
  const creationTime = clientEndTime - clientStartTime;

  setIsCreatingClient(false);

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
    globalWindow.supabase = newClient;
    globalWindow.createBrowserSupabaseClient = createBrowserSupabaseClient;

    // 디버그 도구 등록
    registerDebugTools(
      () => browserSupabase,
      { signOut, simpleSignOut, emergencySignOut },
    );
  }

  return newClient;
}

/**
 * 현재 인증 사용자를 가져오는 편의 함수입니다.
 */
export async function getCurrentUser() {
  const supabase = createBrowserSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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
  setBrowserSupabase(null);
  return result;
}

// Register signOut callback for client-internals (circular dependency prevention)
setSignOutCallback(() => signOut());

export { simpleSignOut, emergencySignOut, getLogoutStatus, resetLogoutStatus };
