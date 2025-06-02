'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider';
// import { usePeriodicAuthVerification } from '@/hooks/usePeriodicAuthVerification'; // 자동 로그아웃 방지를 위해 제거
import {
  // handlePostLoginRedirect, // 사용하지 않음
  // handleSessionTimeout, // 사용하지 않음
  securityUtils,
  getRedirectUrl,
  clearRedirectUrl,
  clearAllAuthData,
} from '@/utils/auth-redirect';

// 세션 타임아웃 설정 제거 (자동 로그아웃 방지)
// const SESSION_TIMEOUT = 30 * 60 * 1000;

// 보호된 라우트 패턴
const PROTECTED_ROUTES = [
  '/vote',
  '/mypage',
  '/rewards',
  '/admin',
];

interface AuthRedirectHandlerProps {
  children: React.ReactNode;
}

/**
 * 로그인 성공 후 자동 리다이렉트를 처리하고
 * 보호된 컨텐츠 접근을 관리하는 컴포넌트
 * 
 * 주의: 자동 로그아웃 기능은 모두 제거되었습니다.
 * - 세션 타임아웃 자동 로그아웃 비활성화
 * - 주기적 인증 검증 자동 로그아웃 비활성화
 * - 서버 검증 실패 시 자동 로그아웃 비활성화
 * - 보호된 라우트 자동 리다이렉트 비활성화
 */
