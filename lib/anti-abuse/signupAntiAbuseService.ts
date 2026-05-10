/**
 * Plan 7 Phase 2 (web) — signup precheck + verify wiring.
 *
 * 흐름:
 *   1. precheck (no auth) — sign-in 시작 시점 호출. 200 + sig → SignupHint, 429 → AntiAbuseError(signup) throw.
 *   2. signInWithOAuth — browser redirect (외부 IdP) 후 callback 으로 복귀.
 *   3. verify (auth required) — callback page 의 client-side useEffect 에서 호출 (fire-and-forget).
 *
 * SignupHint 는 precheck 이후 OAuth redirect 라운드트립 동안 sessionStorage 에 보관 →
 * callback page 에서 재읽음. cookie 대신 storage 사용 = server wiring 단순화 + race window 짧음.
 */
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { AntiAbuseError, mapAntiAbuseError } from './handler';

const HINT_STORAGE_KEY = 'aa_signup_hint';

export interface SignupHint {
  ip_hash: string;
  sig: string;
  exp: number;
}

function safeStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Precheck 호출 — sign-in 진입 시점에서.
 *
 *   - 200 + sig payload → SignupHint 반환 + sessionStorage 보관.
 *   - 200 + skipped → null. (server salt/secret 미설정. caller 는 그냥 진행)
 *   - 429 → AntiAbuseError(channel: 'signup') throw — caller 가 dialog.
 *   - 그 외 실패 → null silent (가입 흐름 차단 안 함).
 */
export async function runSignupPrecheck(): Promise<SignupHint | null> {
  try {
    const sb = createBrowserSupabaseClient();
    const { data, error } = await sb.functions.invoke(
      'anti-abuse-signup-precheck',
      { body: {} },
    );
    if (error) {
      const aa = mapAntiAbuseError(error);
      if (aa instanceof AntiAbuseError) {
        // signup channel 으로 표면화
        throw new AntiAbuseError('signup', {
          rawCode: aa.rawCode,
          original: aa.original,
        });
      }
      console.warn('[anti-abuse] precheck error', error);
      return null;
    }
    const inner = (data as { data?: unknown })?.data;
    if (!inner || typeof inner !== 'object') {
      return null;
    }
    const obj = inner as Record<string, unknown>;
    if (obj.skipped === true) {
      return null;
    }
    const ipHash = obj.ip_hash;
    const sig = obj.sig;
    const exp = obj.exp;
    if (typeof ipHash !== 'string' || typeof sig !== 'string' || typeof exp !== 'number') {
      return null;
    }
    const hint: SignupHint = { ip_hash: ipHash, sig, exp };
    safeStorageSet(HINT_STORAGE_KEY, JSON.stringify(hint));
    return hint;
  } catch (e) {
    if (e instanceof AntiAbuseError) throw e;
    const aa = mapAntiAbuseError(e);
    if (aa instanceof AntiAbuseError) {
      throw new AntiAbuseError('signup', {
        rawCode: aa.rawCode,
        original: aa.original,
      });
    }
    console.warn('[anti-abuse] precheck failed (silent fallback)', e);
    return null;
  }
}

/** sessionStorage 에서 hint 읽기 — OAuth redirect 후 callback page 에서 사용. */
export function getStoredSignupHint(): SignupHint | null {
  const raw = safeStorageGet(HINT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SignupHint>;
    if (
      typeof parsed.ip_hash === 'string' &&
      typeof parsed.sig === 'string' &&
      typeof parsed.exp === 'number'
    ) {
      return parsed as SignupHint;
    }
  } catch {
    /* malformed */
  }
  return null;
}

export function clearStoredSignupHint(): void {
  safeStorageRemove(HINT_STORAGE_KEY);
}

/**
 * Verify 호출 — fire-and-forget. 모든 실패 swallow.
 *   - 200 → server marks signup_verified.
 *   - 422 → server marks signup_unverified (사용자에겐 invisible — Phase 3 grace 적용 시 차단 대상).
 *   - 그 외 (401 / 503 / 네트워크) → 마크 없음, 사용자는 signup_pending 으로 남음.
 */
export async function runSignupVerify(hint: SignupHint): Promise<void> {
  try {
    const sb = createBrowserSupabaseClient();
    await sb.functions.invoke('anti-abuse-signup-verify', { body: hint });
  } catch (e) {
    console.warn('[anti-abuse] verify failed (non-fatal)', e);
  }
}
