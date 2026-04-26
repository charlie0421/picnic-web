import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AppError, ErrorCategory, ErrorSeverity, DEFAULT_RETRY_CONFIG } from '@/utils/error/core';
import { SocialAuthError, SocialAuthErrorCode } from '@/utils/error/social-auth-error';
import { DataFetchingError, DataFetchingErrorType } from '@/utils/error/data-fetching-error';
import {
  ErrorTransformer,
  ErrorHandler,
  createError,
  createContext,
  handleSupabaseError,
  handleError,
  ConsoleErrorLogger,
  RetryUtility,
  ErrorContextBuilder,
} from '@/utils/error/handlers';

describe('SocialAuthError', () => {
  describe('constructor', () => {
    it('creates error with correct properties', () => {
      const error = new SocialAuthError(
        SocialAuthErrorCode.NETWORK_ERROR,
        'Network failed',
        'google',
      );
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(SocialAuthError);
      expect(error.name).toBe('SocialAuthError');
      expect(error.code).toBe(SocialAuthErrorCode.NETWORK_ERROR);
      expect(error.provider).toBe('google');
      expect(error.category).toBe(ErrorCategory.SOCIAL_AUTH);
    });

    it('determines correct severity for USER_CANCELLED', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.USER_CANCELLED, 'cancelled');
      expect(error.severity).toBe(ErrorSeverity.LOW);
    });

    it('determines correct severity for PROVIDER_NOT_SUPPORTED', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED, 'not supported');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('determines correct severity for NETWORK_ERROR', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.NETWORK_ERROR, 'network');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('determines retryability for NETWORK_ERROR', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.NETWORK_ERROR, 'network');
      expect(error.isRetryable).toBe(true);
    });

    it('determines non-retryability for USER_CANCELLED', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.USER_CANCELLED, 'cancelled');
      expect(error.isRetryable).toBe(false);
    });

    it('determines correct status code for USER_CANCELLED', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.USER_CANCELLED, 'cancelled');
      expect(error.statusCode).toBe(400);
    });

    it('determines correct status code for NETWORK_ERROR', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.NETWORK_ERROR, 'network');
      expect(error.statusCode).toBe(0);
    });

    it('determines correct status code for TOKEN_VALIDATION_FAILED', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.TOKEN_VALIDATION_FAILED, 'invalid');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('toUserMessage', () => {
    it('returns cancellation message for USER_CANCELLED', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.USER_CANCELLED, 'test');
      expect(error.toUserMessage()).toBe('로그인이 취소되었습니다.');
    });

    it('returns provider not supported message', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED, 'test', 'google');
      expect(error.toUserMessage()).toContain('google');
    });

    it('returns network error message', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.NETWORK_ERROR, 'test');
      expect(error.toUserMessage()).toContain('네트워크');
    });

    it('returns provider not available message', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.PROVIDER_NOT_AVAILABLE, 'test', 'kakao');
      expect(error.toUserMessage()).toContain('kakao');
    });

    it('returns generic message for unknown code', () => {
      const error = new SocialAuthError(SocialAuthErrorCode.UNKNOWN_ERROR, 'test', 'apple');
      expect(error.toUserMessage()).toContain('apple');
    });
  });

  describe('SocialAuthErrorCode enum', () => {
    it('has all expected codes', () => {
      expect(SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED).toBe('provider_not_supported');
      expect(SocialAuthErrorCode.USER_CANCELLED).toBe('user_cancelled');
      expect(SocialAuthErrorCode.NETWORK_ERROR).toBe('network_error');
      expect(SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED).toBe('token_exchange_failed');
      expect(SocialAuthErrorCode.PROFILE_FETCH_FAILED).toBe('profile_fetch_failed');
    });
  });
});

