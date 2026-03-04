'use client';

/**
 * auth-store-auth.ts — 인증 평가 로직
 *
 * performInstantUserAuth / checkTokenStatusFromCookies 구현을
 * AuthStore 본체에서 분리한 모듈입니다.
 * AuthStoreAccessor 를 통해 AuthStore 내부 상태에 접근합니다.
 */

import { createBrowserSupabaseClient } from './client';
import { setLastLoginInfo, getProviderDisplayName } from '@/utils/storage';
import { debugLog, type AuthStoreAccessor } from './auth-store-types';

// ─── performInstantUserAuth ─────────────────────────────

export async function performInstantUserAuthImpl(store: AuthStoreAccessor): Promise<void> {
  if (store.getIsAuthEvaluating()) {
    debugLog('⏭️  [AuthStore] performInstantUserAuth 중복 호출 건너뜀');
    return;
  }
  store.setIsAuthEvaluating(true);
  try {
    debugLog('🚀 [AuthStore] performInstantUserAuth 시작 (네트워크 요청 없음)');
    const startTime = performance.now();

    const { getInstantUserFromCookies, getTokenExpiry, isTokenExpiringSoon } = await import('@/utils/jwt-parser');

    const user = getInstantUserFromCookies();
    const tokenExpiry = getTokenExpiry();
    const expiringSoon = isTokenExpiringSoon();

    const endTime = performance.now();

    debugLog('✅ [AuthStore] JWT 파싱 완료:', {
      duration: `${(endTime - startTime).toFixed(2)}ms`,
      hasUser: !!user,
      userEmail: user?.email,
      userId: user?.id?.substring(0, 8) + '...',
      tokenExpiry: tokenExpiry?.toISOString(),
      expiringSoon
    });

    if (!user) {
      console.warn('⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음');

      // 폴백: httpOnly 쿠키 기반 세션을 네트워크로 확인
      try {
        const supabase = store.getSupabaseClient() || createBrowserSupabaseClient();
        const timeoutMs = 1000;
        const getUserPromise = supabase.auth.getUser();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('getUser timeout')), timeoutMs));
        const result: any = await Promise.race([getUserPromise, timeoutPromise]);

        const fetchedUser = result?.data?.user;
        if (fetchedUser) {
          debugLog('✅ [AuthStore] 네트워크 폴백으로 사용자 확인 성공 (httpOnly 쿠키)', {
            userId: fetchedUser.id?.substring(0, 8) + '...',
            email: fetchedUser.email,
            provider: fetchedUser.app_metadata?.provider,
          });

          const provider = fetchedUser.app_metadata?.provider;
          if (provider && ['google', 'apple', 'kakao'].includes(provider)) {
            setLastLoginInfo({
              provider: provider,
              providerDisplay: getProviderDisplayName(provider),
              timestamp: new Date().toISOString(),
              userId: fetchedUser.id,
            });
          }

          const instantSession = {
            user: fetchedUser,
            access_token: 'token-from-cookie',
            refresh_token: null,
            expires_at: null,
            token_type: 'bearer' as const,
          };

          const currentState = store.getState();
          const previousUserId = currentState.user?.id;
          const previousUserProfile = currentState.userProfile;
          const isSameUser = previousUserId === fetchedUser.id && !!previousUserId;
          const nextUserProfile = isSameUser ? previousUserProfile : null;
          const shouldLoadProfile = !nextUserProfile;

          store.updateState({
            user: fetchedUser,
            session: instantSession as any,
            userProfile: nextUserProfile,
            isLoading: false,
            isInitialized: true,
            isAuthenticated: true,
            signOut: store.getSignOutFn(),
            loadUserProfile: store.getLoadUserProfileFn(),
          });

          if (shouldLoadProfile) {
            store.loadUserProfile(fetchedUser.id).catch(() => {});
          } else if (process.env.NODE_ENV === 'development') {
            debugLog('✅ [AuthStore] 동일 사용자 프로필이 이미 캐시됨 - 폴백 경로 재로딩 건너뜀:', {
              userId: fetchedUser.id?.substring(0, 8) + '...',
            });
          }
          return;
        }
      } catch (e) {
        console.warn('⚠️ [AuthStore] 네트워크 폴백 사용자 확인 실패:', (e as Error)?.message);
      }

      // 최종 실패: 비인증 처리
      store.updateState({
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        signOut: store.getSignOutFn(),
        loadUserProfile: store.getLoadUserProfileFn(),
      });
      return;
    }

    // 사용자가 있으면 즉시 인증된 상태로 설정
    debugLog('✅ [AuthStore] JWT에서 사용자 확인 성공:', {
      userId: user.id?.substring(0, 8) + '...',
      email: user.email,
      provider: user.app_metadata?.provider,
      createdAt: user.created_at
    });

    const provider = user.app_metadata?.provider;
    if (provider && ['google', 'apple', 'kakao'].includes(provider)) {
      setLastLoginInfo({
        provider: provider,
        providerDisplay: getProviderDisplayName(provider),
        timestamp: new Date().toISOString(),
        userId: user.id,
      });
      debugLog(`✅ [AuthStore] 최근 로그인 정보 저장 (from performInstantUserAuth): ${provider}`);
    }

    const instantSession = {
      user: user,
      access_token: 'token-from-jwt',
      refresh_token: null,
      expires_at: tokenExpiry ? Math.floor(tokenExpiry.getTime() / 1000) : null,
      token_type: 'bearer'
    };

    const currentState = store.getState();
    const previousUserId = currentState.user?.id;
    const previousUserProfile = currentState.userProfile;
    const isSameUser = previousUserId === user.id && !!previousUserId;
    const nextUserProfile = isSameUser ? previousUserProfile : null;
    const shouldLoadProfile = !nextUserProfile;

    debugLog('🔄 [AuthStore] 인증 상태 업데이트 중...');
    store.updateState({
      user: user,
      session: instantSession as any,
      userProfile: nextUserProfile,
      isLoading: false,
      isInitialized: true,
      isAuthenticated: true,
      signOut: store.getSignOutFn(),
      loadUserProfile: store.getLoadUserProfileFn(),
    });

    debugLog('🎉 [AuthStore] 인증 상태 업데이트 완료 - 로딩 해제됨 (JWT 방식)');

    if (process.env.NODE_ENV === 'development') {
      (window as any).authStartTime = Date.now();
    }

    if (shouldLoadProfile) {
      debugLog('🔄 [AuthStore] 사용자 프로필 로드 시작:', {
        userId: user.id?.substring(0, 8) + '...',
        hasUserId: !!user.id,
        userEmail: user.email,
        reason: nextUserProfile ? 'explicit_refresh' : 'profile_not_cached',
        previousUserId: previousUserProfile?.id?.substring(0, 8) + '...' || 'none'
      });

      const loadProfileWithRetry = (attempt: number) => {
        store.loadUserProfile(user.id)
          .then(profile => {
            if (profile) {
              debugLog(`✅ [AuthStore] 사용자 프로필 로드 성공${attempt > 0 ? '(재시도)' : ''}:`, {
                is_admin: profile.is_admin,
                is_super_admin: profile.is_super_admin
              });
              return;
            }

            if (attempt === 0) {
              setTimeout(() => loadProfileWithRetry(attempt + 1), 400);
            } else {
              console.warn('⚠️ [AuthStore] 사용자 프로필 로드 결과가 null임 (재시도 후)');
            }
          })
          .catch(error => {
            if (attempt === 0) {
              console.warn('⚠️ [AuthStore] 사용자 프로필 로드 실패, 재시도 시도 예정:', error);
              setTimeout(() => loadProfileWithRetry(attempt + 1), 400);
            } else {
              console.warn('⚠️ [AuthStore] 사용자 프로필 로드 실패(재시도):', error);
            }
          });
      };

      loadProfileWithRetry(0);
    } else {
        debugLog('✅ [AuthStore] 동일 사용자 프로필이 이미 캐시됨 - 재로딩 건너뜀:', {
          userId: user.id?.substring(0, 8) + '...',
          cachedProfile: {
            nickname: nextUserProfile?.nickname,
            is_admin: nextUserProfile?.is_admin
          }
        });
      }

    // 토큰 만료 경고
    if (expiringSoon) {
      const expiryKey = tokenExpiry ? tokenExpiry.toISOString() : 'unknown-expiry';
      if (store.getLastExpiryWarningKey() !== expiryKey) {
        const remainingMs = tokenExpiry ? Math.max(0, tokenExpiry.getTime() - Date.now()) : null;
        const remainingSec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;
        const remainingMsg = remainingSec != null
          ? (remainingSec >= 60 ? `${Math.ceil(remainingSec / 60)}분 이내` : `${remainingSec}초 이내`)
          : '곧';
        console.warn(`⚠️ [AuthStore] 토큰이 곧 만료됨 (${remainingMsg}) - 재로그인 필요할 수 있음`);
        store.setLastExpiryWarningKey(expiryKey);
      }
    }

  } catch (error) {
    console.error('❌ [AuthStore] performInstantUserAuth 예외:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined
    });

    store.updateState({
      session: null,
      user: null,
      userProfile: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
      signOut: store.getSignOutFn(),
      loadUserProfile: store.getLoadUserProfileFn(),
    });

    debugLog('🔄 [AuthStore] 오류로 인한 비인증 상태 설정 완료');
  } finally {
    store.setIsAuthEvaluating(false);
  }
}

// ─── checkTokenStatusFromCookies ────────────────────────

export async function checkTokenStatusFromCookiesImpl(store: AuthStoreAccessor): Promise<void> {
  try {
    debugLog('🔄 [AuthStore] 쿠키 기반 토큰 상태 체크');

    const { getInstantUserFromCookies, getTokenExpiry } = await import('@/utils/jwt-parser');

    const user = getInstantUserFromCookies();
    const tokenExpiry = getTokenExpiry();

    if (!user) {
      console.warn('⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음 - 로그아웃 처리');
      store.updateState({
        ...store.getState(),
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
      });
      return;
    }

    if (tokenExpiry && tokenExpiry <= new Date()) {
      console.warn('⚠️ [AuthStore] JWT 토큰이 만료됨 - 로그아웃 처리');
      store.updateState({
        ...store.getState(),
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
      });
      return;
    }

    debugLog('✅ [AuthStore] 쿠키 기반 토큰 상태 체크 완료 - 유효함');
  } catch (error) {
    console.warn('⚠️ [AuthStore] 쿠키 기반 토큰 체크 중 오류:', error);
  }
}
