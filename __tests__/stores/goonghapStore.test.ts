import { describe, it, expect, beforeEach } from 'vitest'
import { useGoonghapStore } from '@/stores/goonghapStore'

const mockResult = {
  id: 'test-1',
  artist_id: 1,
  score: 85,
  status: 'completed' as const,
  is_paid: false,
  is_ads: false,
  created_at: '2024-01-01',
}

const mockResult2 = {
  id: 'test-2',
  artist_id: 2,
  score: 92,
  status: 'completed' as const,
  is_paid: true,
  is_ads: false,
  created_at: '2024-01-02',
}

const mockResult3 = {
  id: 'test-3',
  artist_id: 3,
  score: 70,
  status: 'completed' as const,
  is_paid: false,
  is_ads: true,
  created_at: '2024-01-03',
}

describe('goonghapStore', () => {
  beforeEach(() => {
    useGoonghapStore.setState({
      cache: new Map(),
      listResults: [],
    })
  })

  describe('setListResults', () => {
    it('adds results to cache and listResults', () => {
      const { setListResults } = useGoonghapStore.getState()
      setListResults([mockResult, mockResult2])

      const state = useGoonghapStore.getState()
      expect(state.listResults).toHaveLength(2)
      expect(state.listResults).toEqual([mockResult, mockResult2])
      expect(state.cache.get(mockResult.id)).toEqual(mockResult)
      expect(state.cache.get(mockResult2.id)).toEqual(mockResult2)
    })

    it('adds multiple results to cache keyed by id', () => {
      const { setListResults } = useGoonghapStore.getState()
      setListResults([mockResult, mockResult2, mockResult3])

      const state = useGoonghapStore.getState()
      expect(state.cache.size).toBe(3)
      expect(state.cache.get('test-1')).toEqual(mockResult)
      expect(state.cache.get('test-2')).toEqual(mockResult2)
      expect(state.cache.get('test-3')).toEqual(mockResult3)
    })

    it('replaces listResults on subsequent calls', () => {
      const { setListResults } = useGoonghapStore.getState()
      setListResults([mockResult])

      expect(useGoonghapStore.getState().listResults).toHaveLength(1)

      useGoonghapStore.getState().setListResults([mockResult2, mockResult3])

      const state = useGoonghapStore.getState()
      expect(state.listResults).toHaveLength(2)
      expect(state.listResults).toEqual([mockResult2, mockResult3])
    })

    it('preserves previously cached items when setting new list results', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)
      useGoonghapStore.getState().setListResults([mockResult2])

      const state = useGoonghapStore.getState()
      expect(state.cache.get('test-1')).toEqual(mockResult)
      expect(state.cache.get('test-2')).toEqual(mockResult2)
    })

    it('handles empty array', () => {
      const { setListResults } = useGoonghapStore.getState()
      setListResults([])

      const state = useGoonghapStore.getState()
      expect(state.listResults).toHaveLength(0)
    })
  })

  describe('setCachedResult', () => {
    it('adds a single result to the cache', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)

      const state = useGoonghapStore.getState()
      expect(state.cache.get(mockResult.id)).toEqual(mockResult)
    })

    it('overwrites existing cache entry with same id', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)

      const updatedResult = { ...mockResult, score: 99 }
      useGoonghapStore.getState().setCachedResult(mockResult.id, updatedResult)

      const state = useGoonghapStore.getState()
      expect(state.cache.get(mockResult.id)?.score).toBe(99)
    })

    it('does not affect listResults', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)

      const state = useGoonghapStore.getState()
      expect(state.listResults).toHaveLength(0)
    })

    it('can add multiple items independently', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)
      useGoonghapStore.getState().setCachedResult(mockResult2.id, mockResult2)

      const state = useGoonghapStore.getState()
      expect(state.cache.size).toBe(2)
    })
  })

  describe('getCachedResult', () => {
    it('returns cached item when it exists', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)

      const result = useGoonghapStore.getState().getCachedResult(mockResult.id)
      expect(result).toEqual(mockResult)
    })

    it('returns null when item is not cached', () => {
      const result = useGoonghapStore.getState().getCachedResult('non-existent')
      expect(result).toBeNull()
    })

    it('returns null for empty cache', () => {
      const result = useGoonghapStore.getState().getCachedResult('test-1')
      expect(result).toBeNull()
    })

    it('returns correct item from cache with multiple entries', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)
      useGoonghapStore.getState().setCachedResult(mockResult2.id, mockResult2)
      useGoonghapStore.getState().setCachedResult(mockResult3.id, mockResult3)

      const result = useGoonghapStore.getState().getCachedResult('test-2')
      expect(result).toEqual(mockResult2)
    })
  })

  describe('updateCachedResult', () => {
    it('updates an existing cached item', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)

      useGoonghapStore.getState().updateCachedResult('test-1', { score: 99 })

      const cached = useGoonghapStore.getState().cache.get('test-1')
      expect(cached?.score).toBe(99)
      expect(cached?.artist_id).toBe(1)
    })

    it('ignores update for non-existing item', () => {
      useGoonghapStore.getState().updateCachedResult('non-existent', { score: 99 })

      const state = useGoonghapStore.getState()
      expect(state.cache.get('non-existent')).toBeUndefined()
    })

    it('preserves other fields when updating', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)

      useGoonghapStore.getState().updateCachedResult('test-1', { is_paid: true })

      const cached = useGoonghapStore.getState().cache.get('test-1')
      expect(cached?.is_paid).toBe(true)
      expect(cached?.id).toBe('test-1')
      expect(cached?.artist_id).toBe(1)
      expect(cached?.score).toBe(85)
      expect(cached?.status).toBe('completed')
      expect(cached?.created_at).toBe('2024-01-01')
    })

    it('does not create new entry for non-existing id', () => {
      useGoonghapStore.getState().updateCachedResult('missing', { score: 50 })

      const state = useGoonghapStore.getState()
      expect(state.cache.size).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('resets cache and listResults', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)
      useGoonghapStore.getState().setListResults([mockResult, mockResult2])

      useGoonghapStore.getState().clearCache()

      const state = useGoonghapStore.getState()
      expect(state.cache.size).toBe(0)
      expect(state.listResults).toEqual([])
    })

    it('works when cache is already empty', () => {
      useGoonghapStore.getState().clearCache()

      const state = useGoonghapStore.getState()
      expect(state.cache.size).toBe(0)
      expect(state.listResults).toEqual([])
    })

    it('allows re-populating after clear', () => {
      useGoonghapStore.getState().setCachedResult(mockResult.id, mockResult)
      useGoonghapStore.getState().clearCache()
      useGoonghapStore.getState().setCachedResult(mockResult2.id, mockResult2)

      const state = useGoonghapStore.getState()
      expect(state.cache.get('test-1')).toBeUndefined()
      expect(state.cache.get('test-2')).toEqual(mockResult2)
    })
  })
})
