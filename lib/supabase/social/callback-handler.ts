import { SupabaseClient, User } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import {
  AuthResult,
  LogFunction,
  SocialAuthError,
  SocialAuthErrorCode,
  SocialLoginProvider,
} from "./types";
import { createSuccessResult, saveAuthState, cleanCallbackUrl } from "./auth-helpers";

export interface CallbackHelpers {
  log: LogFunction;
  logError: LogFunction;
  // NOTE: profile handlers receive the authenticated `User` (not the full `Session`).
  // Previously these accepted a `Session`, which forced us to fabricate a fake session
  // (with `access_token: 'token-from-cookie'`) on the cookie-only / fallback path.
  // The handlers only ever read `session.user` anyway, so passing `User` directly removes
  // the need for the dangerous `as unknown as Session` cast and the fake-token sentinel.
  handleGoogleProfile: (
    supabase: SupabaseClient<Database>,
    user: User,
    params?: Record<string, string>,
  ) => Promise<void>;
  handleAppleProfile: (
    supabase: SupabaseClient<Database>,
    user: User,
    params?: Record<string, string>,
  ) => Promise<void>;
}

/**
 * 프로필 처리 공통 로직
 */
async function runProfileHandlers(
  supabase: SupabaseClient<Database>,
  provider: SocialLoginProvider,
  user: User,
  params: Record<string, string> | undefined,
  helpers: CallbackHelpers,
): Promise<void> {
  if (provider === "google") {
    await helpers.handleGoogleProfile(supabase, user, params);
  }
  if (provider === "apple") {
    await helpers.handleAppleProfile(supabase, user, params);
  }
}

/**
 * 소셜 로그인 콜백 처리 구현
 */
export async function handleCallbackImpl(
  supabase: SupabaseClient<Database>,
  provider: SocialLoginProvider,
  params: Record<string, string> | undefined,
  helpers: CallbackHelpers,
): Promise<AuthResult> {
  helpers.log(`${provider} 콜백 처리`, params);

  try {
    // SECURITY: The previous implementation also accepted access_token / refresh_token
    // directly from window.location.hash or window.location.search and called
    // `supabase.auth.setSession()` with them. That implicit-flow fallback is unsafe:
    //   - There is no `state` verification, so a CSRF/session-fixation attacker can
    //     inject their own tokens into a victim's browser.
    //   - It bypasses PKCE, which is the only flow Supabase recommends for browsers.
    // We now ONLY accept the PKCE `code` exchange path below.

    // OAuth Code Exchange (PKCE) — the only supported browser flow
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const code = params?.code || searchParams?.get('code');
    if (code) {
      helpers.log(`${provider} OAuth Code 발견, exchangeCodeForSession 시도`);

      try {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (!exchangeError && exchangeData?.session) {
          helpers.log(`${provider} Code Exchange 성공! 즉시 완료`);

          cleanCallbackUrl(["code", "state"]);
          await runProfileHandlers(supabase, provider, exchangeData.session.user, params, helpers);
          saveAuthState(provider);

          return createSuccessResult(
            exchangeData.session,
            exchangeData.session.user,
            provider,
            `${provider} 로그인 성공 (Code Exchange)`,
          );
        } else {
          helpers.log(`${provider} Code Exchange 실패:`, exchangeError?.message);
        }
      } catch (codeExchangeError) {
        helpers.log(`${provider} Code Exchange 오류:`, (codeExchangeError as Error)?.message);
      }
    }

    // 폴백: 기존 사용자 확인 (getUser()로 빠른 처리)
    helpers.log(`${provider} Code Exchange 실패/불가 - 기존 사용자 확인으로 폴백`);

    // 먼저 빠른 사용자 체크 (getUser()는 getSession()보다 빠름)
    let userData: { user: User | null } | null = null;
    let userError: unknown = null;

    try {
      const userPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getUser timeout')), 300)
      );

      const result = await Promise.race([
        userPromise,
        timeoutPromise
      ]);

      userData = result.data;
      userError = result.error;

      helpers.log(`${provider} 사용자 확인 결과`, {
        hasData: !!userData,
        hasUser: !!userData?.user,
        hasError: !!userError
      });

    } catch (timeoutError) {
      helpers.log(`${provider} getUser 타임아웃 (300ms) - Supabase 자동 처리로 전환`);
      userError = timeoutError;
    }

    if (userError || !userData?.user) {
      // Supabase의 자동 콜백 처리 시도 (더 짧은 대기)
      helpers.log(`${provider} Supabase 자동 콜백 처리 시도`);

      // 짧은 대기 후 다시 사용자 확인 (300ms로 단축)
      await new Promise(resolve => setTimeout(resolve, 300));

      // 빠른 재시도
      let retryData: { user: User | null } | null = null;
      let retryError: unknown = null;

      try {
        const retryPromise = supabase.auth.getUser();
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
        helpers.log(`${provider} 재시도 getUser도 타임아웃 - 페이지 새로고침 안내`);
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

      // 재시도로 사용자를 얻었다면 프로필 처리 진행 (세션은 쿠키에 저장되어 있음)
      if (retryData.user) {
        helpers.log(`${provider} 재시도로 사용자 확인 성공`);

        // SECURITY: We deliberately pass only `User` (no fabricated `Session`).
        // The previous code synthesized a session with `access_token: 'token-from-cookie'`
        // which is not a real token; treating it as one elsewhere would be a bug.
        // The actual session lives in the Supabase auth cookie set by the SDK.
        await runProfileHandlers(supabase, provider, retryData.user, params, helpers);
        saveAuthState(provider);

        return createSuccessResult(
          null,
          retryData.user,
          provider,
          `${provider} 로그인 성공`,
        );
      }
    }

    if (!userData?.user) {
      // 최후의 수단: 페이지 새로고침 후 사용자 확인 요청
      helpers.log(`${provider} 사용자가 없음 - 페이지 새로고침 필요`);

      throw new SocialAuthError(
        SocialAuthErrorCode.CALLBACK_FAILED,
        "사용자가 인증되지 않았습니다. 페이지를 새로고침하거나 다시 로그인해주세요.",
        provider,
      );
    }

    helpers.log(`${provider} 기존 사용자 확인 성공`);

    // SECURITY: Pass only `User` (no fabricated `Session`). See note above re: cookie path.
    await runProfileHandlers(supabase, provider, userData.user, params, helpers);
    saveAuthState(provider);

    return createSuccessResult(
      null,
      userData.user,
      provider,
      `${provider} 로그인 성공`,
    );
  } catch (error) {
    helpers.logError(`${provider} 콜백 처리 오류`, error);

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
