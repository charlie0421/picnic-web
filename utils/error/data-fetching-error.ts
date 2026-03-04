/**
 * 데이터 페칭 에러 모듈
 */

import { AppError, ErrorCategory, ErrorSeverity, type ErrorContext } from './core';

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
