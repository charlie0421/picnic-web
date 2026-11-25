import { NextRequest, NextResponse } from 'next/server';
import { chartFreshness, parseChartFilters, parseChartSnapshot } from '@/lib/charts/contract';
import { isChartPreviewEnabled, sampleMarketChart } from '@/lib/charts/fandom-preview';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const filters = parseChartFilters(request.nextUrl.searchParams);
  if (!filters) return NextResponse.json({ error: 'invalid_filters' }, { status: 400, headers });
  if (isChartPreviewEnabled()) {
    return NextResponse.json(parseChartSnapshot(sampleMarketChart(filters), filters), {
      headers: { ...headers, 'X-Picnic-Data': 'synthetic' },
    });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'snapshot_unavailable' }, { status: 503, headers });
  try {
    // Always anonymous. Never forward a caller cookie, bearer token, or privileged server key.
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/get_kpop_chart`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'public' },
      body: JSON.stringify({ p_country: filters.country, p_days: filters.days, p_entity: filters.entity, p_group_mode: filters.group_mode, p_group_gender: filters.group_gender, p_metric: filters.metric }),
    });
    if (!response.ok) throw new Error('Public snapshot unavailable');
    const snapshot = parseChartSnapshot(await response.json(), filters);
    if (chartFreshness(snapshot, Date.now()) === 'expired') throw new Error('Expired publication');
    return NextResponse.json(snapshot, { headers });
  } catch {
    return NextResponse.json({ error: 'snapshot_unavailable' }, { status: 503, headers });
  }
}
