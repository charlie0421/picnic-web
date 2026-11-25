import { describe, expect, it } from 'vitest';
import { fandomParams, parseFandomReport, parseSubjects } from '@/lib/charts/fandom';
describe('artist report boundary', () => {
    it('treats search strings as text and rejects unbounded and ambiguous requests', () => {
        expect(fandomParams(new URLSearchParams({ q: '  벨라  ' }))).toMatchObject({
            type: 'search',
            query: '벨라',
        });
        expect(fandomParams(new URLSearchParams('q=a&q=b'))).toBeNull();
        expect(fandomParams(new URLSearchParams({ entity: 'group', id: '0' }))).toBeNull();
        expect(fandomParams(new URLSearchParams({ q: 'abcd', admin: 'true' }))).toBeNull();
    });
    it('only forwards catalog fields and rejects hidden numeric values', () => {
        const subject = { id: '3', entity: 'artist', name: { ko: '린' }, group_name: null };
        expect(parseSubjects([{ ...subject, user_id: 'should never pass' }])).toEqual([subject]);
        expect(() =>
            parseFandomReport({
                status: 'ready',
                subject,
                metrics: { voters: { status: 'suppressed', value: 1 } },
            }),
        ).toThrow();
    });
});
