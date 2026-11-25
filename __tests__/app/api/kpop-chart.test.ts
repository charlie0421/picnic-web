import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/kpop-chart/route';

const fixture = () => ({
  schema_version: 1, status: 'ready', published_at: '2026-11-25T02:00:00Z', refresh_due_at: '2026-11-26T02:00:00Z',
  period: { start: '2026-11-18', end: '2026-11-25', days: 7 },
  filters: { country: 'ALL', entity: 'artist', group_mode: 'direct', group_gender: 'all', metric: 'voters' },
  available_countries: ['ALL', 'KR'], available_days: [7, 30, 90],
  summary: Object.fromEntries(['voters', 'votes', 'purchaser_voters', 'growth_pct'].map(key => [key, { status: 'available', value: 100 }])),
  rankings: [], series: [], user_profiles: [{ email: 'private@example.test' }],
});

describe('anonymous public chart endpoint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://snapshot.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('calls only the approved RPC anonymously and removes non-contract fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(fixture()));
    vi.stubGlobal('fetch', fetcher);
    const response = await GET(new NextRequest('http://localhost/api/kpop-chart', { headers: { Authorization: 'Bearer private-user-token', cookie: 'session=private' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).not.toHaveProperty('user_profiles');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://snapshot.example.test/rest/v1/rpc/get_kpop_chart');
    expect(init.headers.Authorization).toBe('Bearer public-anon-key');
    expect(init.headers).not.toHaveProperty('cookie');
    expect(JSON.parse(init.body)).toEqual({ p_country: 'ALL', p_days: 7, p_entity: 'artist', p_group_mode: 'direct', p_group_gender: 'all', p_metric: 'voters' });
  });
  it('rejects invalid or duplicate filters without fetching data', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await GET(new NextRequest('http://localhost/api/kpop-chart?country=KR&country=US'))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not publish expired figures or upstream error details', async () => {
    const data = fixture();
    data.published_at = '2026-11-23T02:00:00Z';
    data.period.start = '2026-11-16'; data.period.end = '2026-11-23';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
    const response = await GET(new NextRequest('http://localhost/api/kpop-chart'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'snapshot_unavailable' });
  });
});
