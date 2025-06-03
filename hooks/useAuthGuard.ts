"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useLoginRequired } from "@/components/ui/Dialog";
import { saveRedirectUrl, securityUtils } from "@/utils/auth-redirect";
import { useLanguageStore } from "@/stores/languageStore";
import { isLoggedOut, getRemainingAuthItems } from "@/lib/auth/logout";

export interface AuthGuardOptions {
    redirectUrl?: string;
    requireAuth?: boolean;
    onAuthRequired?: (redirectUrl?: string) => void;
    onAuthSuccess?: () => void;
    onError?: (error: Error) => void;
    customLoginMessage?: {
        title?: string;
        description?: string;
        loginText?: string;
        cancelText?: string;
    };
    requireVerification?: boolean;
    enablePeriodicCheck?: boolean;
    checkInterval?: number; // 밀리초
    onAuthLost?: () => void; // 인증 상실 감지 시 호출될 콜백
}

// 인증 검증 결과 인터페이스
interface AuthVerificationResult {
    isValid: boolean;
    error?: string;
    needsReauth?: boolean;
    shouldReload?: boolean; // 페이지 새로고침 권장
}

/**
 * 강화된 인증 가드 훅
 * 
 * 주요 기능:
 * 1. 포괄적 인증 상태 검증
 * 2. 주기적 인증 상태 확인 (5분마다)
 * 3. 서버 사이드 검증 (선택적)
 * 4. 자동 로그아웃 감지 및 정리
 * 5. 로그아웃된 사용자 강력 차단
 */
