import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUserContextMock = vi.fn();
const orderCalls: Array<{ column: string }> = [];
const rangeMock = vi.fn();

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: () => getCurrentUserContextMock(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseServerClient: () => {
    const builder: any = {
      select: () => builder,
      is: () => builder,
      lte: () => builder,
      gt: () => builder,
      contains: () => builder,
      order: (column: string) => {
        orderCalls.push({ column });
        return builder;
      },
      range: (...args: unknown[]) => {
        rangeMock(...args);
        return Promise.resolve({ data: [], error: null, count: 0 });
      },
    };
    return { from: () => builder };
  },
}));

import { GET } from '@/app/api/votes/route';

const req = (qs: string) => new NextRequest(`http://localhost/api/votes?${qs}`);

/**
 * `?status=admin` 은 서버에서만 승인된다.
 *
 * `getCurrentUserContext` 의 isAdmin 판정이 이 가드의 단일 입력이므로,
 * super-admin 전용 계정이 강등되면 여기서 admin 목록을 못 본다.
 * admin 상태에서만 붙는 `order('area')` 로 실제 승인 여부를 관측한다.
 */
describe('GET /api/votes — admin status 가드', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderCalls.length = 0;
  });

  const sawAdminOrdering = () => orderCalls.some((c) => c.column === 'area');

  it('비로그인은 admin 요청이 ongoing 으로 강등된다', async () => {
    getCurrentUserContextMock.mockResolvedValue({ isAuthenticated: false });
    const res = await GET(req('status=admin&area=all'));

    expect(res.status).toBe(200);
    expect(sawAdminOrdering()).toBe(false);
    expect(orderCalls.map((c) => c.column)).toContain('stop_at'); // ongoing 정렬
  });

  it('일반 사용자도 강등된다', async () => {
    getCurrentUserContextMock.mockResolvedValue({
      isAuthenticated: true, userId: 'u1', isAdmin: false,
    });
    await GET(req('status=admin&area=all'));

    expect(sawAdminOrdering()).toBe(false);
  });

  it('관리자는 admin 목록을 받는다', async () => {
    getCurrentUserContextMock.mockResolvedValue({
      isAuthenticated: true, userId: 'a1', isAdmin: true,
    });
    await GET(req('status=admin&area=all'));

    expect(sawAdminOrdering()).toBe(true);
    expect(orderCalls.map((c) => c.column)).toEqual(['area', 'id']);
  });

  it('super-admin 전용 계정도 admin 목록을 받는다 — 강등 회귀 방지', async () => {
    // getCurrentUserContext 가 is_super_admin 을 보지 않던 시절 이 케이스가 깨졌다.
    getCurrentUserContextMock.mockResolvedValue({
      isAuthenticated: true, userId: 's1', isAdmin: true,
    });
    await GET(req('status=admin&area=all'));

    expect(sawAdminOrdering()).toBe(true);
  });

  it('알 수 없는 status 는 기본값으로 좁혀진다', async () => {
    getCurrentUserContextMock.mockResolvedValue({ isAuthenticated: false });
    await GET(req('status=bogus&area=all'));

    expect(orderCalls.map((c) => c.column)).toContain('stop_at');
    expect(sawAdminOrdering()).toBe(false);
  });
});
