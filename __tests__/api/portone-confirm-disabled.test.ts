import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// PortOne 웹 결제를 끈 동안에는 서버 confirm 이 결제를 거절한다.
// 배포 전에 열어 둔 탭의 옛 번들이 PortOne SDK 를 불러도 결제가 승인되면 안 된다(#77).
vi.mock('@/lib/supabase/server', () => ({
  getServerUser: async () => ({ id: '00000000-0000-0000-0000-000000000001' }),
  isWithdrawnUser: async () => false,
}));

describe('PortOne confirm — 웹 결제가 꺼져 있을 때', () => {
  it('정상 사용자의 올바른 요청도 거절한다', async () => {
    const { POST } = await import('@/app/api/payment/portone/confirm/route');
    const res = await POST(
      new NextRequest('https://www.picnic.fan/api/payment/portone/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          paymentId: 'pay_1',
          orderName: 'Star Candy 100',
          totalAmount: 1000,
          customData: { userId: '00000000-0000-0000-0000-000000000001' },
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: 'portone_disabled' });
  });
});
