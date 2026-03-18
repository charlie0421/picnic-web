import { describe, it, expect } from 'vitest'
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus'

describe('getStarCandyBonusExpiryISO', () => {
  it('returns next month 15th when before the 15th (e.g., Jan 5)', () => {
    const date = new Date(2024, 0, 5) // Jan 5, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(1) // February
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getFullYear()).toBe(2024)
  })

  it('returns month+2 15th when on the 15th (e.g., Jan 15)', () => {
    const date = new Date(2024, 0, 15) // Jan 15, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(2) // March
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getFullYear()).toBe(2024)
  })

  it('returns month+2 15th when after the 15th (e.g., Jan 20)', () => {
    const date = new Date(2024, 0, 20) // Jan 20, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(2) // March
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getFullYear()).toBe(2024)
  })

  it('handles year boundary: Dec before 15th → next year Jan 15th', () => {
    const date = new Date(2024, 11, 10) // Dec 10, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(0) // January
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getFullYear()).toBe(2025)
  })

  it('handles year boundary: Dec after 15th → next year Feb 15th', () => {
    const date = new Date(2024, 11, 20) // Dec 20, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(1) // February
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getFullYear()).toBe(2025)
  })

  it('handles Nov after 15th → next year Jan 15th', () => {
    const date = new Date(2024, 10, 20) // Nov 20, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(0) // January
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getFullYear()).toBe(2025)
  })

  it('returns a valid ISO string', () => {
    const date = new Date(2024, 5, 10) // Jun 10, 2024
    const result = getStarCandyBonusExpiryISO(date)
    expect(typeof result).toBe('string')
    const parsed = new Date(result)
    expect(parsed.toString()).not.toBe('Invalid Date')
    expect(isNaN(parsed.getTime())).toBe(false)
  })

  it('handles first day of month', () => {
    const date = new Date(2024, 3, 1) // Apr 1, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(4) // May
    expect(parsed.getDate()).toBe(15)
  })

  it('handles last day of month', () => {
    const date = new Date(2024, 0, 31) // Jan 31, 2024
    const result = getStarCandyBonusExpiryISO(date)
    const parsed = new Date(result)
    expect(parsed.getMonth()).toBe(2) // March
    expect(parsed.getDate()).toBe(15)
  })
})
