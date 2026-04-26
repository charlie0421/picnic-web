'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider';

// 검증 간격 설정 (기본: 5분)
const DEFAULT_VERIFICATION_INTERVAL = 5 * 60 * 1000;

export interface PeriodicAuthVerificationOptions {
  /**
   * 검증 간격 (밀리초)
   * @default 300000 (5분)
   */
  interval?: number;
  
  /**
   * 인증 실패 시 호출되는 콜백
   */
  onAuthFailure?: (reason: string) => void;
  
  /**
   * 검증 성공 시 호출되는 콜백
   */
  onAuthSuccess?: () => void;
  
  /**
   * 네트워크 오류 시 호출되는 콜백
   */
  onNetworkError?: (error: Error) => void;
  
  /**
   * 훅 활성화 여부
   * @default true
   */
  enabled?: boolean;
  
}

/**
 * 주기적으로 인증 상태를 검증하는 커스텀 훅
 * 
 * @param options 검증 옵션
 * @returns 검증 관련 함수들과 상태
 */
export function usePeriodicAuthVerification(options: PeriodicAuthVerificationOptions = {}) {
  const {
    interval = DEFAULT_VERIFICATION_INTERVAL,
    onAuthFailure,
    onAuthSuccess,
    onNetworkError,
    enabled = true,
  } = options;

  const { isAuthenticated, user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVerifyingRef = useRef(false);
  const verificationCountRef = useRef(0);
  const lastVerificationRef = useRef<Date | null>(null);

  /**
   * 종합적인 인증 상태 검증
   */
  const verifyAuthState = useCallback(async (): Promise<{
    isValid: boolean;
    reason?: string;
    error?: Error;
  }> => {
    try {
      // 중복 검증 방지
      if (isVerifyingRef.current) {
        return { isValid: true };
      }

      isVerifyingRef.current = true;
      verificationCountRef.current += 1;
      lastVerificationRef.current = new Date();

      // 1. 기본 인증 상태 체크
      if (!isAuthenticated || !user) {
        return {
          isValid: false,
          reason: '기본 인증 상태가 유효하지 않습니다.',
        };
      }

      // 2. 서버사이드 인증 검증 단계 제거: 쿠키/세션은 Supabase가 관리, UI는 로컬 상태로 판단

      return { isValid: true };

    } catch (error) {
      const authError = error instanceof Error ? error : new Error('인증 검증 중 알 수 없는 오류');
      console.error('💥 [PeriodicAuth] 인증 검증 중 오류:', authError);
      
      return {
        isValid: false,
        reason: '인증 검증 중 오류가 발생했습니다.',
        error: authError,
      };
    } finally {
      isVerifyingRef.current = false;
    }
  }, [isAuthenticated, user, onNetworkError]);

  /**
   * 수동 인증 상태 검증
   */
  const manualVerification = useCallback(async () => {
    const result = await verifyAuthState();

    if (result.isValid) {
      onAuthSuccess?.();
    } else {
      onAuthFailure?.(result.reason || '인증 검증 실패');
    }

    return result;
  }, [verifyAuthState, onAuthSuccess, onAuthFailure]);

  /**
   * 주기적 검증 시작
   */
  const startPeriodicVerification = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      const result = await verifyAuthState();

      if (result.isValid) {
        onAuthSuccess?.();
      } else {
        onAuthFailure?.(result.reason || '주기적 인증 검증 실패');
        
        // 검증 실패 시 주기적 검증 중단
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, interval);
  }, [interval, verifyAuthState, onAuthSuccess, onAuthFailure]);

  /**
   * 주기적 검증 중단
   */
  const stopPeriodicVerification = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 인증 상태 변화 감지
  useEffect(() => {
    if (!enabled) {
      stopPeriodicVerification();
      return;
    }

    if (isAuthenticated && user) {
      startPeriodicVerification();
    } else {
      stopPeriodicVerification();
    }

    return () => {
      stopPeriodicVerification();
    };
  }, [enabled, isAuthenticated, user, startPeriodicVerification, stopPeriodicVerification]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopPeriodicVerification();
    };
  }, [stopPeriodicVerification]);

  // 페이지 가시성 변화 감지
  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        manualVerification();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isAuthenticated, manualVerification]);

  return {
    // 상태
    isVerifying: isVerifyingRef.current,
    verificationCount: verificationCountRef.current,
    lastVerification: lastVerificationRef.current,
    
    // 메서드
    manualVerification,
    startPeriodicVerification,
    stopPeriodicVerification,
    
    // 유틸리티
    verifyAuthState,
  };
}