/**
 * 인증 오류 처리 유틸리티
 * 특히 리프레시 토큰 관련 오류를 처리합니다.
 */

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export class AuthErrorHandler {
  private static instance: AuthErrorHandler | null = null;
  private supabase = createBrowserSupabaseClient();

  static getInstance(): AuthErrorHandler {
    if (!AuthErrorHandler.instance) {
      AuthErrorHandler.instance = new AuthErrorHandler();
    }
    return AuthErrorHandler.instance;
  }

  /**
   * 리프레시 토큰 오류 처리
   */
  async handleRefreshTokenError(error: any): Promise<boolean> {
    console.warn('🔄 [AuthError] 리프레시 토큰 오류 감지:', error.message);

    try {
      // 1. 모든 인증 관련 스토리지 정리
      await this.clearAuthStorage();

      // 2. Supabase 세션 강제 종료
      await this.supabase.auth.signOut({ scope: 'global' });

      // 3. 페이지 새로고침으로 깨끗한 상태 복원
      if (typeof window !== 'undefined') {
        console.log('🔄 [AuthError] 페이지 새로고침으로 세션 정리');
        window.location.reload();
      }

      return true;
    } catch (clearError) {
      console.error('❌ [AuthError] 세션 정리 중 오류:', clearError);
      return false;
    }
  }

  /**
   * 인증 관련 스토리지 완전 정리
   */
  private async clearAuthStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // localStorage 정리
      const authKeys = [
        'supabase.auth.token',
        'supabase.auth.refresh_token', 
        'supabase.auth.expires_at',
        'sb-auth-token',
        'auth_session_active',
        'auth_provider',
        'auth_timestamp',
        'auth_success'
      ];

      authKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`localStorage 키 제거 실패: ${key}`, e);
        }
      });

      // 패턴 기반 키 제거
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`패턴 키 제거 실패: ${key}`, e);
        }
      });

      // 쿠키 정리
      const cookiesToRemove = [
        'auth-token',
        'auth-refresh-token', 
        'sb-auth-token',
        'supabase-auth-token'
      ];

      cookiesToRemove.forEach(cookieName => {
        try {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
        } catch (e) {
          console.warn(`쿠키 제거 실패: ${cookieName}`, e);
        }
      });

      console.log('✅ [AuthError] 인증 스토리지 정리 완료');
    } catch (error) {
      console.error('❌ [AuthError] 스토리지 정리 중 오류:', error);
    }
  }

  /**
   * 인증 오류가 리프레시 토큰 관련인지 확인
   */
  isRefreshTokenError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message || '';
    return (
      message.includes('Invalid Refresh Token') ||
      message.includes('Refresh Token Not Found') ||
      message.includes('refresh_token_not_found') ||
      message.includes('invalid_refresh_token')
    );
  }

  /**
   * 인증 상태 복구 시도
   */
  async attemptRecovery(): Promise<boolean> {
    try {
      console.log('🔄 [AuthError] 인증 상태 복구 시도');
      
      // 현재 사용자 확인 (getUser()는 getSession()보다 빠르고 안정적)
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (error || !user) {
        console.log('❌ [AuthError] 복구 불가능 - 로그아웃 상태로 처리');
        return false;
      }

      console.log('✅ [AuthError] 사용자 복구 성공');
      return true;
    } catch (error) {
      console.error('❌ [AuthError] 복구 시도 중 오류:', error);
      return false;
    }
  }
}

/**
 * 전역 오류 처리기 - AuthProvider에서 사용
 */
export function handleAuthError(error: any): Promise<boolean> {
  const handler = AuthErrorHandler.getInstance();
  
  if (handler.isRefreshTokenError(error)) {
    return handler.handleRefreshTokenError(error);
  }
  
  return Promise.resolve(false);
}

/**
 * 브라우저 콘솔에서 수동 실행 가능한 응급 복구 함수
 */
export function emergencyAuthReset(): void {
  if (typeof window === 'undefined') {
    console.error('브라우저 환경에서만 실행 가능합니다.');
    return;
  }

  console.log('🚨 [Emergency] 응급 인증 상태 리셋 시작');

  try {
    // localStorage 전체 정리
    const authKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
        authKeys.push(key);
      }
    }
    
    authKeys.forEach(key => localStorage.removeItem(key));
    
    // 쿠키 정리
    document.cookie.split(';').forEach(cookie => {
      const cookieName = cookie.trim().split('=')[0];
      if (cookieName && (cookieName.includes('auth') || cookieName.includes('supabase'))) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });

    console.log('✅ [Emergency] 응급 리셋 완료 - 페이지를 새로고침하세요');
    alert('인증 상태가 리셋되었습니다. 페이지를 새로고침합니다.');
    window.location.reload();
  } catch (error) {
    console.error('❌ [Emergency] 응급 리셋 실패:', error);
    alert('응급 리셋에 실패했습니다. 브라우저를 완전히 재시작해주세요.');
  }
}

// 전역 window 객체에 응급 함수 등록 (개발 모드에서만)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).emergencyAuthReset = emergencyAuthReset;
  console.log('🔧 [Dev] emergencyAuthReset 함수가 window에 등록되었습니다.');
} 