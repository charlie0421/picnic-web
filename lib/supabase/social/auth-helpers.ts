import {
  AuthResult,
  SocialAuthError,
  SocialAuthErrorCode,
  SocialLoginProvider,
} from "./types";
import { Session, User } from "@supabase/supabase-js";

/**
 * signInWith* catch 블록 공통 에러 래핑
 */
export function wrapSignInError(
  error: unknown,
  provider: SocialLoginProvider,
): AuthResult {
  if (error instanceof SocialAuthError) {
    return {
      success: false,
      error,
      provider,
      message: error.message,
    };
  }

  return {
    success: false,
    error: new SocialAuthError(
      SocialAuthErrorCode.AUTH_PROCESS_FAILED,
      error instanceof Error
        ? error.message
        : `알 수 없는 ${provider} 로그인 오류`,
      provider,
      error,
    ),
    provider,
  };
}

/**
 * 성공 AuthResult 생성 헬퍼
 *
 * NOTE: `session` is nullable to support the cookie-only success path in
 * `handleCallbackImpl`, where Supabase has set the auth cookie but we never
 * had access to the raw session (e.g., PKCE handled by the SDK on first load).
 * In that case we return `session: null` rather than fabricating a fake
 * session containing placeholder access/refresh tokens.
 */
export function createSuccessResult(
  session: Session | null,
  user: User,
  provider: SocialLoginProvider,
  message: string,
): AuthResult {
  return {
    success: true,
    session,
    user,
    provider,
    message,
  };
}

/**
 * localStorage에 인증 성공 상태 저장
 */
export function saveAuthState(provider: SocialLoginProvider): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("auth_success", "true");
    localStorage.setItem("auth_provider", provider);
    localStorage.setItem("auth_timestamp", Date.now().toString());
  }
}

/**
 * 콜백 후 URL에서 파라미터를 제거하여 정리
 */
export function cleanCallbackUrl(paramsToRemove: string[]): void {
  if (typeof window !== "undefined") {
    const cleanUrl = new URL(window.location.href);
    if (paramsToRemove.includes("hash")) {
      cleanUrl.hash = "";
    }
    for (const param of paramsToRemove) {
      if (param !== "hash") {
        cleanUrl.searchParams.delete(param);
      }
    }
    window.history.replaceState({}, "", cleanUrl.toString());
  }
}
