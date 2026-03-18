import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('handles a single class string', () => {
    expect(cn('text-red-500')).toBe('text-red-500')
  })

  it('merges multiple class strings', () => {
    const result = cn('text-red-500', 'bg-blue-500')
    expect(result).toBe('text-red-500 bg-blue-500')
  })

  it('filters falsy values', () => {
    const result = cn('text-red-500', false && 'bg-blue-500', 'font-bold')
    expect(result).toBe('text-red-500 font-bold')
  })

  it('handles undefined values', () => {
    const result = cn('text-red-500', undefined, 'font-bold')
    expect(result).toBe('text-red-500 font-bold')
  })

  it('handles null values', () => {
    const result = cn('text-red-500', null, 'font-bold')
    expect(result).toBe('text-red-500 font-bold')
  })

  it('handles false values', () => {
    const result = cn('text-red-500', false, 'font-bold')
    expect(result).toBe('text-red-500 font-bold')
  })

  it('handles empty string', () => {
    const result = cn('')
    expect(result).toBe('')
  })

  it('handles no arguments', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('keeps both classes (no Tailwind merge)', () => {
    const result = cn('text-red-500', 'text-blue-500')
    expect(result).toBe('text-red-500 text-blue-500')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    const result = cn(
      'base-class',
      isActive && 'active-class',
      isDisabled && 'disabled-class',
    )
    expect(result).toBe('base-class active-class')
  })

  it('filters all falsy to empty string', () => {
    const result = cn(false, undefined, null)
    expect(result).toBe('')
  })

  it('handles single truthy among falsy', () => {
    const result = cn(false, 'only-class', null, undefined)
    expect(result).toBe('only-class')
  })
})
