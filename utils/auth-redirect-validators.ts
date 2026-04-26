/**
 * 인증 리다이렉트 — 검증 및 정규화 유틸리티
 */

import { DEFAULT_LANGUAGE } from '@/config/settings';

// 리다이렉트 URL 만료 시간 (30분)
export const REDIRECT_URL_EXPIRY = 30 * 60 * 1000;

/**
 * URL이 안전한지 검증합니다.
 */
export function isValidRedirectUrl(url: string): boolean {
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
 * URL이 저장할 가치가 있는지 확인합니다.
 */
export function shouldSaveUrl(url: string): boolean {
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
 * 현재 브라우저 컨텍스트에서 로케일을 추정합니다.
 * 우선순위: cookie(locale) > 경로 prefix > DEFAULT_LANGUAGE
 */
export function getCurrentLocale(): string {
    try {
        if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
        const match = document.cookie.match(/(?:^|; )locale=([^;]+)/);
        if (match && /^[a-z]{2}$/i.test(match[1])) {
            return match[1];
        }
        const pathname = window.location.pathname || '/';
        const pathLocale = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i)?.[1];
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

        // 잘못된 "/login/..." 프리픽스로 돌아오는 경우 교정
        // 예: "/login/vote" → "/vote"
        if (/^\/login\//i.test(url)) {
            url = url.replace(/^\/login\//i, '/');
        }

        // 로케일 prefix 처리: 비로컬라이즈드 상위 라우트는 접두사 추가하지 않음
        const NON_LOCALIZED_ROOTS = [
            '/vote',
            '/auth',
            '/callback',
        ];
        const hasLocale = /^\/[a-z]{2}(?:\/|$)/i.test(url);
        const isNonLocalized = NON_LOCALIZED_ROOTS.some((root) => url === root || url.startsWith(root + '/'));
        if (!hasLocale && !isNonLocalized) {
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
