'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, ChevronLeft, Globe2, Search, Radio, Users, CreditCard, Activity } from 'lucide-react';
import {
    fandomDetailHref,
    fandomParams,
    parseFandomReport,
    parseSubjects,
    type Subject,
    type FandomMetric,
    type FandomReport,
} from '@/lib/charts/fandom';
import type { ChartCell } from '@/lib/charts/contract';
import type { ChartCopy } from '@/lib/charts/copy';
import type { FandomCopy } from '@/lib/charts/fandom-copy';
// Natural Earth 1:110m Admin 0 map units, public domain (naturalearthdata.com).
import paths from '@/lib/charts/world-paths.json';
import styles from './fandom.module.css';

type Props = { locale: string; chart: ChartCopy; copy: FandomCopy; preview: boolean };
type Campaign = FandomReport['campaigns'][number];
type RequestState<T> = { key: string; data?: T; error?: number };
const groups: {
    title: 'audience' | 'adAudience' | 'paidImpact';
    keys: FandomMetric[];
    icon: typeof Users;
}[] = [
    { title: 'audience', keys: ['fans', 'voters', 'votes', 'returning_pct'], icon: Users },
    {
        title: 'adAudience',
        keys: ['viewers', 'watch_seconds', 'avg_watch_seconds', 'ad_conversion_pct'],
        icon: Radio,
    },
    { title: 'paidImpact', keys: ['buyers', 'repeat_pct', 'paid_units'], icon: CreditCard },
];
const isoCountries =
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
        ' ',
    );
function useProjection<T>(query: string, parse: (raw: unknown) => T, delay = 0) {
    const [state, setState] = useState<RequestState<T>>({ key: '' });
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        if (!query) return;
        let active = true;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const r = await fetch('/api/kpop-chart/fandom?' + query, {
                    signal: controller.signal,
                    cache: 'no-store',
                    credentials: 'same-origin',
                });
                if (!r.ok) {
                    if (active) setState({ key: query, error: r.status });
                    return;
                }
                const data = parse(await r.json());
                if (active) setState({ key: query, data });
            } catch {
                if (active) setState({ key: query, error: 503 });
            }
        }, delay);
        return () => {
            active = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, revision, parse, delay]);
    return {
        data: state.key === query ? state.data : undefined,
        error: state.key === query ? state.error : undefined,
        retry: () => {
            setState({ key: '' });
            setRevision((v) => v + 1);
        },
    };
}
function campaignsFrom(value: unknown): Campaign[] {
    return parseFandomReport({ status: 'ready', campaigns: value }).campaigns;
}
function label(names: Record<string, string> | null | undefined, locale: string) {
    return names?.[locale] || names?.en || names?.ko || Object.values(names || {})[0] || '—';
}