export function AuthRedirectHandler({ children }: AuthRedirectHandlerProps) {
  const { isAuthenticated, isLoading, isInitialized, user, session, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const lastAuthState = useRef<boolean | null>(null);
  // const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 세션 타임아웃 제거
  const redirectProcessed = useRef<boolean>(false);
  
  // 인증 상태 강화 확인
  const [isAuthStateVerified, setIsAuthStateVerified] = useState(false);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);
  const verifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      // WECHAT_AUTH_KEYS.forEach(key => {
      //   try {
      //     localStorage.removeItem(key);
      //     sessionStorage.removeItem(key);
      //   } catch (e) {
      //     console.warn(`WeChat 키 정리 실패: ${key}`, e);
      //   }
      // });

      // 5. 상태 리셋
      setIsAuthStateVerified(false);
      redirectProcessed.current = false;

      console.log('✅ [AuthRedirectHandler] 완전한 로그아웃 완료');
    } catch (error) {
      console.error('💥 [AuthRedirectHandler] 로그아웃 처리 오류:', error);
    }
  };

  /**
   * 강화된 인증 상태 검증 (debounced)
   */
  const verifyAuthState = async (force = false) => {
    // 이미 검증 중이면 중복 호출 방지
    if (isVerifyingAuth && !force) {
      console.log('⏭️ [AuthRedirectHandler] 인증 검증이 이미 진행 중 - 건너뜀');
      return isAuthStateVerified;
    }

    // 이미 검증 완료된 상태이고 강제가 아니면 스킵
    if (isAuthStateVerified && !force) {
      console.log('✅ [AuthRedirectHandler] 이미 검증 완료된 상태 - 건너뜀');
      return true;
    }

    setIsVerifyingAuth(true);

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

      // 2. 세션 만료 체크 (경고만, 자동 로그아웃 안함)
      if (session.expires_at) {
        const expiryTime = new Date(session.expires_at * 1000);
        const now = new Date();
        if (now >= expiryTime) {
          console.warn('⏰ [AuthRedirectHandler] 세션이 만료됨 (자동 로그아웃 비활성화)');
          // await performCompleteLogout('세션 만료'); // 자동 로그아웃 제거
          setIsAuthStateVerified(false);
          return false;
        }
      }

      // 3. 서버 사이드 세션 검증 (자동 로그아웃 없음, 경고만)
      console.log('🔍 [AuthRedirectHandler] 서버 사이드 세션 검증 시작');
      
      let verificationAttempt = 0;
      const maxAttempts = 2;
      
      while (verificationAttempt < maxAttempts) {
        try {
          verificationAttempt++;
          console.log(`🔍 [AuthRedirectHandler] 서버 검증 시도 ${verificationAttempt}/${maxAttempts}`);
          
          // AbortController로 timeout 제어
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 timeout
          
          const response = await fetch('/api/auth/verify', {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            if (response.status === 401) {
              console.warn('🔓 [AuthRedirectHandler] 서버에서 인증 실패 (401) - 자동 로그아웃 비활성화');
              // await performCompleteLogout('서버 인증 실패'); // 자동 로그아웃 제거
              setIsAuthStateVerified(false);
              return false;
            }
            
            // 다른 HTTP 에러 (5xx 등)는 재시도
            if (verificationAttempt >= maxAttempts) {
              console.warn('⚠️ [AuthRedirectHandler] 서버 검증 최대 시도 초과, 클라이언트 세션으로 fallback');
              setIsAuthStateVerified(true);
              return true;
            }
            
            console.warn(`⚠️ [AuthRedirectHandler] 서버 검증 실패 (${response.status}), 재시도...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
            continue;
          }
          
          const result = await response.json();
          
          if (result.valid) {
            console.log('✅ [AuthRedirectHandler] 서버 사이드 세션 검증 성공');
            setIsAuthStateVerified(true);
            return true;
          } else {
            console.warn('❌ [AuthRedirectHandler] 서버 세션 무효 - 자동 로그아웃 비활성화:', result.message);
            // await performCompleteLogout('서버 세션 무효'); // 자동 로그아웃 제거
            setIsAuthStateVerified(false);
            return false;
          }
          
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            console.warn(`⏰ [AuthRedirectHandler] 서버 검증 timeout (시도 ${verificationAttempt}/${maxAttempts})`);
          } else {
            console.warn(`⚠️ [AuthRedirectHandler] 서버 검증 네트워크 오류 (시도 ${verificationAttempt}/${maxAttempts}):`, fetchError.message);
          }
          
          if (verificationAttempt >= maxAttempts) {
            console.warn('⚠️ [AuthRedirectHandler] 서버 검증 완전 실패, 클라이언트 세션으로 fallback');
            // 클라이언트 세션이 있으면 일단 허용
            setIsAuthStateVerified(true);
            return true;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
        }
      }
      
      // 이 지점에 도달하면 fallback
      console.warn('⚠️ [AuthRedirectHandler] 모든 검증 시도 실패, 클라이언트 세션으로 fallback');
      setIsAuthStateVerified(true);
      return true;
      
    } catch (error) {
      console.error('💥 [AuthRedirectHandler] 인증 상태 검증 중 예외:', error);
      
      // 에러 발생 시에도 클라이언트 세션이 있으면 허용
      if (isAuthenticated && user && session) {
        console.warn('⚠️ [AuthRedirectHandler] 검증 에러 but 클라이언트 세션 존재, fallback 허용');
        setIsAuthStateVerified(true);
        return true;
      }
      
      setIsAuthStateVerified(false);
      return false;
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  /**
   * Debounced 인증 상태 검증
   */
  const debouncedVerifyAuthState = (force = false, delay = 500) => {
    if (verifyTimeoutRef.current) {
      clearTimeout(verifyTimeoutRef.current);
    }

    verifyTimeoutRef.current = setTimeout(() => {
      verifyAuthState(force);
    }, delay);
  };

  /**
   * 보호된 라우트 접근 권한 체크 (자동 리다이렉트 비활성화)
   */
  const checkProtectedRouteAccess = () => {
    if (!pathname) return true;

    const isProtectedRoute = PROTECTED_ROUTES.some(route => 
      pathname.includes(route)
    );

    if (isProtectedRoute && !isAuthenticated) {
      console.warn('🛡️ [AuthRedirectHandler] 보호된 라우트 접근 차단 (인증되지 않음):', pathname);
      
      // 자동 리다이렉트 제거 - 사용자가 수동으로 로그인하도록 유도
      // router.push('/login'); // 자동 리다이렉트 제거
      return false;
    }

    // OAuth 콜백 직후에는 isAuthStateVerified가 아직 false일 수 있으므로 더 관대하게 처리
    if (isProtectedRoute && isAuthenticated && !isAuthStateVerified) {
      // 기본 세션이 있으면 잠시 허용하고 백그라운드에서 검증 실행
      if (user && session) {
        console.log('⚠️ [AuthRedirectHandler] 보호된 라우트 접근 - 기본 세션 있음, 백그라운드 검증 비활성화:', pathname);
        
        // 백그라운드에서 검증 실행 비활성화
        // debouncedVerifyAuthState(false, 100); // 100ms 지연으로 즉시 실행
        
        // 일단 접근 허용
        return true;
      } else {
        console.warn('🛡️ [AuthRedirectHandler] 보호된 라우트 접근 차단 (세션 없음):', pathname);
        // 자동 리다이렉트 제거
        // router.push('/login'); // 자동 리다이렉트 제거
        return false;
      }
    }

    return true;
  };

  // 인증 상태 변화 감지 및 리다이렉트 처리
  useEffect(() => {
    console.log('🔄 [AuthRedirectHandler] 상태 체크:', {
      isInitialized,
      isLoading,
      isAuthenticated,
      isAuthStateVerified,
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

        console.log('🔄 [AuthRedirectHandler] 로그인 성공 감지 - 자동 검증 비활성화');
        
        // 자동 검증 대신 바로 verified 상태로 설정
        setIsAuthStateVerified(true);
        
        // 강화된 인증 상태 검증 비활성화
        // debouncedVerifyAuthState(true, 300); // 300ms 지연으로 검증
        
        // 검증 없이 바로 리다이렉트 로직 실행
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
          }, 100); // 검증이 없으므로 빠르게
        } else {
          // 현재 페이지가 로그인 페이지인 경우에만 홈으로 이동
          if (
            typeof window !== 'undefined' &&
            window.location.pathname.includes('/login')
          ) {
            console.log('🏠 [AuthRedirectHandler] 로그인 페이지에서 홈으로 이동');
            setTimeout(() => {
              router.push('/');
            }, 100); // 검증이 없으므로 빠르게
          } else {
            console.log('ℹ️ [AuthRedirectHandler] 리다이렉트 URL이 없거나 로그인 페이지가 아님 - 현재 페이지 유지');
          }
        }
      }

      // 로그아웃 상태가 되었을 때 경고만 (자동 정리 제거)
      if (!isAuthenticated && lastAuthState.current === true) {
        // 이전에 인증된 상태였다가 로그아웃된 경우 경고만
        console.log('🔓 [AuthRedirectHandler] 로그아웃 감지 - 자동 정리 비활성화');
        
        // 자동 로그아웃 정리 제거
        // setTimeout(async () => {
        //   // 다시 한번 확인
        //   if (!isAuthenticated && !user && !session) {
        //     console.log('🚪 [AuthRedirectHandler] 로그아웃 확정 - 모든 데이터 정리');
        //     await performCompleteLogout('확정적 로그아웃 감지');
        //   } else {
        //     console.log('🔄 [AuthRedirectHandler] 일시적 상태 변화로 판단 - 로그아웃 취소');
        //   }
        // }, 100);
      } else if (!isAuthenticated && lastAuthState.current === null) {
        // 초기 로딩 시 인증되지 않은 상태는 정상 (로그아웃 처리하지 않음)
        console.log('ℹ️ [AuthRedirectHandler] 초기 비인증 상태 - 정상');
      }
    }

    // 보호된 라우트 접근 권한 체크 (매번 실행) - 자동 체크 비활성화
    // if (isInitialized && !isLoading) {
    //   checkProtectedRouteAccess();
    // }
  }, [isAuthenticated, isInitialized, isLoading, user, router, pathname, isAuthStateVerified]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (verifyTimeoutRef.current) {
        clearTimeout(verifyTimeoutRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}

