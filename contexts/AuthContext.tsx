/**
 * @deprecated 이 파일은 더 이상 사용되지 않습니다. 대신 lib/supabase/auth-provider.tsx를 사용하세요.
 * 백업용으로 유지되는 파일입니다. 이 파일의 코드를 참조할 수는 있지만 직접 import하지 마세요.
 * 인증 관련 기능을 사용하려면 import { useAuth } from '@/lib/supabase/auth-provider'를 사용하세요.
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { supabase } from '../utils/supabase-client';
import {
  AuthChangeEvent,
  Provider,
  Session,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { UserProfiles } from '@/types/interfaces';
import { clearAllAuthData } from '@/utils/auth-redirect';

// 인증 상태 인터페이스
export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfiles | null;
  loading: boolean;
  error?: string | null;
}

interface AuthContextProps {
  authState: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithSocial: (provider: Provider | 'wechat') => Promise<void>;
  signOut: () => Promise<boolean>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  updateUserProfile: (profile: Partial<UserProfiles>) => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
    error: null,
  });

  // 사용자 프로필 정보 가져오기
  const fetchUserProfile = useCallback(async (user: SupabaseUser) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        return {
          ...data,
          avatarUrl: data.avatar_url,
          isAdmin: data.is_admin,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          deletedAt: data.deleted_at,
          birthDate: data.birth_date,
          birthTime: data.birth_time,
          openAges: data.open_ages,
          openBirthDate: data.open_ages,
          openBirthTime: data.open_ages,
          openGender: data.open_ages,
          starCandy: data.star_candy,
          starCandyBonus: data.star_candy_bonus,
        };
      }
      return null;
    } catch (error) {
      console.error('사용자 프로필 조회 오류:', error);
      return null;
    }
  }, []);

  // 세션 변경 처리
  const handleSession = useCallback(
    async (session: Session | null) => {
      if (session) {
        const userProfile = await fetchUserProfile(session.user);

        setAuthState((prev: AuthState) => ({
          ...prev,
          isAuthenticated: true,
          user: userProfile || {
            id: session.user.id,
            email: session.user.email || null,
            nickname: null,
            avatarUrl: null,
            bio: null,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            birthDate: null,
            birthTime: null,
            gender: null,
            openAges: false,
            openBirthDate: false,
            openBirthTime: false,
            openGender: false,
            starCandy: 0,
            starCandyBonus: 0,
          },
          loading: false,
          error: null,
        }));
      } else {
        setAuthState((prev: AuthState) => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          loading: false,
          error: null,
        }));
      }
    },
    [fetchUserProfile],
  );

  useEffect(() => {
    // 초기 인증 상태 확인
    const checkUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await handleSession(session);
      } catch (error) {
        console.error('인증 체크 에러:', error);
        setAuthState((prev: AuthState) => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          loading: false,
          error: '인증 상태 확인 중 오류가 발생했습니다.',
        }));
      }
    };

    // 인증 상태 변화 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('Auth State Change:', event, !!session);

        // SIGNED_OUT 이벤트에 대한 특별 처리
        if (event === 'SIGNED_OUT') {
          console.log('로그아웃 이벤트 감지: 인증 상태 초기화');
          setAuthState({
            isAuthenticated: false,
            user: null,
            loading: false,
            error: null,
          });
          return;
        }

        await handleSession(session);
      },
    );

    // 커스텀 이벤트 리스너 (외부에서 강제로 인증 상태 갱신을 요청할 수 있도록)
    const handleAuthStateChanged = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await handleSession(session);
      } catch (error) {
        console.error('이벤트 기반 인증 체크 에러:', error);
      }
    };

    // 커스텀 이벤트 리스너 등록
    window.addEventListener('auth.state.changed', handleAuthStateChanged);

    checkUser();

    // 클린업 함수
    return () => {
      subscription?.unsubscribe();
      window.removeEventListener('auth.state.changed', handleAuthStateChanged);
    };
  }, [handleSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setAuthState((prev: AuthState) => ({
        ...prev,
        loading: true,
        error: null,
      }));
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (error: any) {
      setAuthState((prev: AuthState) => ({
        ...prev,
        loading: false,
        error: error.message || '로그인 중 오류가 발생했습니다.',
      }));
    }
  }, []);

  const signInWithSocial = useCallback(
    async (provider: Provider | 'wechat') => {
      try {
        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: true,
          error: null,
        }));

        const options = {
          redirectTo: window.location.origin + '/auth/callback',
        };

        if (provider === 'wechat') {
          // WeChat은 별도 API 처리
          setAuthState((prev: AuthState) => ({
            ...prev,
            loading: false,
            error: 'WeChat 로그인은 별도 API를 통해 처리됩니다.',
          }));
          return;
        }

        const { error } = await supabase.auth.signInWithOAuth({
          provider: provider as Provider,
          options,
        });

        if (error) throw error;
      } catch (error: any) {
        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: false,
          error: error.message || '소셜 로그인 중 오류가 발생했습니다.',
        }));
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      setAuthState((prev: AuthState) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      // 상태를 즉시 초기화하여 UI가 빠르게 반응하도록 함
      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
        error: null,
      });

      // 로그아웃 시도 - 오류가 발생해도 계속 진행 (백그라운드 작업)
      try {
        // 모든 세션 제거
        const { error } = await supabase.auth.signOut({
          scope: 'global',
        });

        if (error) {
          console.warn('Supabase 로그아웃 오류 (진행 계속):', error.message);
        }
      } catch (e: any) {
        console.warn(
          'Supabase 로그아웃 예외 발생 (진행 계속):',
          e.message || '알 수 없는 오류',
        );
      }

      // 인증 관련 로컬 스토리지 데이터 제거 - 오류가 발생해도 최대한 진행 (백그라운드 작업)
      try {
        // clearAllAuthData 함수 사용으로 더 철저한 정리
        clearAllAuthData();

        // 추가적인 Supabase 관련 데이터 정리
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('supabase.auth.expires_at');
        localStorage.removeItem('supabase.auth.refresh_token');

        // 브라우저에서 사용할 수 있는 로컬 스토리지 키를 모두 순회하면서 관련 키 삭제
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('supabase') || key.includes('auth'))) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.warn('로컬 스토리지 정리 중 오류 (진행 계속):', e);
      }

      // 쿠키 정리 시도 - 오류가 발생해도 계속 진행 (백그라운드 작업)
      try {
        document.cookie.split(';').forEach((c) => {
          const cookieName = c.trim().split('=')[0];
          if (
            cookieName &&
            (cookieName.includes('auth') || cookieName.includes('supabase'))
          ) {
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
          }
        });
      } catch (e) {
        console.warn('쿠키 정리 중 오류 (진행 계속):', e);
      }

      // 로그아웃 성공 표시
      return true;
    } catch (error: any) {
      console.error('로그아웃 총괄 오류:', error);

      // 오류가 있어도 인증 상태는 초기화
      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
        error: error.message || '로그아웃 중 오류가 발생했습니다.',
      });

      // 로그아웃은 성공한 것으로 간주
      return true;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      try {
        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: true,
          error: null,
        }));

        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .insert([
              {
                id: data.user.id,
                email: email,
                nickname: username,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ]);

          if (profileError) throw profileError;
        }
      } catch (error: any) {
        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: false,
          error: error.message || '회원가입 중 오류가 발생했습니다.',
        }));
      }
    },
    [],
  );

  const updateUserProfile = useCallback(
    async (profile: Partial<UserProfiles>) => {
      try {
        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: true,
          error: null,
        }));

        const currentUserId = authState.user?.id;
        if (!currentUserId) {
          throw new Error('로그인이 필요합니다');
        }

        const { error } = await supabase
          .from('user_profiles')
          .update(profile)
          .eq('id', currentUserId);

        if (error) throw error;

        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: false,
          user: prev.user ? { ...prev.user, ...profile } : null,
        }));
      } catch (error: any) {
        setAuthState((prev: AuthState) => ({
          ...prev,
          loading: false,
          error: error.message || '프로필 업데이트 중 오류가 발생했습니다.',
        }));
      }
    },
    [authState.user?.id],
  );

  return (
    <AuthContext.Provider
      value={{
        authState,
        signIn,
        signInWithSocial,
        signOut,
        signUp,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
