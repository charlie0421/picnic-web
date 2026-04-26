import { describe, it, expect } from 'vitest'
import { errorReducer, initialState } from '@/contexts/error-context-reducer'
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error/core'

function createTestError(
  message: string,
  category = ErrorCategory.UNKNOWN,
  severity = ErrorSeverity.MEDIUM,
  statusCode = 500,
): AppError {
  return new AppError(message, category, severity, statusCode)
}

describe('error-context-reducer', () => {
  describe('initialState', () => {
    it('has empty errors array', () => {
      expect(initialState.errors).toEqual([])
    })

    it('has null lastError', () => {
      expect(initialState.lastError).toBeNull()
    })

    it('has isLoading set to false', () => {
      expect(initialState.isLoading).toBe(false)
    })
  })

  describe('ADD_ERROR', () => {
    it('adds an error to the state', () => {
      const error = createTestError('Test error')
      const action = { type: 'ADD_ERROR' as const, payload: { error } }
      const newState = errorReducer(initialState, action)

      expect(newState.errors.length).toBe(1)
      expect(newState.errors[0].error).toBe(error)
    })

    it('sets lastError when adding an error', () => {
      const error = createTestError('Test error')
      const action = { type: 'ADD_ERROR' as const, payload: { error } }
      const newState = errorReducer(initialState, action)

      expect(newState.lastError).toBeDefined()
      expect(newState.lastError?.error).toBe(error)
    })

    it('adds multiple different errors', () => {
      const error1 = createTestError('Error 1')
      const error2 = createTestError('Error 2')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error: error2 },
      })

      expect(state.errors.length).toBe(2)
    })

    it('prevents duplicates within 1 second', () => {
      const error = createTestError('Duplicate error')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error },
      })

      // Should not add the same error twice within dedup window
      expect(state.errors.length).toBe(1)
    })

    it('sets lastError to the most recent error', () => {
      const error1 = createTestError('Error 1')
      const error2 = createTestError('Error 2')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error: error2 },
      })

      expect(state.lastError?.error.message).toBe('Error 2')
    })
  })

  describe('DISMISS_ERROR', () => {
    it('marks an error as dismissed', () => {
      const error = createTestError('Test error')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error },
      })

      const errorId = state.errors[0].id

      state = errorReducer(state, {
        type: 'DISMISS_ERROR' as const,
        payload: { id: errorId },
      })

      expect(state.errors[0].dismissed).toBe(true)
    })

    it('does not affect other errors', () => {
      const error1 = createTestError('Error 1')
      const error2 = createTestError('Error 2')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error: error2 },
      })

      const firstErrorId = state.errors[0].id

      state = errorReducer(state, {
        type: 'DISMISS_ERROR' as const,
        payload: { id: firstErrorId },
      })

      expect(state.errors[0].dismissed).toBe(true)
      expect(state.errors[1].dismissed).toBeFalsy()
    })

    it('handles non-existent error id gracefully', () => {
      const error = createTestError('Test error')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error },
      })

      const prevState = state
      state = errorReducer(state, {
        type: 'DISMISS_ERROR' as const,
        payload: { id: 'non-existent-id' },
      })

      // Should not crash, errors remain unchanged in count
      expect(state.errors.length).toBe(prevState.errors.length)
    })
  })

  describe('AUTO_DISMISS_ERROR', () => {
    it('marks error as dismissed (same behavior as DISMISS_ERROR)', () => {
      const error = createTestError('Auto dismiss test')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error },
      })

      const errorId = state.errors[0].id

      state = errorReducer(state, {
        type: 'AUTO_DISMISS_ERROR' as const,
        payload: { id: errorId },
      })

      expect(state.errors[0].dismissed).toBe(true)
    })
  })

  describe('CLEAR_ALL_ERRORS', () => {
    it('resets errors and lastError', () => {
      const error1 = createTestError('Error 1')
      const error2 = createTestError('Error 2')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error: error2 },
      })

      state = errorReducer(state, { type: 'CLEAR_ALL_ERRORS' as const })

      expect(state.errors).toEqual([])
      expect(state.lastError).toBeNull()
    })

    it('works on already empty state', () => {
      const state = errorReducer(initialState, {
        type: 'CLEAR_ALL_ERRORS' as const,
      })

      expect(state.errors).toEqual([])
      expect(state.lastError).toBeNull()
    })
  })

  describe('CLEAR_DISMISSED_ERRORS', () => {
    it('removes dismissed errors, keeps active ones', () => {
      const error1 = createTestError('Error 1')
      const error2 = createTestError('Error 2')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error: error2 },
      })

      const firstErrorId = state.errors[0].id

      // Dismiss first error
      state = errorReducer(state, {
        type: 'DISMISS_ERROR' as const,
        payload: { id: firstErrorId },
      })

      // Clear dismissed
      state = errorReducer(state, {
        type: 'CLEAR_DISMISSED_ERRORS' as const,
      })

      expect(state.errors.length).toBe(1)
      expect(state.errors[0].error.message).toBe('Error 2')
    })

    it('keeps all errors when none are dismissed', () => {
      const error1 = createTestError('Error 1')
      const error2 = createTestError('Error 2')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })
      state = errorReducer(state, {
        type: 'ADD_ERROR' as const,
        payload: { error: error2 },
      })

      state = errorReducer(state, {
        type: 'CLEAR_DISMISSED_ERRORS' as const,
      })

      expect(state.errors.length).toBe(2)
    })

    it('removes all errors when all are dismissed', () => {
      const error1 = createTestError('Error 1')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error: error1 },
      })

      const errorId = state.errors[0].id

      state = errorReducer(state, {
        type: 'DISMISS_ERROR' as const,
        payload: { id: errorId },
      })

      state = errorReducer(state, {
        type: 'CLEAR_DISMISSED_ERRORS' as const,
      })

      expect(state.errors.length).toBe(0)
    })
  })

  describe('SET_LOADING', () => {
    it('sets isLoading to true', () => {
      const state = errorReducer(initialState, {
        type: 'SET_LOADING' as const,
        payload: { isLoading: true },
      })

      expect(state.isLoading).toBe(true)
    })

    it('sets isLoading to false', () => {
      const loadingState = { ...initialState, isLoading: true }

      const state = errorReducer(loadingState, {
        type: 'SET_LOADING' as const,
        payload: { isLoading: false },
      })

      expect(state.isLoading).toBe(false)
    })

    it('does not affect errors', () => {
      const error = createTestError('Test error')

      let state = errorReducer(initialState, {
        type: 'ADD_ERROR' as const,
        payload: { error },
      })

      state = errorReducer(state, {
        type: 'SET_LOADING' as const,
        payload: { isLoading: true },
      })

      expect(state.errors.length).toBe(1)
      expect(state.isLoading).toBe(true)
    })
  })

  describe('default case', () => {
    it('returns current state for unknown action', () => {
      const state = errorReducer(initialState, {
        type: 'UNKNOWN_ACTION' as any,
      })

      expect(state).toBe(initialState)
    })
  })
})
