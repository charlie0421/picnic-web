// First-party fictional catalog for explicitly marked investor previews.
import { parseFandomReport, type DetailOptions, type FandomRequest, type Subject } from './fandom';
import type { ChartCell, ChartFilters, ChartGender, ChartMetric, ChartSnapshot } from './contract';
export function isChartPreviewEnabled() {
    const stage = process.env.VERCEL_ENV;
    return (
        process.env.KPOP_CHART_PREVIEW_DATA === 'synthetic' &&
        stage !== 'production' &&
        (stage === 'preview' || process.env.NODE_ENV !== 'production')
    );
}

const markets = ['ID', 'KR', 'JP', 'TH', 'US', 'PH', 'VN'] as const;
type Market = (typeof markets)[number];
/** Relative audience weight per market, in the order of `markets`. */
type Shares = readonly number[];
interface Profile {
    subject: Subject;
    gender: ChartGender;
    image: string;
    /** Direct voters on the latest day, all markets together. */
    daily: number;
    /** Daily growth of `daily`. A rising fandom had fewer voters in the past. */
    trend: number;
    shares: Shares;
    votesPerVoter: number;
    buyRate: number;
    members: Profile[];
}
// en, ko, share of the group's daily voters, trend change, market with an extra following
type MemberRow = [string, string, number, number, Market];
// en, ko, gender, daily, trend, shares, votes per daily voter, purchaser share, members
type GroupRow = [string, string, Exclude<ChartGender, null>, number, number, Shares, number, number, MemberRow[]];
// The first four groups and their first members keep the ids of the earlier preview (11-14, 31-34).
const groupRows: GroupRow[] = [
    ['VELA NINE', '벨라 나인', 'female', 520, 0.006, [38, 14, 9, 12, 6, 13, 8], 6.1, 0.15, [
        ['Rin', '린', 0.92, 0.002, 'ID'],
        ['Hana', '하나', 0.48, 0.006, 'PH'],
    ]],
    ['Blue Cinema', '블루 시네마', 'female', 430, -0.002, [14, 30, 24, 8, 12, 6, 6], 7.4, 0.19, [
        ['Arin', '아린', 0.74, -0.004, 'JP'],
        ['Seo', '서', 0.66, 0.007, 'KR'],
    ]],
    ['Lunar Post', '루나 포스트', 'female', 300, 0.011, [22, 18, 6, 26, 8, 10, 10], 5.2, 0.11, [
        ['Sol', '솔', 1.15, 0.004, 'TH'],
        ['Dami', '다미', 0.41, 0.012, 'VN'],
    ]],
    ['June Atlas', '준 아틀라스', 'mixed', 260, -0.004, [18, 26, 10, 10, 20, 8, 8], 4.6, 0.09, [
        ['Yun', '윤', 0.88, 0.001, 'US'],
        ['Theo', '테오', 0.57, -0.006, 'KR'],
    ]],
    ['Coral Static', '코랄 스태틱', 'female', 210, 0.002, [10, 22, 36, 6, 14, 6, 6], 8.3, 0.21, [
        ['Ella', '엘라', 1.32, 0.003, 'JP'],
        ['Bom', '봄', 0.61, -0.002, 'KR'],
    ]],
    ['Mono Garden', '모노 가든', 'mixed', 150, 0.009, [12, 34, 8, 8, 18, 10, 10], 5.8, 0.13, [
        ['Ian', '이안', 1.05, 0.005, 'US'],
        ['Seri', '세리', 0.72, 0.01, 'KR'],
    ]],
    ['NORTH SIGNAL', '노스 시그널', 'male', 560, 0.001, [16, 32, 18, 10, 12, 6, 6], 7.9, 0.18, [
        ['Ryu', '류', 0.68, -0.002, 'KR'],
        ['Haon', '하온', 0.51, 0.006, 'JP'],
    ]],
    ['Glass Engine', '글래스 엔진', 'male', 380, 0.008, [30, 16, 8, 14, 8, 14, 10], 5.5, 0.12, [
        ['Ezra', '에즈라', 1.24, 0.004, 'ID'],
        ['Doha', '도하', 0.86, 0.009, 'PH'],
    ]],
    ['Arc Harbor', '아크 하버', 'male', 290, -0.005, [10, 24, 34, 8, 12, 6, 6], 8.8, 0.22, [
        ['Kyle', '카일', 0.79, -0.003, 'JP'],
        ['Yeon', '연', 0.62, 0.002, 'TH'],
    ]],
    ['Paper Comet', '페이퍼 코멧', 'male', 180, 0.012, [14, 36, 6, 12, 10, 12, 10], 4.9, 0.1, [
        ['Noa', '노아', 1.41, 0.006, 'KR'],
        ['Siwoo', '시우', 0.94, 0.011, 'VN'],
    ]],
];
// en, ko, daily, trend, shares, votes per daily voter, purchaser share
const soloRows: [string, string, number, number, Shares, number, number][] = [
    ['Haneul', '하늘', 470, 0.003, [12, 40, 14, 8, 14, 6, 6], 6.8, 0.17],
    ['Lumi', '루미', 260, 0.014, [34, 10, 6, 18, 6, 16, 10], 5.1, 0.12],
];
const slug = (en: string) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const portrait = (kind: 'a' | 'g', en: string) => `/images/charts/sample/${kind}-${slug(en)}.svg`;
const boosted = (shares: Shares, market: Market) => shares.map((w, i) => (markets[i] === market ? w + 14 : w));
const groups: Profile[] = groupRows.map(([en, ko, gender, daily, trend, shares, votesPerVoter, buyRate, members], i) => {
    const name = { en, ko };
    return {
        subject: { entity: 'group', id: String(11 + i), name, group_name: null },
        gender,
        image: portrait('g', en),
        daily,
        trend,
        shares,
        votesPerVoter,
        buyRate,
        members: members.map(([memberEn, memberKo, ratio, change, market], j) => ({
            subject: {
                entity: 'artist',
                id: String(31 + i + j * groupRows.length),
                name: { en: memberEn, ko: memberKo },
                group_name: name,
            },
            gender: null,
            image: portrait('a', memberEn),
            daily: Math.round(daily * ratio),
            trend: trend + change,
            shares: boosted(shares, market),
            votesPerVoter: votesPerVoter * (j ? 0.92 : 1.06),
            buyRate: buyRate * (j ? 0.9 : 1.05),
            members: [],
        })),
    };
});
const artists: Profile[] = [
    ...groups.flatMap((g) => g.members),
    ...soloRows.map(([en, ko, daily, trend, shares, votesPerVoter, buyRate], i): Profile => ({
        subject: { entity: 'artist', id: String(31 + groupRows.length * 2 + i), name: { en, ko }, group_name: null },
        gender: null,
        image: portrait('a', en),
        daily,
        trend,
        shares,
        votesPerVoter,
        buyRate,
        members: [],
    })),
].sort((a, b) => Number(a.subject.id) - Number(b.subject.id));
const profiles = [...groups, ...artists];
const catalog: Subject[] = profiles.map((p) => p.subject);

