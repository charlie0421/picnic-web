/**
 * 인증 리다이렉트 — 스토리지 유틸리티
 */

import { isValidRedirectUrl, normalizeRedirectPath, REDIRECT_URL_EXPIRY } from './auth-redirect-validators';

// 리다이렉트 URL 저장 키
export const REDIRECT_URL_KEY = "redirectUrl";
export const LOGIN_REDIRECT_KEY = "loginRedirectUrl";
export const REDIRECT_TIMESTAMP_KEY = "redirectTimestamp";

/**
 * 리다이렉트 URL이 만료되었는지 확인합니다.
 */
export function isRedirectUrlExpired(): boolean {
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

        // sessionStorage 우선 확인 (신규 키)
        const sessionUrl = sessionStorage.getItem(REDIRECT_URL_KEY);
        if (sessionUrl && isValidRedirectUrl(sessionUrl)) {
            return sessionUrl;
        }

        // localStorage에서 신규 키 우선 확인
        const localNew = localStorage.getItem(REDIRECT_URL_KEY);
        if (localNew && isValidRedirectUrl(localNew)) {
            return localNew;
        }

        // 레거시 키(loginRedirectUrl)도 보조로 확인 (과거 저장값 호환)
        const localLegacy = localStorage.getItem(LOGIN_REDIRECT_KEY);
        if (localLegacy && isValidRedirectUrl(localLegacy)) {
            return localLegacy;
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
        // 신규 및 레거시 키 모두 제거
        localStorage.removeItem(REDIRECT_URL_KEY);
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
        // 단, 최근 로그인 정보는 보존: 'picnic_last_login'
        const PRESERVE_KEYS = new Set(["picnic_last_login"]);
        const localKeysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
                key &&
                !PRESERVE_KEYS.has(key) &&
                (
                    key.includes("auth") ||
                    key.includes("redirect") ||
                    key.includes("supabase") ||
                    key.includes("login")
                )
            ) {
                localKeysToRemove.push(key);
            }
        }
        localKeysToRemove.forEach((key) => {
            try { localStorage.removeItem(key); } catch {}
        });
    } catch (error) {
        console.warn("인증 데이터 정리 실패:", error);
    }
}
