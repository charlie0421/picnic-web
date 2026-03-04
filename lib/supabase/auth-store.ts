'use client';

/**
 * AuthStore — 전역 인증 상태 관리 싱글톤
 *
 * Supabase 인증 상태를 관리하는 싱글톤 클래스입니다.
 * AuthProvider 컴포넌트에서 사용됩니다.
 */

import { Session, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './client';
import { UserProfiles } from '@/types/interfaces';
import { setLastLoginInfo, getProviderDisplayName } from '@/utils/storage';
import { extractAvatarFromProvider } from '@/utils/image-utils';
import { detectStoredAuthToken } from './auth-token-utils';

const authDebug =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

const debugLog = (...args: unknown[]) => {
  if (authDebug) {
    console.log(...args);
  }
};

const debugWarn = (...args: unknown[]) => {
  if (authDebug) {
    console.warn(...args);
  }
};

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfiles | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  signOut: () => Promise<void>;
  loadUserProfile: (userId: string) => Promise<UserProfiles | null>;
}

// 전역 상태 관리를 위한 싱글톤 패턴
export class AuthStore {
  private static instance: AuthStore | null = null;
  private supabaseClient: any = null;
  private listeners: Set<(state: AuthContextType) => void> = new Set();
  private state: AuthContextType;
  private initPromise: Promise<void> | null = null;
  private lastExpiryWarningKey: string | null = null;
  private isAuthEvaluating: boolean = false;
  private profileLoadPromises: Map<string, Promise<UserProfiles | null>> = new Map();
  private readonly signOutFn: AuthContextType['signOut'];
  private readonly loadUserProfileFn: AuthContextType['loadUserProfile'];

  static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  private constructor() {
    this.signOutFn = this.signOut.bind(this);
    this.loadUserProfileFn = this.loadUserProfile.bind(this);
    this.state = {
      session: null,
      user: null,
      userProfile: null,
      isAuthenticated: false,
      isLoading: true,
      isInitialized: false,
      signOut: this.signOutFn,
      loadUserProfile: this.loadUserProfileFn,
    };

    if (typeof window !== 'undefined') {
      try {
        debugLog('🔄 [AuthStore] 초기화 시작');

        const hasStoredToken = detectStoredAuthToken();
        const isLoginPage = window.location.pathname.includes('/login');
        const isCallbackPage = window.location.pathname.includes('/callback');

        debugLog('🔍 [AuthStore] 초기화 컨텍스트:', {
          hasStoredToken,
          isLoginPage,
          isCallbackPage,
          pathname: window.location.pathname
        });

        // 환경 변수 확인 및 안전한 클라이언트 생성
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          console.error('❌ [AuthStore] Supabase 환경 변수가 설정되지 않았습니다.', {
            hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          });

          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOutFn,
            loadUserProfile: this.loadUserProfileFn,
          });
          return;
        }

        // 순수 getUser() 기반 빠른 인증: getSession 완전히 우회
        if (hasStoredToken) {
          debugLog('🚀 [AuthStore] 쿠키 토큰 존재 → 순수 getUser() 기반 빠른 인증 처리');
          this.supabaseClient = createBrowserSupabaseClient();

          this.performInstantUserAuth();
          return;
        }

