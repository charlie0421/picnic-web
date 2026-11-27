import { SUPPORTED_LANGUAGES } from '@/config/settings';
import type { ChartCell } from './contract';

export const fandomMetrics = [
    'fans',
    'voters',
    'purchaser_voters',
    'votes',
    'viewers',
    'watch_seconds',
    'avg_watch_seconds',
    'paid_units',
    'returning_pct',
    'buyers',
    'repeat_pct',
    'ad_conversion_pct',
] as const;
export type FandomMetric = (typeof fandomMetrics)[number];
export interface Subject {
    entity: 'artist' | 'group';
    id: string;
    name: Record<string, string>;
    group_name: Record<string, string> | null;
}
export interface DetailOptions {
    entity: 'artist' | 'group';
    id: number;
    country: string;
    days: 7 | 30 | 90;
    mode: 'direct' | 'member_rollup';
    scope: 'fandom' | 'campaign';
    campaign: string | null;
}
export type FandomRequest =
    | { type: 'campaigns'; entity: Subject['entity']; id: number }
    | { type: 'search'; query: string }
    | { type: 'report'; filters: DetailOptions };
export type Money = { currency: string; amount: string };
export interface FandomReport {
    status: 'ready' | 'unavailable' | 'not_found';
    subject: Subject | null;
    as_of: string | null;
    country_basis: string | null;
    series_basis: string | null;
    report_period: { start: string; end: string } | null;
    activity_basis: 'assigned_campaign_activity_not_rolling_fandom' | null;
    activity_period: { start: string; end: string; days: 7 } | null;
    metrics: Record<FandomMetric, ChartCell>;
    metric_basis: Partial<Record<FandomMetric, string>>;
    series: { date: string; votes: ChartCell; voters: ChartCell }[];
    markets: {
        country: string;
        voters: ChartCell;
        buyers: ChartCell;
        paid_units: ChartCell;
        net_amounts: Money[];
    }[];
    ad_markets: { country: string; viewers: ChartCell }[];
    repeat_intervals: { band: string; count: ChartCell }[];
    net_amounts: Money[];
    campaigns: { id: string; name: string; shared: boolean }[];
}
const country = /^(ALL|UNKNOWN|[A-Z]{2})$/;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const none: ChartCell = { status: 'unavailable', value: null };
const fail = (): never => {
    throw new Error('Invalid fandom projection');
};
const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail();
const field = (v: unknown, max: number): string =>
    typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail();
const array = (v: unknown, max: number): unknown[] =>
    v == null ? [] : Array.isArray(v) && v.length <= max ? v : fail();
