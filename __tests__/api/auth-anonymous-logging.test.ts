import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthSessionMissingError } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mock.getUser } }) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: 'www.picnic.fan' }),
}));

import { GET as session } from '@/app/api/auth/session/route';
import { GET as verify } from '@/app/api/auth/verify/route';

describe('expected anonymous auth state does not become an ERROR event', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    mock.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('session returns anonymous 200 without logging an error', async () => {
    const response = await session();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('verify returns unauthenticated 401 without logging an error', async () => {
    const response = await verify(new NextRequest('https://www.picnic.fan/api/auth/verify'));
    expect(response.status).toBe(401);
    expect((await response.json()).valid).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('a genuine provider failure still produces a safe error record', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('private-provider-canary', 503, 'unexpected_failure') });
    const response = await verify(new NextRequest('https://www.picnic.fan/api/auth/verify'));
    expect(response.status).toBe(401);
    expect(console.error).toHaveBeenCalled();
    const output = vi.mocked(console.error).mock.calls.map((call) => call.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')).join('\n');
    expect(output).toContain('auth.verify.user.failed');
    expect(output).not.toContain('private-provider-canary');
  });
});
