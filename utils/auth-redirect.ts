/**
 * 인증 관련 리다이렉트 유틸리티
 */

import { DEFAULT_LANGUAGE } from '@/config/settings';

// 리다이렉트 URL 저장 키
const REDIRECT_URL_KEY = "redirectUrl";
const LOGIN_REDIRECT_KEY = "loginRedirectUrl";
const REDIRECT_TIMESTAMP_KEY = "redirectTimestamp";

// 리다이렉트 URL 만료 시간 (30분)
const REDIRECT_URL_EXPIRY = 30 * 60 * 1000;

/**
 * URL이 안전한지 검증합니다.
 */
function isValidRedirectUrl(url: string): boolean {
    try {
        // 빈 문자열이나 null 체크
        if (!url || typeof url !== "string") {
            return false;
        }

        // 상대 경로만 허용 (절대 URL 차단)
        if (
            url.startsWith("http://") || url.startsWith("https://") ||
            url.startsWith("//")
        ) {
            return false;
        }

        // 프로토콜 스키마 차단 (javascript:, data:, etc.)
        if (url.includes(":")) {
            return false;
        }

        // 백슬래시 차단 (Windows 경로 방지)
        if (url.includes("\\")) {
            return false;
        }

        // 상위 디렉토리 탐색 방지
        if (url.includes("../") || url.includes("..\\")) {
            return false;
        }

        // URL 객체로 파싱 시도 (상대 경로)
        const testUrl = new URL(url, "https://example.com");

        // 언어 프리픽스 제거 (예: /en/star-candy -> /star-candy)
        const stripLangPrefix = (path: string): string => {
            const match = path.match(/^\/[a-z]{2}(\/|$)/i);
            if (!match) return path;
            const withoutLang = path.replace(/^\/[a-z]{2}(?=\/|$)/i, "");
            return withoutLang === "" ? "/" : withoutLang;
        };

        const originalPathname = testUrl.pathname;
        const normalizedPathname = stripLangPrefix(originalPathname);

        // 보안상 제외할 경로들만 차단하고, 그 외 내부 경로는 모두 허용
        const excludedPatterns = [
            "/login",
            "/auth/",
            "/callback",
            "/logout",
            "/error",
            "/404",
            "/500",
        ];

        const isExcluded = excludedPatterns.some((pattern) =>
            normalizedPathname === pattern || normalizedPathname.startsWith(pattern)
        );

        // 내부 경로이면서 제외 목록이 아니면 허용
        return normalizedPathname.startsWith('/') && !isExcluded;
    } catch (error) {
        console.warn("URL 검증 실패:", error);
        return false;
    }
}

/**
 * 현재 브라우저 컨텍스트에서 로케일을 추정합니다.
 * 우선순위: cookie(locale) > 경로 prefix > DEFAULT_LANGUAGE
 */
function getCurrentLocale(): string {
    try {
        if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
        const match = document.cookie.match(/(?:^|; )locale=([^;]+)/);
        if (match && /^[a-z]{2}$/i.test(match[1])) {
            return match[1];
        }
        const pathname = window.location.pathname || '/';
        const pathLocale = pathname.match(/^\/([a-z]{2})(?:\/|$)/i)?.[1];
        if (pathLocale) return pathLocale;
    } catch {}
    return DEFAULT_LANGUAGE;
}

/**
 * 동일 출처 절대 URL을 상대경로로 변환하고,
 * 선행 슬래시/로케일 prefix 를 보장하는 정규화 함수
 */
