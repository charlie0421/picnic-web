'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Session, Provider } from '@supabase/supabase-js';
import { createBrowserSupabaseClient, signOut as supabaseSignOut } from './client';
import { Database } from '@/types/supabase';
import { UserProfiles } from '@/types/interfaces';

// 프로필 캐시 저장소 (메모리 내 캐싱)
const profileCache = new Map<string, { profile: UserProfiles; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

type AuthContextType = {
  // 기본 인증 상태
  user: User | null;
  userProfile: UserProfiles | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
  error: string | null;
  
  // 인증 메서드
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithOAuth: (provider: 'google' | 'apple' | 'kakao' | 'wechat') => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ error: Error | null, data: { user: User | null } }>;
  signOut: () => Promise<{ success: boolean; error?: unknown }>;
  refreshSession: () => Promise<void>;
  
  // 프로필 관리
  updateUserProfile: (profile: Partial<UserProfiles>) => Promise<{ success: boolean; error?: unknown }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: React.ReactNode;
  initialSession?: Session | null;
};

export function AuthProvider({
  children,
  initialSession,
}: AuthProviderProps) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [session, setSession] = useState<Session | null>(initialSession || null);
  const [user, setUser] = useState<User | null>(initialSession?.user || null);
  const [userProfile, setUserProfile] = useState<UserProfiles | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!session?.user);

  // 사용자 프로필 정보 가져오기 (의존성 최소화)
  const fetchUserProfile = useCallback(async (userId: string, currentSession: Session | null) => {
    try {
      // 캐시에서 확인
      const now = Date.now();
      const cached = profileCache.get(userId);
      if (cached && now - cached.timestamp < CACHE_TTL) {
        setUserProfile(cached.profile);
        return cached.profile;
      }
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('사용자 프로필 조회 오류:', error);
        // 프로필이 없으면 기본 정보로 빈 프로필 생성
        if (currentSession?.user?.id === userId) {
          const defaultProfile: UserProfiles = {
            id: userId,
            email: currentSession.user.email || null,
            nickname: null,
            avatarUrl: null,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            birthDate: null,
            birthTime: null,
            gender: null,
            openAges: false,
            openGender: false,
            starCandy: 0,
            starCandyBonus: 0
          };
          
          profileCache.set(userId, { profile: defaultProfile, timestamp: now });
          setUserProfile(defaultProfile);
          return defaultProfile;
        }
        setUserProfile(null);
        return null;
      }

      if (data) {
        const profile = {
          id: data.id,
          email: data.email,
          nickname: data.nickname,
          avatarUrl: data.avatar_url,
          isAdmin: data.is_admin,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          deletedAt: data.deleted_at,
          birthDate: data.birth_date,
          birthTime: data.birth_time,
          gender: data.gender,
          openAges: data.open_ages,
          openGender: data.open_gender,
          starCandy: data.star_candy,
          starCandyBonus: data.star_candy_bonus
        } as UserProfiles;
        
        // 캐시에 저장
        profileCache.set(userId, { profile, timestamp: now });
        setUserProfile(profile);
        return profile;
      }
      
      setUserProfile(null);
      return null;
    } catch (error) {
      console.error('사용자 프로필 조회 중 예외:', error);
      setUserProfile(null);
      return null;
    }
  }, [supabase]);

  // 인증 상태 처리 함수 (의존성 최소화)
  const handleSession = useCallback(async (newSession: Session | null) => {
    try {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsAuthenticated(!!newSession?.user);
      
      // 세션이 있으면 사용자 프로필 로드
      if (newSession?.user) {
        try {
          await fetchUserProfile(newSession.user.id, newSession);
        } catch (profileError) {
          console.warn('프로필 로드 실패, 기본값으로 진행:', profileError);
          // 프로필 로드 실패해도 인증 상태는 유지
        }
      } else {
        setUserProfile(null);
      }
    } catch (error) {
      console.error('세션 처리 중 오류:', error);
      setError(error instanceof Error ? error.message : '세션 처리 오류');
    } finally {
      setIsLoading(false);
      // 오류가 있어도 초기화는 완료된 것으로 처리
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [fetchUserProfile, isInitialized]);

  // 초기 세션 로드 (한 번만 실행)
  useEffect(() => {
    let isMounted = true;
    let initTimeout: NodeJS.Timeout;
    
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        
        // 현재 세션 가져오기
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }
        
        // 컴포넌트가 언마운트되었으면 상태 업데이트 중단
        if (!isMounted) return;
        
        await handleSession(currentSession);
      } catch (error) {
        if (!isMounted) return;
        
        console.error('AuthProvider 초기화 오류:', error);
        setError(error instanceof Error ? error.message : String(error));
        setIsLoading(false);
      } finally {
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };

    // 5초 후에도 초기화가 완료되지 않으면 강제로 완료 처리
    initTimeout = setTimeout(() => {
      if (isMounted && !isInitialized) {
        console.warn('AuthProvider 초기화 타임아웃 - 강제 완료 처리');
        setIsLoading(false);
        setIsInitialized(true);
        setError('인증 시스템 초기화에 시간이 오래 걸리고 있습니다. 페이지를 새로고침해보세요.');
      }
    }, 5000);

    initializeAuth();
    
    return () => {
      isMounted = false;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
    };
  }, []); // 빈 의존성 배열로 한 번만 실행

  // 인증 상태 변경 구독 (별도 useEffect)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state change:', event, !!newSession);
        
        await handleSession(newSession);
        
        // 세션이 생성되었을 때 로컬 스토리지에 저장
        if (event === 'SIGNED_IN' && newSession) {
          try {
            localStorage.setItem('auth_success', 'true');
            localStorage.setItem('auth_provider', newSession.user?.app_metadata?.provider || 'unknown');
            localStorage.setItem('auth_timestamp', Date.now().toString());
          } catch (e) {
            console.warn('로컬 스토리지 저장 오류:', e);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSession]);

  // 캐시 정리 
  useEffect(() => {
    // 5분마다 만료된 캐시 항목 정리
    const cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      profileCache.forEach((cacheEntry, userId) => {
        if (now - cacheEntry.timestamp > CACHE_TTL) {
          profileCache.delete(userId);
        }
      });
    }, CACHE_TTL);
    
    return () => clearInterval(cacheCleanupInterval);
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error: any) {
      setError(error.message || '로그인 중 오류가 발생했습니다.');
      return { error: error as Error };
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple' | 'kakao' | 'wechat') => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as Provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback/${provider}`,
        },
      });
      
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error(`AuthProvider: ${provider} 소셜 로그인 오류:`, error);
      setError(error instanceof Error ? error.message : String(error));
      return { error: error as Error };
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string, username?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || email.split('@')[0],
          },
        },
      });

      if (error) throw error;

      return { error: null, data: { user: data.user } };
    } catch (error: any) {
      setError(error.message || '회원가입 중 오류가 발생했습니다.');
      return { error: error as Error, data: { user: null } };
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSession = async () => {
    try {
      setIsLoading(true);
      const { data: { session }, error } = await supabase.auth.refreshSession();
      
      if (error) throw error;
      
      await handleSession(session);
    } catch (error) {
      console.error('세션 갱신 오류:', error);
      setError(error instanceof Error ? error.message : '세션 갱신 오류');
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserProfile = async (profile: Partial<UserProfiles>) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const currentUserId = user?.id;
      if (!currentUserId) {
        throw new Error('로그인이 필요합니다');
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(profile)
        .eq('id', currentUserId);

      if (error) throw error;

      // 현재 프로필 업데이트
      const updatedProfile = userProfile ? { ...userProfile, ...profile } : null;
      setUserProfile(updatedProfile);
      
      // 캐시 업데이트
      if (updatedProfile) {
        profileCache.set(currentUserId, { 
          profile: updatedProfile, 
          timestamp: Date.now() 
        });
      }
      
      return { success: true };
    } catch (error: any) {
      setError(error.message || '프로필 업데이트 중 오류가 발생했습니다.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider 
      value={{
        user,
        userProfile,
        session,
        isLoading,
        isInitialized,
        isAuthenticated,
        error,
        signIn,
        signInWithOAuth,
        signUp,
        signOut: async () => await supabaseSignOut(),
        refreshSession,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth는 AuthProvider 내에서 사용해야 합니다');
  }
  return context;
} 