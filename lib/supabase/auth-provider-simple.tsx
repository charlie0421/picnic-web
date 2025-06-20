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

export function SimpleAuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfiles | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 한 번만 실행되도록 보장하는 플래그들
  const initOnceRef = useRef(false);
  const mountedRef = useRef(true);
  const subscriptionRef = useRef<any>(null);

  // Supabase 클라이언트 (한 번만 생성)
  const supabaseRef = useRef<any>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createBrowserSupabaseClient();
  }

  // 사용자 프로필 로딩 함수
  const loadUserProfile = useCallback(async (userId: string): Promise<UserProfiles | null> => {
    if (!supabaseRef.current || !mountedRef.current) return null;
    
    try {
      const { data: profile, error } = await supabaseRef.current
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
  }, []);

  // 로그아웃 함수
  const signOut = useCallback(async () => {
    if (!supabaseRef.current) return;
    
    try {
      console.log('로그아웃 시작');
      
      if (mountedRef.current) {
        setIsLoading(true);
        setUserProfile(null);
        setUser(null);
        setSession(null);
      }

      await supabaseRef.current.auth.signOut();
      
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
  }, []);

  // 초기화 (한 번만 실행)
  useEffect(() => {
    if (initOnceRef.current) return;
    initOnceRef.current = true;

    const initAuth = async () => {
      if (!supabaseRef.current || !mountedRef.current) return;
      
      try {
        console.log('Auth 초기화 시작');

        // 초기 세션 가져오기
        const { data: { session: initialSession } } = await supabaseRef.current.auth.getSession();

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

        const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange(
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

      } catch (error) {
        console.error('Auth 초기화 에러:', error);
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
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, []); // 빈 의존성 배열로 한 번만 실행

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