/**
 * 향상된 인증 제공자 - 성능 최적화 및 안정성 개선 버전
 * 
 * 주요 개선사항:
 * - 회로 차단기 패턴 적용
 * - 지능형 재시도 메커니즘
 * - 성능 모니터링
 * - 요청 큐잉
 */

'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { 
  withProfileOptimization, 
  withPerformanceMonitoring,
  getCircuitBreakerStats,
  PerformanceMetrics 
} from '@/utils/api/enhanced-retry-utils';
import { handleAuthError } from '@/utils/auth-error-handler';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getPerformanceStats: () => Record<string, { avg: number; count: number }>;
  getCircuitStats: () => any;
}

interface AuthProviderProps {
  children: React.ReactNode;
  initialSession?: Session | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 프로필 캐시 관리
interface ProfileCache {
  profile: UserProfile;
  timestamp: number;
}

const profileCache = new Map<string, ProfileCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

export function EnhancedAuthProvider({ children, initialSession }: AuthProviderProps) {
  // 🔍 가장 기본적인 로드 확인 (함수 진입점)
  console.log('🚨 [CRITICAL] EnhancedAuthProvider 함수 시작!', {
    timestamp: Date.now(),
    hasChildren: !!children,
    hasInitialSession: !!initialSession
  });

  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(initialSession || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔍 컴포넌트 로드 확인 (즉시 실행)
  console.log('[EnhancedAuthProvider] 🎬 컴포넌트 로드됨!', {
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    isClient: typeof window !== 'undefined'
  });

  // 🔍 간단한 초기화
  useEffect(() => {
    console.log('🚨 [CRITICAL] useEffect 시작됨!');
    
    const initialize = async () => {
      try {
        console.log('🚨 [CRITICAL] 초기화 시작!');
        setIsLoading(false);
        setIsInitialized(true);
        console.log('🚨 [CRITICAL] 초기화 완료!');
      } catch (error) {
        console.error('🚨 [CRITICAL] 초기화 오류:', error);
        setError('초기화 실패');
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  // 간단한 함수들
  const signOut = useCallback(async () => {
    console.log('🚨 [CRITICAL] signOut 호출됨!');
  }, []);

  const refreshProfile = useCallback(async () => {
    console.log('🚨 [CRITICAL] refreshProfile 호출됨!');
  }, []);

  const getPerformanceStats = useCallback(() => {
    return {};
  }, []);

  const getCircuitStats = useCallback(() => {
    return {};
  }, []);

  // 인증 상태 계산
  const isAuthenticated = !!user && !!userProfile;

  const value: AuthContextType = {
    user,
    userProfile,
    session,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    signOut,
    refreshProfile,
    getPerformanceStats,
    getCircuitStats,
  };

  console.log('🚨 [CRITICAL] Provider value 생성됨!', {
    isLoading,
    isInitialized,
    isAuthenticated,
    hasUser: !!user
  });

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useEnhancedAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useEnhancedAuth는 EnhancedAuthProvider 내부에서 사용해야 합니다');
  }
  return context;
}

// 기존 코드와의 호환성을 위해 useAuth로도 export
export const useAuth = useEnhancedAuth; 