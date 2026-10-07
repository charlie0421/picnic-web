import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
}));

// Only the external auth service and Next request storage are doubled.
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: auth.createClient }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { signOut: auth.signOut } }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  after: vi.fn(),
}));

import { POST as register } from '@/app/api/auth/register/route';
import { POST as logout } from '@/app/api/auth/logout/route';

const PRIVATE_DETAIL = 'auth-private-canary@example.invalid password=private-canary';

function registration() {
  return new Request('https://www.picnic.fan/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.invalid', password: 'test-password' }),
  });
}

function logoutRequest() {
  return new NextRequest('https://www.picnic.fan/api/auth/logout', {
    method: 'POST',
    headers: { origin: 'https://www.picnic.fan', accept: 'application/json' },
  });
}

describe('auth failures do not expose provider exception details in HTTP responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    auth.createClient.mockResolvedValue({ auth: { signUp: auth.signUp } });
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    // The real logger remains enabled; suppress test terminal noise only.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('register preserves 400 for a rejected signup but hides the provider detail', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error(PRIVATE_DETAIL),
    });
    const response = await register(registration());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(PRIVATE_DETAIL);
  });

  it('register hides unexpected service exceptions and preserves 500', async () => {
    auth.createClient.mockRejectedValue(new Error(PRIVATE_DETAIL));
    const response = await register(registration());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(PRIVATE_DETAIL);
  });

  it('logout hides thrown provider exceptions and preserves 500', async () => {
    auth.signOut.mockRejectedValue(new Error(PRIVATE_DETAIL));
    const response = await logout(logoutRequest());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(PRIVATE_DETAIL);
  });

  it('register still returns the successful auth result', async () => {
    const result = { user: { id: 'test-user' }, session: { access_token: 'authorized-session-token' } };
    auth.signUp.mockResolvedValue({ data: result, error: null });
    const response = await register(registration());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it('logout still clears cookies and returns a non-cacheable success response', async () => {
    const response = await logout(logoutRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: 'Logged out successfully' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('clear-site-data')).toBe('"cookies"');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
