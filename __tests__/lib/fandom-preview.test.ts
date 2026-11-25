import { describe, expect, it } from 'vitest';
import { sampleFandom, sampleMarketChart } from '@/lib/charts/fandom-preview';
import { fandomParams, parseFandomReport, parseSubjects } from '@/lib/charts/fandom';
import { parseChartSnapshot, type ChartFilters } from '@/lib/charts/contract';

const base: ChartFilters = { country: 'ALL', days: 30, entity: 'group', group_mode: 'direct', group_gender: 'all', metric: 'voters' };
const chart = (change: Partial<ChartFilters>) => {
    const filters = { ...base, ...change };
    return parseChartSnapshot(sampleMarketChart(filters), filters);
};
const order = (change: Partial<ChartFilters>) => chart(change).rankings.map((r) => r.id).join(',');
const countries = ['ALL', 'ID', 'KR', 'JP', 'TH', 'US', 'PH', 'VN'];

describe('fictional investor scenario', () => {
    const report = (q: string) => parseFandomReport(sampleFandom(fandomParams(new URLSearchParams(q))!));
    it('finds a member through their group and a group through its member', () => {
        expect(parseSubjects(sampleFandom({ type: 'search', query: '베이비' }))).toHaveLength(3);
        expect(
            parseSubjects(sampleFandom({ type: 'search', query: '치키타' })).some((s) => s.entity === 'group'),
        ).toBe(true);
    });
    it('keeps selected market and the two scopes distinct', () => {
        const r = report('id=65&entity=group&country=ID&days=7&mode=member_rollup');
        expect(r.series).toHaveLength(7);
        expect(r.markets.map((m) => m.country)).toEqual(['ID']);
        expect(r.metrics.fans.status).toBe('unavailable');
        const c = report(
            'id=65&entity=group&days=7&scope=campaign&campaign=00000000-0000-4000-8000-000000000011',
        );
        expect(c.series_basis).toBe('completed_week');
        expect(c.metrics.voters.status).toBe('unavailable');
        expect(c.metrics.viewers.value).toBeGreaterThan(0);
        expect(report('id=991&entity=artist').status).toBe('not_found');
    });
});

describe('fictional market chart', () => {
    it('has several ranked fandoms in every market for every group gender and mode', () => {
        for (const country of countries)
            for (const group_gender of ['all', 'male', 'female', 'mixed'] as const)
                for (const group_mode of ['direct', 'member_rollup'] as const) {
                    const c = chart({ country, group_gender, group_mode });
                    expect(c.status, `${country} ${group_gender} ${group_mode}`).toBe('ready');
                    expect(c.rankings.length).toBeGreaterThanOrEqual(2);
                    expect(c.rankings.every((r) => r.value.status === 'available' && r.value.value! > 0)).toBe(true);
                }
        expect(chart({ country: 'KR', group_gender: 'male' }).rankings.length).toBeGreaterThanOrEqual(4);
        for (const country of countries) expect(chart({ country, entity: 'artist' }).rankings.length).toBe(22);
    });

    it('changes the order with the market, metric, period, group mode and subject', () => {
        const reference = order({});
        expect(new Set(countries.map((country) => order({ country }))).size).toBeGreaterThanOrEqual(6);
        expect(order({ metric: 'votes' })).not.toBe(reference);
        expect(order({ metric: 'purchaser_voters' })).not.toBe(reference);
        expect(order({ days: 7 })).not.toBe(order({ days: 90 }));
        expect(order({ group_mode: 'member_rollup' })).not.toBe(reference);
        expect(chart({ entity: 'artist' }).rankings.every((r) => r.entity === 'artist')).toBe(true);
        expect(chart({ entity: 'artist' }).rankings[0].id).not.toBe(chart({}).rankings[0].id);
        const growth = chart({}).rankings.map((r) => r.growth_pct.value!);
        expect(growth.some((g) => g > 0) && growth.some((g) => g < 0)).toBe(true);
    });

    it('shows the catalog image from the CDN for every ranked subject', () => {
        const images = new Set<string>();
        for (const entity of ['artist', 'group'] as const)
            for (const r of chart({ entity }).rankings) {
                expect(r.image_url).toMatch(/^https:\/\/cdn\.picnic\.fan\/picnic\/(artist|artist_group|artist-group)\/[A-Za-z0-9/-]+\.png$/);
                images.add(r.image_url!);
            }
        expect(images.size).toBe(32);
    });

    it('ranks with the same numbers that the fandom report shows', () => {
        for (const change of [{ country: 'KR', group_gender: 'male', group_mode: 'member_rollup' }, { entity: 'artist', country: 'JP', days: 7, metric: 'votes' }] as Partial<ChartFilters>[]) {
            const filters = { ...base, ...change };
            for (const row of chart(filters).rankings) {
                const detail = parseFandomReport(
                    sampleFandom({
                        type: 'report',
                        filters: { entity: row.entity, id: Number(row.id), country: filters.country, days: filters.days, mode: filters.group_mode, scope: 'fandom', campaign: null },
                    }),
                );
                expect(detail.metrics[filters.metric].value).toBe(row.value.value);
            }
        }
    });
});
