/**
 * Anti-abuse IP hash 발급/캐시 서비스 (web).
 *
 * 앱 진입 시 [fetchAndCacheIpHash] 1회 → 메모리 + sessionStorage 캐시.
 * SSR 환경 (sessionStorage 미존재) 도 안전.
 *
 * 실패는 silent fallback (null) — 클라이언트 흐름 절대 차단 안 함.
 */
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'aa_ip_hash';

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

function safeStorageGet(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeStorageSet(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode 등 */
  }
}

function safeStorageRemove(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchAndCacheIpHash(force = false): Promise<string | null> {
  if (cached && !force) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const sb = createBrowserSupabaseClient();
      const { data, error } = await sb.functions.invoke('track-country', {
        body: {},
      });
      if (error) {
        console.warn('[anti-abuse] track-country error', error);
        return null;
      }
      const hash = (data as { ip_hash?: unknown })?.ip_hash;
      if (typeof hash === 'string' && hash.length > 0 && hash !== 'unknown') {
        cached = hash;
        safeStorageSet(hash);
        return hash;
      }
      return null;
    } catch (e) {
      console.warn('[anti-abuse] track-country failed', e);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getCachedIpHash(): string | null {
  if (cached) return cached;
  const stored = safeStorageGet();
  if (stored) {
    cached = stored;
    return stored;
  }
  return null;
}

/** 테스트 / sign-out 정리 용. */
export function clearIpHashCache(): void {
  cached = null;
  inflight = null;
  safeStorageRemove();
}
