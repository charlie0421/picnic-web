// Synthetic numbers on real catalog entries for explicitly marked investor previews.
import { parseFandomReport, type DetailOptions, type FandomRequest, type Subject } from './fandom';
import type { ChartCell, ChartFilters, ChartGender, ChartMetric, ChartSnapshot } from './contract';
import { PREVIEW_SHOWCASE } from './preview-showcase';
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
type Names = Record<string, string>;
// id, names, CDN key, share of the group's daily voters, trend change, market with an extra following
type MemberRow = [number, Names, string, number, number, Market];
// id, names, CDN key, gender, daily, trend, shares, votes per daily voter, purchaser share, members
type GroupRow = [number, Names, string, Exclude<ChartGender, null>, number, number, Shares, number, number, MemberRow[]];
// Real catalog entries (public.artist and public.artist_group: id, name, image) with invented numbers.
// Two members per group with the most PICNIC votes. Every image key returns 200 from the CDN.
const both = (ko: string, en: string, more: Names = {}): Names => ({ ko, en, ...more });
const same = (ko: string, en: string) => both(ko, en, { ja: en, zh: en });
const groupRows: GroupRow[] = [
    [6, same('BTS', 'BTS'), 'artist_group/6/image.png', 'male', 640, 0.001, [16, 24, 20, 10, 18, 6, 6], 7.9, 0.18, [
        [35, same('뷔', 'V'), 'artist/35/image.png', 0.95, 0.002, 'US'],
        [34, same('진', 'JIN'), 'artist/34/image.png', 0.62, -0.002, 'JP'],
    ]],
    [40, same('라이즈', 'RIIZE'), 'artist_group/40/image.png', 'male', 520, 0.008, [22, 30, 18, 10, 8, 6, 6], 6.6, 0.15, [
        [241, same('원빈', 'WONBIN'), 'artist/6000b274-9c80-4310-87ed-3680cecff6a3.png', 0.9, 0.004, 'ID'],
        [243, same('앤톤', 'ANTON'), 'artist/c0311f87-9125-409f-8b59-c6c994c77ea4.png', 0.55, 0.006, 'TH'],
    ]],
    [88, same('스트레이키즈', 'STRAY KIDS'), 'artist_group/88/image.png', 'male', 430, -0.003, [14, 20, 22, 8, 24, 6, 6], 7.2, 0.17, [
        [510, same('리노', 'LEE KNOW'), 'artist/ed7857f9-915f-42a5-8d41-443c15b6d0d3.png', 0.7, 0.001, 'KR'],
        [504, same('현진', 'HYUNJIN'), 'artist/e724caa7-10d2-400a-99a6-bbc349c75f02.png', 0.6, 0.004, 'PH'],
    ]],
    [200, same('플레이브', 'PLAVE'), 'artist_group/200/image.png', 'male', 380, 0.006, [8, 52, 12, 6, 10, 6, 6], 8.8, 0.22, [
        [1234, same('노아', 'NOAH'), 'artist/ade6c4a2-e2bb-4f58-9826-b6668bf3954b.png', 0.8, 0.003, 'KR'],
        [1236, same('밤비', 'BAMBY'), 'artist/2e1bf2fa-155f-4827-94b4-b45ca28a92a7.png', 0.78, 0.005, 'JP'],
    ]],
    [65, same('베이비몬스터', 'BABYMONSTER'), 'artist_group/65/image.png', 'female', 470, 0.009, [30, 14, 10, 16, 10, 12, 8], 5.6, 0.12, [
        [369, same('치키타', 'CHIQUITA'), 'artist/cb9099e9-0708-4575-bd29-e0ad5dadae5f.png', 0.74, 0.01, 'TH'],
        [371, same('아현', 'AHYEON'), 'artist/b106cd47-b688-42e1-83fe-ab418c08a94e.png', 0.66, 0.006, 'ID'],
    ]],
    [50, same('르세라핌', 'LE SSERAFIM'), 'artist_group/50/image.png', 'female', 410, -0.002, [14, 26, 26, 8, 14, 6, 6], 7.4, 0.19, [
        [298, same('사쿠라', 'SAKURA'), 'artist/7ba6687c-96e9-4210-ad63-b91b655d6dbc.png', 0.82, -0.003, 'JP'],
        [301, same('허윤진', 'HUH YUNJIN'), 'artist/87a0294e-3a2a-4d44-b08c-61fdfb7bba26.png', 0.58, 0.004, 'US'],
    ]],
    [234, both('프로미스나인', 'fromis_9', { ja: 'プロミスナイン' }), 'artist-group/e9d26756-5ca0-48f5-a34d-fa3b33394740.png', 'female', 300, 0.004, [10, 44, 16, 8, 10, 6, 6], 8.3, 0.21, [
        [3036, both('이나경', 'LEE NA GYUNG'), 'artist/43b2a17f-94da-4e59-bc83-feec69c2d278.png', 1.2, 0.006, 'KR'],
        [3035, both('이채영', 'LEE CHAE YOUNG'), 'artist/0d8503a3-adf8-4981-ad40-3d069bd590bc.png', 0.5, 0.002, 'VN'],
    ]],
    [223, same('하츠투하츠', 'Hearts2Hearts'), 'artist-group/6e33c748-e969-4086-a8c6-9c9da5d90b09.png', 'female', 250, 0.013, [26, 22, 10, 14, 8, 10, 10], 5.2, 0.11, [
        [1372, same('카르멘', 'CARMEN'), 'artist/a39be0c7-8ed3-4dec-a749-1e067879c69c.png', 0.9, 0.012, 'ID'],
        [1374, same('스텔라', 'STELLA'), 'artist/199ddba2-6374-47b6-b660-862dc7f1af95.png', 0.6, 0.009, 'PH'],
    ]],
    [237, both('올데이 프로젝트', 'ALLDAY PROJECT'), 'artist-group/21f66d29-406c-4e74-9143-c21112329e43.png', 'mixed', 190, 0.011, [14, 38, 10, 10, 14, 8, 6], 5.8, 0.13, [
        [3016, both('우찬', 'WOOCHAN'), 'artist/c1585729-b32a-4c3c-9343-7d543dabef82.png', 0.8, 0.007, 'KR'],
        [3013, both('애니', 'ANNIE'), 'artist/70d443f5-a721-450f-b219-421b90b9afe4.png', 0.7, 0.012, 'US'],
    ]],
    [263, both('크록티칼', 'CRTK'), 'artist-group/e653d8ff-459c-45dc-99ff-bf8bf6c7b7d2.png', 'mixed', 110, 0.005, [16, 30, 8, 12, 14, 10, 10], 4.6, 0.09, [
        [3828, both('이시연', 'LEE SIYEON'), 'artist/8b926b18-fb18-415d-b53e-fa2743d751b7.png', 0.85, 0.004, 'KR'],
        [3829, both('이원석', 'LEE WONSEOK'), 'artist/4b86ad15-05fa-4df2-aabd-5c14a0f697c0.png', 0.7, 0.006, 'TH'],
    ]],
];
// id, names, CDN key, daily, trend, shares, votes per daily voter, purchaser share
const soloRows: [number, Names, string, number, number, Shares, number, number][] = [
    [734, same('마크', 'MARK'), 'artist/14ae9545-7766-47dc-8331-8d06c994e0b9.png', 420, 0.004, [18, 22, 12, 8, 22, 10, 8], 6.4, 0.16],
    [3901, both('그윈 도라도', 'GWYN DORADO'), 'artist/f1b08459-1817-479e-8d2a-179f38100b56.png', 230, 0.012, [10, 8, 6, 8, 18, 42, 8], 5.4, 0.12],
];
const cdn = (key: string) => `https://cdn.picnic.fan/picnic/${key}`;
const boosted = (shares: Shares, market: Market) => shares.map((w, i) => (markets[i] === market ? w + 14 : w));
const groups: Profile[] = groupRows.map(([id, name, image, gender, daily, trend, shares, votesPerVoter, buyRate, members]) => ({
    subject: { entity: 'group', id: String(id), name, group_name: null },
    gender,
    image: cdn(image),
    daily,
    trend,
    shares,
    votesPerVoter,
    buyRate,
    members: members.map(([memberId, memberName, memberImage, ratio, change, market], j) => ({
        subject: { entity: 'artist', id: String(memberId), name: memberName, group_name: name },
        gender: null,
        image: cdn(memberImage),
        daily: Math.round(daily * ratio),
        trend: trend + change,
        shares: boosted(shares, market),
        votesPerVoter: votesPerVoter * (j ? 0.92 : 1.06),
        buyRate: buyRate * (j ? 0.9 : 1.05),
        members: [],
    })),
}));
const artists: Profile[] = [
    ...groups.flatMap((g) => g.members),
    ...soloRows.map(([id, name, image, daily, trend, shares, votesPerVoter, buyRate]): Profile => ({
        subject: { entity: 'artist', id: String(id), name, group_name: null },
        gender: null,
        image: cdn(image),
        daily,
        trend,
        shares,
        votesPerVoter,
        buyRate,
        members: [],
    })),
];
const profiles = [...groups, ...artists];
const catalog: Subject[] = profiles.map((p) => p.subject);

const day = 86400000;
const end = Date.UTC(2026, 10, 23);
const campaign = { id: '00000000-0000-4000-8000-000000000011', name: 'BABYMONSTER · Jakarta', shared: false };
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
    const showcase = Number(PREVIEW_SHOWCASE.id);
    if (req.type === 'campaigns') return req.id === showcase && req.entity === 'group' ? [campaign] : [];
    const f = req.filters,
        profile = profiles.find((p) => p.subject.entity === f.entity && p.subject.id === String(f.id)),
        subject = profile?.subject;
    if (!profile || !subject) return parseFandomReport({ status: 'not_found' });
    const linked = f.scope === 'campaign';
    if (linked && (f.campaign !== campaign.id || f.id !== showcase || f.country !== 'ALL'))
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