        // 로그인 페이지 성능 최적화
        if (!hasStoredToken && isLoginPage) {
          debugLog('⚡ [AuthStore] 로그인 페이지에서 토큰 없음 → 즉시 로그아웃 상태 처리');
          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOutFn,
            loadUserProfile: this.loadUserProfileFn,
          });
          return;
        }

        if (!hasStoredToken && !isCallbackPage) {
          debugLog('⚠️ [AuthStore] 저장된 토큰 없음 → 구독 유지, 초기화 진행');
        }

        this.supabaseClient = createBrowserSupabaseClient();

        // 인증 상태 변경 리스너
        this.supabaseClient.auth.onAuthStateChange(async (event: string, session: any) => {
          debugLog(`[AuthStore] onAuthStateChange 이벤트 발생: ${event}`, { session });

          if (event === 'SIGNED_IN' && session?.user) {
            this.lastExpiryWarningKey = null;
            const provider = session.user.app_metadata?.provider;
            debugLog(`[AuthStore] SIGNED_IN 이벤트 내부, provider: ${provider}`);
            if (provider && ['google', 'apple', 'kakao'].includes(provider)) {
              setLastLoginInfo({
                provider: provider,
                providerDisplay: getProviderDisplayName(provider),
                timestamp: new Date().toISOString(),
                userId: session.user.id,
              });
            } else {
               console.warn('[AuthStore] provider 정보가 없어 최근 로그인 정보를 저장하지 않습니다.', { provider });
            }

            try { await this.performInstantUserAuth(); } catch {}
          }

          if (event === 'TOKEN_REFRESHED') {
            this.lastExpiryWarningKey = null;
            try { await this.performInstantUserAuth(); } catch {}
          }

          if (event === 'SIGNED_OUT' || !session) {
            debugLog('🚪 [AuthStore] 로그아웃 이벤트 - 상태 정리');
            this.lastExpiryWarningKey = null;
          }
        });

        this.initPromise = this.initialize();
      } catch (error) {
        console.error('❌ [AuthStore] Supabase 클라이언트 생성 실패:', error);

        this.updateState({
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          signOut: this.signOutFn,
          loadUserProfile: this.loadUserProfileFn,
        });
      }
    } else {
      debugLog('🌐 [AuthStore] SSR 환경에서 기본 초기화');
      this.updateState({
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        signOut: this.signOutFn,
        loadUserProfile: this.loadUserProfileFn,
      });
    }
  }

  private async initialize() {
    if (!this.supabaseClient) {
      console.warn('⚠️ [AuthStore] Supabase 클라이언트가 없어 초기화를 건너뜁니다.');
      this.updateState({
        ...this.state,
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    if (this.state.isInitialized) {
      debugLog('✅ [AuthStore] 이미 초기화됨 - 재초기화 건너뜀');
      return;
    }

    try {
      debugLog('🚀 [AuthStore] 완전 쿠키 기반 초기화 시작 (네트워크 요청 0개)');
      await this.performInstantUserAuth();
      debugLog('✅ [AuthStore] 쿠키 기반 초기화 완료 (네트워크 요청 없음)');
    } catch (error) {
      console.error('❌ [AuthStore] 초기화 에러:', error);
      this.updateState({
        ...this.state,
        isLoading: false,
        isInitialized: true,
      });
    }
  }

  private updateState(newState: AuthContextType) {
    const prevState = this.state;
    this.state = newState;

    if (process.env.NODE_ENV === 'development') {
      debugLog('🔄 [AuthStore] 상태 변경:', {
        변경전: {
          isAuthenticated: prevState.isAuthenticated,
          isLoading: prevState.isLoading,
          isInitialized: prevState.isInitialized,
          hasUser: !!prevState.user,
          hasSession: !!prevState.session
        },
        변경후: {
          isAuthenticated: newState.isAuthenticated,
          isLoading: newState.isLoading,
          isInitialized: newState.isInitialized,
          hasUser: !!newState.user,
          hasSession: !!newState.session
        },
        listeners개수: this.listeners.size
      });
    }

    this.listeners.forEach(listener => listener(newState));
  }

  public subscribe(listener: (state: AuthContextType) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AuthContextType {
    return this.state;
  }

  public async waitForInitialization(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async signOut(): Promise<void> {
    if (!this.supabaseClient) return;

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

      const { error } = await this.supabaseClient.auth.signOut({ scope: 'global' });

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
        this.updateState({
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          signOut: this.signOutFn,
          loadUserProfile: this.loadUserProfileFn,
        });
      }
    } catch (error) {
      console.error('❌ [AuthStore] 로그아웃 예외:', error);
    }
  }

  private async performInstantUserAuth(): Promise<void> {
    if (this.isAuthEvaluating) {
      debugLog('⏭️  [AuthStore] performInstantUserAuth 중복 호출 건너뜀');
      return;
    }
    this.isAuthEvaluating = true;
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
          const supabase = this.supabaseClient || createBrowserSupabaseClient();
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

            const previousUserId = this.state.user?.id;
            const previousUserProfile = this.state.userProfile;
            const isSameUser = previousUserId === fetchedUser.id && !!previousUserId;
            const nextUserProfile = isSameUser ? previousUserProfile : null;
            const shouldLoadProfile = !nextUserProfile;

            this.updateState({
              user: fetchedUser,
              session: instantSession as any,
              userProfile: nextUserProfile,
              isLoading: false,
              isInitialized: true,
              isAuthenticated: true,
              signOut: this.signOutFn,
              loadUserProfile: this.loadUserProfileFn,
            });

            if (shouldLoadProfile) {
              this.loadUserProfile(fetchedUser.id).catch(() => {});
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
        this.updateState({
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          signOut: this.signOutFn,
          loadUserProfile: this.loadUserProfileFn,
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

      const previousUserId = this.state.user?.id;
      const previousUserProfile = this.state.userProfile;
      const isSameUser = previousUserId === user.id && !!previousUserId;
      const nextUserProfile = isSameUser ? previousUserProfile : null;
      const shouldLoadProfile = !nextUserProfile;

      debugLog('🔄 [AuthStore] 인증 상태 업데이트 중...');
      this.updateState({
        user: user,
        session: instantSession as any,
        userProfile: nextUserProfile,
        isLoading: false,
        isInitialized: true,
        isAuthenticated: true,
        signOut: this.signOutFn,
        loadUserProfile: this.loadUserProfileFn,
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
          this.loadUserProfile(user.id)
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
        if (this.lastExpiryWarningKey !== expiryKey) {
          const remainingMs = tokenExpiry ? Math.max(0, tokenExpiry.getTime() - Date.now()) : null;
          const remainingSec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;
          const remainingMsg = remainingSec != null
            ? (remainingSec >= 60 ? `${Math.ceil(remainingSec / 60)}분 이내` : `${remainingSec}초 이내`)
            : '곧';
          console.warn(`⚠️ [AuthStore] 토큰이 곧 만료됨 (${remainingMsg}) - 재로그인 필요할 수 있음`);
          this.lastExpiryWarningKey = expiryKey;
        }
      }

    } catch (error) {
      console.error('❌ [AuthStore] performInstantUserAuth 예외:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined
      });

      this.updateState({
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        signOut: this.signOutFn,
        loadUserProfile: this.loadUserProfileFn,
      });

      debugLog('🔄 [AuthStore] 오류로 인한 비인증 상태 설정 완료');
    } finally {
      this.isAuthEvaluating = false;
    }
  }

  private async checkTokenStatusFromCookies(): Promise<void> {
    try {
      debugLog('🔄 [AuthStore] 쿠키 기반 토큰 상태 체크');

      const { getInstantUserFromCookies, getTokenExpiry } = await import('@/utils/jwt-parser');

      const user = getInstantUserFromCookies();
      const tokenExpiry = getTokenExpiry();

      if (!user) {
        console.warn('⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음 - 로그아웃 처리');
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
        });
        return;
      }

      if (tokenExpiry && tokenExpiry <= new Date()) {
        console.warn('⚠️ [AuthStore] JWT 토큰이 만료됨 - 로그아웃 처리');
        this.updateState({
          ...this.state,
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

  private async loadUserProfile(userId: string): Promise<UserProfiles | null> {
    if (!this.state.isAuthenticated || !this.state.user || this.state.user.id !== userId) {
      if (process.env.NODE_ENV === 'development') {
        debugLog('⏭️  [AuthStore] loadUserProfile 건너뜀:', {
          isAuthenticated: this.state.isAuthenticated,
          hasUser: !!this.state.user,
          requestedUserId: userId?.substring(0, 8) + '...',
          currentUserId: this.state.user?.id?.substring(0, 8) + '...'
        });
      }
      return null;
    }

    const cachedPromise = this.profileLoadPromises.get(userId);
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
          deleted_at: null,
          gender: null,
          open_ages: false,
          open_gender: false
        };

        debugLog('✅ [AuthStore] API를 통한 프로필 조회 성공:', {
          id: userProfile.id?.substring(0, 8) + '...',
          nickname: userProfile.nickname,
          email: userProfile.email,
          hasAvatar: !!userProfile.avatar_url,
          is_admin: userProfile.is_admin,
          is_super_admin: userProfile.is_super_admin,
          star_candy: userProfile.star_candy
        });

        this.updateState({
          ...this.state,
          userProfile,
        });

        return userProfile;
      } catch (error) {
        console.error('❌ [AuthStore] API 프로필 조회 예외:', error);

        if (process.env.NODE_ENV === 'development') {
          debugLog('🔧 [AuthStore] 개발환경 - 기본 프로필 fallback');

          const { data: { user: currentUser } } = await this.supabaseClient?.auth.getUser() || { data: { user: null } };

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

            this.updateState({
              ...this.state,
              userProfile: fallbackProfile,
            });

            return fallbackProfile;
          }
        }

        return null;
      }
    })()
      .finally(() => {
        this.profileLoadPromises.delete(userId);
      });

    this.profileLoadPromises.set(userId, loadPromise);
    return loadPromise;
  }
}