const day = 86400000;
const end = Date.UTC(2026, 10, 23);
const campaign = { id: '00000000-0000-4000-8000-000000000011', name: 'VELA NINE · Jakarta', shared: false };
const n = (value: number) => ({ status: 'available' as const, value });
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** Share of daily voters who are distinct over a window: fans come back on several days. */
const distinct = (days: number) => 1 / (1 + 0.035 * days);

/** Voters and votes on one day, `daysAgo` days before the end of the period. */
function dailyActivity(p: Profile, market: Market, daysAgo: number, mode: DetailOptions['mode']) {
    if (p.subject.entity === 'group' && mode === 'member_rollup') {
        // Member votes count toward the group. A fan of two members counts once.
        const parts = p.members.map((m) => dailyActivity(m, market, daysAgo, 'direct'));
        return { voters: 0.86 * sum(parts.map((x) => x.voters)), votes: sum(parts.map((x) => x.votes)) };
    }
    const seed = Number(p.subject.id);
    const share = p.shares[markets.indexOf(market)] / sum([...p.shares]);
    const voters = p.daily * Math.exp(-p.trend * daysAgo) * share * (1 + 0.12 * Math.sin(daysAgo * 0.79 + seed));
    return { voters, votes: voters * p.votesPerVoter * (1 + 0.15 * Math.cos(daysAgo * 1.3 + seed)) };
}

