/**
 * 탈퇴(soft delete) 계정 로그인 차단 검증
 *
 * 수정 대상:
 * - lib/supabase/auth-store-profile.ts: loadUserProfileImpl 에서 deleted_at 감지 시
 *   강제 로그아웃 + /login?error=withdrawn 리다이렉트
 * - app/api/user/profile/route.ts: 응답에 deleted_at 포함
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthStoreAccessor } from '@/lib/supabase/auth-store-types';

vi.mock('@/lib/supabase/auth-store-types', async () => {
  const actual = await vi.importActual<any>('@/lib/supabase/auth-store-types');
  return {
    ...actual,
    debugLog: vi.fn(),
  };
});

import { loadUserProfileImpl } from '@/lib/supabase/auth-store-profile';

const TEST_USER_ID = '11111111-2222-3333-4444-555555555555';

function createAccessor(overrides: Partial<AuthStoreAccessor> = {}): {
  accessor: AuthStoreAccessor;
  signOut: ReturnType<typeof vi.fn>;
  updateState: ReturnType<typeof vi.fn>;
} {
  const signOut = vi.fn().mockResolvedValue(undefined);
  const updateState = vi.fn();

  const baseState: any = {
    session: null,
    user: { id: TEST_USER_ID, email: 'deleted@example.com' },
    userProfile: null,
    isAuthenticated: true,
    isLoading: false,
    isInitialized: true,
    signOut,
    loadUserProfile: vi.fn(),
  };

  const accessor: AuthStoreAccessor = {
    getSupabaseClient: vi.fn(() => null),
    getState: vi.fn(() => baseState),
    updateState,
    getSignOutFn: vi.fn(() => signOut),
    getLoadUserProfileFn: vi.fn(() => vi.fn()),
    getIsAuthEvaluating: vi.fn(() => false),
    setIsAuthEvaluating: vi.fn(),
    getLastExpiryWarningKey: vi.fn(() => null),
    setLastExpiryWarningKey: vi.fn(),
    loadUserProfile: vi.fn(),
    getProfileLoadPromises: vi.fn(() => new Map()),
    ...overrides,
  };

  return { accessor, signOut, updateState };
}

describe('탈퇴 계정 로그인 차단 — loadUserProfileImpl', () => {
  let originalLocation: Location;
  let originalFetch: typeof globalThis.fetch | undefined;
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalLocation = window.location;
    originalFetch = globalThis.fetch;
    replaceMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: '/',
        replace: replaceMock,
      } as any,
    });

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    globalThis.fetch = vi.fn() as any;

    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      // @ts-expect-error - 정리 목적
      delete globalThis.fetch;
    }
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    vi.restoreAllMocks();
  });

  it('deleted_at 이 있고 lang prefix 가 있으면 signOut + /{lang}/login?error=withdrawn 리다이렉트', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: TEST_USER_ID,
          email: 'deleted@example.com',
          name: 'deleted user',
          avatar_url: null,
          star_candy: 0,
          star_candy_bonus: 0,
          is_admin: false,
          is_super_admin: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: '2024-06-01T00:00:00.000Z',
        },
      }),
    });

    // 사용자가 /ko/vote 에 있던 상황 가정
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: '/ko/vote',
        replace: replaceMock,
      } as any,
    });

    const { accessor, signOut, updateState } = createAccessor();

    const result = await loadUserProfileImpl(accessor, TEST_USER_ID);

    expect(result).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/ko/login?error=withdrawn');
    expect(updateState).not.toHaveBeenCalled();
  });

  it('이미 /{lang}/login 페이지에 있다면 추가 리다이렉트는 발생시키지 않는다', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: TEST_USER_ID,
          email: 'deleted@example.com',
          name: 'deleted user',
          avatar_url: null,
          star_candy: 0,
          star_candy_bonus: 0,
          is_admin: false,
          is_super_admin: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: '2024-06-01T00:00:00.000Z',
        },
      }),
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        pathname: '/ko/login',
        replace: replaceMock,
      } as any,
    });

    const { accessor, signOut } = createAccessor();

    const result = await loadUserProfileImpl(accessor, TEST_USER_ID);

    expect(result).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('lang prefix 가 없는 경로에서는 기본 언어 en 으로 리다이렉트한다', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: TEST_USER_ID,
          email: 'deleted@example.com',
          name: 'deleted user',
          avatar_url: null,
          star_candy: 0,
          star_candy_bonus: 0,
          is_admin: false,
          is_super_admin: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: '2024-06-01T00:00:00.000Z',
        },
      }),
    });

    // pathname: '/' (lang prefix 없음)
    const { accessor, signOut } = createAccessor();
    const result = await loadUserProfileImpl(accessor, TEST_USER_ID);

    expect(result).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/en/login?error=withdrawn');
  });

  it('deleted_at 이 null 이면 정상적으로 프로필을 반환하고 상태를 업데이트한다', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: TEST_USER_ID,
          email: 'active@example.com',
          name: 'active user',
          avatar_url: null,
          star_candy: 100,
          star_candy_bonus: 50,
          is_admin: false,
          is_super_admin: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: null,
        },
      }),
    });

    const { accessor, signOut, updateState } = createAccessor();

    const result = await loadUserProfileImpl(accessor, TEST_USER_ID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(TEST_USER_ID);
    expect(result?.deleted_at).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(updateState).toHaveBeenCalledTimes(1);
  });
});
