/**
 * API 라우트 에러 핸들링 유틸리티
 * 
 * Next.js App Router의 API 라우트에서 일관된 에러 처리를 제공합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler, AppError, createContext, ErrorCategory } from '@/utils/error';
import { logger, createRequestLogger } from '@/utils/logger';

/**
 * API 에러 응답 인터페이스
 */
interface ApiErrorResponse {
  error: {
    message: string;
    category: string;
    statusCode: number;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * API 성공 응답 인터페이스
 */
interface ApiSuccessResponse<T = any> {
  data: T;
  timestamp: string;
  requestId?: string;
}

/**
 * API 응답 래퍼 타입
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * API 에러 핸들러 클래스
 */
export class ApiErrorHandler {
  /**
   * API 라우트에서 발생한 에러를 처리하고 적절한 HTTP 응답을 반환
   */
  static async handleApiError(
    error: unknown,
    request?: NextRequest,
    requestId?: string
  ): Promise<NextResponse<ApiErrorResponse>> {
    try {
      // 에러 컨텍스트 생성
      const context = createContext()
        .setUrl(request?.url || '')
        .setUserAgent(request?.headers.get('user-agent') || '')
        .setRequestId(requestId || this.generateRequestId())
        .setAdditionalData({
          method: request?.method,
          headers: request ? Object.fromEntries(request.headers.entries()) : {},
          isApiRoute: true,
        })
        .build();

      // 중앙화된 에러 핸들러로 처리
      const appError = await ErrorHandler.handle(error, context);

      // 로깅 시스템에 에러 기록
      if (request) {
        const requestLogger = createRequestLogger(request);
        await requestLogger.logAppError(appError, {
          requestId: context.requestId,
          isApiRoute: true,
        });
      } else {
        await logger.logAppError(appError, {
          requestId: context.requestId,
          isApiRoute: true,
        });
      }

      // API 응답 생성
      const response = appError.toApiResponse();

      return NextResponse.json(response, {
        status: appError.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': context.requestId || '',
        },
      });

    } catch (handlingError) {
      // 핸들링 에러도 로깅
      await logger.fatal('API 에러 핸들러에서 치명적 오류', handlingError as Error, {
        originalError: error,
        requestId: requestId || this.generateRequestId(),
        isApiRoute: true,
      });

      // 최후의 수단 응답
      const fallbackResponse: ApiErrorResponse = {
        error: {
          message: '서버 내부 오류가 발생했습니다.',
          category: ErrorCategory.SERVER,
          statusCode: 500,
          timestamp: new Date().toISOString(),
          requestId: requestId || this.generateRequestId(),
        },
      };

      return NextResponse.json(fallbackResponse, {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': fallbackResponse.error.requestId,
        },
      });
    }
  }

  /**
   * 성공 응답 생성
   */
  static createSuccessResponse<T>(
    data: T,
    requestId?: string
  ): NextResponse<ApiSuccessResponse<T>> {
    const response: ApiSuccessResponse<T> = {
      data,
      timestamp: new Date().toISOString(),
      requestId: requestId || this.generateRequestId(),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': response.requestId,
      },
    });
  }

  /**
   * 요청 ID 생성
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * API 라우트 래퍼 함수
 * 
 * API 라우트 핸들러를 래핑하여 자동으로 에러 처리를 적용합니다.
 */
export function withApiErrorHandler<T = any>(
  handler: (request: NextRequest, context?: { params?: any }) => Promise<NextResponse<T>>
) {
  return async (
    request: NextRequest,
    context?: { params?: any }
  ): Promise<NextResponse<T | ApiErrorResponse>> => {
    const requestId = ApiErrorHandler['generateRequestId']();
    const requestLogger = createRequestLogger(request);

    try {
      // 요청 헤더에 Request ID 추가 (로깅용)
      request.headers.set('X-Request-ID', requestId);

      // 요청 시작 로깅
      await requestLogger.info(`API 요청 시작: ${request.method} ${request.url}`, {
        requestId,
        method: request.method,
        url: request.url,
      });

      const result = await handler(request, context);

      // 성공 응답 로깅
      await requestLogger.info(`API 요청 완료: ${request.method} ${request.url}`, {
        requestId,
        method: request.method,
        url: request.url,
        statusCode: result.status,
      });

      return result;
    } catch (error) {
      // 에러 발생 로깅
      await requestLogger.error(`API 요청 실패: ${request.method} ${request.url}`, error as Error, {
        requestId,
        method: request.method,
        url: request.url,
      });

      return ApiErrorHandler.handleApiError(error, request, requestId);
    }
  };
}

/**
 * 비동기 API 작업 래퍼
 * 
 * API 라우트 내에서 비동기 작업을 안전하게 실행합니다.
 */
export async function safeApiOperation<T>(
  operation: () => Promise<T>,
  request?: NextRequest,
  requestId?: string
): Promise<{ data?: T; error?: NextResponse<ApiErrorResponse> }> {
  try {
    const data = await operation();
    return { data };
  } catch (error) {
    const errorResponse = await ApiErrorHandler.handleApiError(error, request, requestId);
    return { error: errorResponse };
  }
}

/**
 * 입력 검증 에러 생성 헬퍼
 */
export function createValidationError(
  message: string,
  field?: string
): AppError {
  return new AppError(
    message,
    ErrorCategory.VALIDATION,
    'low',
    400,
    {
      context: createContext()
        .setAdditionalData({ field, validationError: true })
        .build(),
    }
  );
}

/**
 * 인증 에러 생성 헬퍼
 */
export function createAuthError(message: string = '인증이 필요합니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.AUTHENTICATION,
    'medium',
    401
  );
}

/**
 * 권한 에러 생성 헬퍼
 */
export function createAuthorizationError(message: string = '접근 권한이 없습니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.AUTHORIZATION,
    'medium',
    403
  );
}

/**
 * 리소스 없음 에러 생성 헬퍼
 */
export function createNotFoundError(resource: string = '리소스'): AppError {
  return new AppError(
    `${resource}를 찾을 수 없습니다.`,
    ErrorCategory.NOT_FOUND,
    'low',
    404
  );
}

/**
 * 충돌 에러 생성 헬퍼
 */
export function createConflictError(message: string = '이미 존재하는 데이터입니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.CONFLICT,
    'low',
    409
  );
}

/**
 * 레이트 리밋 에러 생성 헬퍼
 */
export function createRateLimitError(message: string = '요청 한도를 초과했습니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.CLIENT,
    'medium',
    429
  );
}

/**
 * 외부 서비스 에러 생성 헬퍼
 */
export function createExternalServiceError(message: string = '외부 서비스 연결에 실패했습니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.EXTERNAL,
    'high',
    502
  );
}

/**
 * 데이터베이스 에러 생성 헬퍼
 */
export function createDatabaseError(message: string = '데이터베이스 오류가 발생했습니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.DATABASE,
    'high',
    500
  );
}

/**
 * 비즈니스 로직 에러 생성 헬퍼
 */
export function createBusinessLogicError(message: string = '비즈니스 규칙 위반입니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.BUSINESS,
    'medium',
    400
  );
}

/**
 * API 라우트에서 사용할 수 있는 편의 함수들
 */
export const apiHelpers = {
  success: ApiErrorHandler.createSuccessResponse,
  error: ApiErrorHandler.handleApiError,
  validation: createValidationError,
  auth: createAuthError,
  authorization: createAuthorizationError,
  notFound: createNotFoundError,
  conflict: createConflictError,
  rateLimit: createRateLimitError,
}; 