/**
 * 중앙화된 에러 핸들링 유틸리티 모듈
 * 
 * 이 모듈은 애플리케이션 전반에서 일관된 에러 처리를 제공합니다.
 * 프론트엔드와 백엔드 모두에서 사용 가능하도록 설계되었습니다.
 */

import { PostgrestError } from '@supabase/supabase-js';

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
export type SocialLoginProvider = 'google' | 'apple' | 'kakao' | 'wechat';

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

/**
 * 데이터 페칭 에러 타입
 */
export enum DataFetchingErrorType {
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  VALIDATION = "VALIDATION",
  SERVER = "SERVER",
  NETWORK = "NETWORK",
  UNKNOWN = "UNKNOWN",
}

/**
 * 데이터 페칭 에러 클래스 (AppError 확장)
 */
export class DataFetchingError extends AppError {
  readonly type: DataFetchingErrorType;

  constructor(
    message: string,
    type: DataFetchingErrorType = DataFetchingErrorType.UNKNOWN,
    statusCode: number = 500,
    originalError?: unknown,
    context?: ErrorContext
  ) {
    const category = DataFetchingError.mapTypeToCategory(type);
    const severity = DataFetchingError.determineSeverity(type);
    
    super(message, category, severity, statusCode, {
      isRetryable: DataFetchingError.determineRetryability(type),
      context,
      originalError,
    });
    
    this.name = 'DataFetchingError';
    this.type = type;
  }

  private static mapTypeToCategory(type: DataFetchingErrorType): ErrorCategory {
    switch (type) {
      case DataFetchingErrorType.NOT_FOUND:
        return ErrorCategory.NOT_FOUND;
      case DataFetchingErrorType.UNAUTHORIZED:
        return ErrorCategory.AUTHENTICATION;
      case DataFetchingErrorType.FORBIDDEN:
        return ErrorCategory.AUTHORIZATION;
      case DataFetchingErrorType.VALIDATION:
        return ErrorCategory.VALIDATION;
      case DataFetchingErrorType.NETWORK:
        return ErrorCategory.NETWORK;
      case DataFetchingErrorType.SERVER:
        return ErrorCategory.SERVER;
      default:
        return ErrorCategory.DATA_FETCHING;
    }
  }

  private static determineSeverity(type: DataFetchingErrorType): ErrorSeverity {
    switch (type) {
      case DataFetchingErrorType.NOT_FOUND:
      case DataFetchingErrorType.VALIDATION:
        return ErrorSeverity.LOW;
      case DataFetchingErrorType.UNAUTHORIZED:
      case DataFetchingErrorType.FORBIDDEN:
        return ErrorSeverity.MEDIUM;
      case DataFetchingErrorType.SERVER:
      case DataFetchingErrorType.NETWORK:
        return ErrorSeverity.HIGH;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private static determineRetryability(type: DataFetchingErrorType): boolean {
    const retryableTypes = [
      DataFetchingErrorType.NETWORK,
      DataFetchingErrorType.SERVER,
    ];
    return retryableTypes.includes(type);
  }
}

/**
 * PostgreSQL 에러 코드 매핑
 */
const PG_ERROR_MAPPING: Record<string, { category: ErrorCategory; severity: ErrorSeverity; statusCode: number }> = {
  // 인증/권한 관련
  '28P01': { category: ErrorCategory.AUTHENTICATION, severity: ErrorSeverity.MEDIUM, statusCode: 401 },
  '42501': { category: ErrorCategory.AUTHORIZATION, severity: ErrorSeverity.MEDIUM, statusCode: 403 },
  
  // 데이터 관련
  '23505': { category: ErrorCategory.CONFLICT, severity: ErrorSeverity.LOW, statusCode: 409 },
  '23502': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  '23514': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  '22001': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  
  // 존재하지 않는 리소스
  '42P01': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.MEDIUM, statusCode: 404 },
  '42703': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.MEDIUM, statusCode: 404 },
  '22P02': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  '23503': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.MEDIUM, statusCode: 404 },
  
  // Supabase 특정 에러
  'PGRST116': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.LOW, statusCode: 404 },
};

