import { describe, it, expect } from 'vitest';
import { intlLocale } from '@/lib/i18n/locale';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

describe('intlLocale', () => {
  it('지원 언어가 전부 en-US 로 새지 않는다', () => {
    // 매핑이 빠지면 날짜가 "9/15/2026" 처럼 미국식으로 보여 일/월 순서를 착각할 수 있다.
    // 소멸일처럼 사용자가 날짜를 보고 행동해야 하는 화면에서 특히 위험하다.
    const fallbacks = SUPPORTED_LANGUAGES.filter(
      (l) => l !== 'en' && intlLocale(l) === 'en-US',
    );
    expect(fallbacks).toEqual([]);
  });

  it('지원 언어 수만큼 고유 로케일을 준다', () => {
    const set = new Set(SUPPORTED_LANGUAGES.map(intlLocale));
    expect(set.size).toBe(SUPPORTED_LANGUAGES.length);
  });

  it('주요 언어 매핑이 정확하다', () => {
    expect(intlLocale('ko')).toBe('ko-KR');
    expect(intlLocale('zh-cn')).toBe('zh-CN');
    expect(intlLocale('zh-tw')).toBe('zh-TW');
    expect(intlLocale('tl')).toBe('fil-PH');
    expect(intlLocale('my')).toBe('my-MM');
  });

  it('모르는 언어는 en-US 로 떨어진다', () => {
    expect(intlLocale('xx')).toBe('en-US');
    expect(intlLocale('')).toBe('en-US');
  });

  it('각 로케일이 Intl 에서 실제로 동작한다', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const out = new Intl.DateTimeFormat(intlLocale(lang), {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).format(new Date('2026-08-13T15:00:00.000Z'));
      expect(out, `${lang} 포맷 실패`).toBeTruthy();
    }
  });

  it('zh-cn 과 zh-tw 가 서로 다른 로케일이다', () => {
    expect(intlLocale('zh-cn')).not.toBe(intlLocale('zh-tw'));
  });
});
