import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 민감 작업(결제·업로드·서명 URL)의 탈퇴 검사는 조회 오류 시 차단(fail-closed)해야 한다.
 * 일반 호출은 기존처럼 fail-open 을 유지한다(페이지 렌더를 깨지 않기 위해).
 */
const state = vi.hoisted(() => ({ result: { data: null as any, error: null as any } }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ host: 'www.picnic.fan' }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => state.result }) }) }),
  }),
}));

import { isWithdrawnUser } from '@/lib/supabase/server';

describe('isWithdrawnUser', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('탈퇴 계정은 true', async () => {
    state.result = { data: { deleted_at: '2026-01-01T00:00:00Z' }, error: null };
    expect(await isWithdrawnUser('u1')).toBe(true);
  });

  it('정상 계정은 false', async () => {
    state.result = { data: { deleted_at: null }, error: null };
    expect(await isWithdrawnUser('u1', { failClosed: true })).toBe(false);
  });

  it('조회 오류: 기본은 false(fail-open), failClosed 면 true(차단)', async () => {
    state.result = { data: null, error: { message: 'timeout' } };
    expect(await isWithdrawnUser('u1')).toBe(false);
    expect(await isWithdrawnUser('u1', { failClosed: true })).toBe(true);
  });

  it('프로필 행이 아직 없는 신규 가입자(PGRST116)는 failClosed 여도 탈퇴가 아니다', async () => {
    state.result = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    expect(await isWithdrawnUser('u1', { failClosed: true })).toBe(false);
  });
});
