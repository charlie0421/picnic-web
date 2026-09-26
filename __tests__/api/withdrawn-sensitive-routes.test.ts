import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 결정 #10: 탈퇴 계정 차단을 middleware 매 요청 조회에서 민감 API 로 옮긴다.
 * 결제·업로드·스토리지 서명 URL 은 탈퇴 사용자에게 403 을 주고 외부 호출(PayPal·S3·Storage)을 하지 않는다.
 */
const mocks = vi.hoisted(() => ({
  withdrawn: true,
  isWithdrawnUser: vi.fn(),
  createPresignedPost: vi.fn(),
  fetch: vi.fn(),
  storageSign: vi.fn(),
}));

vi.mock('@/utils/log-error', () => ({ logError: vi.fn() }));
vi.mock('@/utils/star-candy-bonus', () => ({ getStarCandyBonusExpiryISO: () => '2027-01-01T00:00:00Z' }));
vi.mock('@/lib/supabase/server', () => {
  const user = { id: '00000000-0000-0000-0000-000000000001' };
  const builder: any = {};
  Object.assign(builder, { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: null, error: null }) });
  return {
    isWithdrawnUser: mocks.isWithdrawnUser,
    getServerUser: async () => user,
    createServerSupabaseClient: async () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: () => builder,
    }),
  };
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.storageSign, createSignedUploadUrl: mocks.storageSign }) },
    rpc: vi.fn(),
  }),
}));
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: mocks.createPresignedPost }));

const json = (path: string, body: unknown) =>
  new NextRequest(`https://www.picnic.fan${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const routes = [
  ['PayPal create-order', '@/app/api/payment/paypal/create-order/route', '/api/payment/paypal/create-order', { productId: 'STAR_100' }],
  ['PayPal capture-order', '@/app/api/payment/paypal/capture-order/route', '/api/payment/paypal/capture-order', { orderID: 'ORDER-1' }],
  ['PortOne confirm', '@/app/api/payment/portone/confirm/route', '/api/payment/portone/confirm', { paymentId: 'pay_1' }],
  ['storage signed-url', '@/app/api/storage/signed-url/route', '/api/storage/signed-url', { path: 'x.png' }],
  ['uploads presign', '@/app/api/uploads/presign/route', '/api/uploads/presign', { contentType: 'image/png', size: 100 }],
] as const;

describe('민감 API — 탈퇴 사용자 차단', () => {
  beforeEach(() => {
    mocks.isWithdrawnUser.mockReset().mockImplementation(async () => mocks.withdrawn);
    mocks.createPresignedPost.mockReset();
    mocks.storageSign.mockReset();
    mocks.fetch.mockReset().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it.each(routes)('%s: 탈퇴 사용자는 403, 외부 호출 0', async (_name, modulePath, path, body) => {
    const { POST } = await import(/* @vite-ignore */ modulePath);
    const res = await POST(json(path, body));

    expect(res.status).toBe(403);
    expect(mocks.isWithdrawnUser).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createPresignedPost).not.toHaveBeenCalled();
    expect(mocks.storageSign).not.toHaveBeenCalled();
  });
});
