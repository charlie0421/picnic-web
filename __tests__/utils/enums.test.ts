import { describe, it, expect } from 'vitest'
import {
  PolicyLanguage,
  PolicyType,
  PortalType,
  Gender,
} from '@/utils/enums'

describe('PolicyLanguage', () => {
  it('has Korean language value', () => {
    expect(PolicyLanguage.KO).toBeDefined()
  })

  it('has English language value', () => {
    expect(PolicyLanguage.EN).toBeDefined()
  })

  it('contains expected values', () => {
    const values = Object.values(PolicyLanguage)
    expect(values).toContain('ko')
    expect(values).toContain('en')
    expect(values.length).toBe(2)
  })
})

describe('PolicyType', () => {
  it('has terms of service type', () => {
    expect(PolicyType.TERMS).toBeDefined()
  })

  it('has privacy policy type', () => {
    expect(PolicyType.PRIVACY).toBeDefined()
  })

  it('contains all expected policy types', () => {
    const values = Object.values(PolicyType)
    expect(values.length).toBeGreaterThanOrEqual(2)
  })
})

describe('PortalType', () => {
  it('has defined portal types', () => {
    const values = Object.values(PortalType)
    expect(values.length).toBeGreaterThan(0)
  })

  it('has string values', () => {
    Object.values(PortalType).forEach((value) => {
      expect(typeof value).toBe('string')
    })
  })
})

describe('Gender', () => {
  it('has MALE value', () => {
    expect(Gender.MALE).toBeDefined()
  })

  it('has FEMALE value', () => {
    expect(Gender.FEMALE).toBeDefined()
  })

  it('contains expected values', () => {
    const values = Object.values(Gender)
    expect(values.length).toBeGreaterThanOrEqual(2)
  })

  it('values are strings', () => {
    Object.values(Gender).forEach((value) => {
      expect(typeof value).toBe('string')
    })
  })
})
