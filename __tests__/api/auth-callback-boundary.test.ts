import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock('@/utils/log-error', () => ({
  logError: vi.fn(),
}));

import { GET } from '@/app/api/auth/callback/route';

function callbackRequest(
  origin: string,
  params: Record<string, string> = {},
): Request {
  const url = new URL('/api/auth/callback', origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

describe('GET /api/auth/callback — canonical redirect boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.picnic.fan');
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://picnic-project.supabase.co',
    );
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    const cookieStore = {
      get: vi.fn(() => undefined),
      getAll: vi.fn(() => []),
    };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.headers.mockResolvedValue(
      new Headers({ host: 'www.picnic.fan', 'x-forwarded-proto': 'https' }),
    );
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    mocks.signOut.mockResolvedValue(undefined);
    mocks.createServerClient.mockReturnValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        signOut: mocks.signOut,
      },
      from: mocks.from,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps an OAuth deep link on the canonical origin', async () => {
    const response = await GET(
      callbackRequest('https://www.picnic.fan', {
        code: 'valid-code',
        next: '/ko/vote?tab=live#rank',
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://www.picnic.fan/ko/vote?tab=live#rank',
    );
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '%2F%2Fevil.example',
  ])('redirects unsafe next=%s to canonical /', async (next) => {
    const response = await GET(
      callbackRequest('https://attacker.example', {
        code: 'valid-code',
        next,
      }),
    );

    expect(response.headers.get('location')).toBe('https://www.picnic.fan/');
  });

  it('keeps an error redirect canonical when the request Host is manipulated', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: new Error('provider detail'),
    });

    const response = await GET(
      callbackRequest('https://attacker.example', { code: 'bad-code' }),
    );

    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).origin).toBe('https://www.picnic.fan');
    expect(new URL(location!).pathname).toBe('/auth/auth-code-error');
  });

  it('uses only the configured site origin even if the env URL has a path', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SITE_URL',
      'https://www.picnic.fan/configured/base/',
    );

    const response = await GET(
      callbackRequest('https://attacker.example', {
        code: 'valid-code',
        next: '/en/vote',
      }),
    );

    expect(response.headers.get('location')).toBe(
      'https://www.picnic.fan/en/vote',
    );
  });

  it('falls back to the current request origin when SITE_URL is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    const response = await GET(
      callbackRequest('http://localhost:3203', {
        code: 'valid-code',
        next: '/ko/vote',
      }),
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost:3203/ko/vote',
    );
  });
});
