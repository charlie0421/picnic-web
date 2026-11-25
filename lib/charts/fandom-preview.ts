// First-party fictional catalog for explicitly marked investor previews.
import { parseFandomReport, type FandomRequest, type Subject } from './fandom';
import type { ChartCell, ChartFilters, ChartGender, ChartMetric, ChartSnapshot } from './contract';
export function isChartPreviewEnabled() {
    const stage = process.env.VERCEL_ENV;
    return (
        process.env.KPOP_CHART_PREVIEW_DATA === 'synthetic' &&
        stage !== 'production' &&
        (stage === 'preview' || process.env.NODE_ENV !== 'production')
    );
}
const groups = [
    ['VELA NINE', '벨라 나인'],
    ['Blue Cinema', '블루 시네마'],
    ['Lunar Post', '루나 포스트'],
    ['June Atlas', '준 아틀라스'],
];
const members = [
    ['Rin', '린'],
    ['Arin', '아린'],
    ['Sol', '솔'],
    ['Yun', '윤'],
];
const catalog: Subject[] = groups.flatMap(([en, ko], i) => [
    { entity: 'group' as const, id: String(11 + i), name: { en, ko }, group_name: null },
    {
        entity: 'artist' as const,
        id: String(31 + i),
        name: { en: members[i][0], ko: members[i][1] },
        group_name: { en, ko },
    },
]);
const day = 86400000;
const end = Date.UTC(2026, 10, 23);
const campaign = { id: '00000000-0000-4000-8000-000000000011', name: 'VELA NINE · Jakarta', shared: false };
const n = (value: number) => ({ status: 'available' as const, value });
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const markets = [
    ['ID', 2800],
    ['KR', 2140],
    ['JP', 1260],
    ['TH', 920],
    ['US', 650],
] as const;
export function sampleFandom(req: FandomRequest) {
    if (req.type === 'search') {
        const q = req.query.toLocaleLowerCase();
        const hits = (names: Record<string, string> | null) =>
            Object.values(names ?? {}).some((x) => x.toLocaleLowerCase().includes(q));
        return catalog.filter(
            (s) =>
                hits(s.name) ||
                hits(s.group_name) ||
                (s.entity === 'group' && catalog.some((m) => m.group_name?.en === s.name.en && hits(m.name))),
        );
    }
    if (req.type === 'campaigns') return req.id === 11 && req.entity === 'group' ? [campaign] : [];
    const f = req.filters,
        subject = catalog.find((s) => s.entity === f.entity && s.id === String(f.id));
    if (!subject) return parseFandomReport({ status: 'not_found' });
    const linked = f.scope === 'campaign';
    if (linked && (f.campaign !== campaign.id || f.id !== 11 || f.country !== 'ALL'))
        return parseFandomReport({ status: 'unavailable', subject });
    const days = linked ? 7 : f.days;
    const scale =
        (((days / 30) * (f.entity === 'artist' ? 0.44 : f.mode === 'direct' ? 0.52 : 1)) /
            (1 + ((f.id % 10) - 1) * 0.16)) *
        (linked ? 0.38 : 1);
    const rows = markets
        .filter(([country]) => f.country === 'ALL' || f.country === country)
        .map(([country, size]) => {
            const voters = Math.round(size * scale),
                buyers = Math.floor(voters * 0.14);
            return {
                country,
                voters: n(voters),
                buyers: n(buyers),
                paid_units: n(buyers * 34),
                net_amounts: [{ currency: 'USD', amount: (buyers * 4.79).toFixed(2) }],
            };
        });
    if (!rows.length) return parseFandomReport({ status: 'unavailable', subject });
    const voters = rows.reduce((a, r) => a + r.voters.value, 0),
        buyers = rows.reduce((a, r) => a + r.buyers.value, 0),
        viewers = Math.floor(voters * 0.65);
    const points = Array.from({ length: days }, (_, i) => {
        const count = Math.round((voters / days) * (1.4 + (0.55 * i) / days + 0.25 * Math.sin(i * 0.79)));
        return { date: iso(end - (days - i) * day), voters: n(count), votes: n(count * (5 + (i % 3))) };
    });
    const metrics = {
        viewers: n(viewers),
        watch_seconds: n(viewers * 39),
        avg_watch_seconds: n(39),
        buyers: n(buyers),
        repeat_pct: n(21.8),
        ad_conversion_pct: n(7.2),
        ...(!linked && {
            fans: f.country === 'ALL' ? n(Math.round(voters * 1.65)) : undefined,
            voters: n(voters),
            votes: n(points.reduce((a, p) => a + p.votes.value, 0)),
            returning_pct: n(38.4),
            purchaser_voters: n(Math.floor(buyers * 0.85)),
            paid_units: n(buyers * 34),
        }),
    };
    return parseFandomReport(
        {
            status: 'ready',
            subject,
            as_of: new Date(end).toISOString(),
            country_basis: 'profile_at_publication',
            report_period: { start: iso(end - days * day), end: iso(end) },
            series_basis: linked ? 'completed_week' : 'utc_daily',
            metrics,
            series: linked ? [] : points,
            markets: linked ? [] : rows,
            ad_markets: linked
                ? []
                : rows.map((r) => ({ country: r.country, viewers: n(Math.floor(r.voters.value * 0.65)) })),
            net_amounts: [{ currency: 'USD', amount: (buyers * 4.79).toFixed(2) }],
            repeat_intervals: [
                { band: 'under_1d', count: n(Math.floor(buyers * 0.056)) },
                { band: '1_to_7d', count: n(Math.floor(buyers * 0.1)) },
                { band: 'over_7d', count: n(Math.floor(buyers * 0.062)) },
            ],
            campaigns: linked ? [campaign] : [],
        },
        f.scope,
    );
}

