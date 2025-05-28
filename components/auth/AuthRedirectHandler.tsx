'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
import {
  handlePostLoginRedirect,
  handleSessionTimeout,
  securityUtils,
} from '@/utils/auth-redirect';

interface AuthRedirectHandlerProps {
  children: React.ReactNode;
}

/**
 * 로그인 성공 후 자동 리다이렉트를 처리하는 컴포넌트
 * AuthProvider 하위에 배치하여 인증 상태 변화를 감지합니다.
 */
export function AuthRedirectHandler({ children }: AuthRedirectHandlerProps) {
  const { isAuthenticated, isLoading, isInitialized, user } = useAuth();
  const router = useRouter();
  const lastAuthState = useRef<boolean | null>(null);
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 세션 타임아웃 설정 (30분)
  const SESSION_TIMEOUT = 30 * 60 * 1000;

  // 세션 타임아웃 타이머 설정
  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }

    if (isAuthenticated) {
      sessionTimeoutRef.current = setTimeout(() => {
        console.warn('세션이 만료되었습니다.');
        handleSessionTimeout();
      }, SESSION_TIMEOUT);
    }
  };

  // 사용자 활동 감지하여 세션 타임아웃 리셋
  useEffect(() => {
    if (!isAuthenticated) return;

    const resetTimeout = () => resetSessionTimeout();

    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    events.forEach((event) => {
      document.addEventListener(event, resetTimeout, true);
    });

    // 초기 타이머 설정
    resetSessionTimeout();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimeout, true);
      });

      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
    };
  }, [isAuthenticated]);

  // 인증 상태 변화 감지 및 리다이렉트 처리
  useEffect(() => {
    // 초기화가 완료되고 로딩이 끝났을 때만 처리
    if (!isInitialized || isLoading) {
      return;
    }

    // 보안 검증
    if (typeof window !== 'undefined' && !securityUtils.validateUserAgent()) {
      console.warn('의심스러운 사용자 에이전트 감지');
      return;
    }

    // 인증 상태가 변경되었을 때만 처리
    if (lastAuthState.current !== isAuthenticated) {
      lastAuthState.current = isAuthenticated;

      // 로그인 상태가 되었을 때 리다이렉트 처리
      if (isAuthenticated && user) {
        // 현재 페이지가 로그인 페이지인 경우에만 리다이렉트
        if (
          typeof window !== 'undefined' &&
          window.location.pathname === '/login'
        ) {
          const targetUrl = handlePostLoginRedirect();

          // 안전한 리다이렉트 확인
          if (targetUrl && securityUtils.isValidRedirectUrl(targetUrl)) {
            console.log('로그인 성공 - 리다이렉트:', targetUrl);
            router.push(targetUrl);
          } else {
            console.log('로그인 성공 - 홈으로 이동');
            router.push('/');
          }
        }
      }

      // 로그아웃 상태가 되었을 때 세션 타임아웃 정리
      if (!isAuthenticated && sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
    }
  }, [isAuthenticated, isInitialized, isLoading, user, router]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
    };
  }, []);

  // 페이지 가시성 변화 감지 (탭 전환 등)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 페이지가 다시 보일 때 세션 상태 확인
        resetSessionTimeout();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}