describe('DataFetchingError', () => {
  describe('constructor', () => {
    it('creates error with correct properties', () => {
      const error = new DataFetchingError('Data not found', DataFetchingErrorType.NOT_FOUND, 404);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(DataFetchingError);
      expect(error.name).toBe('DataFetchingError');
      expect(error.type).toBe(DataFetchingErrorType.NOT_FOUND);
      expect(error.statusCode).toBe(404);
    });

    it('maps NOT_FOUND to correct category', () => {
      const error = new DataFetchingError('not found', DataFetchingErrorType.NOT_FOUND, 404);
      expect(error.category).toBe(ErrorCategory.NOT_FOUND);
    });

    it('maps UNAUTHORIZED to authentication category', () => {
      const error = new DataFetchingError('unauthorized', DataFetchingErrorType.UNAUTHORIZED, 401);
      expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
    });

    it('maps FORBIDDEN to authorization category', () => {
      const error = new DataFetchingError('forbidden', DataFetchingErrorType.FORBIDDEN, 403);
      expect(error.category).toBe(ErrorCategory.AUTHORIZATION);
    });

    it('maps SERVER to server category', () => {
      const error = new DataFetchingError('server error', DataFetchingErrorType.SERVER, 500);
      expect(error.category).toBe(ErrorCategory.SERVER);
    });

    it('maps NETWORK to network category', () => {
      const error = new DataFetchingError('network', DataFetchingErrorType.NETWORK);
      expect(error.category).toBe(ErrorCategory.NETWORK);
    });

    it('determines LOW severity for NOT_FOUND', () => {
      const error = new DataFetchingError('not found', DataFetchingErrorType.NOT_FOUND, 404);
      expect(error.severity).toBe(ErrorSeverity.LOW);
    });

    it('determines HIGH severity for SERVER', () => {
      const error = new DataFetchingError('server', DataFetchingErrorType.SERVER, 500);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('is retryable for NETWORK type', () => {
      const error = new DataFetchingError('network', DataFetchingErrorType.NETWORK);
      expect(error.isRetryable).toBe(true);
    });

    it('is retryable for SERVER type', () => {
      const error = new DataFetchingError('server', DataFetchingErrorType.SERVER, 500);
      expect(error.isRetryable).toBe(true);
    });

    it('is not retryable for NOT_FOUND type', () => {
      const error = new DataFetchingError('not found', DataFetchingErrorType.NOT_FOUND, 404);
      expect(error.isRetryable).toBe(false);
    });

    it('uses default values', () => {
      const error = new DataFetchingError('error');
      expect(error.type).toBe(DataFetchingErrorType.UNKNOWN);
      expect(error.statusCode).toBe(500);
    });
  });
});

describe('ErrorTransformer', () => {
  describe('fromSupabaseError', () => {
    it('transforms known error code 23505 to CONFLICT', () => {
      const pgError = { code: '23505', message: 'duplicate key', details: '', hint: '' };
      const result = ErrorTransformer.fromSupabaseError(pgError as any);
      expect(result).toBeInstanceOf(AppError);
      expect(result.category).toBe(ErrorCategory.CONFLICT);
      expect(result.statusCode).toBe(409);
    });

    it('transforms unknown error code to SERVER', () => {
      const pgError = { code: '99999', message: 'unknown', details: '', hint: '' };
      const result = ErrorTransformer.fromSupabaseError(pgError as any);
      expect(result.category).toBe(ErrorCategory.SERVER);
      expect(result.statusCode).toBe(500);
    });

    it('transforms authentication error 28P01', () => {
      const pgError = { code: '28P01', message: 'auth failed', details: '', hint: '' };
      const result = ErrorTransformer.fromSupabaseError(pgError as any);
      expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(result.statusCode).toBe(401);
    });

    it('transforms PGRST116 to NOT_FOUND', () => {
      const pgError = { code: 'PGRST116', message: 'no rows', details: '', hint: '' };
      const result = ErrorTransformer.fromSupabaseError(pgError as any);
      expect(result.category).toBe(ErrorCategory.NOT_FOUND);
      expect(result.statusCode).toBe(404);
    });
  });

  describe('fromNetworkError', () => {
    it('identifies timeout errors', () => {
      const error = new Error('Request timeout exceeded');
      const result = ErrorTransformer.fromNetworkError(error);
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.message).toContain('시간이 초과');
      expect(result.isRetryable).toBe(true);
    });

    it('identifies connection errors', () => {
      const error = new Error('Failed to fetch');
      const result = ErrorTransformer.fromNetworkError(error);
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.message).toContain('네트워크');
    });
  });

  describe('fromUnknownError', () => {
    it('returns AppError as-is', () => {
      const original = new AppError('test', ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400);
      const result = ErrorTransformer.fromUnknownError(original);
      expect(result).toBe(original);
    });

    it('transforms plain Error to AppError', () => {
      const error = new Error('something broke');
      const result = ErrorTransformer.fromUnknownError(error);
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('something broke');
      expect(result.category).toBe(ErrorCategory.UNKNOWN);
    });

    it('transforms string to AppError', () => {
      const result = ErrorTransformer.fromUnknownError('string error');
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('string error');
    });

    it('transforms object with code and message (PostgrestError-like)', () => {
      const error = { code: '23505', message: 'duplicate', details: '', hint: '' };
      const result = ErrorTransformer.fromUnknownError(error);
      expect(result).toBeInstanceOf(AppError);
    });

    it('transforms TypeError with fetch to network error', () => {
      const error = new TypeError('Failed to fetch');
      const result = ErrorTransformer.fromUnknownError(error);
      expect(result.category).toBe(ErrorCategory.NETWORK);
    });

    it('handles null/undefined input', () => {
      const result = ErrorTransformer.fromUnknownError(null);
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toContain('알 수 없는');
    });
  });

  describe('fromLegacySocialAuthError', () => {
    it('creates SocialAuthError', () => {
      const result = ErrorTransformer.fromLegacySocialAuthError(
        SocialAuthErrorCode.NETWORK_ERROR,
        'Network error',
        'google',
      );
      expect(result).toBeInstanceOf(SocialAuthError);
      expect(result.code).toBe(SocialAuthErrorCode.NETWORK_ERROR);
      expect(result.provider).toBe('google');
    });
  });

  describe('fromLegacyDataFetchingError', () => {
    it('creates DataFetchingError', () => {
      const result = ErrorTransformer.fromLegacyDataFetchingError(
        'Not found',
        DataFetchingErrorType.NOT_FOUND,
        404,
      );
      expect(result).toBeInstanceOf(DataFetchingError);
      expect(result.type).toBe(DataFetchingErrorType.NOT_FOUND);
    });
  });
});

