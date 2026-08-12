import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerUserMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: rpcMock })),
  getServerUser: () => getServerUserMock(),
}));

import { GET } from '@/app/api/user/wallet/route';

describe('GET /api/user/wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('star 가 null 인 잘못된 RPC 응답은 500을 반환한다 (클라이언트로 전달되어 크래시하지 않는다)', async () => {
    rpcMock.mockResolvedValue({
      data: {
        contract_version: 'v1',
        star: null,
        bonus: '0',
        cotton: '0',
        cotton_expiring_amount: '0',
        cotton_next_expires_at: null,
        snapshot_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const res = await GET();

    expect(res.status).toBe(500);
  });

  it('정상 응답은 그대로 wallet.v1 문자열 필드를 반환한다', async () => {
    rpcMock.mockResolvedValue({
      data: {
        contract_version: 'v1',
        star: '9007199254740993',
        bonus: '0',
        cotton: '40',
        cotton_expiring_amount: '0',
        cotton_next_expires_at: null,
        snapshot_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.wallet.star).toBe('9007199254740993');
  });
});
