'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider';

// 검증 간격 설정 (기본: 5분)
const DEFAULT_VERIFICATION_INTERVAL = 5 * 60 * 1000;

// WeChat 관련 인증 키들
const WECHAT_AUTH_KEYS = [
  'wechat_auth_token',
  'wechat_auth_state', 
  'wechat_login_state',
];

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
  
  /**
   * WeChat 로그인 처리 여부
   * @default true
   */
  includeWeChatVerification?: boolean;
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
    includeWeChatVerification = true,
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
        console.log('🔄 [PeriodicAuth] 이미 검증 중 - 스킵');
        return { isValid: true };
      }

      isVerifyingRef.current = true;
      verificationCountRef.current += 1;
      lastVerificationRef.current = new Date();

      console.log(`🔍 [PeriodicAuth] 인증 상태 검증 시작 (${verificationCountRef.current}회차)`, {
        isAuthenticated,
        hasUser: !!user,
        timestamp: lastVerificationRef.current.toISOString(),
      });

      // 1. 기본 인증 상태 체크
      if (!isAuthenticated || !user) {
        console.warn('❌ [PeriodicAuth] 기본 인증 상태 실패');
        return {
          isValid: false,
          reason: '기본 인증 상태가 유효하지 않습니다.',
        };
      }

      // 2. WeChat 인증 상태 체크 (선택적)
      if (includeWeChatVerification) {
        const provider = user?.app_metadata?.provider;
        if (provider === 'wechat') {
          console.log('🔄 [PeriodicAuth] WeChat 인증 상태 검증');
          
          const wechatTokenValid = WECHAT_AUTH_KEYS.some(key => {
            const value = localStorage.getItem(key);
            return value && value !== 'null' && value !== 'undefined';
          });

          if (!wechatTokenValid) {
            console.warn('🔒 [PeriodicAuth] WeChat 토큰이 유효하지 않음');
            return {
              isValid: false,
              reason: 'WeChat 인증 토큰이 유효하지 않습니다.',
            };
          }
        }
      }

      // 3. 서버사이드 인증 검증 단계 제거: 쿠키/세션은 Supabase가 관리, UI는 로컬 상태로 판단

      console.log('✅ [PeriodicAuth] 모든 인증 상태 검증 통과');
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
  }, [isAuthenticated, user, includeWeChatVerification, onNetworkError]);

  /**
   * 수동 인증 상태 검증
   */
  const manualVerification = useCallback(async () => {
    console.log('🔍 [PeriodicAuth] 수동 인증 검증 요청');
    const result = await verifyAuthState();
    
    if (result.isValid) {
      console.log('✅ [PeriodicAuth] 수동 검증 성공');
      onAuthSuccess?.();
    } else {
      console.warn('❌ [PeriodicAuth] 수동 검증 실패:', result.reason);
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

    console.log(`🕐 [PeriodicAuth] 주기적 검증 시작 (${interval / 1000}초 간격)`);

    intervalRef.current = setInterval(async () => {
      console.log('⏰ [PeriodicAuth] 주기적 검증 실행');
      
      const result = await verifyAuthState();
      
      if (result.isValid) {
        console.log('✅ [PeriodicAuth] 주기적 검증 성공');
        onAuthSuccess?.();
      } else {
        console.warn('❌ [PeriodicAuth] 주기적 검증 실패 - 자동 로그아웃 필요:', result.reason);
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
      console.log('🛑 [PeriodicAuth] 주기적 검증 중단');
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
      console.log('🟢 [PeriodicAuth] 인증된 상태 - 주기적 검증 시작');
      startPeriodicVerification();
    } else {
      console.log('🔴 [PeriodicAuth] 비인증 상태 - 주기적 검증 중단');
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
        console.log('👁️ [PeriodicAuth] 페이지 가시성 복구 - 즉시 검증 실행');
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