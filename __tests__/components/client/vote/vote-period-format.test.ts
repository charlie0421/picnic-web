import { describe, expect, it } from 'vitest';
import { formatVotePeriodForLanguage } from '@/components/client/vote/common/vote-display-utils';

/** DES-004: 투표 기간은 사용자 언어로, 기준 시간대는 KST 로 표시한다. */
describe('formatVotePeriodForLanguage', () => {
  const start = '2026-09-01T09:00:00Z';
  const stop = '2026-09-30T14:59:00Z';

  it('영어는 영어 날짜 형식 + KST', () => {
    const text = formatVotePeriodForLanguage(start, stop, 'en');
    expect(text).toMatch(/September 1, 2026/);
    expect(text).toMatch(/KST$/);
    expect(text).not.toMatch(/[ㄱ-힝]/);
  });

  it('한국어는 한국어 형식', () => {
    expect(formatVotePeriodForLanguage(start, stop, 'ko')).toMatch(/2026년 9월 1일/);
  });

  it('시간대는 KST 고정(UTC 09:00 = KST 18:00)', () => {
    expect(formatVotePeriodForLanguage(start, stop, 'en')).toMatch(/06:00\s?PM/);
  });

  it('날짜가 없으면 빈 문자열', () => {
    expect(formatVotePeriodForLanguage(null, stop, 'en')).toBe('');
  });
});
