import { describe, it, expect } from 'vitest';
import { parseExpiringBonus, bonusExpiryDateLabel } from '@/lib/wallet/expiring-bonus';

describe('parseExpiringBonus', () => {
  it('정상 응답을 그대로 통과시킨다', () => {
    const rows = [
      { prediction_month: '2026-09', expiring_amount: 120 },
      { prediction_month: '2026-10', expiring_amount: 0 },
    ];
    expect(parseExpiringBonus(rows)).toEqual(rows);
  });

  it('문자열 JSON 응답도 파싱한다 (Edge 가 문자열을 줄 수 있다)', () => {
    const raw = JSON.stringify([{ prediction_month: '2026-09', expiring_amount: 5 }]);
    expect(parseExpiringBonus(raw)).toEqual([
      { prediction_month: '2026-09', expiring_amount: 5 },
    ]);
  });

  it('배열이 아니면 거부한다', () => {
    expect(() => parseExpiringBonus({ months: [] })).toThrow('EXPIRING_BONUS_INVALID_SHAPE');
    expect(() => parseExpiringBonus(null)).toThrow('EXPIRING_BONUS_INVALID_SHAPE');
  });

  it('잘못된 월 형식은 거부한다 — 소멸 시점을 잘못 보여주면 안 된다', () => {
    for (const bad of ['2026-13', '2026-00', '202609', '2026-9', '']) {
      expect(() =>
        parseExpiringBonus([{ prediction_month: bad, expiring_amount: 1 }]),
      ).toThrow('EXPIRING_BONUS_INVALID_MONTH');
    }
  });

  it('수량이 숫자가 아니거나 유한하지 않으면 거부한다', () => {
    for (const bad of ['10', null, undefined, NaN, Infinity]) {
      expect(() =>
        parseExpiringBonus([{ prediction_month: '2026-09', expiring_amount: bad }]),
      ).toThrow('EXPIRING_BONUS_INVALID_AMOUNT');
    }
  });

  it('깨진 JSON 문자열은 거부한다', () => {
    expect(() => parseExpiringBonus('{oops')).toThrow('EXPIRING_BONUS_INVALID_JSON');
  });
});

describe('bonusExpiryDateLabel', () => {
  it('해당 월 15일 00:00 KST 를 로컬 타임존과 무관하게 표시한다', () => {
    const out = bonusExpiryDateLabel('2026-09', 'ko-KR');
    expect(out).toContain('2026');
    expect(out).toContain('9');
    expect(out).toContain('15');
    expect(out).toContain('00:00');
  });

  it('로케일이 달라도 KST 기준 날짜는 같다', () => {
    expect(bonusExpiryDateLabel('2026-09', 'en-US')).toContain('15');
    expect(bonusExpiryDateLabel('2026-09', 'ko-KR')).toContain('15');
  });

  it('연말 경계에서도 월이 밀리지 않는다', () => {
    const out = bonusExpiryDateLabel('2026-12', 'ko-KR');
    expect(out).toContain('2026');
    expect(out).toContain('12');
    expect(out).toContain('15');
  });
});
