/**
 * 중앙화된 에러 핸들링 유틸리티 모듈 - 코어 타입 및 클래스
 *
 * 이 모듈은 애플리케이션 전반에서 일관된 에러 처리를 제공합니다.
 * 프론트엔드와 백엔드 모두에서 사용 가능하도록 설계되었습니다.
 */

/**
 * 애플리케이션 에러 카테고리
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  NETWORK = 'network',
  SERVER = 'server',
  CLIENT = 'client',
  EXTERNAL_SERVICE = 'external_service',
  SOCIAL_AUTH = 'social_auth',
  DATA_FETCHING = 'data_fetching',
  UNKNOWN = 'unknown',
}

/**
 * 에러 심각도 레벨
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 에러 컨텍스트 정보
 */
export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  userAgent?: string;
  url?: string;
  timestamp?: Date;
  additionalData?: Record<string, unknown>;
}

/**
 * 재시도 설정
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableCategories: ErrorCategory[];
}

/**
 * 기본 재시도 설정
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableCategories: [ErrorCategory.NETWORK, ErrorCategory.SERVER, ErrorCategory.EXTERNAL_SERVICE],
};

/**
 * 통합 애플리케이션 에러 클래스
 */
export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly statusCode: number;
  readonly isRetryable: boolean;
  readonly context?: ErrorContext;
  readonly originalError?: unknown;
  readonly timestamp: Date;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    statusCode: number = 500,
    options: {
      isRetryable?: boolean;
      context?: ErrorContext;
      originalError?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.severity = severity;
    this.statusCode = statusCode;
    this.isRetryable = options.isRetryable ?? this.determineRetryability(category);
    this.context = options.context;
    this.originalError = options.originalError;
    this.timestamp = new Date();

    // Error 스택 트레이스 보존
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * 카테고리에 따른 재시도 가능성 결정
   */
  private determineRetryability(category: ErrorCategory): boolean {
    return DEFAULT_RETRY_CONFIG.retryableCategories.includes(category);
  }

  /**
   * 사용자 친화적인 메시지 반환
   */
  toUserMessage(): string {
    switch (this.category) {
      case ErrorCategory.AUTHENTICATION:
        return '로그인이 필요합니다. 다시 로그인해 주세요.';
      case ErrorCategory.AUTHORIZATION:
        return '접근 권한이 없습니다.';
      case ErrorCategory.VALIDATION:
        return '입력하신 정보를 다시 확인해 주세요.';
      case ErrorCategory.NOT_FOUND:
        return '요청하신 정보를 찾을 수 없습니다.';
      case ErrorCategory.CONFLICT:
        return '이미 존재하는 데이터입니다.';
      case ErrorCategory.NETWORK:
        return '네트워크 연결을 확인해 주세요.';
      case ErrorCategory.SERVER:
        return '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      case ErrorCategory.EXTERNAL_SERVICE:
        return '외부 서비스 연결에 문제가 발생했습니다.';
      case ErrorCategory.SOCIAL_AUTH:
        return '소셜 로그인 중 문제가 발생했습니다. 다시 시도해 주세요.';
      case ErrorCategory.DATA_FETCHING:
        return '데이터를 불러오는 중 문제가 발생했습니다.';
      default:
        return '알 수 없는 오류가 발생했습니다.';
    }
  }

  /**
   * 로깅용 상세 정보 반환
   */
  toLogData(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
      originalError: this.originalError instanceof Error
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : this.originalError,
    };
  }

  /**
   * API 응답용 직렬화
   */
  toApiResponse(): {
    error: {
      message: string;
      category: string;
      statusCode: number;
      timestamp: string;
      requestId?: string;
    };
  } {
    return {
      error: {
        message: this.toUserMessage(),
        category: this.category,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        requestId: this.context?.requestId,
      },
    };
  }
}
