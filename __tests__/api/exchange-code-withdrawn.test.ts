import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 탈퇴 계정은 OAuth 코드 교환 직후 세션을 폐기하고 403 을 받는다(로그인 재진입 차단).
 */
const mocks = vi.hoisted(() => ({
  deletedAt: null as string | null,
  profileError: null as { message: string } | null,
  signOut: vi.fn(async () => ({ error: null })),
  invoke: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/utils/log-error', () => ({ logError: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('@/lib/supabase/social/service', () => ({ getSocialAuthService: () => ({ handleCallback: async () => ({ success: true }) }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({
        data: { session: { access_token: 't' }, user: { id: 'user-1', email: 'a@b.c', app_metadata: { provider: 'google' } } },
        error: null,
      }),
      signOut: mocks.signOut,
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => mocks.profileError ? { data: null, error: mocks.profileError } : { data: { deleted_at: mocks.deletedAt }, error: null } }) }),
    }),
    functions: { invoke: mocks.invoke },
  }),
}));

import { POST } from '@/app/api/auth/exchange-code/route';

const req = () =>
  new NextRequest('https://www.picnic.fan/api/auth/exchange-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'abc', provider: 'google' }),
  });

describe('POST /api/auth/exchange-code — 탈퇴 계정', () => {
  beforeEach(() => {
    mocks.signOut.mockClear();
    mocks.invoke.mockClear();
    mocks.profileError = null;
  });

  it('탈퇴 계정은 세션을 폐기하고 403', async () => {
    mocks.deletedAt = '2026-01-01T00:00:00Z';
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('withdrawn');
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('정상 계정은 200', async () => {
    mocks.deletedAt = null;
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('탈퇴 여부 조회가 실패하면 세션을 폐기하고 503(차단 쪽으로 처리)', async () => {
    mocks.deletedAt = null;
    mocks.profileError = { message: 'timeout' };
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
