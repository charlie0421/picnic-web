/**
 * Server Actions 에러 핸들링 유틸리티
 * 
 * Next.js Server Actions에서 일관된 에러 처리를 제공합니다.
 */

import { redirect } from 'next/navigation';
import { ErrorHandler, AppError, createContext, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { logger } from '@/utils/logger';

/**
 * Server Action 결과 타입
 */
export type ServerActionResult<T = any> = {
  success: true;
  data: T;
} | {
  success: false;
  error: {
    message: string;
    category: string;
    statusCode: number;
    isRetryable: boolean;
    timestamp: string;
  };
};

/**
 * Server Action 에러 핸들러 클래스
 */
export class ServerActionErrorHandler {
  /**
   * Server Action에서 발생한 에러를 처리하고 적절한 결과를 반환
   */
  static async handleServerActionError(
    error: unknown,
    actionName?: string,
    userId?: string
  ): Promise<ServerActionResult<never>> {
    try {
      // 에러 컨텍스트 생성
      const context = createContext()
        .setUserId(userId || '')
        .setAdditionalData({
          actionName: actionName || 'unknown',
          isServerAction: true,
          timestamp: new Date().toISOString(),
        })
        .build();

      // 중앙화된 에러 핸들러로 처리
      const appError = await ErrorHandler.handle(error, context);

      // 로깅 시스템에 에러 기록
      await logger.logAppError(appError, {
        actionName: actionName || 'unknown',
        isServerAction: true,
      }, userId ? { id: userId } : undefined);

      return {
        success: false,
        error: {
          message: appError.toUserMessage(),
          category: appError.category,
          statusCode: appError.statusCode,
          isRetryable: appError.isRetryable,
          timestamp: appError.timestamp.toISOString(),
        },
      };

    } catch (handlingError) {
      // 핸들링 에러도 로깅
      await logger.fatal('Server Action 에러 핸들러에서 치명적 오류', handlingError as Error, {
        originalError: error,
        actionName: actionName || 'unknown',
        isServerAction: true,
      }, userId ? { id: userId } : undefined);

      // 최후의 수단 응답
      return {
        success: false,
        error: {
          message: '서버에서 오류가 발생했습니다.',
          category: ErrorCategory.SERVER,
          statusCode: 500,
          isRetryable: false,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * 성공 결과 생성
   */
  static createSuccessResult<T>(data: T): ServerActionResult<T> {
    return {
      success: true,
      data,
    };
  }
}

/**
 * Server Action 래퍼 함수
 * 
 * Server Action을 래핑하여 자동으로 에러 처리를 적용합니다.
 */
export function withServerActionErrorHandler<TArgs extends any[], TReturn>(
  action: (...args: TArgs) => Promise<TReturn>,
  actionName?: string
) {
  return async (...args: TArgs): Promise<ServerActionResult<TReturn>> => {
    try {
      // 액션 시작 로깅
      await logger.info(`Server Action 시작: ${actionName || 'unknown'}`, {
        actionName: actionName || 'unknown',
        isServerAction: true,
        argsCount: args.length,
      });

      const result = await action(...args);

      // 액션 성공 로깅
      await logger.info(`Server Action 완료: ${actionName || 'unknown'}`, {
        actionName: actionName || 'unknown',
        isServerAction: true,
        argsCount: args.length,
      });

      return ServerActionErrorHandler.createSuccessResult(result);
    } catch (error) {
      // 액션 실패 로깅
      await logger.error(`Server Action 실패: ${actionName || 'unknown'}`, error as Error, {
        actionName: actionName || 'unknown',
        isServerAction: true,
        argsCount: args.length,
      });

      return ServerActionErrorHandler.handleServerActionError(error, actionName);
    }
  };
}

/**
 * 비동기 Server Action 작업 래퍼
 * 
 * Server Action 내에서 비동기 작업을 안전하게 실행합니다.
 */
export async function safeServerActionOperation<T>(
  operation: () => Promise<T>,
  actionName?: string,
  userId?: string
): Promise<ServerActionResult<T>> {
  try {
    const data = await operation();
    return ServerActionErrorHandler.createSuccessResult(data);
  } catch (error) {
    return ServerActionErrorHandler.handleServerActionError(error, actionName, userId);
  }
}

/**
 * Server Action용 입력 검증 에러 생성 헬퍼
 */
export function createServerActionValidationError(
  message: string,
  field?: string
): AppError {
  return new AppError(
    message,
    ErrorCategory.VALIDATION,
    ErrorSeverity.LOW,
    400,
    {
      context: createContext()
        .setAdditionalData({ field, validationError: true, isServerAction: true })
        .build(),
    }
  );
}

/**
 * Server Action용 인증 에러 생성 헬퍼
 */
export function createServerActionAuthError(message: string = '로그인이 필요합니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.AUTHENTICATION,
    ErrorSeverity.MEDIUM,
    401,
    {
      context: createContext()
        .setAdditionalData({ isServerAction: true })
        .build(),
    }
  );
}

/**
 * Server Action용 권한 에러 생성 헬퍼
 */
export function createServerActionAuthorizationError(message: string = '접근 권한이 없습니다.'): AppError {
  return new AppError(
    message,
    ErrorCategory.AUTHORIZATION,
    ErrorSeverity.MEDIUM,
    403,
    {
      context: createContext()
        .setAdditionalData({ isServerAction: true })
        .build(),
    }
  );
}

/**
 * Server Action용 리소스 없음 에러 생성 헬퍼
 */
export function createServerActionNotFoundError(resource: string = '리소스'): AppError {
  return new AppError(
    `${resource}를 찾을 수 없습니다.`,
    ErrorCategory.NOT_FOUND,
    ErrorSeverity.LOW,
    404,
    {
      context: createContext()
        .setAdditionalData({ isServerAction: true })
        .build(),
    }
  );
}

/**
 * 리다이렉트와 함께 에러 처리
 * 
 * Server Action에서 에러 발생 시 특정 페이지로 리다이렉트합니다.
 */
export async function handleServerActionErrorWithRedirect(
  error: unknown,
  redirectPath: string,
  actionName?: string,
  userId?: string
): Promise<never> {
  // 에러 로깅
  await ServerActionErrorHandler.handleServerActionError(error, actionName, userId);
  
  // 리다이렉트 (이 함수는 never를 반환하므로 실행이 여기서 중단됨)
  redirect(redirectPath);
}

/**
 * 폼 상태와 함께 에러 처리
 * 
 * React Hook Form이나 기타 폼 라이브러리와 함께 사용할 수 있는 에러 처리입니다.
 */
export type FormState<T = any> = {
  success: boolean;
  data?: T;
  errors?: {
    [key: string]: string[];
  };
  message?: string;
};

export async function handleFormActionError<T>(
  operation: () => Promise<T>,
  actionName?: string,
  userId?: string
): Promise<FormState<T>> {
  try {
    const data = await operation();
    return {
      success: true,
      data,
    };
  } catch (error) {
    const result = await ServerActionErrorHandler.handleServerActionError(error, actionName, userId);
    
    if (!result.success) {
      return {
        success: false,
        message: result.error.message,
        errors: {
          _form: [result.error.message],
        },
      };
    }
    
    // 이 코드는 실행되지 않지만 TypeScript를 위해 필요
    return {
      success: false,
      message: '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * Server Action에서 사용할 수 있는 편의 함수들
 */
export const serverActionHelpers = {
  success: ServerActionErrorHandler.createSuccessResult,
  error: ServerActionErrorHandler.handleServerActionError,
  validation: createServerActionValidationError,
  auth: createServerActionAuthError,
  authorization: createServerActionAuthorizationError,
  notFound: createServerActionNotFoundError,
  withRedirect: handleServerActionErrorWithRedirect,
  formAction: handleFormActionError,
};

/**
 * 타입 가드: 성공 결과인지 확인
 */
export function isSuccessResult<T>(result: ServerActionResult<T>): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * 타입 가드: 에러 결과인지 확인
 */
export function isErrorResult<T>(result: ServerActionResult<T>): result is { 
  success: false; 
  error: {
    message: string;
    category: string;
    statusCode: number;
    isRetryable: boolean;
    timestamp: string;
  };
} {
  return result.success === false;
} 