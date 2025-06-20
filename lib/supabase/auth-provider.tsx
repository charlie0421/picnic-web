'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
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
  
  // 로그아웃 진행 상태 추적 (hooks 에러 방지)
  const isSigningOutRef = useRef(false);
  const mountedRef = useRef(true);

  // Supabase 클라이언트 생성
  const supabase = createBrowserSupabaseClient();

  console.log('🚀 [AuthProvider] 인증 초기화 시작');

  // 사용자 프로필 로딩 함수
  const loadUserProfile = async (userId: string): Promise<UserProfiles | null> => {
    try {
      console.log('🔍 [AuthProvider] 프로필 로딩 시작:', userId);
      
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ [AuthProvider] 프로필 조회 실패:', error);
        return null;
      }

      console.log('✅ [AuthProvider] DB에서 프로필 조회 성공:', profile);
      return profile;
    } catch (error) {
      console.error('❌ [AuthProvider] 프로필 로딩 중 에러:', error);
      return null;
    }
  };

  // 로그아웃 함수
  const signOut = async () => {
    if (isSigningOutRef.current) {
      console.log('⏭️ [AuthProvider] 로그아웃 이미 진행 중, 건너뜀');
      return;
    }

    try {
      isSigningOutRef.current = true;
      console.log('🚪 [AuthProvider] 로그아웃 시작');

      // 상태를 안전하게 초기화 (hooks 에러 방지)
      if (mountedRef.current) {
        setIsLoading(true);
        setUserProfile(null);
        setUser(null);
        setSession(null);
      }

      // Supabase 로그아웃 수행
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ [AuthProvider] Supabase 로그아웃 실패:', error);
      } else {
        console.log('✅ [AuthProvider] Supabase 로그아웃 성공');
      }

      // 최종 상태 설정
      if (mountedRef.current) {
        setIsLoading(false);
      }

    } catch (error) {
      console.error('❌ [AuthProvider] 로그아웃 중 에러:', error);
      if (mountedRef.current) {
        setIsLoading(false);
      }
    } finally {
      // 짧은 지연 후 플래그 리셋 (hooks 안정화)
      setTimeout(() => {
        isSigningOutRef.current = false;
      }, 100);
    }
  };

  // 인증 상태 초기화 및 구독
  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;

    const initializeAuth = async () => {
      try {
        console.log('🔄 [AuthProvider] 인증 상태 초기화 시작');

        // 초기 세션 가져오기
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('❌ [AuthProvider] 초기 세션 조회 실패:', sessionError);
        } else {
          console.log('📱 [AuthProvider] 초기 세션:', !!initialSession);
        }

        if (mounted && !isSigningOutRef.current) {
          setSession(initialSession);
          setUser(initialSession?.user || null);

          // 초기 프로필 로딩
          if (initialSession?.user) {
            const profile = await loadUserProfile(initialSession.user.id);
            if (mounted && !isSigningOutRef.current) {
              // 프로필이 없으면 소셜 로그인 메타데이터에서 추출
              if (!profile && initialSession.user.user_metadata) {
                const extractedAvatar = extractAvatarFromProvider(initialSession.user.user_metadata);
                console.log('🖼️ [AuthProvider] 추출된 아바타 URL:', extractedAvatar);
                
                const fallbackProfile: UserProfiles = {
                  id: initialSession.user.id,
                  email: initialSession.user.email || '',
                  nickname: initialSession.user.user_metadata?.full_name || 'User',
                  avatar_url: extractedAvatar,
                  birth_date: null,
                  birth_time: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  deleted_at: null,
                  gender: null,
                  is_admin: false,
                  is_super_admin: false,
                  open_ages: false,
                  open_gender: false,
                  star_candy: 0,
                  star_candy_bonus: 0,
                };
                console.log('🎯 [AuthProvider] 최종 프로필:', fallbackProfile);
                setUserProfile(fallbackProfile);
              } else {
                setUserProfile(profile);
              }
            }
          }

          setIsLoading(false);
          setIsInitialized(true);
        }

        // 인증 상태 변경 구독
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('🔄 [AuthProvider] 인증 상태 변경:', event, !!newSession);

            if (mounted && !isSigningOutRef.current) {
              setSession(newSession);
              setUser(newSession?.user || null);

              if (newSession?.user) {
                const profile = await loadUserProfile(newSession.user.id);
                if (mounted && !isSigningOutRef.current) {
                  setUserProfile(profile);
                }
              } else {
                if (mounted) {
                  setUserProfile(null);
                }
              }

              if (mounted) {
                setIsLoading(false);
              }
            }
          }
        );

        // 컴포넌트 언마운트 시 구독 해제
        return () => {
          mounted = false;
          mountedRef.current = false;
          subscription.unsubscribe();
        };

      } catch (error) {
        console.error('❌ [AuthProvider] 초기화 중 에러:', error);
        if (mounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    // 클린업 함수
    return () => {
      mounted = false;
      mountedRef.current = false;
    };
  }, []);

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

