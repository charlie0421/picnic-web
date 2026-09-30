import { describe, it, expect, vi, beforeEach } from 'vitest';

// 테스트 환경의 react 18 에는 cache 가 없다 — 그대로 통과시킨다.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));

let result: { data: unknown; error: { message: string; code?: string } | null };

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseClient: () => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(result),
    };
    return { from: () => builder };
  },
}));

import { getLatestVersion } from '@/lib/data-fetching/server/version';

/**
 * /[lang]/download 는 ISR(1시간)이다. 조회 장애를 "버전 정보 없음"으로 바꾸면
 * 다운로드 링크 없는 화면이 한 시간 동안 캐시된다.
 */
describe('getLatestVersion', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('버전 정보를 돌려준다', async () => {
    const data = { ios: { version: '1.0.0', url: 'https://apps.apple.com/x' }, android: null, apk: null };
    result = { data, error: null };
    await expect(getLatestVersion()).resolves.toEqual(data);
  });

  it('등록된 버전이 없으면(PGRST116) null 을 돌려준다', async () => {
    result = { data: null, error: { message: 'no rows', code: 'PGRST116' } };
    await expect(getLatestVersion()).resolves.toBeNull();
  });

  it('조회 장애는 예외로 전파한다', async () => {
    result = { data: null, error: { message: 'connection reset', code: '08006' } };
    await expect(getLatestVersion()).rejects.toThrow(/connection reset/);
  });
});
