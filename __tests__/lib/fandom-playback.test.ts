import { describe, it, expect } from 'vitest';
import { PlaybackClock } from '@/lib/charts/playback-clock';
describe('foreground playback measurement', () => {
    it('counts only observed new playback and caps elapsed time', () => {
        const t = new PlaybackClock();
        t.observe(100, 0);
        t.observe(1100, 900);
        expect(t.total).toBe(900);
        t.observe(8100, 1000);
        expect(t.total).toBe(900);
        t.interrupt();
        t.observe(8000, 1300);
        t.observe(9000, 2300);
        expect(t.total).toBe(1800);
        t.observe(9999, 90200);
        expect(t.total).toBe(1800);
    });
});
