import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const singleMock = vi.fn();
const selectSpy = vi.fn();

// React 의 cache 는 서버 컴포넌트 런타임 전용이고 같은 인자 호출을 메모이즈한다.
// 테스트에서는 항등 함수로 두어 케이스마다 실제로 다시 실행되게 한다.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => ({
      select: (columns: string) => {
        selectSpy(columns);
        return { eq: () => ({ single: singleMock }) };
      },
    }),
  })),
}));

import { getCurrentUserContext } from '@/lib/data-fetching/server/safe-operations';

/**
 * 서버의 관리자 판정. `is_admin` 만 select 하던 시절 super-admin 전용 계정이
 * 조용히 일반 사용자로 강등됐다 — 투표 admin 필터가 막히고 safe-operations 의
 * 목록/수정/삭제가 본인 행으로 스코핑됐다.
 */
describe('getCurrentUserContext 관리자 판정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비로그인은 isAuthenticated=false', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    expect(await getCurrentUserContext()).toEqual({ isAuthenticated: false });
  });

  it('일반 사용자는 isAdmin=false', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    singleMock.mockResolvedValue({ data: { is_admin: false, is_super_admin: false }, error: null });

    const ctx = await getCurrentUserContext();
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.userId).toBe('user-1');
  });

  it('is_admin 관리자는 isAdmin=true', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    singleMock.mockResolvedValue({ data: { is_admin: true, is_super_admin: false }, error: null });

    expect((await getCurrentUserContext()).isAdmin).toBe(true);
  });

  it('super-admin 전용 계정도 isAdmin=true — 이게 회귀 대상이다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'super-1' } }, error: null });
    singleMock.mockResolvedValue({ data: { is_admin: false, is_super_admin: true }, error: null });

    expect((await getCurrentUserContext()).isAdmin).toBe(true);
  });

  it('프로필 조회 시 두 플래그를 모두 select 한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'super-1' } }, error: null });
    singleMock.mockResolvedValue({ data: { is_admin: false, is_super_admin: true }, error: null });
    await getCurrentUserContext();

    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('is_super_admin'));
    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('is_admin'));
  });

  it('프로필이 없으면 관리자가 아니다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'ghost' } }, error: null });
    singleMock.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const ctx = await getCurrentUserContext();
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.isAuthenticated).toBe(true);
  });
});