describe('ErrorHandler', () => {
  describe('handle', () => {
    it('transforms and returns AppError', async () => {
      const result = await ErrorHandler.handle(new Error('test'));
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('test');
    });

    it('logs the error', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await ErrorHandler.handle(new Error('test'));
      consoleSpy.mockRestore();
    });
  });

  describe('wrap', () => {
    it('returns data on success', async () => {
      const result = await ErrorHandler.wrap(() => Promise.resolve('data'));
      expect(result.data).toBe('data');
      expect(result.error).toBeUndefined();
    });

    it('returns error on failure', async () => {
      const result = await ErrorHandler.wrap(() => Promise.reject(new Error('fail')));
      expect(result.error).toBeInstanceOf(AppError);
      expect(result.data).toBeUndefined();
    });
  });

  describe('setLogger', () => {
    it('accepts a custom logger', () => {
      const customLogger = { log: vi.fn() };
      expect(() => ErrorHandler.setLogger(customLogger)).not.toThrow();
    });
  });
});

describe('createError convenience functions', () => {
  it('creates authentication error', () => {
    const error = createError.authentication('need login');
    expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
    expect(error.statusCode).toBe(401);
  });

  it('creates authorization error', () => {
    const error = createError.authorization('no access');
    expect(error.category).toBe(ErrorCategory.AUTHORIZATION);
    expect(error.statusCode).toBe(403);
  });

  it('creates validation error', () => {
    const error = createError.validation('invalid input');
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.statusCode).toBe(400);
  });

  it('creates notFound error', () => {
    const error = createError.notFound('missing');
    expect(error.category).toBe(ErrorCategory.NOT_FOUND);
    expect(error.statusCode).toBe(404);
  });

  it('creates conflict error', () => {
    const error = createError.conflict('duplicate');
    expect(error.category).toBe(ErrorCategory.CONFLICT);
    expect(error.statusCode).toBe(409);
  });

  it('creates network error (retryable)', () => {
    const error = createError.network('offline');
    expect(error.category).toBe(ErrorCategory.NETWORK);
    expect(error.isRetryable).toBe(true);
  });

  it('creates server error (retryable)', () => {
    const error = createError.server('internal');
    expect(error.category).toBe(ErrorCategory.SERVER);
    expect(error.isRetryable).toBe(true);
    expect(error.statusCode).toBe(500);
  });

  it('creates socialAuth error', () => {
    const error = createError.socialAuth(SocialAuthErrorCode.USER_CANCELLED, 'cancelled', 'google');
    expect(error).toBeInstanceOf(SocialAuthError);
    expect(error.provider).toBe('google');
  });

  it('creates dataFetching error', () => {
    const error = createError.dataFetching('fetch failed', DataFetchingErrorType.SERVER);
    expect(error).toBeInstanceOf(DataFetchingError);
    expect(error.type).toBe(DataFetchingErrorType.SERVER);
  });
});

