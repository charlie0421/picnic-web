'use client';

/**
 * AuthProvider 컴포넌트 및 useAuth 훅
 *
 * React Context를 통해 인증 상태를 하위 컴포넌트에 전달합니다.
 * AuthStore 싱글톤을 사용하여 인증 상태를 관리합니다.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  memo,
} from 'react';
import { normalizeRedirectPath } from '@/utils/auth-redirect';
import { AuthStore, type AuthContextType } from './auth-store';

export type { AuthContextType } from './auth-store';

const authDebug =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_DEBUG === 'true' ||
  process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true';

const debugLog = (...args: unknown[]) => {
  if (authDebug) {
    console.log(...args);
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider 컴포넌트를 memo로 감싸서 완전히 안정화
const AuthProviderComponent = memo(function AuthProviderInternal({ children }: AuthProviderProps) {
  debugLog('🏗️ [AuthProvider] 컴포넌트 생성/재렌더링');

  const [contextValue, setContextValue] = useState<AuthContextType>(() => {
    return AuthStore.getInstance().getState();
  });

  useEffect(() => {
    const authStore = AuthStore.getInstance();

    const initializeAndSubscribe = async () => {
      try {
        await authStore.waitForInitialization();
        debugLog('✅ [AuthProvider] 초기화 완료 대기 성공');
      } catch (error) {
        console.error('❌ [AuthProvider] 초기화 대기 중 오류:', error);
      }
    };

    initializeAndSubscribe();

    const unsubscribe = authStore.subscribe((newState) => {
      debugLog('🔄 [AuthProvider] Context 값 변경:', {
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

  // 인증 직후 보조 리다이렉트 가드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!contextValue.isAuthenticated) return;

    try {
      const path = window.location.pathname || '/';
      const isLocaleRoot = /^\/[a-z]{2}$/.test(path);
      const isLoadingOrLogin = path.startsWith('/auth/loading') || path.includes('/login');
      if (!isLocaleRoot && !isLoadingOrLogin) return;

      const params = new URLSearchParams(window.location.search);
      const qp = params.get('returnTo') || params.get('return_url');
      const ck = (document.cookie.match(/(?:^|; )auth_return_url=([^;]+)/)?.[1]
        ? decodeURIComponent(document.cookie.match(/(?:^|; )auth_return_url=([^;]+)/)![1])
        : null);
      const ls = localStorage.getItem('auth_return_url') || localStorage.getItem('loginRedirectUrl') || localStorage.getItem('redirectUrl');

      const candidate = qp || ck || ls;
      if (candidate) {
        const target = normalizeRedirectPath(candidate);
        if (target && target !== path) {
          try { localStorage.removeItem('auth_return_url'); document.cookie = 'auth_return_url=; Max-Age=0; Path=/; SameSite=Lax'; } catch {}
          window.location.replace(target);
        }
      }
    } catch {}
  }, [contextValue.isAuthenticated]);

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
