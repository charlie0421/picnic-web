import { describe, expect, it } from 'vitest';
import { sampleFandom } from '@/lib/charts/fandom-preview';
import { fandomParams, parseFandomReport, parseSubjects } from '@/lib/charts/fandom';
describe('fictional investor scenario', () => {
    const report = (q: string) => parseFandomReport(sampleFandom(fandomParams(new URLSearchParams(q))!));
    it('finds a member through their group and a group through its member', () => {
        expect(parseSubjects(sampleFandom({ type: 'search', query: '벨라' }))).toHaveLength(2);
        expect(
            parseSubjects(sampleFandom({ type: 'search', query: '아린' })).some((s) => s.entity === 'group'),
        ).toBe(true);
    });
    it('keeps selected market and the two scopes distinct', () => {
        const r = report('id=11&entity=group&country=ID&days=7&mode=member_rollup');
        expect(r.series).toHaveLength(7);
        expect(r.markets.map((m) => m.country)).toEqual(['ID']);
        expect(r.metrics.fans.status).toBe('unavailable');
        const c = report(
            'id=11&entity=group&days=7&scope=campaign&campaign=00000000-0000-4000-8000-000000000011',
        );
        expect(c.series_basis).toBe('completed_week');
        expect(c.metrics.voters.status).toBe('unavailable');
        expect(c.metrics.viewers.value).toBeGreaterThan(0);
        expect(report('id=991&entity=artist').status).toBe('not_found');
    });
});
