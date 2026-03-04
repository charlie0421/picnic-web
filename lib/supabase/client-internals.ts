'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { emitSupabaseAuthRateLimit } from './events';
import { getIsSigningOut } from './sign-out';

// --- Debug utilities ---

export const supabaseDebug =
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

export const debugLog = (...args: unknown[]) => {
  if (supabaseDebug) {
    console.log(...args);
  }
};

const debugWarn = (...args: unknown[]) => {
  if (supabaseDebug) {
    console.warn(...args);
  }
};

// --- Type alias ---

export type BrowserSupabaseClient = SupabaseClient<Database>;

// --- Singleton state ---

export let browserSupabase: BrowserSupabaseClient | null = null;
export let isCreatingClient = false;

export function setBrowserSupabase(client: BrowserSupabaseClient | null) {
  browserSupabase = client;
}

export function setIsCreatingClient(value: boolean) {
  isCreatingClient = value;
}

// --- Auto-refresh state ---

let isHandlingRateLimit = false;
type AutoRefreshState = 'started' | 'stopped' | 'unknown';
let autoRefreshState: AutoRefreshState = 'unknown';
let autoRefreshSubscription: { unsubscribe: () => void } | null = null;

// --- Constants ---

const AUTH_REFRESH_ENDPOINT = '/auth/v1/token';
const RATE_LIMIT_THROTTLE_WINDOW_MS = 2000;
let lastRateLimitHandledAt = 0;

// --- signOut callback (circular dependency prevention) ---

let signOutCallback: (() => Promise<unknown>) | null = null;

export function setSignOutCallback(fn: () => Promise<unknown>) {
  signOutCallback = fn;
}

// --- Environment variables ---

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// --- Debug initial log ---

if (supabaseDebug && typeof window !== 'undefined') {
  debugLog('🔧 [Supabase Client] 환경변수 상태:', {
    hasProcessEnv: typeof process !== 'undefined',
    urlFromEnv: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : 'process undefined',
    keyFromEnv: typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : 'process undefined',
    finalUrl: SUPABASE_URL,
    finalKey: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.slice(0, 20)}...` : 'undefined'
  });
}

// --- Pure helpers ---

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

// --- Auto-refresh management ---

export function updateAutoRefreshBehavior(session?: { refresh_token?: string | null } | null) {
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

export function ensureAutoRefreshListener() {
  if (!browserSupabase || autoRefreshSubscription) {
    return;
  }

  const { data } = browserSupabase.auth.onAuthStateChange((_event, session) => {
    updateAutoRefreshBehavior(session);
  });

  autoRefreshSubscription = data?.subscription ?? null;
}

// --- Fetch helpers ---

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

// --- Rate limit handling ---

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
      await signOutCallback?.();
    } catch (error) {
      debugWarn('⚠️ [Client] 강제 로그아웃 처리 중 오류가 발생했습니다:', error);
    } finally {
      isHandlingRateLimit = false;
    }
  })();
}

// --- Custom fetch ---

export const supabaseAuthFetch: typeof fetch = async (input, init) => {
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
