'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
  memo,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './client';
import { extractAvatarFromProvider } from '@/utils/image-utils';
import { UserProfiles } from '@/types/interfaces';
import { handleAuthError } from '@/utils/auth-error-handler';
import { Database } from '@/types/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfiles | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  signOut: () => Promise<void>;
  loadUserProfile: (userId: string) => Promise<UserProfiles | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// 전역 상태 관리를 위한 싱글톤 패턴
class AuthStore {
  private static instance: AuthStore | null = null;
  private supabaseClient: any = null;
  private listeners: Set<(state: AuthContextType) => void> = new Set();
  private state: AuthContextType = {
    session: null,
    user: null,
    userProfile: null as UserProfiles | null,
    isAuthenticated: false,
    isLoading: true,
    isInitialized: false,
    signOut: this.signOut.bind(this),
    loadUserProfile: this.loadUserProfile.bind(this),
  };
  private initPromise: Promise<void> | null = null;

  static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        // 환경 변수 확인 및 안전한 클라이언트 생성
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          console.error('❌ [AuthStore] Supabase 환경 변수가 설정되지 않았습니다.', {
            hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          });
          
          // 환경 변수가 없어도 기본 상태로 초기화
          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOut.bind(this),
            loadUserProfile: this.loadUserProfile.bind(this),
          });
          return;
        }

        // TODO: 향후 최적화 방안들
        // 1. Supabase 클라이언트 연결 최적화
        //    - persistSession: 'local' (기본값) vs 'memory'
        //    - autoRefreshToken: true (기본값) vs false
        // 2. 지역별 Supabase 엣지 위치 활용
        //    - 사용자 위치 기반 최적 엣지 선택
        // 3. 세션 캐시 전략
        //    - Service Worker를 통한 세션 캐싱
        //    - IndexedDB 활용한 오프라인 세션
        
        this.supabaseClient = createBrowserSupabaseClient();
        this.initPromise = this.initialize();
      } catch (error) {
        console.error('❌ [AuthStore] Supabase 클라이언트 생성 실패:', error);
        
        // 클라이언트 생성 실패 시에도 기본 상태로 초기화
        this.updateState({
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          signOut: this.signOut.bind(this),
          loadUserProfile: this.loadUserProfile.bind(this),
        });
      }
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

    try {
      console.log('🔄 [AuthStore] 전역 Auth 초기화 시작');
      
      // 🚀 빠른 토큰 사전 체크 (로그인 페이지 최적화)
      const hasStoredToken = this.hasValidStoredToken();
      const isLoginPage = typeof window !== 'undefined' && 
        (window.location.pathname.includes('/login') || window.location.pathname.includes('/auth'));
      
      console.log('🔍 [AuthStore] 초기화 컨텍스트:', {
        hasStoredToken,
        isLoginPage,
        pathname: typeof window !== 'undefined' ? window.location.pathname : 'server'
      });

      // 로그인 페이지이고 토큰이 없으면 즉시 로그아웃 상태로 처리
      if (isLoginPage && !hasStoredToken) {
        console.log('⚡ [AuthStore] 로그인 페이지 + 토큰 없음 → 즉시 로그아웃 상태로 처리');
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
        return;
      }
      
      // 토큰이 없으면 빠른 처리 (다른 페이지에서도)
      if (!hasStoredToken) {
        console.log('⚡ [AuthStore] 저장된 토큰 없음 → 빠른 로그아웃 상태 처리');
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
        return;
      }
      
      // 초기화 타임아웃 설정 (로그인 페이지는 더 짧게)
      const timeoutMs = isLoginPage ? 2000 : 7000;
      const sessionTimeoutMs = isLoginPage ? 1000 : 3000;
      
      console.log(`⏰ [AuthStore] 타임아웃 설정: 전체=${timeoutMs}ms, 세션=${sessionTimeoutMs}ms`);
      
      const initTimeout = setTimeout(() => {
        console.warn(`⏰ [AuthStore] 초기화 타임아웃 - 강제 완료 (${timeoutMs}ms)`);
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
      }, timeoutMs);

      try {
        // 초기 세션 조회 (로그인 페이지는 더 짧은 타임아웃)
        const sessionPromise = this.supabaseClient.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), sessionTimeoutMs)
        );

        console.log(`🔍 [AuthStore] 세션 조회 시작 (타임아웃: ${sessionTimeoutMs}ms)`);
        const sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
        
        clearTimeout(initTimeout);
        console.log('📱 [AuthStore] 초기 세션 조회 완료:', !!sessionResult.data.session);

        if (sessionResult.data.session) {
          await this.handleSuccessfulSession(sessionResult.data.session);
        } else {
          console.log('🔓 [AuthStore] 유효한 세션이 없음 - 로그아웃 상태로 설정');
          this.updateState({
            ...this.state,
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
          });
        }

        console.log('✅ [AuthStore] 전역 Auth 초기화 완료');
      } catch (sessionError) {
        clearTimeout(initTimeout);
        
        // 세션 조회 실패 처리
        const isTimeoutError = sessionError instanceof Error && sessionError.message === 'getSession timeout';
        
        if (isTimeoutError) {
          console.error('❌ [AuthStore] 세션 조회/처리 에러:', sessionError);
        } else {
          console.error('❌ [AuthStore] 예상치 못한 세션 오류:', sessionError);
        }

        // handleAuthError 호출하되, 결과와 관계없이 초기화 완료
        const shouldContinue = await handleAuthError(sessionError);
        
        console.log('🔧 [AuthStore] 세션 오류 발생 - 로그아웃 상태로 초기화 완료');
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('❌ [AuthStore] 초기화 중 예상치 못한 오류:', error);
      
      // 어떤 오류가 발생해도 기본 상태로 초기화 완료
      this.updateState({
        ...this.state,
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
    }
  }

  private async updateAuthState(session: Session | null, event: string) {
    try {
      let userProfile: UserProfiles | null = null;
      
      if (session?.user) {
        userProfile = await this.loadUserProfile(session.user.id);
      }

      this.updateState({
        session,
        user: session?.user || null,
        userProfile,
        isAuthenticated: !!session,
        isLoading: false,
        isInitialized: true,
        signOut: this.signOut.bind(this),
        loadUserProfile: this.loadUserProfile.bind(this),
      });
    } catch (error) {
      console.error('❌ [AuthStore] 상태 업데이트 에러:', error);
      this.updateState({
        ...this.state,
        isLoading: false,
        isInitialized: true,
      });
    }
  }

  private updateState(newState: AuthContextType) {
    this.state = newState;
    this.listeners.forEach(listener => listener(newState));
  }

  public subscribe(listener: (state: AuthContextType) => void): () => void {
    this.listeners.add(listener);
    // 구독 즉시 현재 상태 전달
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
      console.log('🔄 [AuthStore] 로그아웃 시작');
      const { error } = await this.supabaseClient.auth.signOut();
      
      if (error) {
        console.error('❌ [AuthStore] 로그아웃 에러:', error);
      } else {
        console.log('✅ [AuthStore] 로그아웃 완료');
      }
    } catch (error) {
      console.error('❌ [AuthStore] 로그아웃 예외:', error);
    }
  }

  private async loadUserProfile(userId: string): Promise<UserProfiles | null> {
    if (!this.supabaseClient) return null;

    try {
      const { data, error } = await this.supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('⚠️ [AuthStore] 프로필 로드 실패:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ [AuthStore] 프로필 로드 예외:', error);
      return null;
    }
  }

  /**
   * 저장된 토큰의 유효성을 빠르게 체크 (네트워크 요청 없이)
   */
  private hasValidStoredToken(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      
      // Supabase 토큰 키 확인 (실제 프로젝트 URL 기반)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) return false;
      
      // URL에서 프로젝트 ID 추출 (예: xtijtefcycoeqludlngc)
      const projectId = supabaseUrl.replace('https://', '').split('.')[0];
      const tokenKey = `sb-${projectId}-auth-token`;
      
      const storedToken = localStorage.getItem(tokenKey);
      if (!storedToken) {
        console.log('🔍 [AuthStore] localStorage에 토큰 없음:', tokenKey);
        return false;
      }
      
      // 기본적인 JSON 파싱 확인
      try {
        const parsed = JSON.parse(storedToken);
        const hasAccessToken = !!(parsed?.access_token);
        const hasRefreshToken = !!(parsed?.refresh_token);
        
        console.log('🔍 [AuthStore] 토큰 상태:', {
          hasAccessToken,
          hasRefreshToken,
          expiresAt: parsed?.expires_at
        });
        
        return hasAccessToken || hasRefreshToken;
      } catch (parseError) {
        console.warn('⚠️ [AuthStore] 토큰 파싱 실패:', parseError);
        return false;
      }
    } catch (error) {
      console.warn('⚠️ [AuthStore] 토큰 체크 중 오류:', error);
      return false;
    }
  }

  /**
   * 성공적인 세션 처리
   */
  private async handleSuccessfulSession(session: Session) {
    try {
      console.log('✅ [AuthStore] 유효한 세션 발견 - 인증 상태 업데이트');
      await this.updateAuthState(session, 'INITIAL_SESSION');
      
      // 인증 상태 변경 리스너 등록 (아직 등록되지 않은 경우에만)
      if (!this.authStateListenerRegistered) {
        this.registerAuthStateListener();
        this.authStateListenerRegistered = true;
      }
    } catch (error) {
      console.error('❌ [AuthStore] 세션 처리 중 오류:', error);
      throw error;
    }
  }

  /**
   * 인증 상태 변경 리스너 등록
   */
  private registerAuthStateListener() {
    if (!this.supabaseClient) return;
    
    this.supabaseClient.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      console.log('🔄 [AuthStore] 인증 상태 변경:', event);

      try {
        await this.updateAuthState(session, event);
      } catch (error) {
        console.error('❌ [AuthStore] 인증 상태 변경 중 오류:', error);
        
        // 리프레시 토큰 오류 처리
        const handled = await handleAuthError(error);
        if (!handled) {
          // 처리되지 않은 오류의 경우 기본 상태로 설정
          this.updateState({
            ...this.state,
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
          });
        }
      }
    });
  }

  // 인증 상태 리스너 등록 여부 추적
  private authStateListenerRegistered = false;
}

// AuthProvider 컴포넌트를 memo로 감싸서 완전히 안정화
const AuthProviderComponent = memo(function AuthProviderInternal({ children }: AuthProviderProps) {
  console.log('🏗️ [AuthProvider] 컴포넌트 생성/재렌더링');
  
  const [contextValue, setContextValue] = useState<AuthContextType>(() => {
    return AuthStore.getInstance().getState();
  });

  useEffect(() => {
    const authStore = AuthStore.getInstance();
    
    // 초기화 대기
    authStore.waitForInitialization();
    
    // 상태 변경 구독
    const unsubscribe = authStore.subscribe((newState) => {
      console.log('🔄 [AuthProvider] Context 값 변경:', {
        isLoading: newState.isLoading,
        isInitialized: newState.isInitialized,
        isAuthenticated: newState.isAuthenticated,
        hasSession: !!newState.session,
        hasUser: !!newState.user,
        hasUserProfile: !!newState.userProfile,
      });
      setContextValue(newState);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
});

// AuthProvider를 완전히 안정화된 컴포넌트로 export
export const AuthProvider = AuthProviderComponent;

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 