/** Totals for a window that ends `offset` days before the end of the period. */
function measure(p: Profile, f: Pick<DetailOptions, 'country' | 'days' | 'mode'>, offset = 0) {
    const selected = markets.filter((m) => f.country === 'ALL' || f.country === m);
    if (!selected.length) return null;
    const points = Array.from({ length: f.days }, (_, i) => {
        const daysAgo = offset + f.days - 1 - i;
        const parts = selected.map((m) => dailyActivity(p, m, daysAgo, f.mode));
        return {
            date: iso(end - (daysAgo + 1) * day),
            voters: Math.round(sum(parts.map((x) => x.voters))),
            votes: Math.round(sum(parts.map((x) => x.votes))),
        };
    });
    const rows = selected.map((country) => {
        let total = 0;
        for (let i = 0; i < f.days; i++) total += dailyActivity(p, country, offset + i, f.mode).voters;
        const voters = Math.round(total * distinct(f.days)),
            purchasers = Math.round(voters * p.buyRate);
        return { country, voters, purchasers, buyers: Math.round(purchasers / 0.85) };
    });
    return {
        points,
        rows,
        voters: sum(rows.map((r) => r.voters)),
        votes: sum(points.map((x) => x.votes)),
        purchaser_voters: sum(rows.map((r) => r.purchasers)),
        buyers: sum(rows.map((r) => r.buyers)),
    };
}

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
        profile = profiles.find((p) => p.subject.entity === f.entity && p.subject.id === String(f.id)),
        subject = profile?.subject;
    if (!profile || !subject) return parseFandomReport({ status: 'not_found' });
    const linked = f.scope === 'campaign';
    if (linked && (f.campaign !== campaign.id || f.id !== 11 || f.country !== 'ALL'))
        return parseFandomReport({ status: 'unavailable', subject });
    const days = linked ? 7 : f.days;
    const m = measure(profile, { country: f.country, days, mode: f.mode });
    if (!m) return parseFandomReport({ status: 'unavailable', subject });
    const reach = linked ? 0.38 : 1,
        seed = Number(subject.id),
        buyers = Math.round(m.buyers * reach),
        viewers = Math.floor(m.voters * 0.65 * reach),
        watch = 33 + (seed % 9),
        units = 28 + (seed % 13),
        usd = (count: number) => [{ currency: 'USD', amount: (count * 4.79).toFixed(2) }];
    const metrics = {
        viewers: n(viewers),
        watch_seconds: n(viewers * watch),
        avg_watch_seconds: n(watch),
        buyers: n(buyers),
        repeat_pct: n(Math.round((17 + profile.buyRate * 40) * 10) / 10),
        ad_conversion_pct: n(Math.round((4 + profile.buyRate * 20) * 10) / 10),
        ...(!linked && {
            fans: f.country === 'ALL' ? n(Math.round(m.voters * 1.65)) : undefined,
            voters: n(m.voters),
            votes: n(m.votes),
            returning_pct: n(Math.round((30 + profile.votesPerVoter * 1.5) * 10) / 10),
            purchaser_voters: n(m.purchaser_voters),
            paid_units: n(buyers * units),
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
            series: linked ? [] : m.points.map((x) => ({ date: x.date, voters: n(x.voters), votes: n(x.votes) })),
            markets: linked
                ? []
                : m.rows.map((r) => ({
                      country: r.country,
                      voters: n(r.voters),
                      buyers: n(r.buyers),
                      paid_units: n(r.buyers * units),
                      net_amounts: usd(r.buyers),
                  })),
            ad_markets: linked
                ? []
                : m.rows.map((r) => ({ country: r.country, viewers: n(Math.floor(r.voters * 0.65)) })),
            net_amounts: usd(buyers),
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

/**
 * The ranking for each filter comes from the same windows as the fandom reports, so a ranking row and its
 * report agree. Growth compares the window with the window of the same length just before it.
 */
export function sampleMarketChart(filters: ChartFilters): ChartSnapshot {
    const { days, ...selection } = filters;
    const window = { country: filters.country, days, mode: filters.group_mode };
    const records = (filters.entity === 'group' ? groups : artists)
        .filter((p) => filters.entity === 'artist' || filters.group_gender === 'all' || p.gender === filters.group_gender)
        .flatMap((p) => {
            const now = measure(p, window),
                before = measure(p, window, days);
            return now && before ? [{ p, now, before }] : [];
        });
    const unavailable: ChartCell = { status: 'unavailable', value: null };
    const growth = (current: number, prior: number) =>
        prior > 0 ? n(Math.round((current / prior - 1) * 1000) / 10) : unavailable;
    const total = (metric: ChartMetric, key: 'now' | 'before' = 'now') => sum(records.map((r) => r[key][metric]));
    const rankings = records
        .map(({ p, now, before }) => ({
            id: p.subject.id,
            name: p.subject.name,
            image_url: p.image,
            entity: p.subject.entity,
            gender: p.gender,
            rank: 0,
            value: n(now[filters.metric]),
            growth_pct: growth(now[filters.metric], before[filters.metric]),
        }))
        .sort((a, b) => b.value.value - a.value.value || Number(a.id) - Number(b.id));
    rankings.forEach((r, i) => {
        r.rank = i + 1;
    });
    const series = (records[0]?.now.points ?? []).map((point, i) => ({
        date: point.date,
        // The fixture has no daily split for verified purchasers.
        value:
            filters.metric === 'purchaser_voters'
                ? unavailable
                : n(sum(records.map((r) => r.now.points[i][filters.metric === 'votes' ? 'votes' : 'voters']))),
    }));
    return {
        schema_version: 1,
        country_basis: 'profile_at_publication',
        status: records.length ? 'ready' : 'empty',
        period: { start: iso(end - days * day), end: iso(end), days },
        filters: selection,
        published_at: new Date(end).toISOString(),
        refresh_due_at: null,
        available_countries: ['ALL', ...markets],
        available_days: [7, 30, 90],
        summary: {
            voters: n(total('voters')),
            votes: n(total('votes')),
            purchaser_voters: n(total('purchaser_voters')),
            growth_pct: growth(total(filters.metric), total(filters.metric, 'before')),
        },
        rankings,
        series,
    };
}
