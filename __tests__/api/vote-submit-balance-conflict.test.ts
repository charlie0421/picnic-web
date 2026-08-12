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

describe('POST /api/vote/submit 잔액 판정은 서버(voting-v2) 전결', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    isWithdrawnUserMock.mockResolvedValue(false);
    singleMock.mockResolvedValue({ data: { partner: null }, error: null });
  });

  it('잔액 부족은 Edge 가 판정하고 BFF 는 409 를 그대로 전달한다', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge error',
        context: new Response(JSON.stringify({ error: 'WALLET_INSUFFICIENT_BALANCE' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      },
    });

    const res = await POST(makeRequest({
      vote_id: 1,
      vote_item_id: 10,
      amount: 5,
      request_id: '22222222-2222-4222-8222-222222222222',
    }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('WALLET_INSUFFICIENT_BALANCE');
    // 판정은 서버가 한다 — BFF 가 미리 막지 않고 Edge 까지 도달해야 한다.
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('커밋 후 잔액이 0이어도 같은 request_id 재시도는 Edge 까지 도달해 재생될 수 있다', async () => {
    // 사전 잔액검사가 남아 있으면 이 요청은 Edge 에 닿지 못하고 409 로 잘린다(멱등 재생 불가).
    invokeMock.mockResolvedValue({
      data: { votePickId: 1, replayed: true, usage: {}, wallet: {} },
      error: null,
    });

    const res = await POST(makeRequest({
      vote_id: 1,
      vote_item_id: 10,
      amount: 5,
      request_id: '22222222-2222-4222-8222-222222222222',
    }));

    expect(res.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect((await res.json()).data.replayed).toBe(true);
  });
});