/** The fictional subjects have disjoint audiences for this market comparison. */
export function sampleMarketChart(filters: ChartFilters): ChartSnapshot {
    const { days, ...selection } = filters;
    const genders: Record<string, ChartGender> = {
        '11': 'female',
        '12': 'female',
        '13': 'female',
        '14': 'mixed',
    };
    const groupGrowth = [32, 18, 37, -6];
    const records = catalog
        .filter(
            (s) =>
                s.entity === filters.entity &&
                (s.entity === 'artist' ||
                    filters.group_gender === 'all' ||
                    genders[s.id] === filters.group_gender),
        )
        .flatMap((subject) => {
            const detail = sampleFandom({
                type: 'report',
                filters: {
                    entity: subject.entity,
                    id: Number(subject.id),
                    country: filters.country,
                    days,
                    mode: filters.group_mode,
                    scope: 'fandom',
                    campaign: null,
                },
            });
            if (Array.isArray(detail) || detail.status !== 'ready') return [];
            return [{ subject, detail, growth: groupGrowth[(Number(subject.id) % 10) - 1] }];
        });
    const unavailable: ChartCell = { status: 'unavailable', value: null };
    const total = (metric: ChartMetric) =>
        records.reduce((sum, r) => sum + (r.detail.metrics[metric].value ?? 0), 0);
    const prior = records.reduce(
        (sum, r) => sum + (r.detail.metrics[filters.metric].value ?? 0) / (1 + r.growth / 100),
        0,
    );
    const rankings = records
        .map(({ subject, detail, growth }) => ({
            id: subject.id,
            name: subject.name,
            entity: subject.entity,
            gender: genders[subject.id] ?? null,
            rank: 0,
            value: detail.metrics[filters.metric],
            growth_pct: n(growth),
        }))
        .sort((a, b) => (b.value.value ?? 0) - (a.value.value ?? 0));
    rankings.forEach((r, i) => {
        r.rank = i + 1;
    });
    const series = (records[0]?.detail.series ?? []).map((point, i) => ({
        date: point.date,
        // The detail fixture has no daily split for verified purchasers.
        value:
            filters.metric === 'purchaser_voters'
                ? unavailable
                : n(
                      records.reduce(
                          (sum, r) =>
                              sum +
                              (r.detail.series[i][filters.metric === 'votes' ? 'votes' : 'voters'].value ??
                                  0),
                          0,
                      ),
                  ),
    }));
    return {
        schema_version: 1,
        country_basis: 'profile_at_publication',
        status: records.length ? 'ready' : 'empty',
        period: { start: iso(end - days * day), end: iso(end), days },
        filters: selection,
        published_at: new Date(end).toISOString(),
        refresh_due_at: null,
        available_countries: ['ALL', ...markets.map(([code]) => code)],
        available_days: [7, 30, 90],
        summary: {
            voters: n(total('voters')),
            votes: n(total('votes')),
            purchaser_voters: n(total('purchaser_voters')),
            growth_pct: prior ? n(Math.round((total(filters.metric) / prior - 1) * 1000) / 10) : unavailable,
        },
        rankings,
        series,
    };
}
