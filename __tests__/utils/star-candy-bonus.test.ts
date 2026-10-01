import { describe, it, expect } from 'vitest'
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus'

// KST 벽시계 시각이 가리키는 순간. 테스트를 돌리는 기계의 시간대와 무관하다
// (new Date(2024, 0, 5) 나 getDate() 는 기계의 시간대를 따라 UTC 인 CI 와 Vercel 에서 하루 어긋난다).
const kst = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour - 9, minute))

// 만료 시각은 KST 15일 00:00, UTC 로는 14일 15:00 이다.
const expiry = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 14, 15)).toISOString()

describe('getStarCandyBonusExpiryISO', () => {
  it('returns next month 15th when before the 15th (e.g., Jan 5)', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 1, 5))).toBe(expiry(2024, 2))
  })

  it('returns month+2 15th when on the 15th (e.g., Jan 15)', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 1, 15))).toBe(expiry(2024, 3))
  })

  it('returns month+2 15th when after the 15th (e.g., Jan 20)', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 1, 20))).toBe(expiry(2024, 3))
  })

  it('handles year boundary: Dec before 15th → next year Jan 15th', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 12, 10))).toBe(expiry(2025, 1))
  })

  it('handles year boundary: Dec after 15th → next year Feb 15th', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 12, 20))).toBe(expiry(2025, 2))
  })

  it('handles Nov after 15th → next year Jan 15th', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 11, 20))).toBe(expiry(2025, 1))
  })

  it('returns a valid ISO string', () => {
    const result = getStarCandyBonusExpiryISO(kst(2024, 6, 10))
    expect(result).toBe('2024-07-14T15:00:00.000Z')
    expect(new Date(result).toISOString()).toBe(result)
  })

  it('handles first day of month', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 4, 1))).toBe(expiry(2024, 5))
  })

  it('handles last day of month', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 1, 31))).toBe(expiry(2024, 3))
  })

  // 기준은 KST 날짜다. 경계 직전과 직후, 그리고 UTC 날짜와 KST 날짜가 다른 시각을 확인한다.
  it('KST 14일 23:59 는 다음 달, 15일 00:00 은 다다음 달이다', () => {
    expect(getStarCandyBonusExpiryISO(kst(2024, 1, 14, 23, 59))).toBe(expiry(2024, 2))
    expect(getStarCandyBonusExpiryISO(kst(2024, 1, 15, 0, 0))).toBe(expiry(2024, 3))
  })

  it('UTC 로는 14일이어도 KST 로 15일이면 다다음 달이다', () => {
    // 2024-01-14T16:00Z = KST 1월 15일 01:00
    expect(getStarCandyBonusExpiryISO(new Date('2024-01-14T16:00:00Z'))).toBe(expiry(2024, 3))
  })
})
