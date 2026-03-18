import { describe, it, expect } from 'vitest'
import {
  AppError,
  ErrorCategory,
  ErrorSeverity,
  DEFAULT_RETRY_CONFIG,
} from '@/utils/error/core'

describe('AppError', () => {
  it('creates an error with default values', () => {
    const error = new AppError('Something went wrong')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toBe('Something went wrong')
    expect(error.name).toBe('AppError')
    expect(error.category).toBe(ErrorCategory.UNKNOWN)
    expect(error.severity).toBe(ErrorSeverity.MEDIUM)
    expect(error.statusCode).toBe(500)
  })

  it('creates an error with custom category', () => {
    const error = new AppError('Network failure', ErrorCategory.NETWORK)
    expect(error.message).toBe('Network failure')
    expect(error.category).toBe(ErrorCategory.NETWORK)
  })

  it('creates an error with custom status code', () => {
    const error = new AppError('Not found', ErrorCategory.NOT_FOUND, ErrorSeverity.LOW, 404)
    expect(error.statusCode).toBe(404)
  })

  it('creates an error with all custom values', () => {
    const error = new AppError(
      'Auth failed',
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.HIGH,
      401,
      { isRetryable: false },
    )
    expect(error.category).toBe(ErrorCategory.AUTHENTICATION)
    expect(error.statusCode).toBe(401)
    expect(error.severity).toBe(ErrorSeverity.HIGH)
    expect(error.isRetryable).toBe(false)
  })

  it('sets retryability based on category for network errors', () => {
    const error = new AppError('Network error', ErrorCategory.NETWORK)
    expect(error.isRetryable).toBe(true)
  })

  it('sets retryability to false for auth errors', () => {
    const error = new AppError('Auth error', ErrorCategory.AUTHENTICATION)
    expect(error.isRetryable).toBe(false)
  })

  it('sets retryability to false for validation errors', () => {
    const error = new AppError('Validation error', ErrorCategory.VALIDATION)
    expect(error.isRetryable).toBe(false)
  })

  it('allows overriding retryability', () => {
    const error = new AppError(
      'Network error',
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      500,
      { isRetryable: false },
    )
    expect(error.isRetryable).toBe(false)
  })

  it('preserves the original error', () => {
    const cause = new Error('Original error')
    const error = new AppError(
      'Wrapped error',
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      500,
      { originalError: cause },
    )
    expect(error.originalError).toBe(cause)
  })

  it('has a timestamp', () => {
    const error = new AppError('Test')
    expect(error.timestamp).toBeInstanceOf(Date)
  })
})

describe('toUserMessage', () => {
  it('returns correct message for network category', () => {
    const error = new AppError('Connection timeout', ErrorCategory.NETWORK)
    const message = error.toUserMessage()
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(0)
  })

  it('returns correct message for auth category', () => {
    const error = new AppError('Token expired', ErrorCategory.AUTHENTICATION)
    const message = error.toUserMessage()
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(0)
  })

  it('returns correct message for validation category', () => {
    const error = new AppError('Invalid input', ErrorCategory.VALIDATION)
    const message = error.toUserMessage()
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(0)
  })

  it('returns a generic message for unknown category', () => {
    const error = new AppError('Unknown issue')
    const message = error.toUserMessage()
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(0)
  })

  it('returns message for each category', () => {
    const categories = Object.values(ErrorCategory)
    categories.forEach(cat => {
      const error = new AppError('test', cat)
      expect(typeof error.toUserMessage()).toBe('string')
    })
  })
})

describe('toLogData', () => {
  it('returns structured log data', () => {
    const error = new AppError('Something failed', ErrorCategory.NETWORK, ErrorSeverity.HIGH, 500)
    const logData = error.toLogData()
    expect(logData).toBeDefined()
    expect(typeof logData).toBe('object')
    expect(logData).toHaveProperty('message', 'Something failed')
  })

  it('includes category in log data', () => {
    const error = new AppError('Auth error', ErrorCategory.AUTHENTICATION)
    const logData = error.toLogData()
    expect(logData).toHaveProperty('category', ErrorCategory.AUTHENTICATION)
  })

  it('includes status code in log data', () => {
    const error = new AppError('Not found', ErrorCategory.NOT_FOUND, ErrorSeverity.LOW, 404)
    const logData = error.toLogData()
    expect(logData).toHaveProperty('statusCode', 404)
  })

  it('includes retryable flag', () => {
    const error = new AppError('Error', ErrorCategory.NETWORK)
    const logData = error.toLogData()
    expect(logData).toHaveProperty('isRetryable', true)
  })
})

describe('toApiResponse', () => {
  it('returns API response format', () => {
    const error = new AppError('Server error', ErrorCategory.SERVER, ErrorSeverity.HIGH, 500)
    const response = error.toApiResponse()
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response).toHaveProperty('error')
  })

  it('includes error message', () => {
    const error = new AppError('Bad request', ErrorCategory.CLIENT, ErrorSeverity.LOW, 400)
    const response = error.toApiResponse()
    expect(response.error).toHaveProperty('message')
  })

  it('includes status code', () => {
    const error = new AppError('Unauthorized', ErrorCategory.AUTHENTICATION, ErrorSeverity.HIGH, 401)
    const response = error.toApiResponse()
    expect(response.error.statusCode).toBe(401)
  })
})

describe('DEFAULT_RETRY_CONFIG', () => {
  it('is defined', () => {
    expect(DEFAULT_RETRY_CONFIG).toBeDefined()
  })

  it('has maxAttempts property', () => {
    expect(DEFAULT_RETRY_CONFIG).toHaveProperty('maxAttempts')
    expect(typeof DEFAULT_RETRY_CONFIG.maxAttempts).toBe('number')
  })

  it('has reasonable maxAttempts value', () => {
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeLessThanOrEqual(10)
  })

  it('has delay-related properties', () => {
    expect(DEFAULT_RETRY_CONFIG).toHaveProperty('baseDelay')
    expect(typeof DEFAULT_RETRY_CONFIG.baseDelay).toBe('number')
  })

  it('has retryableCategories', () => {
    expect(DEFAULT_RETRY_CONFIG).toHaveProperty('retryableCategories')
    expect(Array.isArray(DEFAULT_RETRY_CONFIG.retryableCategories)).toBe(true)
    expect(DEFAULT_RETRY_CONFIG.retryableCategories).toContain(ErrorCategory.NETWORK)
  })
})
