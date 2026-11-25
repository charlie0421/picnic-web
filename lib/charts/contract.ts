import { SUPPORTED_LANGUAGES } from '@/config/settings';

export type ChartMetric = 'voters' | 'votes' | 'purchaser_voters';
export type ChartGender = 'male' | 'female' | 'mixed' | null;
export interface ChartFilters {
  country: string;
  days: 7 | 30 | 90;
  entity: 'artist' | 'group';
  group_mode: 'direct' | 'member_rollup';
  group_gender: 'all' | 'male' | 'female' | 'mixed';
  metric: ChartMetric;
}
export interface ChartCell { status: 'available' | 'suppressed' | 'unavailable'; value: number | null }
export interface ChartSnapshot {
  schema_version: 1;
  country_basis: 'profile_at_publication' | 'vote_time_verified';
  status: 'ready' | 'empty' | 'suppressed';
  published_at: string | null;
  refresh_due_at: string | null;
  period: { start: string; end: string; days: 7 | 30 | 90 };
  filters: Omit<ChartFilters, 'days'>;
  available_countries: string[];
  available_days: (7 | 30 | 90)[];
  summary: Record<ChartMetric | 'growth_pct', ChartCell>;
  rankings: { id: string; name: Record<string, string>; image_url?: string | null; entity: 'artist' | 'group'; gender: ChartGender; rank: number | null; value: ChartCell; growth_pct: ChartCell }[];
  series: { date: string; value: ChartCell }[];
}

export const DEFAULT_CHART_FILTERS: ChartFilters = { country: 'ALL', days: 7, entity: 'artist', group_mode: 'direct', group_gender: 'all', metric: 'voters' };
const COUNTRY = /^(ALL|UNKNOWN|[A-Z]{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;
const isDays = (value: unknown): value is 7 | 30 | 90 => value === 7 || value === 30 || value === 90;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid chart snapshot');
  return value as Record<string, unknown>;
};
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !DATE.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Invalid chart date');
  return value;
};
const timestamp = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid chart timestamp');
  return value;
};
const hidden = (status: 'suppressed' | 'unavailable'): ChartCell => ({ status, value: null });
function catalogueImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.picnic.fan' && !url.port && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function cell(value: unknown, growth = false): ChartCell {
  const item = record(value);
  if (item.status === 'suppressed' || item.status === 'unavailable') return hidden(item.status);
  if (item.status !== 'available') throw new Error('Invalid chart cell');
  if (typeof item.value !== 'number' || !Number.isFinite(item.value) || (!growth && (!Number.isSafeInteger(item.value) || item.value < 0))) return hidden('unavailable');
  return { status: 'available', value: item.value };
}

export function parseChartFilters(params: URLSearchParams): ChartFilters | null {
  if (Array.from(params.keys()).some(key => !Object.keys(DEFAULT_CHART_FILTERS).includes(key) || params.getAll(key).length !== 1)) return null;
  const country = params.get('country') ?? 'ALL';
  const rawDays = params.get('days') ?? '7';
  const entity = params.get('entity') ?? 'artist';
  const group_mode = params.get('group_mode') ?? 'direct';
  const group_gender = params.get('group_gender') ?? 'all';
  const metric = params.get('metric') ?? 'voters';
  if (!COUNTRY.test(country) || !['7', '30', '90'].includes(rawDays) || !['artist', 'group'].includes(entity) || !['direct', 'member_rollup'].includes(group_mode) || !['all', 'male', 'female', 'mixed'].includes(group_gender) || !['voters', 'votes', 'purchaser_voters'].includes(metric)) return null;
  return { country, days: Number(rawDays), entity, group_mode, group_gender, metric } as ChartFilters;
}

