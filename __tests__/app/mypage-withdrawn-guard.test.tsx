import { describe, expect, it, vi } from 'vitest';

/** 마이페이지 서버 렌더는 탈퇴 계정의 프로필을 렌더하지 않고 로그인으로 보낸다. */
const redirect = vi.hoisted(() => vi.fn((url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }); }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/supabase/server', () => ({
  getServerUser: async () => ({ id: 'user-1' }),
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'user-1', deleted_at: '2026-01-01T00:00:00Z' } }) }) }) }),
  }),
}));
vi.mock('./MyPageClient', () => ({ default: () => null }));
vi.mock('@/app/[lang]/(mypage)/mypage/MyPageClient', () => ({ default: () => null }));
vi.mock('@/components/server/mypage/MyPageActivityMenu', () => ({ default: () => null }));
vi.mock('@/components/server/mypage/MyPageServiceMenu', () => ({ default: () => null }));
vi.mock('@/components/server/mypage/MyPageAccountMenu', () => ({ default: () => null }));
vi.mock('@/components/server', () => ({ LoadingState: () => null }));

import MyPage from '@/app/[lang]/(mypage)/mypage/page';

describe('MyPage — 탈퇴 계정 서버 가드', () => {
  it('deleted_at 이 있으면 /{lang}/login?error=withdrawn 으로 redirect', async () => {
    await expect(MyPage({ params: Promise.resolve({ lang: 'ja' }) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/ja/login?error=withdrawn');
  });
});
