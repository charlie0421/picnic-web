// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/replay/eligibility/route';
afterEach(() => vi.unstubAllEnvs());
function request(url: string, init?: RequestInit) { return new NextRequest(url, { ...init, headers: { host: new URL(url).host, ...(init?.headers as Record<string, string>) } }); }
function local() { vi.stubEnv('NEXT_PUBLIC_REPLAY_LOCAL_TEST', '1'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:59862'); }
it('is unavailable by default, including on loopback', async () => {
  vi.stubEnv('NEXT_PUBLIC_REPLAY_LOCAL_TEST', '');
  expect((await GET(request('http://127.0.0.1:53931/api/replay/eligibility'))).status).toBe(404);
});
it.each(['https://picnic.fan', 'http://localhost:53931', 'http://127.0.0.1:3000'])('rejects a non-harness origin %s', async origin => {
  local(); expect((await GET(request(origin + '/api/replay/eligibility'))).status).toBe(404);
});
it.each(['sb-synthetic-auth-token=opaque', 'locale=unrecognized', 'HttpOnlyCanary=opaque'])('rejects any server-visible cookie: %s', async cookie => {
  local(); const res = await GET(request('http://127.0.0.1:53931/api/replay/eligibility', { headers: { cookie } }));
  expect(await res.json()).toEqual({ anonymous: false }); expect(res.headers.get('cache-control')).toBe('no-store');
});
it('confirms only an empty Cookie header and no bearer credential', async () => {
  local(); const url = 'http://127.0.0.1:53931/api/replay/eligibility';
  expect(await (await GET(request(url))).json()).toEqual({ anonymous: true });
  expect(await (await GET(request(url, { headers: { authorization: 'Bearer synthetic' } }))).json()).toEqual({ anonymous: false });
});

it('allows the explicit public language preference and rejects extra cookies', async () => {
  local(); const url = 'http://127.0.0.1:53931/api/replay/eligibility';
  expect(await (await GET(request(url, { headers: { cookie: 'locale=en' } }))).json()).toEqual({ anonymous: true });
  expect(await (await GET(request(url, { headers: { cookie: 'locale=en; hidden=token' } }))).json()).toEqual({ anonymous: false });
});
