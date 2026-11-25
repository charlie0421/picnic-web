import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/kpop-chart/fandom/route';
const session = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ auth: { getSession: session } }),
}));
function request(q: string) {
    return GET(new NextRequest('http://localhost/api/kpop-chart/fandom?' + q));
}
beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public');
    vi.stubEnv('KPOP_CHART_PREVIEW_DATA', '');
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});
describe('fandom report API', () => {
    it('calls catalog anonymously and drops additional fields', async () => {
        const upstream = vi.fn(async () =>
            Response.json([{ entity: 'artist', name: { ko: '린' }, id: '31', user_id: 'private' }]),
        );
        vi.stubGlobal('fetch', upstream);
        const r = await request('q=Rin');
        expect(await r.json()).toEqual([
            { entity: 'artist', name: { ko: '린' }, id: '31', group_name: null },
        ]);
        expect(session).not.toHaveBeenCalled();
        expect(r.headers.get('cache-control')).toContain('no-store');
    });
    it('requires a signed-in account before listing campaigns', async () => {
        session.mockResolvedValue({ data: { session: null } });
        const upstream = vi.fn();
        vi.stubGlobal('fetch', upstream);
        expect((await request('campaigns=1&entity=group&id=11')).status).toBe(403);
        expect(upstream).not.toHaveBeenCalled();
    });
    it('forwards the caller token and strips admin-only fields', async () => {
        session.mockResolvedValue({ data: { session: { access_token: 'viewer' } } });
        const upstream = vi.fn(async () =>
            Response.json({
                status: 'ready',
                top_contributors: [{ user_id: 'private' }],
                subject: { entity: 'group', id: '11', name: { en: 'Group' } },
            }),
        );
        vi.stubGlobal('fetch', upstream);
        const r = await request(
            'entity=group&id=11&scope=campaign&campaign=00000000-0000-4000-8000-000000000011',
        );
        expect(upstream).toHaveBeenCalledWith(
            expect.any(URL),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer viewer' }) }),
        );
        expect(await r.json()).not.toHaveProperty('top_contributors');
    });
    it('requires explicit sample configuration and never fills an upstream failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, { status: 500 })),
        );
        expect((await request('q=Rin')).status).toBe(503);
        vi.stubEnv('KPOP_CHART_PREVIEW_DATA', 'synthetic');
        const sample = await request('q=Rin');
        expect(sample.headers.get('x-picnic-data')).toBe('synthetic');
        expect(sample.status).toBe(200);
    });
});
