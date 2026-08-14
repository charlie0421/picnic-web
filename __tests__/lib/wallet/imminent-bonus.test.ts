import { describe, it, expect } from 'vitest';
import {
  bonusExpiryInstant,
  findImminentBonus,
  IMMINENT_BONUS_WITHIN_DAYS,
} from '@/lib/wallet/imminent-bonus';

const DAY = 24 * 60 * 60 * 1000;

// 2026-08 분은 KST 8/15 00:00 = UTC 8/14 15:00 에 소멸한다.
const AUG_EXPIRY = Date.UTC(2026, 7, 14, 15, 0, 0);

describe('bonusExpiryInstant', () => {
  it('해당 월 15일 00:00 KST 를 가리킨다', () => {
    expect(bonusExpiryInstant('2026-08')).toBe(AUG_EXPIRY);
    // UTC 로는 전날 15시다. 이 관계가 깨지면 하루 어긋난 경고가 나간다.
    expect(new Date(AUG_EXPIRY).toISOString()).toBe('2026-08-14T15:00:00.000Z');
  });

  it('연말을 넘겨도 월 경계를 지킨다', () => {
    expect(new Date(bonusExpiryInstant('2026-12')).toISOString()).toBe('2026-12-14T15:00:00.000Z');
    expect(new Date(bonusExpiryInstant('2027-01')).toISOString()).toBe('2027-01-14T15:00:00.000Z');
  });
});

describe('findImminentBonus', () => {
  const aug = { prediction_month: '2026-08', expiring_amount: 44 };
  const sep = { prediction_month: '2026-09', expiring_amount: 571 };

  it('임계 안이면 고른다', () => {
    const now = AUG_EXPIRY - 1 * DAY; // 하루 전
    expect(findImminentBonus([aug, sep], now)).toEqual(aug);
  });

  it('임계 밖이면 고르지 않는다', () => {
    const now = AUG_EXPIRY - 10 * DAY;
    expect(findImminentBonus([aug, sep], now)).toBeNull();
  });

  it('경계(정확히 임계일 전)는 포함한다', () => {
    const now = AUG_EXPIRY - IMMINENT_BONUS_WITHIN_DAYS * DAY;
    expect(findImminentBonus([aug, sep], now)).toEqual(aug);
  });

  it('경계를 1ms 넘기면 제외한다', () => {
    const now = AUG_EXPIRY - IMMINENT_BONUS_WITHIN_DAYS * DAY - 1;
    expect(findImminentBonus([aug, sep], now)).toBeNull();
  });

  // 지난 소멸을 임박이라고 띄우면 사용자가 잔액을 오판한다.
  it('이미 지난 건은 제외한다', () => {
    const now = AUG_EXPIRY + 1;
    expect(findImminentBonus([aug], now)).toBeNull();
  });

  it('소멸 시각 정각은 아직 포함한다', () => {
    expect(findImminentBonus([aug], AUG_EXPIRY)).toEqual(aug);
  });

  it('수량 0 은 경고할 것이 없으므로 제외한다', () => {
    const now = AUG_EXPIRY - 1 * DAY;
    expect(findImminentBonus([{ prediction_month: '2026-08', expiring_amount: 0 }], now)).toBeNull();
  });

  it('여러 건이면 가장 이른 것을 고른다', () => {
    const now = Date.UTC(2026, 7, 13, 0, 0, 0);
    const augLate = { prediction_month: '2026-08', expiring_amount: 44 };
    const result = findImminentBonus([sep, augLate], now, 40);
    expect(result).toEqual(augLate);
  });

  it('빈 목록과 null 을 안전하게 처리한다', () => {
    expect(findImminentBonus([], Date.now())).toBeNull();
    expect(findImminentBonus(null, 0)).toBeNull();
    expect(findImminentBonus(undefined, 0)).toBeNull();
  });
});
