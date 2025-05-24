/**
 * Date 유틸리티 함수 테스트
 */

import { calculateRemainingTime, getCurrentLocale, localeMap, RemainingTime } from '../../utils/date';
import { enUS, id, ja, ko, zhCN } from 'date-fns/locale';

describe('Date Utils', () => {
  describe('calculateRemainingTime', () => {
    beforeEach(() => {
      // 현재 시간을 고정하여 테스트의 일관성 보장
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calculates remaining time correctly for future date', () => {
      const futureDate = '2024-01-02T12:00:00Z'; // 24시간 후
      const result = calculateRemainingTime(futureDate);

      expect(result).toEqual({
        days: 1,
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
    });

    it('calculates remaining time correctly for date with hours and minutes', () => {
      const futureDate = '2024-01-01T15:30:45Z'; // 3시간 30분 45초 후
      const result = calculateRemainingTime(futureDate);

      expect(result).toEqual({
        days: 0,
        hours: 3,
        minutes: 30,
        seconds: 45,
      });
    });

    it('returns zero values for past dates', () => {
      const pastDate = '2023-12-31T12:00:00Z'; // 24시간 전
      const result = calculateRemainingTime(pastDate);

      expect(result).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
    });

    it('handles exact current time', () => {
      const currentDate = '2024-01-01T12:00:00Z';
      const result = calculateRemainingTime(currentDate);

      expect(result).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
    });

    it('calculates complex remaining time correctly', () => {
      const futureDate = '2024-01-03T15:45:30Z'; // 2일 3시간 45분 30초 후
      const result = calculateRemainingTime(futureDate);

      expect(result).toEqual({
        days: 2,
        hours: 3,
        minutes: 45,
        seconds: 30,
      });
    });

    it('handles invalid date strings gracefully', () => {
      const invalidDate = 'invalid-date';
      const result = calculateRemainingTime(invalidDate);

      // 잘못된 날짜 문자열은 NaN을 반환함
      expect(result.days).toBeNaN();
      expect(result.hours).toBeNaN();
      expect(result.minutes).toBeNaN();
      expect(result.seconds).toBeNaN();
    });

    it('returns correct type structure', () => {
      const futureDate = '2024-01-01T13:00:00Z';
      const result = calculateRemainingTime(futureDate);

      expect(result).toHaveProperty('days');
      expect(result).toHaveProperty('hours');
      expect(result).toHaveProperty('minutes');
      expect(result).toHaveProperty('seconds');
      
      expect(typeof result.days).toBe('number');
      expect(typeof result.hours).toBe('number');
      expect(typeof result.minutes).toBe('number');
      expect(typeof result.seconds).toBe('number');
    });
  });

  describe('localeMap', () => {
    it('contains all expected locales', () => {
      expect(localeMap).toHaveProperty('ko');
      expect(localeMap).toHaveProperty('ja');
      expect(localeMap).toHaveProperty('zh');
      expect(localeMap).toHaveProperty('en');
      expect(localeMap).toHaveProperty('id');
    });

    it('maps to correct date-fns locales', () => {
      expect(localeMap.ko).toBe(ko);
      expect(localeMap.ja).toBe(ja);
      expect(localeMap.zh).toBe(zhCN);
      expect(localeMap.en).toBe(enUS);
      expect(localeMap.id).toBe(id);
    });
  });

  describe('getCurrentLocale', () => {
    it('returns correct locale for supported languages', () => {
      expect(getCurrentLocale('ko')).toBe(ko);
      expect(getCurrentLocale('ja')).toBe(ja);
      expect(getCurrentLocale('zh')).toBe(zhCN);
      expect(getCurrentLocale('en')).toBe(enUS);
      expect(getCurrentLocale('id')).toBe(id);
    });

    it('returns default locale (enUS) for unsupported languages', () => {
      expect(getCurrentLocale('fr')).toBe(enUS);
      expect(getCurrentLocale('de')).toBe(enUS);
      expect(getCurrentLocale('es')).toBe(enUS);
      expect(getCurrentLocale('unknown')).toBe(enUS);
    });

    it('handles empty string', () => {
      expect(getCurrentLocale('')).toBe(enUS);
    });

    it('handles undefined/null gracefully', () => {
      expect(getCurrentLocale(undefined as any)).toBe(enUS);
      expect(getCurrentLocale(null as any)).toBe(enUS);
    });

    it('is case sensitive', () => {
      expect(getCurrentLocale('KO')).toBe(enUS); // 대문자는 지원하지 않음
      expect(getCurrentLocale('EN')).toBe(enUS);
    });
  });
}); 