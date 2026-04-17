'use client';

/**
 * auth-store-profile.ts — 로그아웃 및 프로필 로드 로직
 *
 * signOut / loadUserProfile 구현을 AuthStore 본체에서 분리한 모듈입니다.
 * AuthStoreAccessor 를 통해 AuthStore 내부 상태에 접근합니다.
 */

import { UserProfiles } from '@/types/interfaces';
import { debugLog, type AuthStoreAccessor } from './auth-store-types';

// ─── signOut ────────────────────────────────────────────

export async function signOutImpl(store: AuthStoreAccessor): Promise<void> {
  const supabaseClient = store.getSupabaseClient();
  if (!supabaseClient) return;

  try {
    debugLog('🔄 [AuthStore] 로그아웃 시작');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store'
      });
    } catch (e) {
      console.warn('[AuthStore] 서버 로그아웃 API 실패(무시):', e);
    }

    const { error } = await supabaseClient.auth.signOut({ scope: 'global' });

    if (error) {
      console.error('❌ [AuthStore] 로그아웃 에러:', error);
    } else {
      debugLog('✅ [AuthStore] 로그아웃 완료, 클라이언트 상태 초기화');
      try {
        try {
          const before = { picnic_last_login: localStorage.getItem('picnic_last_login') };
          debugLog('🧪 [AuthStore.signOut] before LS cleanup snapshot:', before);
        } catch {}

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectId = supabaseUrl ? supabaseUrl.split('.')[0]?.split('://')[1] : '';
        const explicitKeys = [
          'auth_session_active','auth_provider','auth_timestamp','auth_success',
          'supabase.auth.token','supabase.auth.expires_at','supabase.auth.refresh_token',
          'sb-auth-token','loginRedirectUrl','redirectUrl','auth_return_url'
        ];
        explicitKeys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.includes('sb-') || key.includes('supabase') || key.includes('auth'))) {
            try { localStorage.removeItem(key); } catch {}
          }
        }
        try { sessionStorage.removeItem('redirectUrl'); } catch {}
        try { document.cookie = 'auth_return_url=; Max-Age=0; Path=/; SameSite=Lax'; } catch {}
        if (projectId) {
          const names = [
            `sb-${projectId}-auth-token`,'sb-auth-token','supabase-auth-token','sb-api-auth-token'
          ];
          names.forEach(n => {
            try {
              document.cookie = `${n}=; Max-Age=0; Path=/;`;
            } catch {}
          });
        }

        try {
          const after = { picnic_last_login: localStorage.getItem('picnic_last_login') };
          debugLog('🧪 [AuthStore.signOut] after LS cleanup snapshot:', after);
        } catch {}
      } catch {}
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
    }
  } catch (error) {
    console.error('❌ [AuthStore] 로그아웃 예외:', error);
  }
}

// ─── loadUserProfile ────────────────────────────────────