/**
 * 에러 변환 유틸리티 클래스
 */
export class ErrorTransformer {
  /**
   * Supabase/PostgreSQL 에러를 AppError로 변환
   */
  static fromSupabaseError(error: PostgrestError, context?: ErrorContext): AppError {
    const mapping = PG_ERROR_MAPPING[error.code] || {
      category: ErrorCategory.SERVER,
      severity: ErrorSeverity.MEDIUM,
      statusCode: 500,
    };

    return new AppError(
      error.message || '데이터베이스 오류가 발생했습니다.',
      mapping.category,
      mapping.severity,
      mapping.statusCode,
      {
        context,
        originalError: error,
      }
    );
  }

  /**
   * 네트워크 에러를 AppError로 변환
   */
  static fromNetworkError(error: Error, context?: ErrorContext): AppError {
    const isTimeoutError = error.message.includes('timeout') || error.message.includes('TIMEOUT');
    const isConnectionError = error.message.includes('fetch') || error.message.includes('network');

    return new AppError(
      isTimeoutError ? '요청 시간이 초과되었습니다.' : '네트워크 연결에 실패했습니다.',
      ErrorCategory.NETWORK,
      isTimeoutError ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
      0,
      {
        isRetryable: true,
        context,
        originalError: error,
      }
    );
  }

  /**
   * 소셜 인증 에러를 새로운 SocialAuthError로 변환
   */
  static fromLegacySocialAuthError(
    code: SocialAuthErrorCode,
    message: string,
    provider?: SocialLoginProvider,
    originalError?: unknown,
    context?: ErrorContext
  ): SocialAuthError {
    return new SocialAuthError(code, message, provider, originalError, context);
  }

  /**
   * 데이터 페칭 에러를 새로운 DataFetchingError로 변환
   */
  static fromLegacyDataFetchingError(
    message: string,
    type: DataFetchingErrorType,
    statusCode: number,
    originalError?: unknown,
    context?: ErrorContext
  ): DataFetchingError {
    return new DataFetchingError(message, type, statusCode, originalError, context);
  }

  /**
   * 일반 에러를 AppError로 변환
   */
  static fromUnknownError(error: unknown, context?: ErrorContext): AppError {
    // 이미 AppError인 경우 그대로 반환
    if (error instanceof AppError) {
      return error;
    }

    // PostgrestError인 경우
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return this.fromSupabaseError(error as PostgrestError, context);
    }

    // 네트워크 에러인 경우
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
      return this.fromNetworkError(error, context);
    }

    // 일반 Error 객체인 경우
    if (error instanceof Error) {
      return new AppError(
        error.message,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500,
        {
          context,
          originalError: error,
        }
      );
    }

    // 기타 모든 경우
    return new AppError(
      typeof error === 'string' ? error : '알 수 없는 오류가 발생했습니다.',
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      500,
      {
        context,
        originalError: error,
      }
    );
  }
}

/**
 * 에러 로깅 인터페이스
 */
export interface ErrorLogger {
  log(error: AppError): void | Promise<void>;
}

/**
 * 콘솔 에러 로거
 */
export class ConsoleErrorLogger implements ErrorLogger {
  log(error: AppError): void {
    const logData = error.toLogData();
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', logData);
        break;
      case ErrorSeverity.HIGH:
        console.error('❌ HIGH SEVERITY ERROR:', logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('⚠️ MEDIUM SEVERITY ERROR:', logData);
        break;
      case ErrorSeverity.LOW:
        console.info('ℹ️ LOW SEVERITY ERROR:', logData);
        break;
    }
  }
}

/**
 * 재시도 유틸리티
 */
export class RetryUtility {
  /**
   * 지수 백오프를 사용한 재시도 실행
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: ErrorContext
  ): Promise<T> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: AppError;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = ErrorTransformer.fromUnknownError(error, context);

        // 재시도 불가능한 에러인 경우 즉시 throw
        if (!lastError.isRetryable || !finalConfig.retryableCategories.includes(lastError.category)) {
          throw lastError;
        }

        // 마지막 시도인 경우 throw
        if (attempt === finalConfig.maxAttempts) {
          throw lastError;
        }

        // 백오프 지연
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
          finalConfig.maxDelay
        );

        console.warn(`재시도 ${attempt}/${finalConfig.maxAttempts} - ${delay}ms 후 재시도:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

/**
 * 중앙화된 에러 핸들러
 */
export class ErrorHandler {
  private static logger: ErrorLogger = new ConsoleErrorLogger();

