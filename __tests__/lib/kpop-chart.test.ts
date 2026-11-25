import { describe, expect, it } from 'vitest';
import { chartFreshness, chartHref, chartHostPath, parseChartSnapshot, parseChartFilters } from '@/lib/charts/contract';

const available = (value: number) => ({ status: 'available', value });
const filters = { country: 'ALL', days: 7, entity: 'artist', group_mode: 'direct', group_gender: 'all', metric: 'voters' } as const;
const fixture = () => ({
  schema_version: 1, status: 'ready', published_at: '2026-11-25T02:00:00Z', refresh_due_at: '2026-11-26T02:00:00Z',
  period: { start: '2026-11-18', end: '2026-11-25', days: 7 }, filters,
  available_countries: ['ALL', 'UNKNOWN', 'KR'], available_days: [7, 30, 90],
  summary: { voters: available(100), votes: available(500), purchaser_voters: available(20), growth_pct: available(-12.5) },
  rankings: [{ id: 'artist-1', name: { en: 'Artist' }, entity: 'artist', gender: null, rank: 1, value: available(100), growth_pct: available(-12.5) }],
  series: [{ date: '2026-11-18', value: available(10) }],
});

describe('public chart boundary', () => {
  it('marks late refreshes stale and expires a publication at exactly 48 hours', () => {
    const publication = { published_at: '2026-11-25T02:00:00Z', refresh_due_at: '2026-11-26T02:00:00Z' };
    expect(chartFreshness(publication, Date.parse('2026-11-26T02:00:01Z'))).toBe('stale');
    expect(chartFreshness(publication, Date.parse('2026-11-27T01:59:59Z'))).toBe('stale');
    expect(chartFreshness(publication, Date.parse('2026-11-27T02:00:00Z'))).toBe('expired');
  });
  it('keeps the country attribution of a release and rejects unsupported methods', () => {
    expect(parseChartSnapshot({ ...fixture(), country_basis: 'profile_at_publication' }, filters).country_basis).toBe('profile_at_publication');
    expect(parseChartSnapshot(fixture(), filters).country_basis).toBe('vote_time_verified');
    expect(() => parseChartSnapshot({ ...fixture(), country_basis: 'nationality' }, filters)).toThrow();
  });
  it('rejects unsupported filters instead of broadening the data request', () => {
    expect(parseChartFilters(new URLSearchParams('days=365'))).toBeNull();
    expect(parseChartFilters(new URLSearchParams('country=kr'))).toBeNull();
    expect(parseChartFilters(new URLSearchParams())).toEqual(filters);
  });
  it('keeps negative growth but hides unsafe quantities', () => {
    const input = fixture();
    input.summary.voters.value = Number.MAX_SAFE_INTEGER + 1;
    const parsed = parseChartSnapshot(input, filters);
    expect(parsed.summary.voters).toEqual({ status: 'unavailable', value: null });
    expect(parsed.summary.growth_pct.value).toBe(-12.5);
  });
  it('removes all identifying rows and numbers from a suppressed snapshot', () => {
    const input = { ...fixture(), status: 'suppressed' };
    const parsed = parseChartSnapshot(input, filters);
    expect(parsed.rankings).toEqual([]);
    expect(parsed.series).toEqual([]);
    expect(parsed.summary.voters).toEqual({ status: 'suppressed', value: null });
  });
  it('never exposes hidden cell values or extra raw fields', () => {
    const input = fixture();
    Object.assign(input.summary.voters, { status: 'suppressed', value: 4, user_ids: ['secret'] });
    expect(parseChartSnapshot(input, filters).summary.voters).toEqual({ status: 'suppressed', value: null });
  });
  it('rejects a ranking that identifies an entity whose metric was suppressed', () => {
    const input = fixture();
    Object.assign(input.rankings[0].value, { status: 'suppressed', value: null });
    expect(() => parseChartSnapshot(input, filters)).toThrow();
  });
  it('uses only the catalogue CDN for optional artist pictures', () => {
    const input = fixture();
    Object.assign(input.rankings[0], { image_url: 'https://cdn.picnic.fan.evil.test/artist.jpg' });
    expect(parseChartSnapshot(input, filters).rankings[0].image_url).toBeNull();
    Object.assign(input.rankings[0], { image_url: 'https://cdn.picnic.fan/artist.jpg' });
    expect(parseChartSnapshot(input, filters).rankings[0].image_url).toBe('https://cdn.picnic.fan/artist.jpg');
  });
  it('rejects filter mismatch and dates outside the published exclusive period', () => {
    expect(() => parseChartSnapshot({ ...fixture(), filters: { ...filters, country: 'KR' } }, filters)).toThrow();
    const input = fixture();
    input.series[0].date = '2026-11-25';
    expect(() => parseChartSnapshot(input, filters)).toThrow();
  });
  it('routes only the exact chart host and preserves local/preview navigation', () => {
    expect(chartHostPath('chart.picnic.fan', '/ko', 'en')).toBe('/ko/charts');
    expect(chartHostPath('chart.picnic.fan', '/', 'ja')).toBe('/ja/charts');
    expect(chartHostPath('chart.picnic.fan.evil.test', '/', 'ko')).toBeNull();
    expect(chartHostPath('chart.picnic.fan', '/en/vote', 'en')).toBeNull();
    expect(chartHref('ko', 'localhost')).toBe('/ko/charts');
    expect(chartHref('zh-tw', 'preview.vercel.app')).toBe('/zh-tw/charts');
    expect(chartHref('ja', 'picnic.fan')).toBe('https://chart.picnic.fan/ja/charts');
  });
});
