/**
 * 소셜 인증 에러 모듈
 */

import { AppError, ErrorCategory, ErrorSeverity, type ErrorContext } from './core';

/**
 * 소셜 인증 에러 코드
 */
export enum SocialAuthErrorCode {
  PROVIDER_NOT_SUPPORTED = 'provider_not_supported',
  INITIALIZATION_FAILED = 'initialization_failed',
  AUTH_PROCESS_FAILED = 'auth_process_failed',
  CALLBACK_FAILED = 'callback_failed',
  USER_CANCELLED = 'user_cancelled',
  NETWORK_ERROR = 'network_error',
  TOKEN_EXCHANGE_FAILED = 'token_exchange_failed',
  PROFILE_FETCH_FAILED = 'profile_fetch_failed',
  INVALID_RESPONSE = 'invalid_response',
  INVALID_STATE = 'invalid_state',
  UNKNOWN_ERROR = 'unknown_error',
  PROVIDER_NOT_AVAILABLE = 'provider_not_available',
  USER_INFO_FAILED = 'user_info_failed',
  SESSION_CREATION_FAILED = 'session_creation_failed',
  TOKEN_VALIDATION_FAILED = 'token_validation_failed',
  TOKEN_REFRESH_FAILED = 'token_refresh_failed'
}

/**
 * 소셜 로그인 제공자 타입
 */
export type SocialLoginProvider = 'google' | 'apple' | 'kakao';

/**
 * 소셜 인증 에러 클래스 (AppError 확장)
 */
export class SocialAuthError extends AppError {
  readonly code: SocialAuthErrorCode;
  readonly provider?: SocialLoginProvider;

  constructor(
    code: SocialAuthErrorCode,
    message: string,
    provider?: SocialLoginProvider,
    originalError?: unknown,
    context?: ErrorContext
  ) {
    const severity = SocialAuthError.determineSeverity(code);
    const statusCode = SocialAuthError.determineStatusCode(code);

    super(message, ErrorCategory.SOCIAL_AUTH, severity, statusCode, {
      isRetryable: SocialAuthError.determineRetryability(code),
      context,
      originalError,
    });

    this.name = 'SocialAuthError';
    this.code = code;
    this.provider = provider;
  }

  private static determineSeverity(code: SocialAuthErrorCode): ErrorSeverity {
    switch (code) {
      case SocialAuthErrorCode.USER_CANCELLED:
        return ErrorSeverity.LOW;
      case SocialAuthErrorCode.NETWORK_ERROR:
      case SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED:
      case SocialAuthErrorCode.PROFILE_FETCH_FAILED:
        return ErrorSeverity.MEDIUM;
      case SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED:
      case SocialAuthErrorCode.INITIALIZATION_FAILED:
        return ErrorSeverity.HIGH;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private static determineStatusCode(code: SocialAuthErrorCode): number {
    switch (code) {
      case SocialAuthErrorCode.USER_CANCELLED:
        return 400;
      case SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED:
        return 400;
      case SocialAuthErrorCode.TOKEN_VALIDATION_FAILED:
      case SocialAuthErrorCode.INVALID_STATE:
        return 401;
      case SocialAuthErrorCode.NETWORK_ERROR:
        return 0; // Network error
      default:
        return 500;
    }
  }

  private static determineRetryability(code: SocialAuthErrorCode): boolean {
    const retryableCodes = [
      SocialAuthErrorCode.NETWORK_ERROR,
      SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED,
      SocialAuthErrorCode.PROFILE_FETCH_FAILED,
      SocialAuthErrorCode.SESSION_CREATION_FAILED,
    ];
    return retryableCodes.includes(code);
  }

  /**
   * 사용자 친화적인 메시지 반환 (소셜 인증 특화)
   */
  toUserMessage(): string {
    switch (this.code) {
      case SocialAuthErrorCode.USER_CANCELLED:
        return '로그인이 취소되었습니다.';
      case SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED:
        return `${this.provider} 로그인은 현재 지원되지 않습니다.`;
      case SocialAuthErrorCode.NETWORK_ERROR:
        return '네트워크 연결을 확인하고 다시 시도해 주세요.';
      case SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED:
        return '로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.';
      case SocialAuthErrorCode.PROVIDER_NOT_AVAILABLE:
        return `${this.provider} 로그인 서비스를 사용할 수 없습니다.`;
      default:
        return `${this.provider} 로그인 중 오류가 발생했습니다.`;
    }
  }
}
