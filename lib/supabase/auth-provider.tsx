'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './client';
import { extractAvatarFromProvider } from '@/utils/image-utils';
import { UserProfiles } from '@/types/interfaces';

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

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfiles | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 한 번만 실행되도록 보장하는 플래그들
  const initOnceRef = useRef(false);
  const mountedRef = useRef(true);
  const subscriptionRef = useRef<any>(null);
  const isInitializingRef = useRef(false);

  // Supabase 클라이언트 (한 번만 생성)
  const [supabaseClient] = useState(() => {
    try {
      const client = createBrowserSupabaseClient();
      console.log('✅ [AuthProvider] Supabase 클라이언트 생성 완료');
      return client;
    } catch (error) {
      console.error('❌ [AuthProvider] Supabase 클라이언트 생성 실패:', error);
      return null;
    }
  });

  // 사용자 프로필 로딩 함수
  const loadUserProfile = useCallback(async (userId: string): Promise<UserProfiles | null> => {
    if (!supabaseClient || !mountedRef.current) return null;
    
    try {
      const { data: profile, error } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !profile) {
        console.log('프로필 없음, 기본 프로필 생성');
        return null;
      }

      return profile;
    } catch (error) {
      console.error('프로필 로딩 에러:', error);
      return null;
    }
  }, [supabaseClient]);

  // 로그아웃 함수
  const signOut = useCallback(async () => {
    if (!supabaseClient) return;
    
    try {
      console.log('로그아웃 시작');
      
      if (mountedRef.current) {
        setIsLoading(true);
        setUserProfile(null);
        setUser(null);
        setSession(null);
      }

      await supabaseClient.auth.signOut();
      
      if (mountedRef.current) {
        setIsLoading(false);
      }
      
      console.log('로그아웃 완료');
    } catch (error) {
      console.error('로그아웃 에러:', error);
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [supabaseClient]);

  // 초기화 (한 번만 실행)
  useEffect(() => {
    if (initOnceRef.current || isInitializingRef.current) {
      console.log('⏭️ [AuthProvider] 이미 초기화됨/진행중, 건너뜀:', { 
        initOnce: initOnceRef.current, 
        isInitializing: isInitializingRef.current 
      });
      return;
    }
    
    initOnceRef.current = true;
    isInitializingRef.current = true;

    // 5초 후 강제로 로딩 해제 (무한 대기 방지)
    const timeoutId = setTimeout(() => {
      console.log('⏰ [AuthProvider] 초기화 타임아웃 - 강제로 로딩 해제');
      isInitializingRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }, 5000);

    const initAuth = async () => {
      if (!supabaseClient || !mountedRef.current) {
        console.log('❌ [AuthProvider] 초기화 조건 불충족:', { 
          hasSupabase: !!supabaseClient, 
          isMounted: mountedRef.current 
        });
        return;
      }
      
      try {
        console.log('🔄 [AuthProvider] Auth 초기화 시작');

        // 초기 세션 가져오기
        console.log('🔍 [AuthProvider] 초기 세션 조회 중...');
        const { data: { session: initialSession }, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError) {
          console.error('❌ [AuthProvider] 세션 조회 에러:', sessionError);
        } else {
          console.log('📱 [AuthProvider] 초기 세션 조회 완료:', !!initialSession);
        }

        if (mountedRef.current) {
          setSession(initialSession);
          setUser(initialSession?.user || null);

          // 초기 프로필 로딩
          if (initialSession?.user) {
            const profile = await loadUserProfile(initialSession.user.id);
            if (mountedRef.current) {
              setUserProfile(profile);
            }
          }

          setIsLoading(false);
          setIsInitialized(true);
        }

        // 인증 상태 변경 구독
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
        }

        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('인증 상태 변경:', event);

            if (mountedRef.current) {
              setSession(newSession);
              setUser(newSession?.user || null);

              if (newSession?.user) {
                const profile = await loadUserProfile(newSession.user.id);
                if (mountedRef.current) {
                  setUserProfile(profile);
                }
              } else {
                if (mountedRef.current) {
                  setUserProfile(null);
                }
              }

              if (mountedRef.current) {
                setIsLoading(false);
              }
            }
          }
        );

        subscriptionRef.current = subscription;

        // 타임아웃 클리어 (정상 초기화 완료)
        clearTimeout(timeoutId);
        isInitializingRef.current = false;
        console.log('✅ [AuthProvider] 초기화 완료');

      } catch (error) {
        console.error('❌ [AuthProvider] Auth 초기화 에러:', error);
        clearTimeout(timeoutId);
        isInitializingRef.current = false;
        if (mountedRef.current) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initAuth();

    // 정리 함수
    return () => {
      mountedRef.current = false;
      isInitializingRef.current = false;
      clearTimeout(timeoutId);
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [supabaseClient]); // supabaseClient 의존성 추가

  const value: AuthContextType = {
    session,
    user,
    userProfile,
    isAuthenticated: !!session && !!user,
    isLoading,
    isInitialized,
    signOut,
    loadUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 