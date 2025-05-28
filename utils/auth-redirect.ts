/**
 * 인증 관련 리다이렉트 유틸리티
 */

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

        // 허용된 경로 패턴 확인
        const allowedPaths = [
            "/vote",
            "/mypage",
            "/rewards",
            "/media",
            "/notice",
            "/faq",
            "/",
        ];

        const pathname = testUrl.pathname;
        const isAllowedPath = allowedPaths.some((path) =>
            pathname === path || pathname.startsWith(path + "/")
        );

        return isAllowedPath;
    } catch (error) {
        console.warn("URL 검증 실패:", error);
        return false;
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
        // URL 검증
        if (!isValidRedirectUrl(url)) {
            console.warn("유효하지 않은 리다이렉트 URL:", url);
            return;
        }

        const timestamp = Date.now().toString();

        sessionStorage.setItem(REDIRECT_URL_KEY, url);
        sessionStorage.setItem(REDIRECT_TIMESTAMP_KEY, timestamp);

        // 백업으로 localStorage에도 저장
        localStorage.setItem(LOGIN_REDIRECT_KEY, url);
        localStorage.setItem(REDIRECT_TIMESTAMP_KEY, timestamp);
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
    } catch (error) {
        console.warn("리다이렉트 URL 제거 실패:", error);
    }
}

/**
 * 로그인 후 적절한 페이지로 리다이렉트합니다.
 */
export function handlePostLoginRedirect(): string {
    const redirectUrl = getRedirectUrl();

    // 저장된 URL 제거
    clearRedirectUrl();

    // 리다이렉트 URL이 있고 유효하면 해당 URL로, 없으면 홈으로
    if (redirectUrl && isValidRedirectUrl(redirectUrl)) {
        return redirectUrl;
    }

    return "/";
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
