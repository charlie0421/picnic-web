"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useLoginRequired } from "@/components/ui/Dialog";
import { saveRedirectUrl, securityUtils } from "@/utils/auth-redirect";

const DEBUG_AUTH_GUARD = process.env.NEXT_PUBLIC_DEBUG_AUTH_GUARD === 'true';

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
}

export function useAuthGuard(options: AuthGuardOptions = {}) {
    const { isAuthenticated, isLoading, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const showLoginRequired = useLoginRequired();

    const {
        redirectUrl,
        requireAuth = true,
        onAuthRequired,
        onAuthSuccess,
        onError,
        customLoginMessage,
    } = options;

    // 인증 체크 함수
    const checkAuth = useCallback(async (): Promise<boolean> => {
        try {
            if (DEBUG_AUTH_GUARD) {
                console.log("🔍 checkAuth 시작:", {
                    isLoading,
                    requireAuth,
                    isAuthenticated,
                    userId: user?.id,
                    timestamp: new Date().toISOString(),
                });
            }

            // 로딩 중이면 대기
            if (isLoading) {
                if (DEBUG_AUTH_GUARD) console.log("⏳ 로딩 중 - 인증 체크 대기");
                return false;
            }

            // 인증이 필요하지 않은 경우
            if (!requireAuth) {
                if (DEBUG_AUTH_GUARD) console.log("✅ 인증 불필요 - 통과");
                return true;
            }

            // 보안 검증
            if (!securityUtils.validateUserAgent()) {
                if (DEBUG_AUTH_GUARD) console.log("🚫 보안 검증 실패 - 의심스러운 사용자 에이전트");
                const error = new Error(
                    "보안 검증 실패: 의심스러운 사용자 에이전트",
                );
                onError?.(error);
                return false;
            }

            // 인증 상태 엄격 체크
            const hasValidAuth = isAuthenticated && user && user.id;

            if (DEBUG_AUTH_GUARD) {
                console.log("🔐 인증 상태 체크:", {
                    isAuthenticated,
                    hasUser: !!user,
                    userId: user?.id,
                    hasValidAuth,
                });
            }

            // 로컬 스토리지의 잘못된 인증 데이터 정리
            if (!hasValidAuth) {
                if (DEBUG_AUTH_GUARD) console.log("🧹 잘못된 인증 데이터 정리 시작");
                try {
                    // 인증되지 않았는데 남아있는 인증 관련 데이터 정리
                    const authKeys = [
                        "auth_success",
                        "auth_provider",
                        "auth_timestamp",
                    ];
                    authKeys.forEach((key) => {
                        if (localStorage.getItem(key)) {
                            localStorage.removeItem(key);
                            if (DEBUG_AUTH_GUARD) console.log(`🗑️ 잘못된 인증 데이터 정리: ${key}`);
                        }
                    });
                } catch (e) {
                    console.warn("로컬 스토리지 정리 중 오류:", e);
                }
            }

            // 인증된 경우
            if (hasValidAuth) {
                if (DEBUG_AUTH_GUARD) console.log("✅ 인증 성공");
                onAuthSuccess?.();
                return true;
            }

            // 인증되지 않은 경우
            if (DEBUG_AUTH_GUARD) console.log("❌ 인증 실패 - 로그인 필요");
            const targetUrl = redirectUrl || pathname;

            // URL 보안 검증
            if (targetUrl && !securityUtils.isValidRedirectUrl(targetUrl)) {
                if (DEBUG_AUTH_GUARD) console.warn("유효하지 않은 리다이렉트 URL:", targetUrl);
                onAuthRequired?.();
                return false;
            }

            onAuthRequired?.(targetUrl);
            return false;
        } catch (error) {
            console.error("인증 체크 중 오류:", error);
            onError?.(
                error instanceof Error ? error : new Error("인증 체크 실패"),
            );
            return false;
        }
    }, [
        isLoading,
        requireAuth,
        isAuthenticated,
        user,
        redirectUrl,
        pathname,
        onAuthRequired,
        onAuthSuccess,
        onError,
    ]);

    // 인증이 필요한 액션을 실행하는 함수
    const withAuth = useCallback(async <T>(
        action: () => Promise<T> | T,
        customRedirectUrl?: string,
    ): Promise<T | null> => {
        try {
            if (DEBUG_AUTH_GUARD) {
                console.log("🔐 withAuth 시작:", {
                    isLoading,
                    isAuthenticated,
                    userId: user?.id,
                    requireAuth,
                    timestamp: new Date().toISOString(),
                });
            }

            const isAuthorized = await checkAuth();

            if (DEBUG_AUTH_GUARD) console.log("🔍 checkAuth 결과:", isAuthorized);

            if (!isAuthorized) {
                if (DEBUG_AUTH_GUARD) console.log("❌ 인증 실패 - 로그인 다이얼로그 표시");
                const targetUrl = customRedirectUrl || redirectUrl || pathname;

                // URL 보안 검증 및 저장
                if (targetUrl && securityUtils.isValidRedirectUrl(targetUrl)) {
                    if (DEBUG_AUTH_GUARD) console.log("리다이렉트 URL 저장:", targetUrl);
                    saveRedirectUrl(targetUrl);
                }

                // 로그인 다이얼로그 표시
                if (DEBUG_AUTH_GUARD) {
                    console.log("🔄 showLoginRequired 호출 시작:", {
                        targetUrl,
                        hasCustomMessage: !!customLoginMessage,
                        timestamp: new Date().toISOString()
                    });
                }
                
                const loginDialogResult = await showLoginRequired({
                    redirectUrl: targetUrl,
                    title: customLoginMessage?.title,
                    description: customLoginMessage?.description,
                    loginText: customLoginMessage?.loginText,
                    cancelText: customLoginMessage?.cancelText,
                    onLogin: () => {
                        // URL은 이미 저장되었으므로 중복 저장하지 않음
                        console.log("🔄 로그인 페이지로 이동");
                        router.push(`/login`);
                    },
                });

                if (DEBUG_AUTH_GUARD) console.log("🔄 showLoginRequired 결과:", loginDialogResult);

                return null;
            }

            if (DEBUG_AUTH_GUARD) console.log("✅ 인증 성공 - 액션 실행");
            // 인증된 경우 액션 실행
            return await action();
        } catch (error) {
            console.error("인증 액션 실행 중 오류:", error);
            onError?.(
                error instanceof Error ? error : new Error("액션 실행 실패"),
            );
            return null;
        }
    }, [
        checkAuth,
        redirectUrl,
        pathname,
        showLoginRequired,
        router,
        onError,
        customLoginMessage,
        isLoading,
        isAuthenticated,
        user,
        requireAuth,
    ]);

    // 인증이 필요한 네비게이션
    const navigateWithAuth = useCallback(async (
        path: string,
        options?: { replace?: boolean },
    ): Promise<boolean> => {
        try {
            // 경로 보안 검증
            if (!securityUtils.isValidRedirectUrl(path)) {
                console.warn("유효하지 않은 네비게이션 경로:", path);
                onError?.(new Error("유효하지 않은 경로"));
                return false;
            }

            const isAuthorized = await checkAuth();

            if (!isAuthorized) {
                if (DEBUG_AUTH_GUARD) console.log("네비게이션 리다이렉트 URL 저장:", path);
                saveRedirectUrl(path);

                // 로그인 다이얼로그 표시
                if (DEBUG_AUTH_GUARD) {
                    console.log("🔄 showLoginRequired 호출 시작:", {
                        path,
                        hasCustomMessage: !!customLoginMessage,
                        timestamp: new Date().toISOString()
                    });
                }
                
                const loginDialogResult = await showLoginRequired({
                    redirectUrl: path,
                    title: customLoginMessage?.title,
                    description: customLoginMessage?.description,
                    loginText: customLoginMessage?.loginText,
                    cancelText: customLoginMessage?.cancelText,
                    onLogin: () => {
                        // 언어별 로그인 경로로 이동
                        const language = pathname.split('/')[1] || 'en';
                        try { saveRedirectUrl(path); } catch {}
                        router.push(`/${language}/login?returnTo=${encodeURIComponent(path)}`);
                    },
                });

                if (DEBUG_AUTH_GUARD) console.log("🔄 showLoginRequired 결과:", loginDialogResult);

                return false;
            }

            // 인증된 경우 네비게이션 실행
            if (options?.replace) {
                router.replace(path);
            } else {
                router.push(path);
            }

            return true;
        } catch (error) {
            console.error("인증 네비게이션 중 오류:", error);
            onError?.(
                error instanceof Error ? error : new Error("네비게이션 실패"),
            );
            return false;
        }
    }, [checkAuth, showLoginRequired, router, onError, customLoginMessage]);

    return {
        // 상태
        isAuthenticated,
        isLoading,
        user,

        // 메서드
        checkAuth,
        withAuth,
        navigateWithAuth,
    };
}

// 편의 훅들
export function useRequireAuth(
    options?: Omit<AuthGuardOptions, "requireAuth">,
) {
    return useAuthGuard({ ...options, requireAuth: true });
}

export function useOptionalAuth(
    options?: Omit<AuthGuardOptions, "requireAuth">,
) {
    return useAuthGuard({ ...options, requireAuth: false });
}
