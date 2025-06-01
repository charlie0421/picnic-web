'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
import { usePeriodicAuthVerification } from '@/hooks/usePeriodicAuthVerification';
import {
  handlePostLoginRedirect,
  handleSessionTimeout,
  securityUtils,
  getRedirectUrl,
  clearRedirectUrl,
  clearAllAuthData,
} from '@/utils/auth-redirect';

// 세션 타임아웃 설정 (30분)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// 보호된 라우트 패턴
const PROTECTED_ROUTES = [
  '/vote',
  '/mypage',
  '/rewards',
  '/admin',
];

// WeChat 관련 인증 상태
const WECHAT_AUTH_KEYS = [
  'wechat_auth_token',
  'wechat_auth_state',
  'wechat_login_state',
];

interface AuthRedirectHandlerProps {
  children: React.ReactNode;
}

/**
 * 로그인 성공 후 자동 리다이렉트를 처리하고
 * 로그아웃한 사용자의 보호된 컨텐츠 접근을 방지하는 컴포넌트
 * 주기적 인증 상태 검증 기능 포함
 */
export function AuthRedirectHandler({ children }: AuthRedirectHandlerProps) {
  const { isAuthenticated, isLoading, isInitialized, user, session, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const lastAuthState = useRef<boolean | null>(null);
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const redirectProcessed = useRef<boolean>(false);
  
  // 인증 상태 강화 확인
  const [isAuthStateVerified, setIsAuthStateVerified] = useState(false);

  /**
   * 완전한 로그아웃 처리
   */
  const performCompleteLogout = async (reason?: string) => {
    console.log('🚪 [AuthRedirectHandler] 완전한 로그아웃 처리 시작:', reason);

    try {
      // 1. 주기적 검증 중단 (signOut이 처리함)
      
      // 2. AuthProvider signOut 호출
      await signOut();

      // 3. 모든 인증 관련 데이터 정리
      clearAllAuthData();

      // 4. WeChat 특별 처리
      WECHAT_AUTH_KEYS.forEach(key => {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } catch (e) {
          console.warn(`WeChat 키 정리 실패: ${key}`, e);
        }
      });

      // 5. 상태 리셋
      setIsAuthStateVerified(false);
      redirectProcessed.current = false;

      console.log('✅ [AuthRedirectHandler] 완전한 로그아웃 완료');
    } catch (error) {
      console.error('💥 [AuthRedirectHandler] 로그아웃 처리 오류:', error);
    }
  };

  // 주기적 인증 상태 검증 훅 사용
  const {
    isVerifying,
    verificationCount,
    lastVerification,
    manualVerification,
  } = usePeriodicAuthVerification({
    interval: 5 * 60 * 1000, // 5분
    enabled: isAuthenticated && isInitialized,
    
    onAuthFailure: async (reason: string) => {
      console.warn('❌ [AuthRedirectHandler] 주기적 인증 검증 실패:', reason);
      await performCompleteLogout(`주기적 검증 실패: ${reason}`);
    },
    
    onAuthSuccess: () => {
      console.log('✅ [AuthRedirectHandler] 주기적 인증 검증 성공');
      setIsAuthStateVerified(true);
    },
    
    onNetworkError: (error: Error) => {
      console.warn('⚠️ [AuthRedirectHandler] 주기적 검증 네트워크 오류:', error.message);
      // 네트워크 오류는 로그아웃하지 않음
    },
  });

  /**
   * 강화된 인증 상태 검증
   */
  const verifyAuthState = async () => {
    try {
      console.log('🔍 [AuthRedirectHandler] 강화된 인증 상태 검증 시작');

      // 1. 기본 인증 상태 체크
      if (!isAuthenticated || !user || !session) {
        console.warn('❌ [AuthRedirectHandler] 기본 인증 상태 실패:', {
          isAuthenticated,
          hasUser: !!user,
          hasSession: !!session,
        });
        setIsAuthStateVerified(false);
        return false;
      }

      // 2. 세션 만료 체크
      if (session.expires_at) {
        const expiryTime = new Date(session.expires_at * 1000);
        const now = new Date();
        if (now >= expiryTime) {
          console.warn('⏰ [AuthRedirectHandler] 세션이 만료됨');
          await performCompleteLogout('세션 만료');
          setIsAuthStateVerified(false);
          return false;
        }
      }

      // 3. WeChat 인증 상태 체크 (WeChat 로그인인 경우)
      const provider = session.user?.app_metadata?.provider;
      if (provider === 'wechat') {
        const wechatTokenValid = WECHAT_AUTH_KEYS.some(key => {
          const value = localStorage.getItem(key);
          return value && value !== 'null' && value !== 'undefined';
        });

        if (!wechatTokenValid) {
          console.warn('🔒 [AuthRedirectHandler] WeChat 토큰이 유효하지 않음');
          setIsAuthStateVerified(false);
          return false;
        }
      }

      // 4. 토큰 유효성 검증 (간단한 API 호출)
      try {
        const response = await fetch('/api/auth/verify', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (!response.ok) {
          console.warn('🚫 [AuthRedirectHandler] 서버 인증 검증 실패');
          setIsAuthStateVerified(false);
          return false;
        }

        const data = await response.json();
        if (!data.valid) {
          console.warn('❌ [AuthRedirectHandler] 서버에서 인증 무효 응답');
          setIsAuthStateVerified(false);
          return false;
        }
      } catch (error) {
        console.warn('⚠️ [AuthRedirectHandler] 서버 인증 검증 오류:', error);
        // 네트워크 오류는 허용 (오프라인 상황 고려)
      }

      console.log('✅ [AuthRedirectHandler] 인증 상태 검증 성공');
      setIsAuthStateVerified(true);
      return true;
    } catch (error) {
      console.error('💥 [AuthRedirectHandler] 인증 상태 검증 중 오류:', error);
      setIsAuthStateVerified(false);
      return false;
    }
  };

  /**
   * 보호된 라우트 접근 권한 체크
   */
  const checkProtectedRouteAccess = () => {
    if (!pathname) return true;

    const isProtectedRoute = PROTECTED_ROUTES.some(route => 
      pathname.includes(route)
    );

    if (isProtectedRoute && (!isAuthenticated || !isAuthStateVerified)) {
      console.warn('🛡️ [AuthRedirectHandler] 보호된 라우트 접근 차단:', pathname);
      
      // 로그인 다이얼로그 표시하지 않고 로그인 페이지로 리다이렉트
      router.push('/login');
      return false;
    }

    return true;
  };

  // 세션 타임아웃 타이머 설정
  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }

    if (isAuthenticated) {
      sessionTimeoutRef.current = setTimeout(async () => {
        console.warn('⏰ [AuthRedirectHandler] 세션 타임아웃');
        await performCompleteLogout('세션 타임아웃');
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
    console.log('🔄 [AuthRedirectHandler] 상태 체크:', {
      isInitialized,
      isLoading,
      isAuthenticated,
      isAuthStateVerified,
      isVerifying,
      verificationCount,
      lastVerification: lastVerification?.toISOString(),
      user: user?.id,
      lastAuthState: lastAuthState.current,
      redirectProcessed: redirectProcessed.current,
      pathname,
    });

    // 초기화가 완료되고 로딩이 끝났을 때만 처리
    if (!isInitialized || isLoading) {
      console.log('⏳ [AuthRedirectHandler] 초기화 대기 중...');
      return;
    }

    // 보안 검증
    if (typeof window !== 'undefined' && !securityUtils.validateUserAgent()) {
      console.warn('🚨 [AuthRedirectHandler] 의심스러운 사용자 에이전트 감지');
      return;
    }

    // 인증 상태가 변경되었을 때만 처리
    if (lastAuthState.current !== isAuthenticated) {
      console.log('🔄 [AuthRedirectHandler] 인증 상태 변화 감지:', {
        이전상태: lastAuthState.current,
        현재상태: isAuthenticated,
      });

      lastAuthState.current = isAuthenticated;

      // 로그인 상태가 되었을 때 리다이렉트 처리
      if (isAuthenticated && user && !redirectProcessed.current) {
        redirectProcessed.current = true;

        console.log('🔄 [AuthRedirectHandler] 로그인 성공 감지 - 인증 상태 검증 시작');
        
        // 강화된 인증 상태 검증 후 리다이렉트
        verifyAuthState().then(isValid => {
          if (!isValid) {
            console.warn('❌ [AuthRedirectHandler] 인증 상태 검증 실패');
            performCompleteLogout('로그인 후 검증 실패');
            return;
          }

          // 저장된 리다이렉트 URL 확인
          const savedRedirectUrl = getRedirectUrl();
          console.log('📍 [AuthRedirectHandler] 저장된 리다이렉트 URL:', savedRedirectUrl);

          if (
            savedRedirectUrl &&
            securityUtils.isValidRedirectUrl(savedRedirectUrl)
          ) {
            console.log('✅ [AuthRedirectHandler] 유효한 리다이렉트 URL로 이동:', savedRedirectUrl);
            clearRedirectUrl();

            // 약간의 지연을 두어 상태 안정화
            setTimeout(() => {
              console.log('🚀 [AuthRedirectHandler] 리다이렉트 실행:', savedRedirectUrl);
              router.push(savedRedirectUrl);
            }, 100);
          } else {
            // 현재 페이지가 로그인 페이지인 경우에만 홈으로 이동
            if (
              typeof window !== 'undefined' &&
              window.location.pathname.includes('/login')
            ) {
              console.log('🏠 [AuthRedirectHandler] 로그인 페이지에서 홈으로 이동');
              setTimeout(() => {
                router.push('/');
              }, 100);
            } else {
              console.log('ℹ️ [AuthRedirectHandler] 리다이렉트 URL이 없거나 로그인 페이지가 아님 - 현재 페이지 유지');
            }
          }
        });
      }

      // 로그아웃 상태가 되었을 때 완전한 정리
      if (!isAuthenticated) {
        console.log('🔓 [AuthRedirectHandler] 로그아웃 상태 감지 - 모든 데이터 정리');
        performCompleteLogout('로그아웃 상태 감지');
      }
    }

    // 보호된 라우트 접근 권한 체크 (매번 실행)
    if (isInitialized && !isLoading) {
      checkProtectedRouteAccess();
    }
  }, [isAuthenticated, isInitialized, isLoading, user, router, pathname, isAuthStateVerified]);

  // 초기 인증 상태 검증
  useEffect(() => {
    if (isInitialized && !isLoading && isAuthenticated) {
      console.log('🔍 [AuthRedirectHandler] 초기 인증 상태 검증');
      verifyAuthState();
    }
  }, [isInitialized, isLoading, isAuthenticated]);

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
        console.log('👁️ [AuthRedirectHandler] 페이지 가시성 복구 - 수동 검증 실행');
        manualVerification();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, manualVerification]);

  return <>{children}</>;
}