export function fandomParams(p: URLSearchParams): FandomRequest | null {
    const keys = Array.from(p.keys());
    if (new Set(keys).size !== keys.length) return null;
    if (p.has('campaigns')) {
        const id = p.get('id') ?? '',
            entity = p.get('entity');
        return keys.length === 3 &&
            p.get('campaigns') === '1' &&
            /^[1-9]\d{0,9}$/.test(id) &&
            Number(id) <= 2147483647 &&
            (entity === 'group' || entity === 'artist')
            ? { type: 'campaigns', entity, id: Number(id) }
            : null;
    }
    if (p.has('q')) {
        const q = p.get('q')!.normalize('NFKC').trim();
        return keys.length === 1 && q.length > 0 && q.length <= 64 ? { type: 'search', query: q } : null;
    }
    if (keys.some((k) => !['id', 'entity', 'country', 'days', 'mode', 'scope', 'campaign'].includes(k)))
        return null;
    const id = p.get('id') ?? '',
        entity = p.get('entity'),
        c = p.get('country') ?? 'ALL',
        days = p.get('days') ?? '30';
    const mode = p.get('mode') ?? 'direct',
        scope = p.get('scope') ?? 'fandom',
        campaign = p.get('campaign');
    if (
        !/^[1-9]\d{0,9}$/.test(id) ||
        Number(id) > 2147483647 ||
        !['artist', 'group'].includes(entity ?? '') ||
        !country.test(c) ||
        !['7', '30', '90'].includes(days) ||
        !['direct', 'member_rollup'].includes(mode) ||
        !['fandom', 'campaign'].includes(scope) ||
        (campaign !== null && (!uuid.test(campaign) || scope !== 'campaign'))
    )
        return null;
    return {
        type: 'report',
        filters: {
            entity: entity as DetailOptions['entity'],
            id: Number(id),
            country: c,
            days: Number(days) as DetailOptions['days'],
            mode: entity === 'artist' ? 'direct' : (mode as DetailOptions['mode']),
            scope: scope as DetailOptions['scope'],
            campaign,
        },
    };
}
function labels(v: unknown) {
    const result: Record<string, string> = {};
    for (const [k, val] of Object.entries(obj(v))) {
        if (
            (SUPPORTED_LANGUAGES as readonly string[]).includes(k) &&
            typeof val === 'string' &&
            val.length <= 250 &&
            val.trim()
        )
            result[k] = val;
    }
    return result;
}
function subject(v: unknown): Subject {
    const r = obj(v),
        id = field(r.id, 10);
    if (!/^[1-9]\d*$/.test(id) || (r.entity !== 'artist' && r.entity !== 'group')) return fail();
    return {
        id,
        entity: r.entity,
        name: labels(r.name),
        group_name: r.group_name == null ? null : labels(r.group_name),
    };
}
export function parseSubjects(v: unknown) {
    if (!Array.isArray(v)) return fail();
    return array(v, 100).map(subject);
}
function cell(v: unknown): ChartCell {
    if (v === undefined) return none;
    const c = obj(v);
    if (
        c.status === 'available' &&
        typeof c.value === 'number' &&
        Number.isFinite(c.value) &&
        c.value >= 0 &&
        c.value <= Number.MAX_SAFE_INTEGER
    )
        return { status: c.status, value: c.value };
    if ((c.status === 'suppressed' || c.status === 'unavailable') && c.value === null)
        return { status: c.status, value: null };
    return fail();
}
function money(v: unknown) {
    return array(v, 200).map((v) => {
        const r = obj(v);
        if (
            typeof r.currency !== 'string' ||
            !/^[A-Z]{3}$/.test(r.currency) ||
            typeof r.amount !== 'string' ||
            !/^\d{1,20}(\.\d{1,6})?$/.test(r.amount)
        )
            return fail();
        return { currency: r.currency, amount: r.amount };
    });
}
function period(value: unknown) {
    const p = obj(value);
    const start = field(p.start, 10),
        end = field(p.end, 10);
    if (!date.test(start) || !date.test(end) || end <= start) return fail();
    return { start, end };
}
function campaignWeek(raw: unknown) {
    const week = period(raw);
    if (
        obj(raw).days !== 7 ||
        Date.parse(week.end) - Date.parse(week.start) !== 7 * 86400000 ||
        new Date(week.start).getUTCDay() !== 1
    )
        return fail();
    return { ...week, days: 7 as const };
}
function countryField(v: unknown) {
    return typeof v === 'string' && country.test(v) ? v : fail();
}
export function parseFandomReport(v: unknown, scope?: DetailOptions['scope']): FandomReport {
    const r = obj(v),
        raw = obj(r.metrics ?? {}),
        bases = obj(r.metric_basis ?? {});
    if (r.status !== 'ready' && r.status !== 'not_found' && r.status !== 'unavailable') return fail();
    if (r.as_of != null && (typeof r.as_of !== 'string' || !Number.isFinite(Date.parse(r.as_of))))
        return fail();
    const metrics = Object.fromEntries(
        fandomMetrics.map((k) => [k, scope === 'fandom' && k === 'paid_units' ? none : cell(raw[k])]),
    ) as FandomReport['metrics'];
    const metric_basis = Object.fromEntries(
        fandomMetrics
            .filter((k) => typeof bases[k] === 'string' && !(scope === 'fandom' && k === 'paid_units'))
            .map((k) => [k, field(bases[k], 100)]),
    );
    const markets = array(r.markets, 260).map((v) => {
        const m = obj(v);
        return {
            country: countryField(m.country),
            voters: cell(m.voters),
            buyers: cell(m.buyers),
            paid_units: scope === 'fandom' ? none : cell(m.paid_units),
            net_amounts: scope === 'fandom' ? [] : money(m.net_amounts),
        };
    });
    const series = array(r.series, 181).map((v) => {
        const d = obj(v);
        if (typeof d.date !== 'string' || !date.test(d.date)) return fail();
        return { date: d.date, votes: cell(d.votes), voters: cell(d.voters) };
    });
    const activityBasis = r.activity_basis ?? null;
    if (activityBasis !== null && activityBasis !== 'assigned_campaign_activity_not_rolling_fandom')
        return fail();
    if ((activityBasis === null) !== (r.activity_period == null)) return fail();
    return {
        status: r.status,
        subject: r.subject == null ? null : subject(r.subject),
        as_of: (r.as_of as string | null) ?? null,
        series,
        markets,
        metrics,
        metric_basis,
        activity_basis: activityBasis,
        activity_period: r.activity_period == null ? null : campaignWeek(r.activity_period),
        report_period: r.report_period == null ? null : period(r.report_period),
        country_basis: r.country_basis == null ? null : field(r.country_basis, 100),
        series_basis: r.series_basis == null ? null : field(r.series_basis, 100),
        ad_markets: array(r.ad_markets, 260).map((v) => {
            const m = obj(v);
            return { country: countryField(m.country), viewers: cell(m.viewers) };
        }),
        repeat_intervals: array(r.repeat_intervals, 10).map((v) => {
            const m = obj(v);
            return { band: field(m.band, 40), count: cell(m.count) };
        }),
        net_amounts: scope === 'fandom' ? [] : money(r.net_amounts),
        campaigns: array(r.campaigns, 200).map((v) => {
            const m = obj(v),
                id = field(m.id, 36);
            if (!uuid.test(id)) return fail();
            return { id, name: field(m.name, 250), shared: m.shared === true };
        }),
    };
}
export function fandomDetailHref(
    locale: string,
    row: Pick<Subject, 'id' | 'entity'>,
    days: number,
    c: string,
    mode: string,
) {
    const p = new URLSearchParams({
        id: row.id,
        entity: row.entity,
        days: String(days),
        country: c,
        mode: row.entity === 'artist' ? 'direct' : mode,
    });
    return '/' + locale + '/charts/artists?' + p.toString();
}
