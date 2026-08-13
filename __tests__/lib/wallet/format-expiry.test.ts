import { describe, it, expect } from 'vitest';
import { formatExpiryDate } from '@/lib/wallet/format-expiry';

describe('formatExpiryDate', () => {
  it('KST 자정 만료를 사용자 타임존과 무관하게 KST 기준으로 보여준다', () => {
    // 2026-08-14 00:00 KST === 2026-08-13 15:00 UTC
    const iso = '2026-08-13T15:00:00.000Z';
    const out = formatExpiryDate(iso, 'ko-KR');

    // 로컬 타임존으로 렌더하면 8/13 또는 다른 시각이 되어 앱과 다른 날짜가 보인다.
    expect(out).toContain('2026');
    expect(out).toContain('8');
    expect(out).toContain('14');
    expect(out).toContain('00:00');
  });

  it('UTC 타임존 환경에서도 KST 날짜로 고정된다', () => {
    const iso = '2026-08-13T15:00:00.000Z';
    // Intl 에 timeZone 을 고정했으므로 로케일이 달라도 KST 기준 날짜는 동일해야 한다
    const ko = formatExpiryDate(iso, 'ko-KR');
    const en = formatExpiryDate(iso, 'en-US');
    expect(ko).toContain('14');
    expect(en).toContain('14');
  });

  it('잘못된 값은 원문을 그대로 돌려주고 예외를 던지지 않는다', () => {
    expect(formatExpiryDate('not-a-date', 'ko-KR')).toBe('not-a-date');
    expect(formatExpiryDate('', 'ko-KR')).toBe('');
  });
});