/** DTO v1: UTC start inclusive/end exclusive; only allowlisted aggregate fields leave this boundary. */
export function parseChartSnapshot(input: unknown, expected: ChartFilters): ChartSnapshot {
  const data = record(input);
  if (data.schema_version !== 1 || !['ready', 'empty', 'suppressed'].includes(String(data.status))) throw new Error('Unsupported chart contract');
  const countryBasis = data.country_basis === undefined ? 'vote_time_verified' : data.country_basis;
  if (countryBasis !== 'profile_at_publication' && countryBasis !== 'vote_time_verified') throw new Error('Unsupported chart country attribution');
  const filters = record(data.filters);
  for (const key of ['country', 'entity', 'group_mode', 'group_gender', 'metric'] as const) {
    if (filters[key] !== expected[key]) throw new Error('Chart filter mismatch');
  }
  const period = record(data.period);
  const start = date(period.start), end = date(period.end);
  if (period.days !== expected.days || Date.parse(end) - Date.parse(start) !== expected.days * DAY) throw new Error('Invalid chart period');
  const published = timestamp(data.published_at), due = timestamp(data.refresh_due_at);
  if ((!published && data.status !== 'empty') || (published && Date.parse(end) > Date.parse(published))) throw new Error('Unpublished chart period');
  if (!Array.isArray(data.available_countries) || !data.available_countries.every(v => typeof v === 'string' && COUNTRY.test(v)) || !Array.isArray(data.available_days) || !data.available_days.every(isDays)) throw new Error('Invalid chart options');
  const summary = record(data.summary);
  const suppressAll = data.status === 'suppressed';
  const cleanSummary = Object.fromEntries((['voters', 'votes', 'purchaser_voters', 'growth_pct'] as const).map(key => [key, suppressAll ? hidden('suppressed') : data.status === 'empty' ? hidden('unavailable') : cell(summary[key], key === 'growth_pct')])) as ChartSnapshot['summary'];
  if (!Array.isArray(data.rankings) || !Array.isArray(data.series)) throw new Error('Invalid chart rows');
  const rankings: ChartSnapshot['rankings'] = suppressAll || data.status === 'empty' ? [] : data.rankings.slice(0, 100).map(value => {
    const row = record(value), names = record(row.name);
    if (typeof row.id !== 'string' || row.id.length > 128 || row.entity !== expected.entity || ![null, 'male', 'female', 'mixed'].includes(row.gender as ChartGender) || (row.rank !== null && (typeof row.rank !== 'number' || !Number.isSafeInteger(row.rank) || row.rank < 1))) throw new Error('Invalid chart ranking');
    if (expected.entity === 'group' && expected.group_gender !== 'all' && row.gender !== expected.group_gender) throw new Error('Chart gender mismatch');
    const name = Object.fromEntries(Object.entries(names).filter(([key, label]) => (SUPPORTED_LANGUAGES as readonly string[]).includes(key) && typeof label === 'string' && label.length <= 200)) as Record<string, string>;
    const metricValue = cell(row.value);
    if (metricValue.status === 'suppressed') throw new Error('Suppressed ranking contains an identifier');
    return { id: row.id, name, image_url: catalogueImage(row.image_url), entity: row.entity as 'artist' | 'group', gender: row.gender as ChartGender, rank: row.rank as number | null, value: metricValue, growth_pct: cell(row.growth_pct, true) };
  });
  const series: ChartSnapshot['series'] = suppressAll || data.status === 'empty' ? [] : data.series.slice(0, 90).map(value => {
    const row = record(value), day = date(row.date);
    if (day < start || day >= end) throw new Error('Chart point outside period');
    return { date: day, value: cell(row.value) };
  });
  if (new Set(rankings.map(row => row.id)).size !== rankings.length || series.some((point, index) => index > 0 && point.date <= series[index - 1].date)) throw new Error('Duplicate or unordered chart rows');
  return { schema_version: 1, country_basis: countryBasis, status: data.status as ChartSnapshot['status'], published_at: published, refresh_due_at: due, period: { start, end, days: expected.days }, filters: { country: expected.country, entity: expected.entity, group_mode: expected.group_mode, group_gender: expected.group_gender, metric: expected.metric }, available_countries: Array.from(new Set(data.available_countries as string[])), available_days: Array.from(new Set(data.available_days as (7 | 30 | 90)[])), summary: cleanSummary, rankings, series };
}

export function chartHref(locale: string, hostname?: string): string {
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(locale) ? locale : 'en';
  return `${hostname === 'picnic.fan' || hostname === 'www.picnic.fan' ? 'https://chart.picnic.fan' : ''}/${lang}/charts`;
}

export function chartHostPath(host: string | null, pathname: string, preferred: string): string | null {
  if (host?.toLowerCase() !== 'chart.picnic.fan') return null;
  if (pathname === '/') return `/${preferred}/charts`;
  const locale = pathname.replace(/^\//, '').replace(/\/$/, '');
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(locale) ? `/${locale}/charts` : null;
}

export function chartFreshness(snapshot: Pick<ChartSnapshot, 'published_at' | 'refresh_due_at'>, now: number): 'current' | 'stale' | 'expired' {
  if (snapshot.published_at && now - Date.parse(snapshot.published_at) >= 48 * 60 * 60 * 1000) return 'expired';
  if (snapshot.refresh_due_at && now > Date.parse(snapshot.refresh_due_at)) return 'stale';
  return 'current';
}
