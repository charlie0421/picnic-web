'use client';

/**
 * AuthStore — 전역 인증 상태 관리 싱글톤
 *
 * Supabase 인증 상태를 관리하는 싱글톤 클래스입니다.
 * AuthProvider 컴포넌트에서 사용됩니다.
 *
 * 인증 평가 로직은 auth-store-auth.ts,
 * 프로필/로그아웃 로직은 auth-store-profile.ts 에 위임합니다.
 */

import { createBrowserSupabaseClient } from './client';
import { UserProfiles } from '@/types/interfaces';
import { setLastLoginInfo, getProviderDisplayName } from '@/utils/storage';
import { detectStoredAuthToken } from './auth-token-utils';

import {
  debugLog,
  type AuthContextType,
  type AuthStoreAccessor,
} from './auth-store-types';

import { performInstantUserAuthImpl, checkTokenStatusFromCookiesImpl } from './auth-store-auth';
import { signOutImpl, loadUserProfileImpl } from './auth-store-profile';

// Re-export AuthContextType so that consumers can keep importing from './auth-store'
export type { AuthContextType } from './auth-store-types';

// 전역 상태 관리를 위한 싱글톤 패턴
export class AuthStore implements AuthStoreAccessor {
  private static instance: AuthStore | null = null;
  private supabaseClient: any = null;
  private listeners: Set<(state: AuthContextType) => void> = new Set();
  private state: AuthContextType;
  private initPromise: Promise<void> | null = null;
  private lastExpiryWarningKey: string | null = null;
  private isAuthEvaluatingFlag: boolean = false;
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

  // ─── AuthStoreAccessor 구현 ───────────────────────────

  getSupabaseClient(): any {
    return this.supabaseClient;
  }

  getState(): AuthContextType {
    return this.state;
  }

  updateState(newState: AuthContextType) {
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

  getSignOutFn(): AuthContextType['signOut'] {
    return this.signOutFn;
  }

  getLoadUserProfileFn(): AuthContextType['loadUserProfile'] {
    return this.loadUserProfileFn;
  }

  getIsAuthEvaluating(): boolean {
    return this.isAuthEvaluatingFlag;
  }

  setIsAuthEvaluating(v: boolean): void {
    this.isAuthEvaluatingFlag = v;
  }

  getLastExpiryWarningKey(): string | null {
    return this.lastExpiryWarningKey;
  }

  setLastExpiryWarningKey(v: string | null): void {
    this.lastExpiryWarningKey = v;
  }

  getProfileLoadPromises(): Map<string, Promise<UserProfiles | null>> {
    return this.profileLoadPromises;
  }

  // ─── 공개 API ─────────────────────────────────────────

  public subscribe(listener: (state: AuthContextType) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async waitForInitialization(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  // ─── 위임 메서드 ─────────────────────────────────────

  private async performInstantUserAuth(): Promise<void> {
    return performInstantUserAuthImpl(this);
  }

  private async checkTokenStatusFromCookies(): Promise<void> {
    return checkTokenStatusFromCookiesImpl(this);
  }

  private async signOut(): Promise<void> {
    return signOutImpl(this);
  }

  async loadUserProfile(userId: string): Promise<UserProfiles | null> {
    return loadUserProfileImpl(this, userId);
  }
}
