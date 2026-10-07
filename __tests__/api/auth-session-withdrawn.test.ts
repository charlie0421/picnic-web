import { beforeEach, describe, expect, it, vi } from 'vitest';

/** /api/auth/session 은 탈퇴(또는 확인 불가) 계정에 사용자 정보를 주지 않는다. */
const mocks = vi.hoisted(() => ({ withdrawn: false, isWithdrawnUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  getServerUser: async () => ({ id: 'user-1', email: 'a@b.c' }),
  isWithdrawnUser: mocks.isWithdrawnUser,
}));

import { GET } from '@/app/api/auth/session/route';

describe('GET /api/auth/session', () => {
  beforeEach(() => mocks.isWithdrawnUser.mockReset().mockImplementation(async () => mocks.withdrawn));

  it('정상 계정은 id·email', async () => {
    mocks.withdrawn = false;
    const body = await (await GET()).json();
    expect(body.user).toEqual({ id: 'user-1', email: 'a@b.c' });
  });

  it('탈퇴 계정은 403·user null (fail-closed 로 확인)', async () => {
    mocks.withdrawn = true;
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).user).toBeNull();
    expect(mocks.isWithdrawnUser).toHaveBeenCalledWith('user-1', { failClosed: true });
  });
});