export default function FandomExplorer({ locale, chart: c, copy: f, preview }: Props) {
    const params = useSearchParams();
    const router = useRouter(),
        path = usePathname();
    const query = params.toString();
    const parsed = fandomParams(new URLSearchParams(query));
    const selected = parsed?.type === 'report' ? parsed.filters : null;
    const [input, setInput] = useState('');
    const search = useProjection(
        input.trim() ? new URLSearchParams({ q: input.trim() }).toString() : '',
        parseSubjects,
        220,
    );
    const company = selected?.scope === 'campaign';
    const campaigns = useProjection(
        company && selected
            ? new URLSearchParams({
                  campaigns: '1',
                  entity: selected.entity,
                  id: String(selected.id),
              }).toString()
            : '',
        campaignsFrom,
    );
    const report = useProjection(selected && (!company || selected.campaign) ? query : '', parseFandomReport);
    const data = report.data;
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const regions = new Intl.DisplayNames([locale], { type: 'region' });
    const market = (code: string) =>
        code === 'ALL' ? c.allCountries : code === 'UNKNOWN' ? c.unknownCountry : regions.of(code) || code;
    const cell = (v?: ChartCell, k?: FandomMetric) =>
        !v || v.status !== 'available' || v.value === null
            ? c[v?.status === 'suppressed' ? 'suppressed' : 'unavailable']
            : number.format(v.value) +
              (k?.endsWith('_pct') ? '%' : k?.endsWith('seconds') ? ' ' + f.seconds : '');
    const metric = (key: FandomMetric) => (key === 'votes' || key === 'voters' ? c[key] : f[key]);
    const navigate = (changes: Record<string, string | null>) => {
        const next = new URLSearchParams(query);
        Object.entries(changes).forEach(([key, value]) => {
            if (value === null) next.delete(key);
            else next.set(key, value);
        });
        router.push(path + '?' + next, { scroll: false });
    };
    const rankedHref = (s: Subject) =>
        fandomDetailHref(
            locale,
            s,
            selected?.days || 30,
            selected?.country || 'ALL',
            s.entity === 'group' ? 'member_rollup' : 'direct',
        );
    const subject = data?.subject;
    const dates = data?.series ?? [];
    const geo = data?.ad_markets ?? [];
    const geoValues = new Map(geo.map((m) => [m.country, m.viewers.value]));
    const peak = Math.max(1, ...geo.map((m) => m.viewers.value ?? 0));
    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <a className={styles.back} href={'/' + locale + '/charts'}>
                    <ChevronLeft size={16} />
                    {c.title}
                </a>
                <header className={styles.header}>
                    <div>
                        <h1>{f.explore}</h1>
                        {preview && <p className={styles.sample}>{c.sampleBadge}</p>}
                    </div>
                    <form onSubmit={(e) => e.preventDefault()} role="search">
                        <label htmlFor="fandom-search">{f.search}</label>
                        <div className={styles.input}>
                            <Search size={20} />
                            <input
                                id="fandom-search"
                                type="search"
                                placeholder={f.searchHint}
                                value={input}
                                maxLength={64}
                                onChange={(e) => setInput(e.target.value)}
                            />
                        </div>
                    </form>
                </header>
                {input.trim() && (
                    <section className={styles.matches} aria-label={f.search} aria-live="polite">
                        {search.error ? (
                            <button onClick={search.retry}>
                                {c.error} · {c.retry}
                            </button>
                        ) : !search.data ? (
                            c.loading
                        ) : !search.data.length ? (
                            f.noMatches
                        ) : (
                            search.data.map((s) => (
                                <a key={s.entity + s.id} href={rankedHref(s)}>
                                    <span className={styles.type}>{c[s.entity]}</span>
                                    <strong>{label(s.name, locale)}</strong>
                                    {s.group_name && <small>{label(s.group_name, locale)}</small>}
                                    <ArrowUpRight size={15} />
                                </a>
                            ))
                        )}
                    </section>
                )}
                {!selected && !input.trim() && (
                    <div className={styles.empty}>
                        <Search size={34} />
                        <p>{f.searchHint}</p>
                        {preview && (
                            <a
                                href={fandomDetailHref(
                                    locale,
                                    { id: '11', entity: 'group' },
                                    30,
                                    'ID',
                                    'member_rollup',
                                )}
                            >
                                VELA NINE ↗
                            </a>
                        )}
                    </div>
                )}
                {selected && (
                    <>
                        <section className={styles.controls}>
                            <div className={styles.identity}>
                                <span>{c[selected.entity]}</span>
                                <h2>{label(subject?.name, locale)}</h2>
                                {subject?.group_name && <p>{label(subject.group_name, locale)}</p>}
                            </div>
                            <div className={styles.scope}>
                                {(['fandom', 'campaign'] as const).map((scope) => (
                                    <button
                                        key={scope}
                                        aria-pressed={selected.scope === scope}
                                        onClick={() =>
                                            navigate({
                                                scope,
                                                campaign: null,
                                                ...(scope === 'campaign'
                                                    ? { country: 'ALL', days: '7' }
                                                    : {}),
                                            })
                                        }
                                    >
                                        {scope === 'fandom' ? f.fanScope : f.campaignScope}
                                    </button>
                                ))}
                            </div>
                            <p>{company ? f.campaignNote : f.fanNote}</p>
                            {data?.report_period && (
                                <p>
                                    {data.report_period.start} –{' '}
                                    {new Date(Date.parse(data.report_period.end) - 86400000)
                                        .toISOString()
                                        .slice(0, 10)}{' '}
                                    UTC
                                </p>
                            )}
                            <div className={styles.filters}>
                                <label>
                                    {c.country}
                                    <select
                                        disabled={company}
                                        value={selected.country}
                                        onChange={(e) => navigate({ country: e.target.value })}
                                    >
                                        {['ALL', 'UNKNOWN', ...isoCountries].map((x) => (
                                            <option key={x} value={x}>
                                                {market(x)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    {c.period}
                                    <select
                                        disabled={company}
                                        value={selected.days}
                                        onChange={(e) => navigate({ days: e.target.value })}
                                    >
                                        {[7, 30, 90].map((n) => (
                                            <option key={n} value={n}>
                                                {c.days.replace('{days}', String(n))}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {selected.entity === 'group' && !company && (
                                    <label>
                                        {c.groupMode}
                                        <select
                                            value={selected.mode}
                                            onChange={(e) => navigate({ mode: e.target.value })}
                                        >
                                            <option value="direct">{c.direct}</option>
                                            <option value="member_rollup">{c.memberRollup}</option>
                                        </select>
                                    </label>
                                )}
                                {company && (
                                    <label>
                                        {f.choose}
                                        <select
                                            disabled={!campaigns.data?.length}
                                            value={selected.campaign || ''}
                                            onChange={(e) => navigate({ campaign: e.target.value || null })}
                                        >
                                            <option value="">{f.choose}</option>
                                            {campaigns.data?.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name}
                                                    {a.shared ? ' · ' + f.shared : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </div>
                        </section>
                        <div role="status">
                            {report.error || campaigns.error ? (
                                <div className={styles.notice}>
                                    {report.error === 403 || campaigns.error === 403 ? (
                                        f.forbidden
                                    ) : (
                                        <button
                                            onClick={() => {
                                                report.retry();
                                                campaigns.retry();
                                            }}
                                        >
                                            {c.error} · {c.retry}
                                        </button>
                                    )}
                                </div>
                            ) : company && !selected.campaign ? (
                                <p className={styles.notice}>
                                    {campaigns.data?.length
                                        ? f.choose
                                        : campaigns.data
                                          ? f.forbidden
                                          : c.loading}
                                </p>
                            ) : !data ? (
                                <p className={styles.notice}>{c.loading}</p>
                            ) : data.status !== 'ready' ? (
                                <p className={styles.notice}>
                                    {data.status === 'not_found' ? f.noMatches : c.unavailable}
                                </p>
                            ) : null}
                        </div>
                        {data?.status === 'ready' && (
                            <>
                                <div className={styles.meta}>
                                    <p>
                                        {data.country_basis === 'profile_at_publication'
                                            ? c.profileCountryNote
                                            : c.countryNote}
                                    </p>
                                    {data.as_of && (
                                        <time dateTime={data.as_of}>
                                            {c.published} ·{' '}
                                            {new Intl.DateTimeFormat(locale, {
                                                dateStyle: 'medium',
                                                timeZone: 'UTC',
                                            }).format(new Date(data.as_of))}{' '}
                                            UTC
                                        </time>
                                    )}
                                </div>
                                <div className={styles.metrics}>
                                    {groups.map((g) => (
                                        <section key={g.title}>
                                            <h3>
                                                <g.icon size={20} />
                                                {f[g.title]}
                                            </h3>
                                            <dl>
                                                {g.keys.map((k) => (
                                                    <div key={k}>
                                                        <dt>{metric(k)}</dt>
                                                        <dd
                                                            data-available={
                                                                data.metrics[k].status === 'available'
                                                            }
                                                        >
                                                            {cell(data.metrics[k], k)}
                                                        </dd>
                                                    </div>
                                                ))}
                                                {g.title === 'paidImpact' && (
                                                    <div>
                                                        <dt>{f.net}</dt>
                                                        <dd>
                                                            {data.net_amounts
                                                                .map((m) => m.currency + ' ' + m.amount)
                                                                .join(' · ') || c.unavailable}
                                                        </dd>
                                                    </div>
                                                )}
                                            </dl>
                                        </section>
                                    ))}
                                </div>
                                <div className={styles.grid}>
                                    <section className={styles.card}>
                                        <h3>
                                            <Activity />
                                            {f.history}
                                        </h3>
                                        <p>
                                            {data.series_basis === 'published_window'
                                                ? f.publishedWindow
                                                : data.series_basis === 'utc_daily'
                                                  ? f.daily
                                                  : c.periodNote}
                                        </p>
                                        <Series points={dates} label={c.voters} empty={c.noTrend} />
                                        {dates.length > 0 && (
                                            <details>
                                                <summary>{c.trendTable}</summary>
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>{c.date}</th>
                                                            <th>{c.voters}</th>
                                                            <th>{c.votes}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dates.map((d) => (
                                                            <tr key={d.date}>
                                                                <th>{d.date}</th>
                                                                <td>{cell(d.voters)}</td>
                                                                <td>{cell(d.votes)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </details>
                                        )}
                                    </section>
                                    <section className={styles.card}>
                                        <h3>
                                            <Globe2 />
                                            {f.adsRegion}
                                        </h3>
                                        <svg
                                            viewBox="0 0 360 145"
                                            role="img"
                                            aria-label={f.adsRegion}
                                            className={styles.map}
                                        >
                                            {paths.map((p, i) => {
                                                const v = geoValues.get(p.code);
                                                return (
                                                    <path
                                                        key={i}
                                                        d={p.shape}
                                                        fill={
                                                            v != null
                                                                ? 'hsl(257,49%,' +
                                                                  (78 - (40 * v) / peak) +
                                                                  '%)'
                                                                : '#e5e4ef'
                                                        }
                                                        stroke="#fff"
                                                        strokeWidth=".3"
                                                    />
                                                );
                                            })}
                                        </svg>
                                        {geo.length ? (
                                            <dl className={styles.bars}>
                                                {geo.map((m) => (
                                                    <div key={m.country}>
                                                        <dt>{market(m.country)}</dt>
                                                        <dd>
                                                            <i
                                                                style={{
                                                                    width:
                                                                        ((m.viewers.value ?? 0) / peak) *
                                                                            100 +
                                                                        '%',
                                                                }}
                                                            />
                                                            <span>{cell(m.viewers)}</span>
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : (
                                            <p>{c.unavailable}</p>
                                        )}
                                    </section>
                                    <section className={styles.card}>
                                        <h3>{f.repeatInterval}</h3>
                                        {data.repeat_intervals.length ? (
                                            <dl className={styles.rows}>
                                                {data.repeat_intervals
                                                    .filter((x) => x.band !== 'first_observed')
                                                    .map((x) => (
                                                        <div key={x.band}>
                                                            <dt>
                                                                {x.band === 'under_1d'
                                                                    ? f.oneDay
                                                                    : x.band === '1_to_7d'
                                                                      ? f.oneWeek
                                                                      : f.later}
                                                            </dt>
                                                            <dd>{cell(x.count)}</dd>
                                                        </div>
                                                    ))}
                                            </dl>
                                        ) : (
                                            <p>{c.unavailable}</p>
                                        )}
                                    </section>
                                    <section className={styles.card}>
                                        <h3>{f.marketValue}</h3>
                                        {data.markets.length ? (
                                            <div className={styles.scroll}>
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>{c.country}</th>
                                                            <th>{c.voters}</th>
                                                            <th>{f.buyers}</th>
                                                            <th>{f.paid_units}</th>
                                                            <th>{f.net}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {data.markets.map((m) => (
                                                            <tr key={m.country}>
                                                                <th>{market(m.country)}</th>
                                                                <td>{cell(m.voters)}</td>
                                                                <td>{cell(m.buyers)}</td>
                                                                <td>{cell(m.paid_units)}</td>
                                                                <td>
                                                                    {m.net_amounts
                                                                        .map(
                                                                            (x) =>
                                                                                x.currency + ' ' + x.amount,
                                                                        )
                                                                        .join(' · ') || c.unavailable}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p>{c.unavailable}</p>
                                        )}
                                    </section>
                                </div>
                                <p className={styles.note}>
                                    {f.coverage} {c.purchaserNote}
                                </p>
                            </>
                        )}
                    </>
                )}
                <footer>
                    <a href={'/' + locale + '/charts/business'}>{c.b2bAction} ↗</a>
                </footer>
            </div>
        </div>
    );
}

function Series({ points, label, empty }: { points: FandomReport['series']; label: string; empty: string }) {
    const max = Math.max(1, ...points.map((p) => p.voters.value ?? 0));
    if (!points.some((p) => p.voters.value !== null)) return <p>{empty}</p>;
    const x = (i: number) => 12 + (points.length > 1 ? i / (points.length - 1) : 0.5) * 456;
    const y = (v: number) => 123 - (v / max) * 100;
    return (
        <svg viewBox="0 0 480 144" className={styles.series} role="img" aria-label={label}>
            {[23, 73, 123].map((n) => (
                <line key={n} x1="10" x2="470" y1={n} y2={n} stroke="#e2ddec" strokeDasharray="3 4" />
            ))}
            {points.map((p, i) => {
                const v = p.voters.value,
                    last = points[i - 1];
                if (v === null) return null;
                return (
                    <g key={p.date}>
                        {last?.voters.value != null &&
                            Date.parse(p.date) - Date.parse(last.date) === 86400000 && (
                                <line
                                    x1={x(i - 1)}
                                    y1={y(last.voters.value)}
                                    x2={x(i)}
                                    y2={y(v)}
                                    stroke="#7458cc"
                                    strokeWidth="3"
                                />
                            )}
                        <circle cx={x(i)} cy={y(v)} r="3" fill="#58439e">
                            <title>
                                {p.date} · {v}
                            </title>
                        </circle>
                    </g>
                );
            })}
        </svg>
    );
}
