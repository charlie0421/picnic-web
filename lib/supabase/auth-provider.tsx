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
      this.supabaseClient = createBrowserSupabaseClient();
      this.initPromise = this.initialize();
    }
  }

  private async initialize() {
    if (!this.supabaseClient) return;

    try {
      console.log('🔄 [AuthStore] 전역 Auth 초기화 시작');
      
      // 초기 세션 조회
      const { data: { session }, error } = await this.supabaseClient.auth.getSession();
      console.log('📱 [AuthStore] 초기 세션 조회 완료:', !!session);

      if (error) {
        console.error('❌ [AuthStore] 세션 조회 에러:', error);
        
        // 리프레시 토큰 오류 처리
        const handled = await handleAuthError(error);
        if (handled) {
          console.log('🔄 [AuthStore] 리프레시 토큰 오류 처리 완료');
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