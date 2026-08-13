import { describe, it, expect } from 'vitest';
import { msUntilNextKstMidnight } from '@/lib/wallet/next-kst-midnight';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('msUntilNextKstMidnight', () => {
  it('KST 23:00 이면 1시간 뒤', () => {
    // 2026-08-13 14:00 UTC == 2026-08-13 23:00 KST
    expect(msUntilNextKstMidnight(new Date('2026-08-13T14:00:00.000Z'))).toBe(HOUR);
  });

  it('KST 00:30 이면 23시간 30분 뒤', () => {
    // 2026-08-13 15:30 UTC == 2026-08-14 00:30 KST
    expect(msUntilNextKstMidnight(new Date('2026-08-13T15:30:00.000Z'))).toBe(
      23 * HOUR + 30 * 60 * 1000,
    );
  });

  it('정확히 KST 자정이면 0 이 아니라 하루를 돌려준다 (타이머 폭주 방지)', () => {
    // 2026-08-13 15:00 UTC == 2026-08-14 00:00 KST
    expect(msUntilNextKstMidnight(new Date('2026-08-13T15:00:00.000Z'))).toBe(DAY);
  });

  it('항상 0 초과 하루 이하다', () => {
    for (let h = 0; h < 24; h++) {
      const v = msUntilNextKstMidnight(new Date(Date.UTC(2026, 7, 13, h, 17, 3)));
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(DAY);
    }
  });
});
