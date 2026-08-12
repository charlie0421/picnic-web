import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getServerUserMock = vi.fn();
const singleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: singleMock }) }) }),
    rpc: rpcMock,
  })),
  getServerUser: () => getServerUserMock(),
}));

import { GET } from '@/app/api/user/wallet/history/route';

function makeRequest() {
  return new NextRequest('http://localhost/api/user/wallet/history?currency=STAR_CANDY&limit=20');
}

describe('GET /api/user/wallet/history 관리자 정책', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: { items: [], total_count: '0', next_cursor: null, snapshot_at: null }, error: null });
  });

  it('비로그인 401', async () => {
    getServerUserMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('일반 사용자(관리자 아님) 403', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    singleMock.mockResolvedValue({ data: { is_admin: false, is_super_admin: false }, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('관리자는 200', async () => {
    getServerUserMock.mockResolvedValue({ id: 'admin-1' });
    singleMock.mockResolvedValue({ data: { is_admin: true, is_super_admin: false }, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('super admin 도 200', async () => {
    getServerUserMock.mockResolvedValue({ id: 'super-1' });
    singleMock.mockResolvedValue({ data: { is_admin: false, is_super_admin: true }, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});
