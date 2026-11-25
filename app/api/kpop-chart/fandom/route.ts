import { NextRequest, NextResponse } from 'next/server';
import { fandomParams, parseSubjects, parseFandomReport } from '@/lib/charts/fandom';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isChartPreviewEnabled, sampleFandom } from '@/lib/charts/fandom-preview';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
export async function GET(request: NextRequest) {
    const params = fandomParams(request.nextUrl.searchParams);
    if (!params) return NextResponse.json({ error: 'invalid_filters' }, { status: 400, headers });
    if (isChartPreviewEnabled()) {
        return NextResponse.json(sampleFandom(params), {
            headers: { ...headers, 'X-Picnic-Data': 'synthetic' },
        });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
        key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
    try {
        let auth = key;
        if (
            params.type === 'campaigns' ||
            (params.type === 'report' && params.filters.scope === 'campaign')
        ) {
            const client = await createSupabaseServerClient();
            const { data } = await client.auth.getSession();
            if (!data.session) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });
            auth = data.session.access_token;
        }
        let rpc: string, body: object;
        if (params.type === 'search') {
            rpc = 'search_kpop_fandom';
            body = { p_query: params.query, p_limit: 30 };
        } else if (params.type === 'campaigns') {
            rpc = 'list_kpop_fandom_campaigns';
            body = { p_entity: params.entity, p_id: params.id };
        } else {
            const f = params.filters;
            rpc = 'get_kpop_fandom_report';
            body = {
                p_entity: f.entity,
                p_id: f.id,
                p_country: f.country,
                p_days: f.days,
                p_scope: f.scope,
                p_group_mode: f.mode,
                p_campaign: f.campaign,
            };
        }
        const response = await fetch(new URL('/rest/v1/rpc/' + rpc, url), {
            method: 'POST',
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
            headers: { apikey: key, Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const status = [401, 403].includes(response.status) ? 403 : response.status === 400 ? 400 : 503;
            return NextResponse.json(
                { error: status === 403 ? 'forbidden' : 'unavailable' },
                { status, headers },
            );
        }
        const raw: unknown = await response.json();
        if (params.type === 'search') return NextResponse.json(parseSubjects(raw), { headers });
        if (params.type === 'campaigns' && !Array.isArray(raw)) throw new Error('Invalid campaign list');
        if (params.type === 'campaigns')
            return NextResponse.json(parseFandomReport({ status: 'ready', campaigns: raw }).campaigns, {
                headers,
            });
        const result = parseFandomReport(raw, params.filters.scope),
            f = params.filters;
        if (result.subject && (result.subject.id !== String(f.id) || result.subject.entity !== f.entity))
            throw new Error('Mismatched target');
        return NextResponse.json(result, { headers });
    } catch {
        return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
    }
}
