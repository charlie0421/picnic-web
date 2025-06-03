'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
import { clearRedirectUrl, getRedirectUrl, handlePostLoginRedirect } from '@/utils/auth-redirect';
import { isLoggedOut, getRemainingAuthItems, emergencyLogout } from '@/lib/auth/logout';

// 인증 검증 결과 인터페이스
interface VerificationResult {
  valid: boolean;
  authenticated: boolean;
  user_id?: string;
  error?: string;
  details?: string;
}

/**
 * 강화된 인증 리다이렉트 핸들러
 * 
 * 주요 기능:
 * 1. 포괄적 인증 상태 검증
 * 2. 서버 사이드 인증 검증
 * 3. 주기적 인증 상태 모니터링
 * 4. 자동 로그아웃 및 정리
 * 5. 로그아웃된 사용자 강력 차단
 */
export default function AuthRedirectHandler() {
  const { isAuthenticated, isLoading, user, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  // 상태 관리
  const [authVerificationCount, setAuthVerificationCount] = useState(0);
  const [lastVerificationTime, setLastVerificationTime] = useState(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Refs
  const redirectProcessed = useRef(false);
  const verifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const periodicCheckRef = useRef<NodeJS.Timeout | null>(null);
  const lastAuthState = useRef<boolean>(false);

  /**
   * 서버 사이드 인증 검증
   */
  const verifyAuthenticationWithServer = useCallback(async (): Promise<VerificationResult> => {
    try {
      console.log('🔍 [AuthRedirectHandler] 서버 사이드 인증 검증 시작');

      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: VerificationResult = await response.json();

      console.log('🔍 [AuthRedirectHandler] 서버 인증 검증 결과:', {
        status: response.status,
        valid: result.valid,
        authenticated: result.authenticated,
        userId: result.user_id
      });

      return result;
    } catch (error) {
      console.warn('⚠️ [AuthRedirectHandler] 서버 인증 검증 실패:', error);
      return {
        valid: false,
        authenticated: false,
        error: 'Server verification failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }, []);

  /**
   * 포괄적 인증 상태 검증
   */
  const performComprehensiveAuthCheck = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔄 [AuthRedirectHandler] 포괄적 인증 상태 검증 시작');

      // 1. 강화된 로그아웃 상태 검증
      if (isLoggedOut()) {
        console.warn('❌ [AuthRedirectHandler] 강화된 로그아웃 상태 감지');
        const remainingItems = getRemainingAuthItems();
        if (remainingItems.length > 0) {
          console.warn('⚠️ [AuthRedirectHandler] 남은 인증 데이터 감지:', remainingItems);
          // 남은 데이터가 있으면 강제 정리
          await emergencyLogout();
        }
        return false;
      }

      // 2. 기본 AuthProvider 상태 체크
      if (!isAuthenticated || !user || !session) {
        console.log('❌ [AuthRedirectHandler] 기본 인증 상태 실패:', {
          isAuthenticated,
          hasUser: !!user,
          hasSession: !!session
        });
        return false;
      }

      // 3. 세션 만료 체크
      if (session.expires_at) {
        const expiryTime = new Date(session.expires_at * 1000);
        const now = new Date();
        const timeDiff = expiryTime.getTime() - now.getTime();
        
        if (timeDiff <= 0) {
          console.warn('⏰ [AuthRedirectHandler] 세션 만료됨');
          await emergencyLogout();
          return false;
        }

        // 세션이 10분 이내에 만료될 예정이면 서버 검증 강제 실행
        if (timeDiff < 600000) { // 10분
          console.warn('⚠️ [AuthRedirectHandler] 세션이 곧 만료됨:', Math.round(timeDiff / 60000), '분 남음');
          const serverResult = await verifyAuthenticationWithServer();
          if (!serverResult.valid || !serverResult.authenticated) {
            console.warn('❌ [AuthRedirectHandler] 만료 예정 세션 서버 검증 실패');
            await emergencyLogout();
            return false;
          }
        }
      }

      // 4. 서버 사이드 검증 (중요한 작업에서만)
      const shouldVerifyWithServer = 
        authVerificationCount % 3 === 0 || // 3번에 한 번
        Date.now() - lastVerificationTime > 300000 || // 5분마다
        consecutiveFailures > 0; // 이전에 실패가 있었으면 항상 검증

      if (shouldVerifyWithServer) {
        const serverResult = await verifyAuthenticationWithServer();
        setLastVerificationTime(Date.now());

        if (!serverResult.valid || !serverResult.authenticated) {
          console.warn('❌ [AuthRedirectHandler] 서버 인증 검증 실패');
          setConsecutiveFailures(prev => prev + 1);
          
          // 연속 실패 3회 이상시 강제 로그아웃
          if (consecutiveFailures >= 2) {
            console.error('🚨 [AuthRedirectHandler] 연속 인증 실패 - 강제 로그아웃');
            await emergencyLogout();
            return false;
          }
          
          return false;
        } else {
          setConsecutiveFailures(0); // 성공시 실패 카운트 리셋
        }
      }

      console.log('✅ [AuthRedirectHandler] 포괄적 인증 상태 검증 성공');
      setAuthVerificationCount(prev => prev + 1);
      return true;

    } catch (error) {
      console.error('💥 [AuthRedirectHandler] 인증 상태 검증 중 오류:', error);
      setConsecutiveFailures(prev => prev + 1);
      
      // 예외 발생시도 일정 횟수 이상이면 강제 로그아웃
      if (consecutiveFailures >= 2) {
        console.error('🚨 [AuthRedirectHandler] 예외 연속 발생 - 강제 로그아웃');
        await emergencyLogout();
      }
      
      return false;
    }
  }, [isAuthenticated, user, session, authVerificationCount, lastVerificationTime, consecutiveFailures, verifyAuthenticationWithServer]);

  /**
   * 5분마다 주기적 인증 상태 검증
   */
  const startPeriodicAuthVerification = useCallback(() => {
    if (periodicCheckRef.current) {
      clearInterval(periodicCheckRef.current);
    }

    console.log('🔄 [AuthRedirectHandler] 주기적 인증 검증 시작');
    setIsMonitoring(true);

    periodicCheckRef.current = setInterval(async () => {
      if (isAuthenticated && !isLoading) {
        console.log('🔄 [AuthRedirectHandler] 주기적 인증 상태 검증 실행');
        
        const isValid = await performComprehensiveAuthCheck();
        
        if (!isValid) {
          console.warn('❌ [AuthRedirectHandler] 주기적 검증 실패 - 모니터링 중단');
          stopPeriodicAuthVerification();
        }
      }
    }, 300000); // 5분마다
  }, [isAuthenticated, isLoading, performComprehensiveAuthCheck]);

  /**
   * 주기적 인증 검증 중단
   */
  const stopPeriodicAuthVerification = useCallback(() => {
    if (periodicCheckRef.current) {
      clearInterval(periodicCheckRef.current);
      periodicCheckRef.current = null;
      setIsMonitoring(false);
      console.log('⏹️ [AuthRedirectHandler] 주기적 인증 검증 중단');
    }
  }, []);

  /**
   * 로그인 후 리다이렉트 처리
   */
  const handleAuthenticationSuccess = useCallback(async () => {
    if (redirectProcessed.current) return;

    console.log('🔄 [AuthRedirectHandler] 로그인 성공 감지 - 리다이렉트 처리 시작');
    
    // 인증 상태 검증 먼저 수행
    const isValid = await performComprehensiveAuthCheck();
    if (!isValid) {
      console.warn('❌ [AuthRedirectHandler] 로그인 후 인증 검증 실패');
      return;
    }

    redirectProcessed.current = true;

    // 100ms 지연으로 상태 안정화
    if (verifyTimeoutRef.current) {
      clearTimeout(verifyTimeoutRef.current);
    }

    verifyTimeoutRef.current = setTimeout(async () => {
      try {
        const redirectUrl = getRedirectUrl();
        
        if (redirectUrl && redirectUrl !== pathname) {
          console.log('📍 [AuthRedirectHandler] 저장된 리다이렉트 URL:', redirectUrl);
          
          if (await handlePostLoginRedirect()) {
            console.log('🚀 [AuthRedirectHandler] 리다이렉트 성공');
          } else {
            console.log('🏠 [AuthRedirectHandler] 리다이렉트 실패 - 홈으로 이동');
            router.push('/');
          }
        } else {
          console.log('🏠 [AuthRedirectHandler] 저장된 URL 없음 - 홈으로 이동');
          clearRedirectUrl();
          router.push('/');
        }
      } catch (error) {
        console.error('💥 [AuthRedirectHandler] 리다이렉트 처리 중 오류:', error);
        router.push('/');
      }
    }, 100);
  }, [pathname, router, performComprehensiveAuthCheck]);

  /**
   * 인증 상태 변화 감지 및 처리
   */
  useEffect(() => {
    const currentAuthState = isAuthenticated && !!user && !!session;
    
    console.log('🔄 [AuthRedirectHandler] 인증 상태 변화 감지:', {
      이전상태: lastAuthState.current,
      현재상태: currentAuthState,
      isLoading,
      pathname
    });

    if (!isLoading) {
      if (currentAuthState && !lastAuthState.current) {
        console.log('✅ [AuthRedirectHandler] 로그인 감지');
        lastAuthState.current = true;
        redirectProcessed.current = false;
        
        // 로그인 성공 처리
        handleAuthenticationSuccess();
        
        // 주기적 검증 시작
        startPeriodicAuthVerification();
        
      } else if (!currentAuthState && lastAuthState.current) {
        console.log('🚪 [AuthRedirectHandler] 로그아웃 감지');
        lastAuthState.current = false;
        redirectProcessed.current = false;
        
        // 검증 중단
        stopPeriodicAuthVerification();
        
        // 추가 정리 작업
        clearRedirectUrl();
        
      } else if (currentAuthState && lastAuthState.current) {
        // 로그인 상태 유지 중 - 주기적 검증이 실행 중인지 확인
        if (!isMonitoring) {
          console.log('🔄 [AuthRedirectHandler] 로그인 상태 유지 중 - 주기적 검증 재시작');
          startPeriodicAuthVerification();
        }
      }
    }
  }, [isAuthenticated, user, session, isLoading, pathname, handleAuthenticationSuccess, startPeriodicAuthVerification, stopPeriodicAuthVerification, isMonitoring]);

  /**
   * 컴포넌트 언마운트 시 정리
   */
  useEffect(() => {
    return () => {
      if (verifyTimeoutRef.current) {
        clearTimeout(verifyTimeoutRef.current);
      }
      stopPeriodicAuthVerification();
    };
  }, [stopPeriodicAuthVerification]);

  // 컴포넌트는 UI를 렌더링하지 않음
  return null;
}

