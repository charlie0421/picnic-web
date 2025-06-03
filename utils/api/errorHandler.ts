/**
 * 중앙화된 API 오류 처리 시스템
 * 
 * 주요 기능:
 * 1. 401 Unauthorized 에러 자동 감지
 * 2. 연속 인증 실패 감지 및 강제 로그아웃
 * 3. 자동 리다이렉트 처리
 * 4. 에러 로깅 및 모니터링
 */

// 타입 정의
interface ApiError {
  status?: number;
  code?: string;
  message?: string;
  details?: any;
  isAuthError?: boolean;
  isNetworkError?: boolean;
  handledByClient?: boolean;
}

interface ErrorHandlerOptions {
  context?: string;
  retryCount?: number;
  maxRetries?: number;
  autoLogout?: boolean;
  redirectOnAuth?: boolean;
}

// 전역 상태
let authFailureCount = 0;
let lastAuthFailureTime = 0;
const MAX_AUTH_FAILURES = 3;
const AUTH_FAILURE_WINDOW = 300000; // 5분

/**
 * 인증 실패 카운터 리셋
 */
export function resetAuthFailureCount(): void {
  if (authFailureCount > 0) {
    console.log('✅ [ErrorHandler] 인증 성공 - 실패 카운트 리셋');
    authFailureCount = 0;
    lastAuthFailureTime = 0;
  }
}

/**
 * 강제 로그아웃 수행
 */
async function performEmergencyLogout(reason: string): Promise<void> {
  console.error(`🚨 [ErrorHandler] 강제 로그아웃 실행: ${reason}`);
  
  try {
    // 동적 import로 로그아웃 함수 호출
    const { emergencyLogout } = await import('@/lib/auth/logout');
    await emergencyLogout();
    
    // 로그인 페이지로 리다이렉트
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        const redirectUrl = `/login?reason=auth_expired&timestamp=${Date.now()}`;
        window.location.href = redirectUrl;
      }, 1000);
    }
  } catch (error) {
    console.error('💥 [ErrorHandler] 강제 로그아웃 실패:', error);
    
    // 응급 처리
    if (typeof window !== 'undefined') {
      try {
        const { clearAllAuthData } = await import('@/utils/auth-redirect');
        clearAllAuthData();
      } catch (e) {
        console.warn('⚠️ [ErrorHandler] 응급 데이터 정리 실패:', e);
      }
      
      setTimeout(() => {
        window.location.href = '/login?reason=auth_error';
      }, 500);
    }
  }
}

/**
 * 인증 에러 처리
 */
async function handleAuthError(error: ApiError, context: string): Promise<void> {
  const now = Date.now();
  
  // 5분 이내에 발생한 연속 실패만 카운트
  if (now - lastAuthFailureTime > AUTH_FAILURE_WINDOW) {
    authFailureCount = 0;
  }
  
  authFailureCount++;
  lastAuthFailureTime = now;
  
  console.warn(`🚫 [ErrorHandler] 인증 에러 #${authFailureCount} (${context}):`, {
    status: error.status,
    code: error.code,
    message: error.message
  });
  
  // 연속 실패 임계값 도달 시 강제 로그아웃
  if (authFailureCount >= MAX_AUTH_FAILURES) {
    const reason = `연속 인증 실패 ${authFailureCount}회 (${context})`;
    await performEmergencyLogout(reason);
  }
}

/**
 * API 에러가 인증 관련인지 확인
 */
function isAuthenticationError(error: ApiError): boolean {
  // HTTP 상태 코드 확인
  if (error.status === 401 || error.status === 403) {
    return true;
  }
  
  // Supabase 에러 코드 확인
  const authErrorCodes = [
    'PGRST301', // JWT expired
    'PGRST302', // JWT invalid
    'invalid_grant',
    'token_expired',
    'invalid_token'
  ];
  
  if (error.code && authErrorCodes.includes(error.code)) {
    return true;
  }
  
  // 에러 메시지 확인
  const authErrorMessages = [
    'jwt',
    'unauthorized',
    'invalid_grant',
    'token',
    'session',
    'authentication',
    'expired',
    'invalid'
  ];
  
  if (error.message) {
    const lowerMessage = error.message.toLowerCase();
    return authErrorMessages.some(keyword => lowerMessage.includes(keyword));
  }
  
  return false;
}

/**
 * 네트워크 에러 확인
 */
function isNetworkError(error: any): boolean {
  return (
    error.name === 'NetworkError' ||
    error.message?.includes('fetch') ||
    error.message?.includes('network') ||
    error.message?.includes('Failed to fetch') ||
    !navigator.onLine
  );
}

/**
 * 중앙화된 API 에러 핸들러
 */
