/**
 * 소셜 로그인 서비스 구현
 *
 * 이 파일은 다양한 소셜 로그인 제공자(Google, Apple, Kakao)에 대한
 * 통합 인증 서비스를 구현합니다.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import {
  AuthResult,
  LogFunction,
  SocialAuthError,
  SocialAuthErrorCode,
  SocialAuthOptions,
  SocialAuthServiceInterface,
  SocialLoginProvider,
} from "./types";
import { wrapSignInError } from "./auth-helpers";
import { handleGoogleProfile, handleAppleProfile } from "./profile-handlers";
import { handleCallbackImpl } from "./callback-handler";

// 디버그 모드 설정
const DEBUG = process.env.NODE_ENV !== "production";

/**
 * 소셜 로그인 서비스 클래스
 *
 * 다양한 소셜 로그인 제공자에 대한 통합 인증 인터페이스를 제공합니다.
 */
export class SocialAuthService implements SocialAuthServiceInterface {
  /**
   * 디버그 로깅 함수
   */
  private log: LogFunction;

  /**
   * 에러 로깅 함수
   */
  private logError: LogFunction;

  /**
   * 마지막 로그인 요청 시간 (성능 최적화용)
   */
  private lastAuthRequestTime: Record<string, number> = {};

  /**
   * 콜백 URL 캐시
   */
  private callbackUrls: Record<SocialLoginProvider, string> = {
    google: "",
    apple: "",
    kakao: "",
  };

  /**
   * 생성자
   *
   * @param supabase Supabase 클라이언트 인스턴스
   */
  constructor(private supabase: SupabaseClient<Database>) {
    // 로깅 함수 초기화
    this.log = (message: string, data?: any) => {
      if (DEBUG) {
        console.log(`🔑 SocialAuth: ${message}`, data || "");
      }
    };

    this.logError = (message: string, data?: any) => {
      console.error(`❌ SocialAuth Error: ${message}`, data || "");
    };

    // 콜백 URL 초기화 (모든 환경에서 동일)
    if (typeof window !== "undefined") {
      const baseUrl = window.location.origin;

      this.callbackUrls = {
        google: `${baseUrl}/auth/callback/google`,
        apple: `${baseUrl}/auth/callback/apple`,
        kakao: `${baseUrl}/auth/callback/kakao`,
      };

    }

    this.log("서비스 초기화 완료");
  }

  /**
   * Google 로그인 처리
   */
  async signInWithGoogle(options?: SocialAuthOptions): Promise<AuthResult> {
    try {
      this.log("Google 로그인 시작", options);
      this.preventRapidRequests("google");

      const redirectUrl = options?.redirectUrl || this.callbackUrls.google;
      const { signInWithGoogleImpl } = await import("./google");

      return await signInWithGoogleImpl(this.supabase, {
        ...options,
        redirectUrl,
      });
    } catch (error) {
      this.logError("Google 로그인 오류", error);
      return wrapSignInError(error, "google");
    }
  }

  /**
   * Apple 로그인 처리
   */
  async signInWithApple(options?: SocialAuthOptions): Promise<AuthResult> {
    try {
      this.log("Apple 로그인 시작", options);
      this.preventRapidRequests("apple");

      const redirectUrl = options?.redirectUrl || this.callbackUrls.apple;
      const { signInWithAppleImpl } = await import("./apple");

      return await signInWithAppleImpl(this.supabase, {
        ...options,
        redirectUrl,
      });
    } catch (error) {
      this.logError("Apple 로그인 오류", error);
      return wrapSignInError(error, "apple");
    }
  }

  /**
   * Kakao 로그인 처리
   */
  async signInWithKakao(options?: SocialAuthOptions): Promise<AuthResult> {
    try {
      this.log("Kakao 로그인 시작", options);
      this.preventRapidRequests("kakao");

      const redirectUrl = options?.redirectUrl || this.callbackUrls.kakao;
      const { signInWithKakaoImpl } = await import("./kakao");

      return await signInWithKakaoImpl(this.supabase, {
        ...options,
        redirectUrl,
      });
    } catch (error) {
      this.logError("Kakao 로그인 오류", error);
      return wrapSignInError(error, "kakao");
    }
  }

  /**
   * 통합 소셜 로그인 처리
   */
  async signInWithProvider(
    provider: SocialLoginProvider,
    options?: SocialAuthOptions,
  ): Promise<AuthResult> {
    this.log(`${provider} 제공자 로그인 요청`, options);

    switch (provider) {
      case "google":
        return this.signInWithGoogle(options);
      case "apple":
        return this.signInWithApple(options);
      case "kakao":
        return this.signInWithKakao(options);
      default:
        return {
          success: false,
          error: new SocialAuthError(
            SocialAuthErrorCode.PROVIDER_NOT_SUPPORTED,
            `지원되지 않는 로그인 제공자: ${provider}`,
            provider as SocialLoginProvider,
          ),
          provider: provider as SocialLoginProvider,
        };
    }
  }

  /**
   * 소셜 로그인 콜백 처리
   */
  async handleCallback(
    provider: SocialLoginProvider,
    params?: Record<string, string>,
  ): Promise<AuthResult> {
    return handleCallbackImpl(this.supabase, provider, params, {
      log: this.log,
      logError: this.logError,
      handleGoogleProfile,
      handleAppleProfile,
    });
  }

  /**
   * 빠른 연속 요청 방지
   */
  private preventRapidRequests(provider: string): void {
    const now = Date.now();
    const lastRequest = this.lastAuthRequestTime[provider] || 0;
    const MIN_REQUEST_INTERVAL = 2000; // 2초

    if (now - lastRequest < MIN_REQUEST_INTERVAL) {
      throw new SocialAuthError(
        SocialAuthErrorCode.AUTH_PROCESS_FAILED,
        `너무 빠른 로그인 요청입니다. ${
          (MIN_REQUEST_INTERVAL - (now - lastRequest)) / 1000
        }초 후에 다시 시도하세요.`,
        provider as SocialLoginProvider,
      );
    }

    this.lastAuthRequestTime[provider] = now;
  }
}

/**
 * 소셜 인증 서비스 싱글톤 인스턴스
 */
let socialAuthServiceInstance: SocialAuthService | null = null;

/**
 * 소셜 인증 서비스 인스턴스 생성 또는 가져오기
 */
export function getSocialAuthService(
  supabase?: SupabaseClient<Database>,
): SocialAuthService {
  // Supabase 클라이언트가 제공되지 않은 경우 자동 생성
  let client = supabase;
  if (!client) {
    if (typeof window !== "undefined") {
      const { createBrowserSupabaseClient } = require("@/lib/supabase/client");
      client = createBrowserSupabaseClient();
    } else {
      throw new Error("서버 환경에서는 Supabase 클라이언트를 명시적으로 전달해야 합니다.");
    }
  }

  if (!socialAuthServiceInstance) {
    socialAuthServiceInstance = new SocialAuthService(client as SupabaseClient<Database>);
  }

  return socialAuthServiceInstance;
}

/**
 * 소셜 인증 서비스 인스턴스 재설정 (테스트용)
 */
export function resetSocialAuthService(): void {
  socialAuthServiceInstance = null;
}
