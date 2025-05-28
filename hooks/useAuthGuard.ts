"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useLoginRequired } from "@/components/ui/Dialog";
import { saveRedirectUrl, securityUtils } from "@/utils/auth-redirect";

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
            // 로딩 중이면 대기
            if (isLoading) {
                return false;
            }

            // 인증이 필요하지 않은 경우
            if (!requireAuth) {
                return true;
            }

            // 보안 검증
            if (!securityUtils.validateUserAgent()) {
                const error = new Error(
                    "보안 검증 실패: 의심스러운 사용자 에이전트",
                );
                onError?.(error);
                return false;
            }

            // 인증된 경우
            if (isAuthenticated && user) {
                onAuthSuccess?.();
                return true;
            }

            // 인증되지 않은 경우
            const targetUrl = redirectUrl || pathname;

            // URL 보안 검증
            if (targetUrl && !securityUtils.isValidRedirectUrl(targetUrl)) {
                console.warn("유효하지 않은 리다이렉트 URL:", targetUrl);
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
            const isAuthorized = await checkAuth();

            if (!isAuthorized) {
                const targetUrl = customRedirectUrl || redirectUrl || pathname;

                // URL 보안 검증
                if (targetUrl && securityUtils.isValidRedirectUrl(targetUrl)) {
                    saveRedirectUrl(targetUrl);
                }

                // 로그인 다이얼로그 표시
                showLoginRequired({
                    redirectUrl: targetUrl,
                    title: customLoginMessage?.title,
                    description: customLoginMessage?.description,
                    loginText: customLoginMessage?.loginText,
                    cancelText: customLoginMessage?.cancelText,
                    onLogin: (url) => {
                        if (url && securityUtils.isValidRedirectUrl(url)) {
                            saveRedirectUrl(url);
                        }
                        router.push("/login");
                    },
                });

                return null;
            }

            // 인증된 경우 액션 실행
            return await action();
        } catch (error) {
            console.error("인증 액션 실행 중 오류:", error);
            onError?.(
                error instanceof Error ? error : new Error("액션 실행 실패"),
            );
            return null;
        }
    }, [checkAuth, redirectUrl, pathname, showLoginRequired, router, onError]);

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
                saveRedirectUrl(path);

                // 로그인 다이얼로그 표시
                showLoginRequired({
                    redirectUrl: path,
                    title: customLoginMessage?.title,
                    description: customLoginMessage?.description,
                    loginText: customLoginMessage?.loginText,
                    cancelText: customLoginMessage?.cancelText,
                    onLogin: (url) => {
                        if (url && securityUtils.isValidRedirectUrl(url)) {
                            saveRedirectUrl(url);
                        }
                        router.push("/login");
                    },
                });

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
    }, [checkAuth, showLoginRequired, router, onError]);

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