export function normalizeRedirectPath(input: string): string {
    try {
        if (!input || typeof input !== 'string') return '/';

        let url = input.trim();

        // 동일 출처의 절대 URL은 상대 경로로 축약
        if (typeof window !== 'undefined' && (url.startsWith('http://') || url.startsWith('https://'))) {
            try {
                const u = new URL(url, window.location.origin);
                if (u.origin === window.location.origin) {
                    url = u.pathname + u.search + u.hash;
                } else {
                    // 외부 도메인은 차단하고 홈으로
                    return '/';
                }
            } catch {
                return '/';
            }
        }

        // 프로토콜/스키마가 들어간 경우는 차단
        if (url.includes(':') && !url.startsWith('/')) return '/';

        // 선행 슬래시 보장
        if (!url.startsWith('/')) url = `/${url}`;

        // 로케일 prefix 보장
        const hasLocale = /^\/[a-z]{2}(?:\/|$)/i.test(url);
        if (!hasLocale) {
            const locale = getCurrentLocale();
            url = `/${locale}${url === '/' ? '' : url}`;
        }

        // 중복 슬래시 정리
        url = url.replace(/\/{2,}/g, '/');

        return url || '/';
    } catch {
        return '/';
    }
}

/**
 * 리다이렉트 URL이 만료되었는지 확인합니다.
 */
function isRedirectUrlExpired(): boolean {
    try {
        const timestamp = sessionStorage.getItem(REDIRECT_TIMESTAMP_KEY) ||
            localStorage.getItem(REDIRECT_TIMESTAMP_KEY);

        if (!timestamp) {
            return true;
        }

        const savedTime = parseInt(timestamp, 10);
        const currentTime = Date.now();

        return (currentTime - savedTime) > REDIRECT_URL_EXPIRY;
    } catch (error) {
        console.warn("리다이렉트 URL 만료 확인 실패:", error);
        return true;
    }
}

/**
 * 로그인 후 리다이렉트할 URL을 저장합니다.
 */
export function saveRedirectUrl(url: string): void {
    try {
        // 항상 먼저 정규화한 뒤 검증 (로케일/선행슬래시/동일출처 처리)
        const normalized = normalizeRedirectPath(url);
        if (!isValidRedirectUrl(normalized)) {
            console.warn("유효하지 않은 리다이렉트 URL:", url);
            return;
        }

        const timestamp = Date.now().toString();

        sessionStorage.setItem(REDIRECT_URL_KEY, normalized);
        sessionStorage.setItem(REDIRECT_TIMESTAMP_KEY, timestamp);

        // 필요 시 세션 범위를 넘어 보존하려면 localStorage 'redirectUrl'을 사용하고,
        // 과거 키 'loginRedirectUrl'은 더 이상 생성하지 않음(혼란 방지)
        try {
            localStorage.setItem(REDIRECT_URL_KEY, normalized);
            localStorage.setItem(REDIRECT_TIMESTAMP_KEY, timestamp);
        } catch {}
    } catch (error) {
        console.warn("리다이렉트 URL 저장 실패:", error);
    }
}

/**
 * 저장된 리다이렉트 URL을 가져옵니다.
 */
export function getRedirectUrl(): string | null {
    try {
        // 만료 확인
        if (isRedirectUrlExpired()) {
            clearRedirectUrl();
            return null;
        }

        // sessionStorage 우선 확인
        const sessionUrl = sessionStorage.getItem(REDIRECT_URL_KEY);
        if (sessionUrl && isValidRedirectUrl(sessionUrl)) {
            return sessionUrl;
        }

        // localStorage 백업 확인
        const localUrl = localStorage.getItem(LOGIN_REDIRECT_KEY);
        if (localUrl && isValidRedirectUrl(localUrl)) {
            return localUrl;
        }

        return null;
    } catch (error) {
        console.warn("리다이렉트 URL 조회 실패:", error);
        return null;
    }
}

/**
 * 저장된 리다이렉트 URL을 제거합니다.
 */