export async function loadUserProfileImpl(store: AuthStoreAccessor, userId: string): Promise<UserProfiles | null> {
  const currentState = store.getState();
  if (!currentState.isAuthenticated || !currentState.user || currentState.user.id !== userId) {
    if (process.env.NODE_ENV === 'development') {
      debugLog('⏭️  [AuthStore] loadUserProfile 건너뜀:', {
        isAuthenticated: currentState.isAuthenticated,
        hasUser: !!currentState.user,
        requestedUserId: userId?.substring(0, 8) + '...',
        currentUserId: currentState.user?.id?.substring(0, 8) + '...'
      });
    }
    return null;
  }

  const profileLoadPromises = store.getProfileLoadPromises();
  const cachedPromise = profileLoadPromises.get(userId);
  if (cachedPromise) {
    if (process.env.NODE_ENV === 'development') {
      debugLog('⏳ [AuthStore] 프로필 로딩 Promise 재사용:', {
        userId: userId.substring(0, 8) + '...',
      });
    }
    return cachedPromise;
  }

  const loadPromise = (async () => {
    try {
      debugLog('🔍 [AuthStore] API를 통한 프로필 조회 시작:', { userId: userId.substring(0, 8) + '...' });

      const response = await fetch('/api/user/profile', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.warn('⚠️ [AuthStore] API 프로필 조회 실패:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });

        if (response.status === 404 || response.status === 403) {
          return null;
        }

        throw new Error(`API 응답 실패: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.user) {
        console.warn('⚠️ [AuthStore] API 응답에서 사용자 정보 없음:', data);
        return null;
      }

      const userProfile: UserProfiles = {
        id: data.user.id,
        email: data.user.email,
        nickname: data.user.name,
        avatar_url: data.user.avatar_url,
        country_code: data.user.country_code ?? null,
        star_candy: data.user.star_candy || 0,
        star_candy_bonus: data.user.star_candy_bonus || 0,
        jma_candy: data.user.jma_candy ?? 0,
        is_admin: data.user.is_admin || false,
        is_super_admin: data.user.is_super_admin || false,
        created_at: data.user.created_at,
        updated_at: data.user.updated_at,
        last_ip: data.user.last_ip ?? null,
        language: data.user.language ?? null,
        birth_date: null,
        birth_time: null,
        deleted_at: data.user.deleted_at ?? null,
        gender: null,
        open_ages: false,
        open_gender: false
      };

      // 탈퇴(soft delete) 처리된 계정은 즉시 로그아웃 후 로그인 페이지로 이동
      if (userProfile.deleted_at) {
        console.warn('🗑️ [AuthStore] 탈퇴 계정 감지 - 강제 로그아웃 처리:', {
          userId: userProfile.id?.substring(0, 8) + '...',
          deleted_at: userProfile.deleted_at,
        });

        try {
          await store.getSignOutFn()();
        } catch (signOutError) {
          console.warn('⚠️ [AuthStore] 탈퇴 계정 강제 로그아웃 중 오류:', signOutError);
        }

        if (typeof window !== 'undefined') {
          // 현재 pathname 에서 lang prefix 추출 (없으면 'en' 기본값)
          const langMatch = window.location.pathname.match(
            /^\/([a-z]{2}(-[a-z]{2})?)(?=\/|$)/i,
          );
          const lang = langMatch ? langMatch[1].toLowerCase() : 'en';
          const targetPath = `/${lang}/login`;
          const alreadyOnLogin =
            window.location.pathname === targetPath ||
            window.location.pathname === '/login';
          if (!alreadyOnLogin) {
            window.location.replace(`${targetPath}?error=withdrawn`);
          }
        }

        return null;
      }

      debugLog('✅ [AuthStore] API를 통한 프로필 조회 성공:', {
        id: userProfile.id?.substring(0, 8) + '...',
        nickname: userProfile.nickname,
        email: userProfile.email,
        hasAvatar: !!userProfile.avatar_url,
        is_admin: userProfile.is_admin,
        is_super_admin: userProfile.is_super_admin,
        star_candy: userProfile.star_candy
      });

      store.updateState({
        ...store.getState(),
        userProfile,
      });

      return userProfile;
    } catch (error) {
      console.error('❌ [AuthStore] API 프로필 조회 예외:', error);

      if (process.env.NODE_ENV === 'development') {
        debugLog('🔧 [AuthStore] 개발환경 - 기본 프로필 fallback');

        const supabaseClient = store.getSupabaseClient();
        const { data: { user: currentUser } } = await supabaseClient?.auth.getUser() || { data: { user: null } };

        if (currentUser && currentUser.id === userId) {
          const fallbackProfile: UserProfiles = {
            id: userId,
            email: currentUser.email || null,
            nickname: currentUser.user_metadata?.name ||
                     currentUser.user_metadata?.full_name ||
                     currentUser.email?.split('@')[0] ||
                     'User',
            avatar_url: null,
            country_code: null,
            is_admin: true,
            is_super_admin: false,
            star_candy: 0,
            star_candy_bonus: 0,
            jma_candy: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_ip: null,
            language: null,
            birth_date: null,
            birth_time: null,
            deleted_at: null,
            gender: null,
            open_ages: false,
            open_gender: false
          };

          debugLog('🐛 [AuthStore] 개발환경 fallback 프로필 생성:', {
            nickname: fallbackProfile.nickname,
            is_admin: fallbackProfile.is_admin
          });

          store.updateState({
            ...store.getState(),
            userProfile: fallbackProfile,
          });

          return fallbackProfile;
        }
      }

      return null;
    }
  })()
    .finally(() => {
      profileLoadPromises.delete(userId);
    });

  profileLoadPromises.set(userId, loadPromise);
  return loadPromise;
}