export function useAuthGuard(options: AuthGuardOptions = {}) {
    const {
        customLoginMessage,
        requireVerification = false,
        enablePeriodicCheck = true, // 기본값을 true로 변경
        checkInterval = 300000, // 5분 기본값
        onAuthLost
    } = options;

    const { isAuthenticated, isLoading, user, session } = useAuth();
    const showLoginRequired = useLoginRequired();
    const router = useRouter();
    const pathname = usePathname();
    const { t } = useLanguageStore();

    // 상태 관리
    const [isVerified, setIsVerified] = useState(false);
    const [verificationCount, setVerificationCount] = useState(0);
    const [lastVerificationTime, setLastVerificationTime] = useState(0);
    const [authError, setAuthError] = useState<string | null>(null);
    const [consecutiveFailures, setConsecutiveFailures] = useState(0);
    const [isMonitoring, setIsMonitoring] = useState(false);

    // Refs
    const periodicCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastAuthState = useRef<boolean>(false);
    const logoutDetectionRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /**
     * 서버 사이드 인증 검증
     */
    const verifyServerAuthentication = useCallback(async (): Promise<boolean> => {
        try {
            console.log('🔍 [useAuthGuard] 서버 인증 검증 시작');

            const response = await fetch('/api/auth/verify', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-Source': 'useAuthGuard',
                    'X-Verification-Count': verificationCount.toString()
                },
            });

            if (!response.ok) {
                console.warn('🚫 [useAuthGuard] 서버 인증 검증 실패:', response.status);
                return false;
            }

            const result = await response.json();
            
            if (!result.valid || !result.authenticated) {
                console.warn('❌ [useAuthGuard] 서버에서 인증 무효 응답:', result);
                return false;
            }

            console.log('✅ [useAuthGuard] 서버 인증 검증 성공');
            return true;
        } catch (error) {
            console.warn('⚠️ [useAuthGuard] 서버 인증 검증 오류:', error);
            // 네트워크 오류는 허용 (클라이언트 세션으로 fallback)
            return true;
        }
    }, [verificationCount]);

    /**
     * 포괄적 인증 상태 검증 (강화됨)
     */
    const performComprehensiveAuthCheck = useCallback(async (): Promise<AuthVerificationResult> => {
        try {
            console.log('🔄 [useAuthGuard] 포괄적 인증 상태 검증 시작 (검증 #' + (verificationCount + 1) + ')');
            setVerificationCount(prev => prev + 1);

            // 1. 강화된 로그아웃 상태 검증
            if (isLoggedOut()) {
                console.warn('❌ [useAuthGuard] 강화된 로그아웃 상태 감지');
                const remainingItems = getRemainingAuthItems();
                if (remainingItems.length > 0) {
                    console.warn('⚠️ [useAuthGuard] 남은 인증 데이터 감지 - 강제 정리:', remainingItems);
                    try {
                        // 남은 데이터 강제 정리
                        await import('@/lib/auth/logout').then(module => module.emergencyLogout());
                    } catch (err) {
                        console.error('💥 [useAuthGuard] 강제 로그아웃 실패:', err);
                    }
                    return {
                        isValid: false,
                        error: '로그인이 필요합니다. 페이지를 새로고침 해주세요.',
                        needsReauth: true,
                        shouldReload: true
                    };
                }
                return {
                    isValid: false,
                    error: '로그인이 필요합니다.',
                    needsReauth: true
                };
            }

            // 2. 기본 인증 상태 체크 (강화됨)
            if (!isAuthenticated || !user || !session) {
                console.warn('❌ [useAuthGuard] 기본 인증 상태 실패:', {
                    isAuthenticated,
                    hasUser: !!user,
                    hasSession: !!session,
                    isLoading
                });
                return {
                    isValid: false,
                    error: '인증 정보를 확인할 수 없습니다.',
                    needsReauth: true
                };
            }

            // 3. 세션 만료 체크 (강화됨)
            if (session.expires_at) {
                const expiryTime = new Date(session.expires_at * 1000);
                const now = new Date();
                const timeDiff = expiryTime.getTime() - now.getTime();
                
                if (timeDiff <= 0) {
                    console.warn('⏰ [useAuthGuard] 세션이 만료됨');
                    try {
                        await import('@/lib/auth/logout').then(module => module.emergencyLogout());
                    } catch (err) {
                        console.error('💥 [useAuthGuard] 세션 만료 로그아웃 실패:', err);
                    }
                    return {
                        isValid: false,
                        error: '세션이 만료되었습니다. 다시 로그인해주세요.',
                        needsReauth: true,
                        shouldReload: true
                    };
                }

                // 세션이 10분 이내에 만료될 예정이면 경고
                if (timeDiff < 600000) { // 10분
                    console.warn('⚠️ [useAuthGuard] 세션이 곧 만료됩니다:', Math.round(timeDiff / 60000), '분 남음');
                    
                    // 곧 만료될 예정이면 서버 검증 강제 실행
                    if (requireVerification) {
                        const serverValid = await verifyServerAuthentication();
                        if (!serverValid) {
                            return {
                                isValid: false,
                                error: '세션이 곧 만료되거나 무효합니다. 다시 로그인해주세요.',
                                needsReauth: true
                            };
                        }
                    }
                }
            }

            // 4. 서버 인증 상태 검증 (주기적)
            if (requireVerification) {
                const shouldVerifyServer = 
                    verificationCount % 3 === 1 || // 3번에 한 번
                    Date.now() - lastVerificationTime > 300000 || // 5분마다
                    consecutiveFailures > 0; // 이전에 실패가 있었으면 항상 검증

                if (shouldVerifyServer) {
                    console.log('🔍 [useAuthGuard] 서버 검증 조건 충족 - 실행');
                    const serverValid = await verifyServerAuthentication();
                    setLastVerificationTime(Date.now());

                    if (!serverValid) {
                        setConsecutiveFailures(prev => prev + 1);
                        
                        // 연속 실패 3회 이상시 강제 로그아웃
                        if (consecutiveFailures >= 2) {
                            console.error('🚨 [useAuthGuard] 연속 인증 실패 - 강제 로그아웃');
                            try {
                                await import('@/lib/auth/logout').then(module => module.emergencyLogout());
                            } catch (err) {
                                console.error('💥 [useAuthGuard] 연속 실패 로그아웃 실패:', err);
                            }
                            return {
                                isValid: false,
                                error: '인증에 문제가 발생했습니다. 다시 로그인해주세요.',
                                needsReauth: true,
                                shouldReload: true
                            };
                        }
                        
                        return {
                            isValid: false,
                            error: '서버 인증 검증에 실패했습니다.',
                            needsReauth: true
                        };
                    } else {
                        setConsecutiveFailures(0); // 성공시 실패 카운트 리셋
                    }
                }
            }

            console.log('✅ [useAuthGuard] 포괄적 인증 상태 검증 성공');
            return { isValid: true };

        } catch (error) {
            console.error('💥 [useAuthGuard] 인증 검증 중 예외:', error);
            setConsecutiveFailures(prev => prev + 1);
            
            // 예외 발생시도 연속 실패로 간주
            if (consecutiveFailures >= 2) {
                console.error('🚨 [useAuthGuard] 예외 연속 발생 - 강제 로그아웃');
                try {
                    await import('@/lib/auth/logout').then(module => module.emergencyLogout());
                } catch (err) {
                    console.error('💥 [useAuthGuard] 예외 처리 로그아웃 실패:', err);
                }
                return {
                    isValid: false,
                    error: '인증 확인 중 문제가 발생했습니다. 페이지를 새로고침해주세요.',
                    needsReauth: true,
                    shouldReload: true
                };
            }
            
            return {
                isValid: false,
                error: '인증 확인 중 오류가 발생했습니다.',
                needsReauth: false // 네트워크 오류 등은 재인증이 필요하지 않을 수 있음
            };
        }
    }, [isAuthenticated, user, session, isLoading, requireVerification, verificationCount, lastVerificationTime, consecutiveFailures, verifyServerAuthentication]);

    /**
     * 로그아웃 상태 감지 (1분마다)
     */
    const startLogoutDetection = useCallback(() => {
        if (logoutDetectionRef.current) {
            clearInterval(logoutDetectionRef.current);
        }

        console.log('🔍 [useAuthGuard] 로그아웃 감지 시작 (1분 간격)');

        logoutDetectionRef.current = setInterval(() => {
            if (isAuthenticated && !isLoading) {
                // 빠른 로그아웃 상태 감지
                if (isLoggedOut()) {
                    console.warn('🚪 [useAuthGuard] 로그아웃 상태 감지됨');
                    setAuthError('로그아웃되었습니다.');
                    setIsVerified(false);
                    
                    // 콜백 호출
                    if (onAuthLost) {
                        onAuthLost();
                    }
                    
                    // 감지 중단
                    if (logoutDetectionRef.current) {
                        clearInterval(logoutDetectionRef.current);
                        logoutDetectionRef.current = null;
                    }
                }
            }
        }, 60000); // 1분마다
    }, [isAuthenticated, isLoading, onAuthLost]);

    /**
     * 로그아웃 감지 중단
     */
    const stopLogoutDetection = useCallback(() => {
        if (logoutDetectionRef.current) {
            clearInterval(logoutDetectionRef.current);
            logoutDetectionRef.current = null;
            console.log('⏹️ [useAuthGuard] 로그아웃 감지 중단');
        }
    }, []);

    /**
     * 주기적 인증 상태 검증 시작 (강화됨)
     */
    const startPeriodicCheck = useCallback(() => {
        if (!enablePeriodicCheck) return;
        
        if (periodicCheckRef.current) {
            clearInterval(periodicCheckRef.current);
        }

        console.log('🔄 [useAuthGuard] 주기적 인증 검증 시작:', checkInterval, 'ms 간격');
        setIsMonitoring(true);

        periodicCheckRef.current = setInterval(async () => {
            if (isAuthenticated && !isLoading) {
                console.log('🔄 [useAuthGuard] 주기적 인증 상태 검증 실행');
                
                const result = await performComprehensiveAuthCheck();
                
                if (!result.isValid) {
                    console.warn('❌ [useAuthGuard] 주기적 검증 실패:', result.error);
                    setAuthError(result.error || '인증 상태가 유효하지 않습니다.');
                    setIsVerified(false);

                    if (result.needsReauth) {
                        console.warn('🚪 [useAuthGuard] 재인증 필요 - 주기적 검증 중단');
                        stopPeriodicCheck();
                        stopLogoutDetection();
                        
                        // 콜백 호출
                        if (onAuthLost) {
                            onAuthLost();
                        }
                        
                        // 페이지 새로고침 권장시 처리
                        if (result.shouldReload) {
                            setTimeout(() => {
                                if (typeof window !== 'undefined') {
                                    window.location.reload();
                                }
                            }, 2000);
                        }
                    }
                } else {
                    setAuthError(null);
                    setIsVerified(true);
                }
            }
        }, checkInterval);

        // 로그아웃 감지도 함께 시작
        startLogoutDetection();
    }, [enablePeriodicCheck, checkInterval, isAuthenticated, isLoading, performComprehensiveAuthCheck, onAuthLost, startLogoutDetection]);

    /**
     * 주기적 인증 상태 검증 중단 (강화됨)
     */
    const stopPeriodicCheck = useCallback(() => {
        if (periodicCheckRef.current) {
            clearInterval(periodicCheckRef.current);
            periodicCheckRef.current = null;
            setIsMonitoring(false);
            console.log('⏹️ [useAuthGuard] 주기적 인증 검증 중단');
        }
        stopLogoutDetection();
    }, [stopLogoutDetection]);

    /**
     * 인증이 필요한 액션 실행
     */
    const withAuth = useCallback(async <T>(action: () => Promise<T> | T): Promise<T | null> => {
        console.log('🔐 [useAuthGuard] withAuth 호출 - 인증 검증 시작');

        // 포괄적 인증 상태 검증
        const authResult = await performComprehensiveAuthCheck();
        
        if (!authResult.isValid) {
            console.warn('❌ [useAuthGuard] 인증 검증 실패:', authResult.error);
            setAuthError(authResult.error || '인증에 실패했습니다.');

            if (authResult.needsReauth) {
                console.log('🔐 [useAuthGuard] 로그인 다이얼로그 표시');
                
                // 현재 URL 저장
                try {
                    saveRedirectUrl(pathname);
                    console.log('💾 [useAuthGuard] 리다이렉트 URL 저장:', pathname);
                } catch (error) {
                    console.warn('⚠️ [useAuthGuard] 리다이렉트 URL 저장 실패:', error);
                }

                // 로그인 다이얼로그 표시
                showLoginRequired({
                    title: customLoginMessage?.title || t('dialog.login_required.title'),
                    description: customLoginMessage?.description || t('dialog.login_required.description'),
                    loginText: customLoginMessage?.loginText || t('dialog.login_required.login_button'),
                    cancelText: customLoginMessage?.cancelText || t('dialog.login_required.cancel_button'),
                });
            }

            return null;
        }

        try {
            console.log('✅ [useAuthGuard] 인증 통과 - 액션 실행');
            setAuthError(null);
            setIsVerified(true);
            
            const result = await action();
            return result;
        } catch (error) {
            console.error('💥 [useAuthGuard] 액션 실행 중 오류:', error);
            setAuthError('작업 실행 중 오류가 발생했습니다.');
            throw error;
        }
    }, [performComprehensiveAuthCheck, pathname, showLoginRequired, customLoginMessage, t]);

    /**
     * 인증 상태 변화 감지
     */
    useEffect(() => {
        const currentAuthState = isAuthenticated && !!user && !!session;
        
        console.log('🔄 [useAuthGuard] 인증 상태 변화 감지:', {
            이전상태: lastAuthState.current,
            현재상태: currentAuthState,
            isLoading
        });

        if (lastAuthState.current !== currentAuthState) {
            lastAuthState.current = currentAuthState;

            if (currentAuthState) {
                console.log('✅ [useAuthGuard] 로그인 감지 - 주기적 검증 시작');
                setIsVerified(true);
                setAuthError(null);
                startPeriodicCheck();
            } else {
                console.log('🚪 [useAuthGuard] 로그아웃 감지 - 검증 중단');
                setIsVerified(false);
                setAuthError(null);
                stopPeriodicCheck();
            }
        }
    }, [isAuthenticated, user, session, isLoading, startPeriodicCheck, stopPeriodicCheck]);

    /**
     * 컴포넌트 언마운트 시 정리
     */
    useEffect(() => {
        return () => {
            stopPeriodicCheck();
        };
    }, [stopPeriodicCheck]);

    return {
        // 인증 상태
        isAuthenticated,
        isVerified,
        user,
        authError,
        isLoading,

        // 인증 검증 메서드
        withAuth,
        verifyAuth: performComprehensiveAuthCheck,

        // 주기적 검증 제어
        startPeriodicCheck,
        stopPeriodicCheck,

        // 통계
        verificationCount,
        lastVerificationTime: new Date(lastVerificationTime),
    };
}

/**
 * 간단한 인증 확인만 필요할 때 사용하는 훅
 */
export function useRequireAuth(options: AuthGuardOptions = {}) {
    const authGuard = useAuthGuard({
        ...options,
        enablePeriodicCheck: false, // 간단한 버전은 주기적 검증 비활성화
        requireVerification: false
    });

    return {
        withAuth: authGuard.withAuth,
        isAuthenticated: authGuard.isAuthenticated,
        user: authGuard.user,
        authError: authGuard.authError,
        isLoading: authGuard.isLoading
    };
}
