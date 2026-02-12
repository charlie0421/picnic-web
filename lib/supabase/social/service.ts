/**
 * 소셜 로그인 서비스 구현
 *
 * 이 파일은 다양한 소셜 로그인 제공자(Google, Apple, Kakao)에 대한
 * 통합 인증 서비스를 구현합니다.
 */

import { Provider, Session, SupabaseClient } from "@supabase/supabase-js";
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
   *
   * @param options 인증 옵션
   * @returns 인증 결과
   */
  async signInWithGoogle(options?: SocialAuthOptions): Promise<AuthResult> {
    try {
      this.log("Google 로그인 시작", options);
      this.preventRapidRequests("google");

      // Supabase OAuth 인터페이스 활용
      const redirectUrl = options?.redirectUrl || this.callbackUrls.google;

      // 내부 구현은 별도 파일로 분리하여 세부 구현 숨김
      // 실제 구현에서는 import된 함수 사용
      const { signInWithGoogleImpl } = await import("./google");

      const result = await signInWithGoogleImpl(this.supabase, {
        ...options,
        redirectUrl,
      });

      return result;
    } catch (error) {
      this.logError("Google 로그인 오류", error);

      if (error instanceof SocialAuthError) {
        return {
          success: false,
          error,
          provider: "google",
          message: error.message,
        };
      }

      return {
        success: false,
        error: new SocialAuthError(
          SocialAuthErrorCode.AUTH_PROCESS_FAILED,
          error instanceof Error
            ? error.message
            : "알 수 없는 Google 로그인 오류",
          "google",
          error,
        ),
        provider: "google",
      };
    }
  }

  /**
   * Apple 로그인 처리
   *
   * @param options 인증 옵션
   * @returns 인증 결과
   */
  async signInWithApple(options?: SocialAuthOptions): Promise<AuthResult> {
    try {
      this.log("Apple 로그인 시작", options);
      this.preventRapidRequests("apple");

      const redirectUrl = options?.redirectUrl || this.callbackUrls.apple;

      // 실제 구현에서는 import된 함수 사용
      const { signInWithAppleImpl } = await import("./apple");
      return await signInWithAppleImpl(this.supabase, {
        ...options,
        redirectUrl,
      });
    } catch (error) {
      this.logError("Apple 로그인 오류", error);

      if (error instanceof SocialAuthError) {
        return {
          success: false,
          error,
          provider: "apple",
          message: error.message,
        };
      }

      return {
        success: false,
        error: new SocialAuthError(
          SocialAuthErrorCode.AUTH_PROCESS_FAILED,
          error instanceof Error
            ? error.message
            : "알 수 없는 Apple 로그인 오류",
          "apple",
          error,
        ),
        provider: "apple",
      };
    }
  }

  /**
   * Kakao 로그인 처리
   *
   * @param options 인증 옵션
   * @returns 인증 결과
   */
  async signInWithKakao(options?: SocialAuthOptions): Promise<AuthResult> {
    try {
      this.log("Kakao 로그인 시작", options);
      this.preventRapidRequests("kakao");

      const redirectUrl = options?.redirectUrl || this.callbackUrls.kakao;

      // 실제 구현에서는 import된 함수 사용
      const { signInWithKakaoImpl } = await import("./kakao");
      return await signInWithKakaoImpl(this.supabase, {
        ...options,
        redirectUrl,
      });
    } catch (error) {
      this.logError("Kakao 로그인 오류", error);

      if (error instanceof SocialAuthError) {
        return {
          success: false,
          error,
          provider: "kakao",
          message: error.message,
        };
      }

      return {
        success: false,
        error: new SocialAuthError(
          SocialAuthErrorCode.AUTH_PROCESS_FAILED,
          error instanceof Error
            ? error.message
            : "알 수 없는 Kakao 로그인 오류",
          "kakao",
          error,
        ),
        provider: "kakao",
      };
    }
  }

  /**
   * 통합 소셜 로그인 처리
   *
   * @param provider 소셜 로그인 제공자
   * @param options 인증 옵션
   * @returns 인증 결과
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
   *
   * @param provider 소셜 로그인 제공자
   * @param params URL 파라미터
   * @returns 인증 결과
   */
  async handleCallback(
    provider: SocialLoginProvider,
    params?: Record<string, string>,
  ): Promise<AuthResult> {
    this.log(`${provider} 콜백 처리`, params);

    try {
      // OAuth 콜백에서는 URL 해시나 검색 파라미터에서 세션 정보를 추출해야 함
      if (typeof window !== "undefined") {
        // 브라우저 환경에서 URL 해시 확인
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        
        // access_token이나 code가 있는지 확인
        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
        const code = searchParams.get('code');
        
        this.log(`${provider} 콜백 파라미터 확인`, {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasCode: !!code,
          hashParams: Object.fromEntries(hashParams.entries()),
          searchParams: Object.fromEntries(searchParams.entries())
        });

        // 토큰이 URL에 있으면 세션 설정
        if (accessToken) {
          const { data, error } = await this.supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (error) {
            throw new SocialAuthError(
              SocialAuthErrorCode.CALLBACK_FAILED,
              `토큰으로 세션 설정 실패: ${error.message}`,
              provider,
              error,
            );
          }

          if (data.session) {
            this.log(`${provider} 토큰으로 세션 생성 성공`);
            
            // Google 특화 처리
            if (provider === "google") {
              await this.handleGoogleProfile(data.session, params);
            }

            // Apple 특화 처리
            if (provider === "apple") {
              await this.handleAppleProfile(data.session, params);
            }

            // 로컬 스토리지에 인증 성공 정보 저장
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_success", "true");
              localStorage.setItem("auth_provider", provider);
              localStorage.setItem("auth_timestamp", Date.now().toString());
              
              // URL 정리 (토큰 제거)
              const cleanUrl = new URL(window.location.href);
              cleanUrl.hash = '';
              cleanUrl.searchParams.delete('access_token');
              cleanUrl.searchParams.delete('refresh_token');
              cleanUrl.searchParams.delete('expires_in');
              cleanUrl.searchParams.delete('token_type');
              window.history.replaceState({}, '', cleanUrl.toString());
            }

            return {
              success: true,
              session: data.session,
              user: data.session.user,
              provider,
              message: `${provider} 로그인 성공`,
            };
          }
        }
      }

      // 최적화된 방식: OAuth Code Exchange 우선 시도
      const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const code = params?.code || searchParams?.get('code');
      if (code) {
        this.log(`${provider} OAuth Code 발견, exchangeCodeForSession 시도`);
        
        try {
          const { data: exchangeData, error: exchangeError } = await this.supabase.auth.exchangeCodeForSession(code);
          
          if (!exchangeError && exchangeData?.session) {
            this.log(`${provider} Code Exchange 성공! 즉시 완료`);
            
            // URL 정리
            if (typeof window !== 'undefined') {
              const cleanUrl = new URL(window.location.href);
              cleanUrl.searchParams.delete('code');
              cleanUrl.searchParams.delete('state');
              window.history.replaceState({}, '', cleanUrl.toString());
            }
            
            // Google 특화 처리
            if (provider === "google") {
              await this.handleGoogleProfile(exchangeData.session, params);
            }

            // Apple 특화 처리
            if (provider === "apple") {
              await this.handleAppleProfile(exchangeData.session, params);
            }

            // 로컬 스토리지에 인증 성공 정보 저장
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_success", "true");
              localStorage.setItem("auth_provider", provider);
              localStorage.setItem("auth_timestamp", Date.now().toString());
            }

            return {
              success: true,
              session: exchangeData.session,
              user: exchangeData.session.user,
              provider,
              message: `${provider} 로그인 성공 (Code Exchange)`,
            };
          } else {
            this.log(`${provider} Code Exchange 실패:`, exchangeError?.message);
          }
        } catch (codeExchangeError) {
          this.log(`${provider} Code Exchange 오류:`, (codeExchangeError as Error)?.message);
        }
      }

      // 폴백: 기존 사용자 확인 (getUser()로 빠른 처리)
      this.log(`${provider} Code Exchange 실패/불가 - 기존 사용자 확인으로 폴백`);
      
      // 먼저 빠른 사용자 체크 (getUser()는 getSession()보다 빠름)
      let userData: { user: import("@supabase/supabase-js").User | null } | null = null;
      let userError: unknown = null;

      try {
        const userPromise = this.supabase.auth.getUser();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getUser timeout')), 300) // getUser는 더 빠르므로 300ms
        );

        const result = await Promise.race([
          userPromise,
          timeoutPromise
        ]);

        userData = result.data;
        userError = result.error;
        
        this.log(`${provider} 사용자 확인 결과`, { 
          hasData: !!userData, 
          hasUser: !!userData?.user,
          hasError: !!userError 
        });
        
      } catch (timeoutError) {
        this.log(`${provider} getUser 타임아웃 (300ms) - Supabase 자동 처리로 전환`);
        userError = timeoutError;
      }

      if (userError || !userData?.user) {
        // Supabase의 자동 콜백 처리 시도 (더 짧은 대기)
        this.log(`${provider} Supabase 자동 콜백 처리 시도`);
        
        // 짧은 대기 후 다시 사용자 확인 (300ms로 단축)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 빠른 재시도
        let retryData: { user: import("@supabase/supabase-js").User | null } | null = null;
        let retryError: unknown = null;

        try {
          const retryPromise = this.supabase.auth.getUser();
          const retryTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('retry getUser timeout')), 300)
          );

          const retryResult = await Promise.race([
            retryPromise,
            retryTimeoutPromise
          ]);

          retryData = retryResult.data;
          retryError = retryResult.error;
          
        } catch (retryTimeoutError) {
          this.log(`${provider} 재시도 getUser도 타임아웃 - 페이지 새로고침 안내`);
          retryError = retryTimeoutError;
        }
        
        if (retryError || !retryData?.user) {
          throw new SocialAuthError(
            SocialAuthErrorCode.CALLBACK_FAILED,
            `인증 사용자 가져오기 실패: ${userError instanceof Error ? userError.message : retryError instanceof Error ? retryError.message : 'Unknown error'}`,
            provider,
            userError || retryError,
          );
        }
        
        // 재시도로 사용자를 얻었다면 간단한 세션 객체 생성
        if (retryData.user) {
          this.log(`${provider} 재시도로 사용자 확인 성공`);
          
          // 간단한 세션 객체 생성 (프로필 처리용)
          const simpleSession = {
            user: retryData.user,
            access_token: 'token-from-cookie',
            refresh_token: null,
            expires_at: null,
            token_type: 'bearer'
          };
          
          // Google 특화 처리
          if (provider === "google") {
            await this.handleGoogleProfile(simpleSession as unknown as Session, params);
          }

          // Apple 특화 처리
          if (provider === "apple") {
            await this.handleAppleProfile(simpleSession as unknown as Session, params);
          }

          // 로컬 스토리지에 인증 성공 정보 저장
          if (typeof window !== "undefined") {
            localStorage.setItem("auth_success", "true");
            localStorage.setItem("auth_provider", provider);
            localStorage.setItem("auth_timestamp", Date.now().toString());
          }

          return {
            success: true,
            session: simpleSession as unknown as Session,
            user: retryData.user,
            provider,
            message: `${provider} 로그인 성공`,
          };
        }
      }

      if (!userData?.user) {
        // 최후의 수단: 페이지 새로고침 후 사용자 확인 요청
        this.log(`${provider} 사용자가 없음 - 페이지 새로고침 필요`);
        
        throw new SocialAuthError(
          SocialAuthErrorCode.CALLBACK_FAILED,
          "사용자가 인증되지 않았습니다. 페이지를 새로고침하거나 다시 로그인해주세요.",
          provider,
        );
      }

      this.log(`${provider} 기존 사용자 확인 성공`);

      // 간단한 세션 객체 생성 (프로필 처리용)
      const sessionForProfile = {
        user: userData.user,
        access_token: 'token-from-cookie',
        refresh_token: null,
        expires_at: null,
        token_type: 'bearer'
      };

      // Google 특화 처리
      if (provider === "google") {
        await this.handleGoogleProfile(sessionForProfile as unknown as Session, params);
      }

      // Apple 특화 처리
      if (provider === "apple") {
        await this.handleAppleProfile(sessionForProfile as unknown as Session, params);
      }

      // 로컬 스토리지에 인증 성공 정보 저장 (기존 코드와의 호환성)
      if (typeof window !== "undefined") {
        localStorage.setItem("auth_success", "true");
        localStorage.setItem("auth_provider", provider);
        localStorage.setItem("auth_timestamp", Date.now().toString());
      }

      return {
        success: true,
        session: sessionForProfile as unknown as Session,
        user: userData.user,
        provider,
        message: `${provider} 로그인 성공`,
      };
    } catch (error) {
      this.logError(`${provider} 콜백 처리 오류`, error);

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
          SocialAuthErrorCode.CALLBACK_FAILED,
          error instanceof Error ? error.message : "알 수 없는 콜백 처리 오류",
          provider,
          error,
        ),
        provider,
      };
    }
  }

  /**
   * Google 로그인 후 프로필 정보 처리
   *
   * @param session 인증 세션
   * @param params URL 파라미터
   */
  private async handleGoogleProfile(
    session: Session,
    params?: Record<string, string>,
  ): Promise<void> {
    try {
      const user = session.user;

      // 사용자 프로필이 이미 존재하는지 확인
      const { data: existingProfile } = await this.supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // ID 토큰이 있는 경우 (콜백에서 제공)
      if (params?.id_token) {
        try {
          // API를 호출하여 ID 토큰을 검증하고 프로필 정보 가져오기
          const response = await fetch("/api/auth/google", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              idToken: params.id_token,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.profile) {
              // 사용자 프로필이 없으면 생성, 있으면 업데이트
              if (!existingProfile) {
                const insertData = {
                  id: user.id,
                  nickname: data.profile.name || user.email?.split("@")[0] || "User", // display_name → nickname
                  avatar_url: data.profile.avatar || null,
                  email: data.profile.email || user.email,
                  provider: "google",
                  provider_id: data.profile.id,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                
                const { error: insertError } = await this.supabase.from("user_profiles").insert(insertData);

                if (insertError) {
                  console.error('❌ [Google] 프로필 생성 실패:', insertError);
                }
              } else {
                // 필요한 필드만 업데이트
                await this.supabase.from("user_profiles").update({
                  avatar_url: data.profile.avatar || existingProfile.avatar_url,
                  provider: "google",
                  provider_id: data.profile.id,
                  updated_at: new Date().toISOString(),
                }).eq("id", user.id);
              }
            }
          }
        } catch (error) {
          console.error("Google 프로필 처리 오류:", error);
          // 오류 발생 시 기본 프로필만 사용
        }
      }

      // 최소한의 프로필 정보가 없는 경우 기본 프로필 생성
      if (!existingProfile) {
        const basicProfileData = {
          id: user.id,
          nickname: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User", // display_name → nickname
          email: user.email,
          avatar_url: null, // JWT 토큰 이미지는 사용하지 않음
          provider: "google",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        const { error: basicInsertError } = await this.supabase.from("user_profiles").insert(basicProfileData);

        if (basicInsertError) {
          console.error('❌ [Google] 기본 프로필 생성 실패:', basicInsertError);
        }
      }
    } catch (error) {
      console.error("Google 프로필 업데이트 오류:", error);
      // 프로필 업데이트 실패해도 로그인 자체는 성공으로 처리
    }
  }

  /**
   * Apple 로그인 후 프로필 정보 처리
   *
   * @param session 인증 세션
   * @param params URL 파라미터
   */
  private async handleAppleProfile(
    session: Session,
    params?: Record<string, string>,
  ): Promise<void> {
    try {
      const user = session.user;
      // 사용자 프로필이 이미 존재하는지 확인
      const { data: existingProfile, error: profileCheckError } = await this.supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileCheckError && profileCheckError.code !== 'PGRST116') {
        // PGRST116 = 데이터 없음 (정상), 다른 에러는 로깅
        console.error('🍎 [Apple Profile] 기존 프로필 확인 오류:', profileCheckError);
      }

      // Apple은 첫 로그인 시에만 name과 email 정보를 제공합니다.
      // user 정보가 URL 파라미터로 제공된 경우 (첫 로그인)
      let userObject: { name?: { firstName?: string; lastName?: string }; email?: string } | null = null;

      if (params?.user) {
        try {
          userObject = JSON.parse(decodeURIComponent(params.user));

          // localStorage에 저장 (향후 사용)
          if (typeof localStorage !== "undefined" && userObject) {
            localStorage.setItem(
              "apple_user_name",
              JSON.stringify(userObject.name),
            );
            localStorage.setItem(
              "apple_user_email",
              userObject.email || user.email || "",
            );
          }
        } catch (error) {
          console.error("🍎 [Apple Profile] 사용자 데이터 파싱 오류:", error);
        }
      }

      // ID 토큰이 있는 경우 (API 검증 시도)
      if (params?.id_token) {
        try {
          // API를 호출하여 ID 토큰을 검증하고 프로필 정보 가져오기
          const response = await fetch("/api/auth/apple", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id_token: params.id_token,
              user: userObject,
            }),
          });

          if (response.ok) {
            const data = await response.json();

            if (data.success && data.profile) {
              // 사용자 프로필이 없으면 생성, 있으면 업데이트
              if (!existingProfile) {
                const appleInsertData = {
                  id: user.id,
                  nickname: data.profile.name || userObject?.name?.firstName || user.email?.split("@")[0] || "User",
                  avatar_url: null, // Apple은 프로필 이미지를 제공하지 않음
                  email: data.profile.email || user.email,
                  provider: "apple",
                  provider_id: data.profile.id,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                
                const { error: appleInsertError } = await this.supabase
                  .from("user_profiles")
                  .insert(appleInsertData);

                if (appleInsertError) {
                  console.error('❌ [Apple Profile] 프로필 생성 실패:', appleInsertError);
                } else {
                  return; // 성공적으로 생성했으므로 함수 종료
                }
              } else {
                // 기존 프로필 업데이트
                const { error: updateError } = await this.supabase
                  .from("user_profiles")
                  .update({
                    provider: "apple",
                    provider_id: data.profile.id,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", user.id);

                if (updateError) {
                  console.error('❌ [Apple Profile] 프로필 업데이트 실패:', updateError);
                } else {
                  return; // 성공적으로 업데이트했으므로 함수 종료
                }
              }
            }
          }
        } catch (error) {
          console.error("🍎 [Apple Profile] API 호출 오류:", error);
          // 오류 발생 시 기본 프로필 처리로 진행
        }
      }

      // API 검증 실패 또는 ID 토큰 없음 → 기본 프로필 처리
      if (!existingProfile) {
        // localStorage에서 이전에 저장한 정보 사용
        let name = "";
        if (typeof localStorage !== "undefined") {
          try {
            const savedName = localStorage.getItem("apple_user_name");
            if (savedName) {
              const parsedName = JSON.parse(savedName);
              name = [parsedName.firstName, parsedName.lastName].filter(Boolean).join(" ");
            }
          } catch (e) {
            console.error("🍎 [Apple Profile] 저장된 이름 파싱 오류:", e);
          }
        }

        // 기본 프로필 데이터 생성
        const appleBasicData = {
          id: user.id,
          nickname: name || 
                   userObject?.name?.firstName || 
                   user.user_metadata?.name || 
                   user.user_metadata?.full_name || 
                   user.email?.split("@")[0] || 
                   "User",
          email: user.email,
          avatar_url: null, // Apple은 프로필 이미지 제공 안함
          provider: "apple",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        const { error: appleBasicError } = await this.supabase
          .from("user_profiles")
          .insert(appleBasicData);

        if (appleBasicError) {
          console.error('❌ [Apple Profile] 기본 프로필 생성 실패:', appleBasicError);
        }
      }
    } catch (error) {
      console.error("🍎 [Apple Profile] 처리 중 전체 오류:", error);
      // 프로필 업데이트 실패해도 로그인 자체는 성공으로 처리
    }
  }

  /**
   * 빠른 연속 요청 방지
   *
   * @param provider 소셜 로그인 제공자
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
 *
 * @param supabase Supabase 클라이언트 인스턴스 (옵션)
 * @returns SocialAuthService 인스턴스
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
