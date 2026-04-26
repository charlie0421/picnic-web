/**
 * 인증 관련 리다이렉트 유틸리티
 */

// Barrel re-exports — 기존 소비자들이 '@/utils/auth-redirect' 경로를 그대로 사용할 수 있도록 함
export * from './auth-redirect-validators';
export * from './auth-redirect-storage';

import {
    isValidRedirectUrl,
    shouldSaveUrl,
    getCurrentLocale,
    normalizeRedirectPath,
} from './auth-redirect-validators';

import {
    saveRedirectUrl,
    getRedirectUrl,
    clearRedirectUrl,
    isRedirectUrlExpired,
} from './auth-redirect-storage';

/**
 * 로그인 후 적절한 페이지로 리다이렉트합니다.
 */
export function handlePostLoginRedirect(returnToParam?: string): string {
    // 1. URL 파라미터에서 returnTo 확인 (우선순위 가장 높음)
    if (returnToParam && isValidRedirectUrl(returnToParam)) {
        return normalizeRedirectPath(returnToParam);
    }

    // 2. 브라우저 URL에서 returnTo / return_url 파라미터 확인
    if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const returnTo = urlParams.get('returnTo') || urlParams.get('return_url');
        if (returnTo && isValidRedirectUrl(returnTo)) {
            return normalizeRedirectPath(returnTo);
        }
    }

    // 3. 소셜 로그인에서 강제 저장한 auth_return_url 우선 사용
    try {
        if (typeof window !== 'undefined') {
            const altReturn = localStorage.getItem('auth_return_url');
            if (altReturn && isValidRedirectUrl(altReturn)) {
                // 일회성 사용 후 정리
                localStorage.removeItem('auth_return_url');
                return normalizeRedirectPath(altReturn);
            }
        }
    } catch {}

    // 4. 저장된 리다이렉트 URL 확인 (기존 유틸 저장값)
    let redirectUrl = getRedirectUrl();

    // 저장된 URL 제거
    clearRedirectUrl();

    // 리다이렉트 URL이 있고 유효하면 해당 URL로
    if (redirectUrl && isValidRedirectUrl(redirectUrl)) {
        return normalizeRedirectPath(redirectUrl);
    }

    // 기본 폴백: 사이트 루트로 이동 (원복)
    return normalizeRedirectPath("/");
}

/**
 * 현재 URL을 저장하고 로그인 페이지로 이동합니다.
 */
export function redirectToLogin(currentUrl?: string): void {
    if (typeof window === "undefined") return;

    const urlToSave = currentUrl || (window.location.pathname + window.location.search);

    // 로그인 페이지나 인증 관련 페이지는 저장하지 않음
    if (!shouldSaveUrl(urlToSave)) {
        clearRedirectUrl();
    } else {
        saveRedirectUrl(urlToSave);
    }

    // 현재 로케일을 기준으로 언어 프리픽스 포함한 로그인 경로 구성 + returnTo 쿼리 전달
    const locale = getCurrentLocale();
    const normalizedReturnTo = normalizeRedirectPath(urlToSave);
    const loginPath = `/${locale}/login?returnTo=${encodeURIComponent(normalizedReturnTo)}`;
    window.location.href = loginPath;
}

/**
 * 로그인 성공 후 자동 리다이렉트를 처리합니다.
 */
export function usePostLoginRedirect() {
    if (typeof window === "undefined") return;

    const targetUrl = handlePostLoginRedirect();

    // 현재 페이지가 로그인 페이지가 아닌 경우에만 리다이렉트
    if (window.location.pathname !== targetUrl) {
        window.location.href = targetUrl;
    }
}

/**
 * 세션 타임아웃 처리
 */
export function handleSessionTimeout(): void {
    // 리다이렉트 URL 정리
    clearRedirectUrl();

    // 현재 페이지를 저장하고 로그인으로 이동
    const currentUrl = window.location.pathname + window.location.search;
    if (shouldSaveUrl(currentUrl)) {
        saveRedirectUrl(currentUrl);
    }

    // 세션 만료 메시지와 함께 로그인 페이지로 이동
    const loginUrl = new URL("/login", window.location.origin);
    loginUrl.searchParams.set("reason", "session_expired");
    window.location.href = loginUrl.toString();
}

/**
 * 보안 검증을 위한 유틸리티 함수들
 */
export const securityUtils = {
    isValidRedirectUrl,
    isRedirectUrlExpired,
    handleSessionTimeout,

    /**
     * CSRF 토큰 검증 (필요시 사용)
     */
    validateCSRFToken: (token: string): boolean => {
        // 실제 구현에서는 서버와 토큰을 검증
        return typeof token === "string" && token.length > 0;
    },

    /**
     * 사용자 에이전트 검증 (봇 차단 등)
     */
    validateUserAgent: (): boolean => {
        if (typeof window === "undefined") return true;

        const userAgent = navigator.userAgent.toLowerCase();
        const suspiciousPatterns = ["bot", "crawler", "spider", "scraper"];

        return !suspiciousPatterns.some((pattern) =>
            userAgent.includes(pattern)
        );
    },
};