export function clearRedirectUrl(): void {
    try {
        sessionStorage.removeItem(REDIRECT_URL_KEY);
        sessionStorage.removeItem(REDIRECT_TIMESTAMP_KEY);
        localStorage.removeItem(LOGIN_REDIRECT_KEY);
        localStorage.removeItem(REDIRECT_TIMESTAMP_KEY);

        // 추가로 다른 키 패턴들도 정리
        sessionStorage.removeItem("auth_redirect_url");
        sessionStorage.removeItem("auth_redirect_timestamp");
        localStorage.removeItem("auth_redirect_url");
        localStorage.removeItem("auth_redirect_timestamp");
    } catch (error) {
        console.warn("리다이렉트 URL 제거 실패:", error);
    }
}

/**
 * 로그인 후 적절한 페이지로 리다이렉트합니다.
 */
export function handlePostLoginRedirect(returnToParam?: string): string {
    try { console.log('[AuthRedirect] handlePostLoginRedirect called with param:', returnToParam); } catch {}
    // 1. URL 파라미터에서 returnTo 확인 (우선순위 가장 높음)
    if (returnToParam && isValidRedirectUrl(returnToParam)) {
        try { console.log('[AuthRedirect] using returnToParam:', returnToParam); } catch {}
        return normalizeRedirectPath(returnToParam);
    }

    // 2. 브라우저 URL에서 returnTo / return_url 파라미터 확인
    if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const returnTo = urlParams.get('returnTo') || urlParams.get('return_url');
        if (returnTo && isValidRedirectUrl(returnTo)) {
            try { console.log('[AuthRedirect] using query returnTo/return_url:', returnTo); } catch {}
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
                try { console.log('[AuthRedirect] using auth_return_url:', altReturn); } catch {}
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
        try { console.log('[AuthRedirect] using stored redirectUrl/loginRedirectUrl:', redirectUrl); } catch {}
        return normalizeRedirectPath(redirectUrl);
    }

    // 기본 폴백: 사이트 루트로 이동 (원복)
    try { console.log('[AuthRedirect] fallback to /'); } catch {}
    return normalizeRedirectPath("/");
}

/**
 * 현재 URL을 저장하고 로그인 페이지로 이동합니다.
 */
export function redirectToLogin(currentUrl?: string): void {
    if (typeof window === "undefined") return;

    const urlToSave = currentUrl ||
        window.location.pathname + window.location.search;

    // 로그인 페이지나 인증 관련 페이지는 저장하지 않음
    if (!shouldSaveUrl(urlToSave)) {
        clearRedirectUrl();
    } else {
        saveRedirectUrl(urlToSave);
    }

    // 로그인 페이지로 이동
    window.location.href = "/login";
}

/**
 * URL이 저장할 가치가 있는지 확인합니다.
 */
function shouldSaveUrl(url: string): boolean {
    const excludePatterns = [
        "/login",
        "/auth/",
        "/callback",
        "/logout",
        "/signup",
        "/reset-password",
        "/error",
        "/404",
        "/500",
    ];

    return !excludePatterns.some((pattern) => url.includes(pattern)) &&
        isValidRedirectUrl(url);
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

/**
 * 로그아웃 시 모든 인증 관련 데이터를 완전히 정리합니다.
 */
export function clearAllAuthData(): void {
    try {
        // 리다이렉트 URL 정리
        clearRedirectUrl();

        // sessionStorage에서 인증 관련 모든 데이터 제거
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (
                key && (
                    key.includes("auth") ||
                    key.includes("redirect") ||
                    key.includes("supabase") ||
                    key.includes("login")
                )
            ) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));

        // localStorage에서 인증 관련 모든 데이터 제거
        const localKeysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
                key && (
                    key.includes("auth") ||
                    key.includes("redirect") ||
                    key.includes("supabase") ||
                    key.includes("login")
                )
            ) {
                localKeysToRemove.push(key);
            }
        }
        localKeysToRemove.forEach((key) => localStorage.removeItem(key));

        console.log("모든 인증 관련 데이터가 정리되었습니다.");
    } catch (error) {
        console.warn("인증 데이터 정리 실패:", error);
    }
}