describe('createContext', () => {
  it('returns an ErrorContextBuilder', () => {
    const builder = createContext();
    expect(builder).toBeInstanceOf(ErrorContextBuilder);
  });
});

describe('ErrorContextBuilder', () => {
  it('builds context with all fields', () => {
    const context = new ErrorContextBuilder()
      .setUserId('user-1')
      .setSessionId('session-1')
      .setRequestId('req-1')
      .setUserAgent('Mozilla/5.0')
      .setUrl('/api/test')
      .setAdditionalData({ extra: 'data' })
      .build();

    expect(context.userId).toBe('user-1');
    expect(context.sessionId).toBe('session-1');
    expect(context.requestId).toBe('req-1');
    expect(context.userAgent).toBe('Mozilla/5.0');
    expect(context.url).toBe('/api/test');
    expect(context.additionalData).toEqual({ extra: 'data' });
    expect(context.timestamp).toBeInstanceOf(Date);
  });

  it('supports method chaining', () => {
    const builder = new ErrorContextBuilder();
    const result = builder.setUserId('1').setSessionId('2');
    expect(result).toBe(builder);
  });
});

describe('ConsoleErrorLogger', () => {
  it('logs CRITICAL errors with console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new ConsoleErrorLogger();
    const error = new AppError('critical', ErrorCategory.SERVER, ErrorSeverity.CRITICAL, 500);
    logger.log(error);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs HIGH errors with console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new ConsoleErrorLogger();
    const error = new AppError('high', ErrorCategory.SERVER, ErrorSeverity.HIGH, 500);
    logger.log(error);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs MEDIUM errors with console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ConsoleErrorLogger();
    const error = new AppError('medium', ErrorCategory.SERVER, ErrorSeverity.MEDIUM, 500);
    logger.log(error);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs LOW errors with console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new ConsoleErrorLogger();
    const error = new AppError('low', ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400);
    logger.log(error);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('RetryUtility', () => {
  describe('withRetry', () => {
    it('returns result on first successful attempt', async () => {
      const result = await RetryUtility.withRetry(() => Promise.resolve('data'));
      expect(result).toBe('data');
    });

    it('retries and succeeds on second attempt', async () => {
      let attempt = 0;
      const result = await RetryUtility.withRetry(
        () => {
          attempt++;
          if (attempt === 1) {
            const err = new AppError('fail', ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, 500, { isRetryable: true });
            return Promise.reject(err);
          }
          return Promise.resolve('recovered');
        },
        { baseDelay: 1, maxDelay: 2 },
      );
      expect(result).toBe('recovered');
    });

    it('throws non-retryable errors immediately', async () => {
      const error = new AppError('validation', ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400);
      await expect(
        RetryUtility.withRetry(() => Promise.reject(error), { baseDelay: 1, maxDelay: 2 }),
      ).rejects.toThrow('validation');
    });

    it('throws after exhausting all retries', async () => {
      const error = new AppError('network', ErrorCategory.NETWORK, ErrorSeverity.HIGH, 0, { isRetryable: true });
      await expect(
        RetryUtility.withRetry(
          () => Promise.reject(error),
          { maxAttempts: 2, baseDelay: 1, maxDelay: 2 },
        ),
      ).rejects.toThrow('network');
    });

    it('uses custom errorTransformer when provided', async () => {
      const transformer = vi.fn().mockReturnValue(
        new AppError('transformed', ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400),
      );
      await expect(
        RetryUtility.withRetry(
          () => Promise.reject(new Error('raw')),
          {},
          undefined,
          transformer,
        ),
      ).rejects.toThrow('transformed');
      expect(transformer).toHaveBeenCalled();
    });
  });
});

describe('legacy compatibility functions', () => {
  describe('handleSupabaseError', () => {
    it('transforms PostgrestError to AppError', () => {
      const pgError = { code: '23505', message: 'duplicate', details: '', hint: '' };
      const result = handleSupabaseError(pgError as any);
      expect(result).toBeInstanceOf(AppError);
      expect(result.category).toBe(ErrorCategory.CONFLICT);
    });
  });

  describe('handleError', () => {
    it('transforms unknown error to AppError', () => {
      const result = handleError(new Error('test'));
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('test');
    });

    it('returns AppError as-is', () => {
      const original = new AppError('original', ErrorCategory.SERVER);
      const result = handleError(original);
      expect(result).toBe(original);
    });
  });
});
