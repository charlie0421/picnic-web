'use client';

import { useEffect, useId, useState } from 'react';
import Image from 'next/image';
import { Activity, BarChart3, Building2, Globe2, Info, LockKeyhole, RefreshCw, Sparkles, Users } from 'lucide-react';
import { chartFreshness, DEFAULT_CHART_FILTERS, parseChartSnapshot, type ChartCell, type ChartFilters, type ChartMetric, type ChartSnapshot } from '@/lib/charts/contract';
import type { ChartCopy } from '@/lib/charts/copy';
import styles from './charts.module.css';

type Result = { key: string; state: 'loading' | 'error' | 'loaded'; snapshot?: ChartSnapshot };
const metrics: ChartMetric[] = ['voters', 'votes', 'purchaser_voters'];

export default function ChartDashboard({ locale, copy: c }: { locale: string; copy: ChartCopy }) {
  const [filters, setFilters] = useState<ChartFilters>(DEFAULT_CHART_FILTERS);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result>({ key: '', state: 'loading' });
  const key = JSON.stringify(filters);
  const [countries, setCountries] = useState(['ALL']);
  const [periods, setPeriods] = useState<(7 | 30 | 90)[]>([7, 30, 90]);
  const [clock, setClock] = useState<number | null>(null);
  const candidate = result.key === key && result.state === 'loaded' ? result.snapshot : undefined;
  const expired = !!(candidate && clock !== null && chartFreshness(candidate, clock) === 'expired');
  const state = expired ? 'error' : result.key === key ? result.state : 'loading';
  const snapshot = expired ? undefined : candidate;
  const titleId = useId();
  const number = new Intl.NumberFormat(locale);
  const signed = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setResult({ key, state: 'loading' });
    const params = new URLSearchParams(Object.entries(filters).map(([name, value]) => [name, String(value)]));
    fetch(`/api/kpop-chart?${params}`, { signal: controller.signal, credentials: 'omit', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Snapshot unavailable');
        return parseChartSnapshot(await response.json(), filters);
      })
      .then(data => {
        if (!active) return;
        setCountries(Array.from(new Set(['ALL', ...data.available_countries, filters.country])));
        setPeriods(Array.from(new Set([...data.available_days, filters.days])).sort((a, b) => a - b));
        setClock(Date.now());
        setResult({ key, state: 'loaded', snapshot: data });
      })
      .catch(() => { if (active) setResult({ key, state: 'error' }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [key, retry]); // key contains every filter; old requests cannot replace the current result.

  useEffect(() => {
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const change = <K extends keyof ChartFilters>(name: K, value: ChartFilters[K]) => setFilters(previous => ({ ...previous, [name]: value, ...(name === 'entity' && value === 'artist' ? { group_mode: 'direct', group_gender: 'all' } : {}) }));
  const textCell = (value?: ChartCell, growth = false) => !value ? '—' : value.status !== 'available' || value.value === null ? c[value.status === 'suppressed' ? 'suppressed' : 'unavailable'] : growth ? `${signed.format(value.value)}%` : number.format(value.value);
  const countryName = (code: string) => {
    if (code === 'ALL') return c.allCountries;
    if (code === 'UNKNOWN') return c.unknownCountry;
    try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code; } catch { return code; }
  };
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  const lastDay = snapshot ? new Date(Date.parse(snapshot.period.end) - 86400000).toISOString().slice(0, 10) : null;
  const stale = !!(snapshot?.refresh_due_at && clock !== null && clock > Date.parse(snapshot.refresh_due_at));
  const max = Math.max(1, ...(snapshot?.rankings ?? []).map(row => row.value.status === 'available' ? row.value.value ?? 0 : 0));
  const selectedLabel = c[filters.metric];

  return (
    <section className={styles.dashboard} aria-labelledby={titleId}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroOrbit} aria-hidden="true"><Globe2 size={132} strokeWidth={0.65} /></div>
          <div className={styles.eyebrow}><span className={styles.heroMark}>PICNIC</span> FAN INTELLIGENCE <span className={styles.free}>{c.free}</span></div>
          <h1 id={titleId}>{c.title}</h1>
          <p>{c.subtitle}</p>
          <div className={styles.publication}><span>{c.published}</span><strong>{snapshot?.published_at ? `${formatDate(snapshot.published_at)} UTC` : c.unpublished}</strong></div>
        </section>

        <section className={styles.filters} aria-label={`${c.country} · ${c.period}`}>
          <div className={styles.filterGrid}>
            <label><span><Globe2 size={15} aria-hidden="true" />{c.country}</span><select value={filters.country} onChange={e => change('country', e.target.value)}>{countries.map(code => <option key={code} value={code}>{countryName(code)}</option>)}</select></label>
            <label><span>{c.period}</span><select value={filters.days} onChange={e => change('days', Number(e.target.value) as ChartFilters['days'])}>{periods.map(days => <option key={days} value={days}>{c.days.replace('{days}', String(days))}</option>)}</select></label>
            <label><span>{c.entity}</span><select value={filters.entity} onChange={e => change('entity', e.target.value as ChartFilters['entity'])}><option value="artist">{c.artist}</option><option value="group">{c.group}</option></select></label>
            <label><span>{c.metric}</span><select value={filters.metric} onChange={e => change('metric', e.target.value as ChartMetric)}>{metrics.map(metric => <option key={metric} value={metric}>{c[metric]}</option>)}</select></label>
          </div>
          {filters.entity === 'group' && <div className={styles.groupFilters}>
            <fieldset><legend>{c.groupMode}</legend>{(['direct', 'member_rollup'] as const).map(mode => <label key={mode}><input type="radio" name="group-mode" value={mode} checked={filters.group_mode === mode} onChange={() => change('group_mode', mode)} />{mode === 'direct' ? c.direct : c.memberRollup}</label>)}</fieldset>
            <label className={styles.gender}><span>{c.gender}</span><select value={filters.group_gender} onChange={e => change('group_gender', e.target.value as ChartFilters['group_gender'])}><option value="all">{c.allGenders}</option>{(['male', 'female', 'mixed'] as const).map(gender => <option key={gender} value={gender}>{c[gender]}</option>)}</select></label>
          </div>}
          <div className={styles.periodCaption}><span>{snapshot && lastDay ? `${formatDate(snapshot.period.start)} – ${formatDate(lastDay)} · UTC` : c.periodNote}</span><span>{filters.entity === 'artist' ? c.artistNote : c.groupNote}</span></div>
          {snapshot?.published_at && <p className={styles.dailyNote}>{snapshot.country_basis === 'profile_at_publication' ? c.profileCountryNote : c.countryNote}</p>}
        </section>

        <div aria-live="polite" aria-atomic="true" className={styles.status}>
          {state === 'loading' && <span className={styles.loading}><RefreshCw size={16} aria-hidden="true" />{c.loading}</span>}
          {state === 'error' && <div className={styles.warning}><Info size={18} aria-hidden="true" /><span>{c.error}</span><button type="button" onClick={() => setRetry(v => v + 1)}>{c.retry}</button></div>}
          {snapshot?.status === 'empty' && <div className={styles.notice}>{c.empty}</div>}
          {snapshot?.status === 'suppressed' && <div className={styles.notice}><LockKeyhole size={17} aria-hidden="true" />{c.suppressed} · {c.privacyNote}</div>}
          {stale && <div className={styles.warning}><Info size={17} aria-hidden="true" />{c.stale}<button type="button" onClick={() => setRetry(v => v + 1)}>{c.retry}</button></div>}
        </div>

        <p className={styles.dailyNote}>{c.precision}</p>
        <section className={styles.stats} aria-label={c.metric} aria-busy={state === 'loading'}>
          {[...metrics, 'growth_pct' as const].map((metric, index) => <article key={metric} className={index === 0 ? styles.statPrimary : styles.stat}>
            <span className={styles.statLabel}>{index === 0 ? <Users size={17} aria-hidden="true" /> : index === 3 ? <Activity size={17} aria-hidden="true" /> : <BarChart3 size={17} aria-hidden="true" />}{metric === 'growth_pct' ? c.growth : c[metric]}</span>
            <strong>{textCell(snapshot?.summary[metric], metric === 'growth_pct')}</strong>
            <span className={styles.statNote}>{metric === 'voters' ? c.votersNote : metric === 'purchaser_voters' ? c.purchaserNote : metric === 'growth_pct' ? c.growthNote : c.votes}</span>
          </article>)}
        </section>

        <div className={styles.chartsGrid}>
          <section className={styles.panel} aria-busy={state === 'loading'}>
            <div className={styles.panelHeader}><div><span className={styles.sectionKicker}>PICNIC CHART</span><h2>{c.ranking}</h2></div><span className={styles.tag}>{selectedLabel}</span></div>
            <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={c.ranking}><table className={styles.ranking}><caption className={styles.srOnly}>{c.ranking} · {selectedLabel}</caption><thead><tr><th scope="col">#</th><th scope="col">{c.name}</th><th scope="col">{c.value}</th><th scope="col">{c.growth}</th></tr></thead><tbody>
              {snapshot?.rankings.map((row, index) => {
                const name = row.name[locale] || row.name.en || row.name.ko || Object.values(row.name)[0] || '—';
                return <tr key={row.id}><td><span className={index < 3 ? styles.topRank : styles.rank}>{row.rank ?? '—'}</span></td><th scope="row"><div className={styles.artistCell}><ArtistAvatar key={row.image_url ?? ''} name={name} image={row.image_url} /><div><strong>{name}</strong><span>{row.entity === 'group' ? row.gender ? c[row.gender] : c.unknownGender : c.artist}</span><div className={styles.track} aria-hidden="true">{row.value.status === 'available' && <div style={{ width: `${((row.value.value ?? 0) / max) * 100}%` }} />}</div></div></div></th><td className={styles.numeric}>{textCell(row.value)}</td><td className={styles.growth}>{textCell(row.growth_pct, true)}</td></tr>;
              })}
              {!snapshot?.rankings.length && <tr><td colSpan={4} className={styles.emptyCell}><BarChart3 size={32} aria-hidden="true" /><p>{state === 'loading' ? c.loading : state === 'error' ? c.error : snapshot?.status === 'suppressed' ? c.suppressed : c.empty}</p></td></tr>}
            </tbody></table></div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.sectionKicker}>FAN MOMENTUM</span><h2>{c.trend}</h2></div><Activity size={21} aria-hidden="true" /></div>
            <p className={styles.trendMetric}>{selectedLabel}</p>
            <Trend series={snapshot?.series ?? []} label={c.trend} locale={locale} empty={state === 'loading' ? c.loading : c.noTrend} />
            <p className={styles.dailyNote}>{c.dailyNote}</p>
            {!!snapshot?.series.length && <details className={styles.trendDetails}><summary>{c.trendTable}</summary><div className={styles.tableScroll} tabIndex={0} role="region" aria-label={c.trendTable}><table><thead><tr><th scope="col">{c.date} UTC</th><th scope="col">{selectedLabel}</th></tr></thead><tbody>{snapshot.series.map(point => <tr key={point.date}><th scope="row">{formatDate(point.date)}</th><td>{textCell(point.value)}</td></tr>)}</tbody></table></div></details>}
          </section>
        </div>

        <section className={styles.methodology} aria-labelledby="chart-methodology"><div><Info size={18} aria-hidden="true" /><h2 id="chart-methodology">{c.methodology}</h2></div><p>{c.coverage}</p><div className={styles.methodGrid}><p>{c.periodNote}</p><p>{c.votersNote} {c.growthNote}</p><p>{c.purchaserNote}</p><p>{c.groupNote}</p><p>{c.privacyNote}</p></div></section>

        <div className={styles.businessGrid}>
          <section className={styles.business}><Building2 size={25} aria-hidden="true" /><span className={styles.sectionKicker}>PICNIC FOR BUSINESS</span><h2>{c.b2bTitle}</h2><p>{c.b2bBody}</p><a href={`/${locale}/charts/business`}>{c.b2bAction}</a></section>
          <section className={styles.sample}><Sparkles size={25} aria-hidden="true" /><span className={styles.sampleBadge}>{c.sampleBadge}</span><h2>{c.sampleTitle}</h2><p>{c.sampleBody}</p><details><summary>{c.sampleOpen}</summary><div className={styles.sampleReport}><strong>{c.sampleBadge}</strong><p>{c.sampleWarning}</p><dl><dt>{c.period}</dt><dd>{c.samplePeriod}</dd><dt>{c.entity}</dt><dd>{c.sampleEntity}</dd><dt>{c.country}</dt><dd>{c.sampleCountry}</dd></dl><SampleDistribution title={c.sampleAge} locale={locale} rows={[['18–24', 47], ['25–34', 38], ['35+', 15]]} />
            <SampleDistribution title={c.sampleGender} locale={locale} rows={[[c.female, 65], [c.male, 30], [c.sampleUndisclosed, 5]]} />
            <p>{c.sampleMarket}</p><p>{c.sampleAudience}</p><p>{c.sampleHypothesis}</p><p>{c.sampleConclusion}</p></div></details></section>
        </div>
      </div>
    </section>
  );
}

function SampleDistribution({ title, locale, rows }: {
  title: string;
  locale: string;
  rows: [string, number][];
}) {
  const format = new Intl.NumberFormat(locale, { style: 'percent' });
  return (
    <figure className={styles.sampleFigure}>
      <figcaption>{title}</figcaption>
      {rows.map(([label, share]) => (
        <div className={styles.sampleBarRow} key={label}>
          <span>{label}</span>
          <span className={styles.sampleBarTrack} aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
          <strong>{format.format(share / 100)}</strong>
        </div>
      ))}
    </figure>
  );
}

function Trend({ series, label, locale, empty }: { series: ChartSnapshot['series']; label: string; locale: string; empty: string }) {
  const id = useId();
  const points = series.filter(point => point.value.status === 'available' && point.value.value !== null);
  if (!points.length) return <div className={styles.trendEmpty}><Activity size={34} aria-hidden="true" /><p>{empty}</p></div>;
  const max = Math.max(1, ...points.map(point => point.value.value!));
  const first = Date.parse(series[0].date), last = Date.parse(series[series.length - 1].date);
  const x = (day: string) => 24 + ((Date.parse(day) - first) / Math.max(86400000, last - first)) * 432;
  const y = (value: number) => 178 - (value / max) * 148;
  return <svg className={styles.trendSvg} viewBox="0 0 480 215" role="img" aria-labelledby={id}>
    <title id={id}>{label}</title>
    <text x="24" y="20" fontSize="12" fill="#655f76">{new Intl.NumberFormat(locale).format(max)}</text>
    <text x="10" y="181" fontSize="12" fill="#655f76">0</text>
    {[30, 79, 128, 178].map(line => <line key={line} x1="24" x2="456" y1={line} y2={line} stroke="#e9e6f2" strokeDasharray="4 5" />)}
    {series.map((point, index) => {
      if (point.value.status !== 'available' || point.value.value === null) return null;
      const previous = series[index - 1];
      const join = previous?.value.status === 'available' && previous.value.value !== null && Date.parse(point.date) - Date.parse(previous.date) === 86400000;
      return <g key={point.date}>{join && <line x1={x(previous.date)} y1={y(previous.value.value!)} x2={x(point.date)} y2={y(point.value.value)} stroke="#6d4ee8" strokeWidth="3" />}<circle cx={x(point.date)} cy={y(point.value.value)} r="4" fill="#6d4ee8" /></g>;
    })}
    <text x="24" y="205" fontSize="12" fill="#655f76">{series[0].date}</text><text x="456" y="205" textAnchor="end" fontSize="12" fill="#655f76">{series[series.length - 1].date}</text>
  </svg>;
}

function ArtistAvatar({ name, image }: { name: string; image?: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.avatar} aria-hidden="true">{image && !failed ? <Image src={image} width={40} height={40} alt="" onError={() => setFailed(true)} /> : Array.from(name).slice(0, 2).join('')}</span>;
}
