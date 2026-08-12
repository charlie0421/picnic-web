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

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/vote/submit', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/vote/submit request_id handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    isWithdrawnUserMock.mockResolvedValue(false);
    singleMock.mockResolvedValue({ data: { partner: null }, error: null });
    rpcMock.mockResolvedValue({
      data: {
        contract_version: 'v1',
        star: '100',
        bonus: '0',
        cotton: '0',
        cotton_expiring_amount: '0',
        cotton_next_expires_at: null,
        snapshot_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('malformed request_id 는 조용히 치환되지 않고 400을 반환한다', async () => {
    const res = await POST(makeRequest({
      vote_id: 1,
      vote_item_id: 10,
      amount: 5,
      request_id: 'not-a-uuid',
    }));

    expect(res.status).toBe(400);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('request_id 누락 시 서버가 생성한 유효 UUID를 Edge로 전달한다', async () => {
    const res = await POST(makeRequest({
      vote_id: 1,
      vote_item_id: 10,
      amount: 5,
    }));

    expect(res.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const sentBody = invokeMock.mock.calls[0][1].body;
    expect(sentBody.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('유효한 UUID request_id는 그대로 Edge에 전달된다', async () => {
    const res = await POST(makeRequest({
      vote_id: 1,
      vote_item_id: 10,
      amount: 5,
      request_id: VALID_UUID,
    }));

    expect(res.status).toBe(200);
    const sentBody = invokeMock.mock.calls[0][1].body;
    expect(sentBody.request_id).toBe(VALID_UUID);
  });
});