export async function handleApiError(
  error: any,
  options: ErrorHandlerOptions = {}
): Promise<ApiError> {
  const {
    context = 'unknown',
    autoLogout = true,
    redirectOnAuth = true
  } = options;
  
  // 에러 정규화
  const normalizedError: ApiError = {
    status: error.status || error.response?.status,
    code: error.code || error.response?.data?.code,
    message: error.message || error.response?.data?.message || 'Unknown error',
    details: error.details || error.response?.data,
    isNetworkError: isNetworkError(error)
  };
  
  console.warn(`⚠️ [ErrorHandler] API 에러 처리 (${context}):`, normalizedError);
  
  // 인증 에러 확인 및 처리
  if (isAuthenticationError(normalizedError)) {
    normalizedError.isAuthError = true;
    normalizedError.handledByClient = true;
    
    if (autoLogout) {
      await handleAuthError(normalizedError, context);
    }
  } else {
    // 인증 에러가 아닌 경우 실패 카운트 리셋
    resetAuthFailureCount();
  }
  
  return normalizedError;
}

/**
 * Fetch API 래퍼 (에러 처리 포함)
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestInit & { context?: string } = {}
): Promise<{ data: T | null; error: ApiError | null }> {
  const { context = url, ...fetchOptions } = options;
  
  try {
    console.log(`🔄 [ErrorHandler] API 요청 시작: ${context}`);
    
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Source': 'api-error-handler',
        'X-Request-Context': context,
        ...fetchOptions.headers
      },
      ...fetchOptions
    });
    
    let data: T | null = null;
    
    // JSON 응답 파싱 시도
    try {
      if (response.headers.get('content-type')?.includes('application/json')) {
        data = await response.json();
      }
    } catch (parseError) {
      console.warn('⚠️ [ErrorHandler] JSON 파싱 실패:', parseError);
    }
    
    // 성공 응답
    if (response.ok) {
      console.log(`✅ [ErrorHandler] API 요청 성공: ${context}`);
      resetAuthFailureCount();
      return { data, error: null };
    }
    
    // 에러 응답 처리
    const error = await handleApiError({
      status: response.status,
      message: response.statusText,
      details: data
    }, { context });
    
    return { data: null, error };
    
  } catch (exception) {
    console.error(`💥 [ErrorHandler] API 요청 예외 (${context}):`, exception);
    
    const error = await handleApiError(exception, { context });
    
    return { data: null, error };
  }
}

/**
 * Supabase 에러 처리 래퍼
 */
export async function handleSupabaseError<T>(
  operation: () => Promise<{ data: T; error: any }>,
  context: string = 'supabase'
): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    console.log(`🔄 [ErrorHandler] Supabase 작업 시작: ${context}`);
    
    const result = await operation();
    
    if (result.error) {
      const error = await handleApiError(result.error, { context });
      return { data: null, error };
    }
    
    console.log(`✅ [ErrorHandler] Supabase 작업 성공: ${context}`);
    resetAuthFailureCount();
    
    return { data: result.data, error: null };
    
  } catch (exception) {
    console.error(`💥 [ErrorHandler] Supabase 작업 예외 (${context}):`, exception);
    
    const error = await handleApiError(exception, { context });
    
    return { data: null, error };
  }
}

/**
 * 에러 핸들러 상태 조회 (디버깅용)
 */
export function getErrorHandlerStats() {
  return {
    authFailureCount,
    lastAuthFailureTime: lastAuthFailureTime ? new Date(lastAuthFailureTime) : null,
    maxFailures: MAX_AUTH_FAILURES,
    failureWindow: AUTH_FAILURE_WINDOW,
    isAtRisk: authFailureCount >= MAX_AUTH_FAILURES - 1,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
  };
}

/**
 * 에러 핸들러 초기화
 */
export function initializeErrorHandler(): void {
  console.log('🔧 [ErrorHandler] 에러 핸들러 초기화');
  
  // 전역 에러 핸들러 등록
  if (typeof window !== 'undefined') {
    // 처리되지 않은 Promise rejection 캐치
    window.addEventListener('unhandledrejection', async (event) => {
      console.warn('🚫 [ErrorHandler] 처리되지 않은 Promise rejection:', event.reason);
      
      if (event.reason && typeof event.reason === 'object') {
        await handleApiError(event.reason, { context: 'unhandled-rejection' });
      }
    });
    
    // 네트워크 상태 변화 감지
    window.addEventListener('online', () => {
      console.log('🌐 [ErrorHandler] 네트워크 연결 복구');
      resetAuthFailureCount();
    });
    
    window.addEventListener('offline', () => {
      console.warn('📵 [ErrorHandler] 네트워크 연결 끊김');
    });
  }
}