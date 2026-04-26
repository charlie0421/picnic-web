import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue, useDebouncedCallback } from '@/hooks/useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('useDebouncedValue', () => {
    it('returns initial value immediately', () => {
      const { result } = renderHook(() => useDebouncedValue('hello', 500))

      expect(result.current).toBe('hello')
    })

    it('does not update value before delay', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 'hello', delay: 500 } },
      )

      rerender({ value: 'world', delay: 500 })

      // Before the delay, value should still be the old one
      expect(result.current).toBe('hello')
    })

    it('updates value after delay', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 'hello', delay: 500 } },
      )

      rerender({ value: 'world', delay: 500 })

      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(result.current).toBe('world')
    })

    it('resets timer on rapid changes', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 'a', delay: 300 } },
      )

      // Change quickly
      rerender({ value: 'b', delay: 300 })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      rerender({ value: 'c', delay: 300 })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      // Still the original value since timer keeps resetting
      expect(result.current).toBe('a')

      // Wait for the full delay after last change
      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(result.current).toBe('c')
    })

    it('handles different delay values', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 'fast', delay: 100 } },
      )

      rerender({ value: 'updated', delay: 100 })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(result.current).toBe('updated')
    })

    it('works with numeric values', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 0, delay: 200 } },
      )

      rerender({ value: 42, delay: 200 })

      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current).toBe(42)
    })

    it('works with null values', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: null as string | null, delay: 200 } },
      )

      rerender({ value: 'something', delay: 200 })

      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current).toBe('something')
    })

    it('does not update if value returns to original before delay', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 'original', delay: 300 } },
      )

      rerender({ value: 'changed', delay: 300 })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      rerender({ value: 'original', delay: 300 })

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(result.current).toBe('original')
    })
  })

  describe('useDebouncedCallback', () => {
    it('debounces function calls', () => {
      const fn = vi.fn()
      const { result } = renderHook(() => useDebouncedCallback(fn, 300))

      act(() => {
        result.current('first')
        result.current('second')
        result.current('third')
      })

      // Function should not have been called yet
      expect(fn).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(300)
      })

      // Should only be called once with the last argument
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith('third')
    })

    it('calls function after delay', () => {
      const fn = vi.fn()
      const { result } = renderHook(() => useDebouncedCallback(fn, 200))

      act(() => {
        result.current()
      })

      expect(fn).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('resets timer on each call', () => {
      const fn = vi.fn()
      const { result } = renderHook(() => useDebouncedCallback(fn, 300))

      act(() => {
        result.current()
      })

      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(fn).not.toHaveBeenCalled()

      act(() => {
        result.current()
      })

      act(() => {
        vi.advanceTimersByTime(200)
      })

      // Still not called because timer was reset
      expect(fn).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('passes arguments to the debounced function', () => {
      const fn = vi.fn()
      const { result } = renderHook(() => useDebouncedCallback(fn, 100))

      act(() => {
        result.current('arg1', 'arg2', 42)
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 42)
    })

    it('handles multiple separate debounced calls', () => {
      const fn = vi.fn()
      const { result } = renderHook(() => useDebouncedCallback(fn, 100))

      // First call
      act(() => {
        result.current('first')
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith('first')

      // Second call after first completes
      act(() => {
        result.current('second')
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(fn).toHaveBeenCalledTimes(2)
      expect(fn).toHaveBeenLastCalledWith('second')
    })

    it('does not call function if not enough time has passed', () => {
      const fn = vi.fn()
      const { result } = renderHook(() => useDebouncedCallback(fn, 500))

      act(() => {
        result.current()
      })

      act(() => {
        vi.advanceTimersByTime(499)
      })

      expect(fn).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(1)
      })

      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
