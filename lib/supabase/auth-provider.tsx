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
        
        // localStorage에서 Supabase Auth 토큰 체크 (동적 키 확인)
        const checkStoredToken = () => {
          try {
            // Supabase 프로젝트 URL에서 프로젝트 ID 추출
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            if (!supabaseUrl) return false;
            
            const urlParts = supabaseUrl.split('.');
            const projectId = urlParts[0]?.split('://')[1];
            
            // 🍪 쿠키에서 토큰 확인하는 함수
            const checkCookieToken = (projectId: string) => {
              try {
                const cookies = document.cookie.split(';');
                for (let cookie of cookies) {
                  const [name, value] = cookie.trim().split('=');
                  if (name && name.startsWith(`sb-${projectId}-auth-token`) && value) {
                    console.log(`🍪 [AuthStore] 쿠키에 토큰 (${name}): 있음`);
                    return true;
                  }
                }
                return false;
              } catch (error) {
                console.warn('⚠️ [AuthStore] 쿠키 토큰 체크 중 오류:', error);
                return false;
              }
            };
            
            if (projectId) {
              const authKey = `sb-${projectId}-auth-token`;
              
              // 1단계: localStorage 확인
              const hasLocalStorageToken = localStorage.getItem(authKey);
              console.log(`🔍 [AuthStore] localStorage에 토큰 (${authKey}):`, hasLocalStorageToken ? '있음' : '없음');
              
              // 2단계: 쿠키 확인
              const hasCookieToken = checkCookieToken(projectId);
              
              const hasAnyToken = !!hasLocalStorageToken || hasCookieToken;
              console.log(`🔍 [AuthStore] 토큰 총합:`, {
                localStorage: !!hasLocalStorageToken,
                cookie: hasCookieToken,
                hasAnyToken
              });
              
              return hasAnyToken;
            }
            
            // 프로젝트 ID를 추출할 수 없는 경우 모든 Supabase 키 확인
            let hasLocalStorage = false;
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const hasToken = localStorage.getItem(key);
                console.log(`🔍 [AuthStore] localStorage에 토큰 (${key}):`, hasToken ? '있음' : '없음');
                if (hasToken) hasLocalStorage = true;
              }
            }
            
            // 일반적인 쿠키 패턴 확인
            let hasCookie = false;
            try {
              const cookies = document.cookie.split(';');
              for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name && name.startsWith('sb-') && name.includes('auth-token') && value) {
                  console.log(`🍪 [AuthStore] 쿠키에 토큰 (${name}): 있음`);
                  hasCookie = true;
                  break;
                }
              }
            } catch (error) {
              console.warn('⚠️ [AuthStore] 일반 쿠키 확인 중 오류:', error);
            }
            
            const hasAnyToken = hasLocalStorage || hasCookie;
            console.log(`🔍 [AuthStore] 전체 토큰 상태:`, {
              localStorage: hasLocalStorage,
              cookie: hasCookie,
              hasAnyToken
            });
            
            return hasAnyToken;
          } catch (error) {
            console.warn('⚠️ [AuthStore] 토큰 체크 중 오류:', error);
            return false;
          }
        };
        
        const hasStoredToken = checkStoredToken();
        const isLoginPage = window.location.pathname.includes('/login');
        const isCallbackPage = window.location.pathname.includes('/callback');
        
        console.log('🔍 [AuthStore] 초기화 컨텍스트:', {
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

        // 🚀 로그인 페이지 성능 최적화: 토큰이 없으면 즉시 로그아웃 상태 처리
        if (!hasStoredToken && isLoginPage) {
          console.log('⚡ [AuthStore] 로그인 페이지에서 토큰 없음 → 즉시 로그아웃 상태 처리 (getSession 건너뛰기)');
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
        
        // 저장된 토큰이 없고 일반 페이지에서도 빠른 초기화
        if (!hasStoredToken && !isCallbackPage) {
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
      
      // 네트워크 상태 체크
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        console.log('🌐 [AuthStore] 네트워크 상태:', {
          effectiveType: connection?.effectiveType,
          downlink: connection?.downlink,
          rtt: connection?.rtt
        });
      }
      
      // localStorage 접근 테스트
      try {
        const testKey = 'test_storage_access';
        const testStart = performance.now();
        localStorage.setItem(testKey, 'test');
        const testValue = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);
        const testEnd = performance.now();
        console.log('✅ [AuthStore] localStorage 접근 테스트:', {
          success: testValue === 'test',
          duration: `${(testEnd - testStart).toFixed(2)}ms`
        });
      } catch (storageError) {
        console.error('❌ [AuthStore] localStorage 접근 실패:', storageError);
      }
      
      // Supabase 클라이언트 상태 상세 진단
      console.log('🔍 [AuthStore] Supabase 클라이언트 상태:', {
        clientExists: !!this.supabaseClient,
        authExists: !!this.supabaseClient?.auth,
        getSessionExists: !!this.supabaseClient?.auth?.getSession,
        realtimeExists: !!this.supabaseClient?.realtime,
        restExists: !!this.supabaseClient?.rest
      });
      
      // 환경 변수 길이 체크 (너무 길면 성능 영향)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      console.log('🔍 [AuthStore] 환경 변수 상태:', {
        urlLength: supabaseUrl.length,
        keyLength: supabaseKey.length,
        urlValid: supabaseUrl.startsWith('https://'),
        keyValid: supabaseKey.length > 50
      });
      
      // localStorage에서 기존 세션 데이터 크기 체크
      try {
        let totalSize = 0;
        let authRelatedSize = 0;
        const authKeys: string[] = [];
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key) || '';
            const itemSize = key.length + value.length;
            totalSize += itemSize;
            
            if (key.includes('sb-') || key.includes('auth') || key.includes('supabase')) {
              authRelatedSize += itemSize;
              authKeys.push(key);
            }
          }
        }
        
        console.log('🔍 [AuthStore] localStorage 상태:', {
          totalItems: localStorage.length,
          totalSize: `${totalSize} chars`,
          authRelatedSize: `${authRelatedSize} chars`,
          authKeys: authKeys.slice(0, 5), // 처음 5개만 표시
          authKeysCount: authKeys.length
        });
      } catch (error) {
        console.warn('⚠️ [AuthStore] localStorage 분석 실패:', error);
      }
      
      // 초기 세션 조회 - 단계별 성능 측정
      console.log('🔍 [AuthStore] getSession() 단계별 성능 측정 시작...');
      
      let session: any = null;
      let error: any = null;
      let progressInterval: NodeJS.Timeout | null = null;
      let startTime = 0;
      
      try {
        // 1단계: 준비 시간 측정
        const prepStartTime = performance.now();
        
        startTime = Date.now();
        console.log('🚀 [AuthStore] getSession() 호출 시작 - 시간:', new Date().toISOString());
        
        // 2단계: Promise 생성 시간 측정
        const promiseStartTime = performance.now();
        const sessionPromise = this.supabaseClient.auth.getSession();
        const promiseCreationTime = performance.now() - promiseStartTime;
        
        console.log('🔍 [AuthStore] Promise 생성 완료:', {
          promiseExists: !!sessionPromise,
          creationTime: `${promiseCreationTime.toFixed(2)}ms`
        });
        
        // 🔧 타임아웃 연장: OAuth 성공 후에도 충분한 시간 제공
        const isCallbackPageDetected = window.location.pathname.includes('/auth/callback/');
        const timeoutDuration = isCallbackPageDetected ? 8000 : 5000; // 콜백: 8초, 일반: 5초
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            console.log(`⏰ [AuthStore] ${timeoutDuration/1000}초 타임아웃 도달 (${isCallbackPageDetected ? '콜백 페이지' : '일반 페이지'}) - RLS 비활성화했는데도 지연`);
            reject(new Error(`getSession timeout after ${timeoutDuration/1000} seconds`));
          }, timeoutDuration)
        );
        
        // 1초마다 진행 상황 로그 및 상세 진단
        progressInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ [AuthStore] getSession 진행 중... ${elapsed}ms 경과`);
          
          // 2초 후부터 상세 진단 시작
          if (elapsed > 2000) {
            console.log(`🔍 [진단] getSession 장시간 대기 중:`, {
              elapsed: `${elapsed}ms`,
              networkOnline: navigator.onLine,
              authClientState: !!this.supabaseClient?.auth,
              hasActiveRequests: document.querySelectorAll('script, link').length
            });
          }
          
          // 타임아웃 임박 시 추가 정보
          if (elapsed > timeoutDuration * 0.8) {
            console.warn(`⚠️ [AuthStore] 타임아웃 임박 (${Math.round(timeoutDuration * 0.8)}ms/${timeoutDuration}ms) - API 응답 없음`);
          }
        }, 1000);
        
        // 4단계: 실제 세션 조회 실행
        const sessionStartTime = performance.now();
        const result = await Promise.race([sessionPromise, timeoutPromise]);
        const sessionEndTime = performance.now();
        
        if (progressInterval) clearInterval(progressInterval);
        const elapsed = Date.now() - startTime;
        const performanceElapsed = sessionEndTime - sessionStartTime;
        
        console.log(`✅ [AuthStore] getSession 완료 - 성능 분석:`, {
          totalTime: `${elapsed}ms`,
          performanceTime: `${performanceElapsed.toFixed(2)}ms`,
          prepTime: `${(promiseStartTime - prepStartTime).toFixed(2)}ms`,
          creationTime: `${promiseCreationTime.toFixed(2)}ms`
        });
        
        session = (result as any)?.data?.session;
        error = (result as any)?.error;
        
        // 5단계: 결과 분석
        console.log('🔍 [AuthStore] getSession() 결과 분석:', { 
          hasSession: !!session,
          hasError: !!error,
          errorMessage: error?.message,
          sessionSize: session ? JSON.stringify(session).length : 0,
          resultType: typeof result,
          resultKeys: result ? Object.keys(result as any) : []
        });
        
      } catch (timeoutError) {
        if (progressInterval) clearInterval(progressInterval);
        const elapsed = Date.now() - startTime;
        console.warn(`⚠️ [AuthStore] getSession() 타임아웃 분석:`, {
          timeoutAt: `${elapsed}ms`,
          error: (timeoutError as Error).message,
          stack: (timeoutError as Error).stack?.split('\n').slice(0, 3)
        });
        
        // 타임아웃 시 Supabase 내부 상태 진단
        try {
          console.log('🔍 [AuthStore] 타임아웃 시 내부 상태:', {
            authState: this.supabaseClient.auth?.getSession ? 'ready' : 'not ready',
            clientReady: !!this.supabaseClient,
            hasListeners: !!(this.supabaseClient.auth as any)?._listeners
          });
        } catch (diagError) {
          console.warn('⚠️ [AuthStore] 내부 상태 진단 실패:', diagError);
        }
        
        // 타임아웃 시 브라우저 콘솔 진단 코드 제공
        console.log('⚡ [AuthStore] 타임아웃으로 인한 빠른 로그아웃 상태 처리');
        console.log('🔧 [진단] 브라우저 콘솔에서 다음 코드로 수동 테스트 가능:');
        console.log('window.supabase.auth.getSession().then(r => console.log("수동 테스트 결과:", r))');
        console.log('document.cookie.split(";").filter(c => c.includes("sb-"))'); // 쿠키 확인
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
        
        // 인증 상태 변경 리스너는 여전히 등록
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
        
        return; // 타임아웃 후 조기 종료
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