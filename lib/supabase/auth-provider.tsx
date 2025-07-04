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
        console.log('🔄 [AuthStore] 초기화 시작');
        
        // localStorage 체크 (SSR 안전성)  
        console.log('🔍 [AuthStore] localStorage에 토큰:', localStorage.getItem('sb-xtijtefcycoeqludlngc-auth-token') ? '있음' : '없음');
        const hasStoredToken = typeof localStorage !== 'undefined' && localStorage.getItem('sb-xtijtefcycoeqludlngc-auth-token');
        const isLoginPage = window.location.pathname.includes('/login');
        const isCallbackPage = window.location.pathname.includes('/callback');
        
        console.log('🔍 [AuthStore] 초기화 컨텍스트:', {
          hasStoredToken: !!hasStoredToken,
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

        // 저장된 토큰이 없고 로그인/콜백 페이지가 아니면 빠른 초기화
        if (!hasStoredToken && !isLoginPage && !isCallbackPage) {
          console.log('⚡ [AuthStore] 저장된 토큰 없음 → 빠른 로그아웃 상태 처리');
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
    } else {
      // SSR 환경에서는 기본 상태로 초기화
      console.log('🌐 [AuthStore] SSR 환경에서 기본 초기화');
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
      
      // 브라우저 환경 진단
      console.log('🔍 [AuthStore] 브라우저 환경 진단:', {
        userAgent: navigator.userAgent,
        cookieEnabled: navigator.cookieEnabled,
        localStorage: typeof localStorage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined',
        isLocalhost: window.location.hostname === 'localhost',
        protocol: window.location.protocol,
        origin: window.location.origin
      });
      
      // localStorage 접근 테스트
      try {
        const testKey = 'test_storage_access';
        localStorage.setItem(testKey, 'test');
        const testValue = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);
        console.log('✅ [AuthStore] localStorage 접근 테스트 성공:', testValue === 'test');
      } catch (storageError) {
        console.error('❌ [AuthStore] localStorage 접근 실패:', storageError);
      }
      
      // 초기 세션 조회 (타임아웃 추가)
      console.log('🔍 [AuthStore] getSession() 호출 시작...');
      
      let session: any = null;
      let error: any = null;
      let progressInterval: NodeJS.Timeout | null = null;
      let startTime = 0;
      
      try {
        // 단계별 진행 상황 모니터링
        console.log('🔍 [AuthStore] Supabase 클라이언트 상태:', {
          clientExists: !!this.supabaseClient,
          authExists: !!this.supabaseClient?.auth,
          getSessionExists: !!this.supabaseClient?.auth?.getSession
        });
        
        // getSession 호출 전 준비
        startTime = Date.now();
        console.log('🚀 [AuthStore] getSession() 호출 시작 - 시간:', new Date().toISOString());
        
        const sessionPromise = this.supabaseClient.auth.getSession();
        
        // Promise 상태 체크
        console.log('🔍 [AuthStore] sessionPromise 생성됨:', !!sessionPromise);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            console.log('⏰ [AuthStore] 3초 타임아웃 도달');
            reject(new Error('getSession timeout after 3 seconds'));
          }, 3000)
        );
        
        // 1초마다 진행 상황 로그
        progressInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ [AuthStore] getSession 진행 중... ${elapsed}ms 경과`);
        }, 1000);
        
        const result = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (progressInterval) clearInterval(progressInterval);
        const elapsed = Date.now() - startTime;
        console.log(`✅ [AuthStore] getSession 완료 - 소요시간: ${elapsed}ms`);
        
        session = (result as any)?.data?.session;
        error = (result as any)?.error;
        
        console.log('🔍 [AuthStore] getSession() 결과:', { 
          hasSession: !!session,
          hasError: !!error,
          errorMessage: error?.message 
        });
      } catch (timeoutError) {
        if (progressInterval) clearInterval(progressInterval);
        const elapsed = Date.now() - startTime;
        console.warn(`⚠️ [AuthStore] getSession() 타임아웃 - 소요시간: ${elapsed}ms:`, (timeoutError as Error).message);
        error = timeoutError;
      }
      
      console.log('📱 [AuthStore] 초기 세션 조회 완료:', !!session);

      if (error) {
        console.error('❌ [AuthStore] 세션 조회 에러:', error);
        
        // 리프레시 토큰 오류 처리
        const handled = await handleAuthError(error);
        if (handled) {
          console.log('🔄 [AuthStore] 리프레시 토큰 오류 처리 완료');
          
          // 에러 처리 후에도 초기화 완료 표시
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
          return; // 처리되었으면 더 이상 진행하지 않음
        }
      }

      await this.updateAuthState(session, 'INITIAL_SESSION');

      // 인증 상태 변경 리스너 등록
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

      console.log('✅ [AuthStore] 전역 Auth 초기화 완료');
    } catch (error) {
      console.error('❌ [AuthStore] 초기화 에러:', error);
      this.updateState({
        ...this.state,
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
}

// AuthProvider 컴포넌트를 memo로 감싸서 완전히 안정화
const AuthProviderComponent = memo(function AuthProviderInternal({ children }: AuthProviderProps) {
  console.log('🏗️ [AuthProvider] 컴포넌트 생성/재렌더링');
  
  const [contextValue, setContextValue] = useState<AuthContextType>(() => {
    return AuthStore.getInstance().getState();
  });

  useEffect(() => {
    const authStore = AuthStore.getInstance();
    
    // 초기화 대기 (await 추가)
    const initializeAndSubscribe = async () => {
      try {
        await authStore.waitForInitialization();
        console.log('✅ [AuthProvider] 초기화 완료 대기 성공');
      } catch (error) {
        console.error('❌ [AuthProvider] 초기화 대기 중 오류:', error);
      }
    };
    
    initializeAndSubscribe();
    
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