  /**
   * 에러 로거 설정
   */
  static setLogger(logger: ErrorLogger): void {
    this.logger = logger;
  }

  /**
   * 에러 처리 및 로깅
   */
  static async handle(error: unknown, context?: ErrorContext): Promise<AppError> {
    const appError = ErrorTransformer.fromUnknownError(error, context);
    
    // 로깅
    try {
      await this.logger.log(appError);
    } catch (logError) {
      console.error('에러 로깅 실패:', logError);
    }

    return appError;
  }

  /**
   * 비동기 작업 래핑 (에러 처리 포함)
   */
  static async wrap<T>(
    operation: () => Promise<T>,
    context?: ErrorContext
  ): Promise<{ data?: T; error?: AppError }> {
    try {
      const data = await operation();
      return { data };
    } catch (error) {
      const appError = await this.handle(error, context);
      return { error: appError };
    }
  }

  /**
   * 재시도와 함께 비동기 작업 래핑
   */
  static async wrapWithRetry<T>(
    operation: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>,
    context?: ErrorContext
  ): Promise<{ data?: T; error?: AppError }> {
    try {
      const data = await RetryUtility.withRetry(operation, retryConfig, context);
      return { data };
    } catch (error) {
      const appError = await this.handle(error, context);
      return { error: appError };
    }
  }
}

/**
 * 컨텍스트 생성 유틸리티
 */
export class ErrorContextBuilder {
  private context: ErrorContext = {};

  setUserId(userId: string): this {
    this.context.userId = userId;
    return this;
  }

  setSessionId(sessionId: string): this {
    this.context.sessionId = sessionId;
    return this;
  }

  setRequestId(requestId: string): this {
    this.context.requestId = requestId;
    return this;
  }

  setUserAgent(userAgent: string): this {
    this.context.userAgent = userAgent;
    return this;
  }

  setUrl(url: string): this {
    this.context.url = url;
    return this;
  }

  setAdditionalData(data: Record<string, unknown>): this {
    this.context.additionalData = { ...this.context.additionalData, ...data };
    return this;
  }

  build(): ErrorContext {
    return {
      ...this.context,
      timestamp: new Date(),
    };
  }
}

/**
 * 편의 함수들
 */

/**
 * 에러 생성 편의 함수
 */
export const createError = {
  authentication: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, { context }),
  
  authorization: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403, { context }),
  
  validation: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, { context }),
  
  notFound: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.NOT_FOUND, ErrorSeverity.LOW, 404, { context }),
  
  conflict: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.CONFLICT, ErrorSeverity.LOW, 409, { context }),
  
  network: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.NETWORK, ErrorSeverity.HIGH, 0, { context, isRetryable: true }),
  
  server: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.SERVER, ErrorSeverity.HIGH, 500, { context, isRetryable: true }),

  socialAuth: (code: SocialAuthErrorCode, message: string, provider?: SocialLoginProvider, context?: ErrorContext) =>
    new SocialAuthError(code, message, provider, undefined, context),

  dataFetching: (message: string, type: DataFetchingErrorType, statusCode: number = 500, context?: ErrorContext) =>
    new DataFetchingError(message, type, statusCode, undefined, context),
};

/**
 * 컨텍스트 빌더 생성 편의 함수
 */
export const createContext = () => new ErrorContextBuilder();

/**
 * 기존 코드와의 호환성을 위한 레거시 함수들
 */

/**
 * @deprecated Use ErrorTransformer.fromSupabaseError instead
 */
export const handleSupabaseError = (error: PostgrestError): AppError => {
  return ErrorTransformer.fromSupabaseError(error);
};

/**
 * @deprecated Use ErrorTransformer.fromUnknownError instead
 */
export const handleError = (error: unknown): AppError => {
  return ErrorTransformer.fromUnknownError(error);
}; 