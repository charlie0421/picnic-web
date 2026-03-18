import { describe, it, expect, beforeEach } from 'vitest'
import { useVoteFilterStore, VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore'

describe('voteFilterStore', () => {
  beforeEach(() => {
    useVoteFilterStore.setState({
      selectedStatus: VOTE_STATUS.ONGOING,
      selectedArea: VOTE_AREAS.ALL,
    })
  })

  describe('constants', () => {
    it('VOTE_STATUS contains expected status values', () => {
      expect(VOTE_STATUS).toBeDefined()
      expect(VOTE_STATUS.UPCOMING).toBe('upcoming')
      expect(VOTE_STATUS.ONGOING).toBe('ongoing')
      expect(VOTE_STATUS.COMPLETED).toBe('completed')
    })

    it('VOTE_AREAS contains expected area values', () => {
      expect(VOTE_AREAS).toBeDefined()
      expect(VOTE_AREAS.ALL).toBe('all')
      expect(VOTE_AREAS.KPOP).toBe('kpop')
    })
  })

  describe('initial state', () => {
    it('has default selectedStatus of ongoing', () => {
      const state = useVoteFilterStore.getState()
      expect(state.selectedStatus).toBe('ongoing')
    })

    it('has default selectedArea of all', () => {
      const state = useVoteFilterStore.getState()
      expect(state.selectedArea).toBe('all')
    })
  })

  describe('setSelectedStatus', () => {
    it('sets a valid status correctly', () => {
      const { setSelectedStatus } = useVoteFilterStore.getState()

      Object.values(VOTE_STATUS).forEach((status) => {
        setSelectedStatus(status)
        expect(useVoteFilterStore.getState().selectedStatus).toBe(status)
      })
    })

    it('falls back to default for invalid status', () => {
      const { setSelectedStatus } = useVoteFilterStore.getState()
      setSelectedStatus('invalid-status-value' as any)

      const state = useVoteFilterStore.getState()
      expect(Object.values(VOTE_STATUS)).toContain(state.selectedStatus)
    })

    it('does not affect selectedArea', () => {
      const { setSelectedStatus } = useVoteFilterStore.getState()
      setSelectedStatus(VOTE_STATUS.COMPLETED)

      const state = useVoteFilterStore.getState()
      expect(state.selectedArea).toBe('all')
    })
  })

  describe('setSelectedArea', () => {
    it('sets a valid area correctly', () => {
      const { setSelectedArea } = useVoteFilterStore.getState()

      Object.values(VOTE_AREAS).forEach((area) => {
        setSelectedArea(area)
        expect(useVoteFilterStore.getState().selectedArea).toBe(area)
      })
    })

    it('falls back to default for invalid area', () => {
      const { setSelectedArea } = useVoteFilterStore.getState()
      setSelectedArea('invalid-area-value' as any)

      const state = useVoteFilterStore.getState()
      expect(Object.values(VOTE_AREAS)).toContain(state.selectedArea)
    })

    it('does not affect selectedStatus', () => {
      const { setSelectedArea } = useVoteFilterStore.getState()
      setSelectedArea(VOTE_AREAS.KPOP)

      const state = useVoteFilterStore.getState()
      expect(state.selectedStatus).toBe('ongoing')
    })
  })

  describe('resetFilters', () => {
    it('resets to defaults (ongoing, all)', () => {
      const store = useVoteFilterStore.getState()
      store.setSelectedStatus(VOTE_STATUS.COMPLETED)
      store.setSelectedArea(VOTE_AREAS.KPOP)

      useVoteFilterStore.getState().resetFilters()

      const state = useVoteFilterStore.getState()
      expect(state.selectedStatus).toBe('ongoing')
      expect(state.selectedArea).toBe('all')
    })

    it('is idempotent when already at defaults', () => {
      useVoteFilterStore.getState().resetFilters()

      const state = useVoteFilterStore.getState()
      expect(state.selectedStatus).toBe('ongoing')
      expect(state.selectedArea).toBe('all')
    })
  })

  describe('validateAndFixState', () => {
    it('fixes invalid selectedStatus', () => {
      useVoteFilterStore.setState({ selectedStatus: 'bogus' as any })

      useVoteFilterStore.getState().validateAndFixState()

      const state = useVoteFilterStore.getState()
      expect(Object.values(VOTE_STATUS)).toContain(state.selectedStatus)
    })

    it('fixes invalid selectedArea', () => {
      useVoteFilterStore.setState({ selectedArea: 'bogus' as any })

      useVoteFilterStore.getState().validateAndFixState()

      const state = useVoteFilterStore.getState()
      expect(Object.values(VOTE_AREAS)).toContain(state.selectedArea)
    })

    it('leaves valid state unchanged', () => {
      useVoteFilterStore.setState({
        selectedStatus: VOTE_STATUS.ONGOING,
        selectedArea: VOTE_AREAS.ALL,
      })

      useVoteFilterStore.getState().validateAndFixState()

      const state = useVoteFilterStore.getState()
      expect(state.selectedStatus).toBe('ongoing')
      expect(state.selectedArea).toBe('all')
    })

    it('fixes both invalid fields at once', () => {
      useVoteFilterStore.setState({
        selectedStatus: 'xxx' as any,
        selectedArea: 'yyy' as any,
      })

      useVoteFilterStore.getState().validateAndFixState()

      const state = useVoteFilterStore.getState()
      expect(Object.values(VOTE_STATUS)).toContain(state.selectedStatus)
      expect(Object.values(VOTE_AREAS)).toContain(state.selectedArea)
    })
  })
})
