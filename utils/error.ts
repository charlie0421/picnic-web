/**
 * 중앙화된 에러 핸들링 유틸리티 모듈
 *
 * Barrel re-export — 기존 import 경로(@/utils/error) 유지
 */

// Core types and classes
export { ErrorCategory, ErrorSeverity, AppError, DEFAULT_RETRY_CONFIG } from './error/core';
export type { ErrorContext, RetryConfig } from './error/core';

// Social auth errors
export { SocialAuthErrorCode, SocialAuthError } from './error/social-auth-error';
export type { SocialLoginProvider } from './error/social-auth-error';

// Data fetching errors
export { DataFetchingErrorType, DataFetchingError } from './error/data-fetching-error';

// Handlers and utilities
export {
  ErrorTransformer,
  ConsoleErrorLogger,
  RetryUtility,
  ErrorHandler,
  ErrorContextBuilder,
  createError,
  createContext,
  handleSupabaseError,
  handleError,
} from './error/handlers';
export type { ErrorLogger } from './error/handlers';
