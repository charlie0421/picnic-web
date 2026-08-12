import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getServerUserMock = vi.fn();
const isWithdrawnUserMock = vi.fn();
const invokeMock = vi.fn();
const rpcMock = vi.fn();
const singleMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: singleMock }) }) }),
    rpc: rpcMock,
    functions: { invoke: invokeMock },
  })),
  getServerUser: () => getServerUserMock(),
  isWithdrawnUser: () => isWithdrawnUserMock(),
}));

import { POST } from '@/app/api/vote/submit/route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/vote/submit', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/vote/submit 사전 잔액 부족은 409 (Edge 판정과 동일한 상태코드)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    isWithdrawnUserMock.mockResolvedValue(false);
    singleMock.mockResolvedValue({ data: { partner: null }, error: null });
    // 잔액 합계 4 인데 amount 5 요청 -> 사전검증 단계에서 걸린다.
    rpcMock.mockResolvedValue({
      data: {
        contract_version: 'v1',
        star: '4',
        bonus: '0',
        cotton: '0',
        cotton_expiring_amount: '0',
        cotton_next_expires_at: null,
        snapshot_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
  });

  it('사전검증에서 걸린 잔액 부족은 400이 아니라 409를 반환한다', async () => {
    const res = await POST(makeRequest({ vote_id: 1, vote_item_id: 10, amount: 5 }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('WALLET_INSUFFICIENT_BALANCE');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
