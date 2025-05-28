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
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(initialSession || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializationAttempted = useRef(false);

  // 향상된 프로필 조회 함수 - 성능 최적화 적용
  const fetchUserProfile = useCallback(
    withPerformanceMonitoring(
      withProfileOptimization(async (userId: string): Promise<UserProfile | null> => {
        // 캐시에서 확인
        const now = Date.now();
        const cached = profileCache.get(userId);
        if (cached && now - cached.timestamp < CACHE_TTL) {
          console.log('[EnhancedAuthProvider] 캐시된 프로필 사용');
          setUserProfile(cached.profile);
          return cached.profile;
        }

        console.log('[EnhancedAuthProvider] 프로필 DB 조회 시작');

        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) {
            console.warn('[EnhancedAuthProvider] 프로필 조회 오류:', error);
            
            // 오류 상황에서도 기본 프로필 생성
            const defaultProfile: UserProfile = {
              id: userId,
              email: user?.email || '',
              nickname: user?.email?.split('@')[0] || 'User',
              avatar_url: null,
              birth_date: null,
              birth_time: null,
              gender: null,
              is_admin: false,
              open_ages: false,
              open_gender: false,
              star_candy: 0,
              star_candy_bonus: 0,
              deleted_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            console.log('[EnhancedAuthProvider] 기본 프로필 생성:', defaultProfile);
            setUserProfile(defaultProfile);
            
            // 캐시에 저장 (짧은 TTL로)
            profileCache.set(userId, {
              profile: defaultProfile,
              timestamp: now,
            });

            return defaultProfile;
          }

          if (!data) {
            console.log('[EnhancedAuthProvider] 프로필 없음 - 기본 프로필 생성');
            
            const defaultProfile: UserProfile = {
              id: userId,
              email: user?.email || '',
              nickname: user?.email?.split('@')[0] || 'User',
              avatar_url: null,
              birth_date: null,
              birth_time: null,
              gender: null,
              is_admin: false,
              open_ages: false,
              open_gender: false,
              star_candy: 0,
              star_candy_bonus: 0,
              deleted_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            setUserProfile(defaultProfile);
            profileCache.set(userId, {
              profile: defaultProfile,
              timestamp: now,
            });

            return defaultProfile;
          }

          console.log('[EnhancedAuthProvider] 프로필 조회 성공');
          setUserProfile(data);
          
          // 캐시에 저장
          profileCache.set(userId, {
            profile: data,
            timestamp: now,
          });

          return data;
        } catch (error) {
          console.error('[EnhancedAuthProvider] 프로필 조회 예외:', error);
          
          // 예외 상황에서도 기본 프로필 생성
          const defaultProfile: UserProfile = {
            id: userId,
            email: user?.email || '',
            nickname: user?.email?.split('@')[0] || 'User',
            avatar_url: null,
            birth_date: null,
            birth_time: null,
            gender: null,
            is_admin: false,
            open_ages: false,
            open_gender: false,
            star_candy: 0,
            star_candy_bonus: 0,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          setUserProfile(defaultProfile);
          return defaultProfile;
        }
      }),
      'profile_fetch'
    ),
    [supabase, user?.email]
  );

  // 세션 처리 함수 - 성능 모니터링 적용
  const handleSession = useCallback(
    withPerformanceMonitoring(async (newSession: Session | null) => {
      console.log('[EnhancedAuthProvider] 세션 처리 시작:', !!newSession);
      
      try {
        setSession(newSession);
        
        if (newSession?.user) {
          setUser(newSession.user);
          
          // 프로필 조회 시도
          try {
            await fetchUserProfile(newSession.user.id);
          } catch (profileError) {
            console.warn('[EnhancedAuthProvider] 프로필 로드 실패, 기본 인증 상태 유지:', profileError);
            
            // 프로필 로드에 실패해도 기본 프로필로 인증 상태 유지
            const defaultProfile: UserProfile = {
              id: newSession.user.id,
              email: newSession.user.email || '',
              nickname: newSession.user.email?.split('@')[0] || 'User',
              avatar_url: null,
              birth_date: null,
              birth_time: null,
              gender: null,
              is_admin: false,
              open_ages: false,
              open_gender: false,
              star_candy: 0,
              star_candy_bonus: 0,
              deleted_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            setUserProfile(defaultProfile);
          }
        } else {
          setUser(null);
          setUserProfile(null);
          profileCache.clear();
        }
        
        setError(null);
      } catch (error) {
        console.error('[EnhancedAuthProvider] 세션 처리 오류:', error);
        
        // 세션 처리 실패 시 복구 로직
        if (newSession?.user) {
          console.log('[EnhancedAuthProvider] 세션 오류 복구 시도');
          setUser(newSession.user);
          
          // 최소한의 기본 프로필 설정
          const fallbackProfile: UserProfile = {
            id: newSession.user.id,
            email: newSession.user.email || '',
            nickname: newSession.user.email?.split('@')[0] || 'User',
            avatar_url: null,
            birth_date: null,
            birth_time: null,
            gender: null,
            is_admin: false,
            open_ages: false,
            open_gender: false,
            star_candy: 0,
            star_candy_bonus: 0,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setUserProfile(fallbackProfile);
        } else {
          setUser(null);
          setUserProfile(null);
        }
        
        setError(null); // 사용자에게 오류 표시 안함
      }
    }, 'session_handling'),
    [fetchUserProfile]
  );

  // 로그아웃 함수
  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      
      setUser(null);
      setUserProfile(null);
      setSession(null);
      setError(null);
      profileCache.clear();
    } catch (error) {
      console.error('[EnhancedAuthProvider] 로그아웃 오류:', error);
      setError('로그아웃 중 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth]);

  // 프로필 새로고침
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    
    // 캐시 무효화
    profileCache.delete(user.id);
    
    try {
      await fetchUserProfile(user.id);
    } catch (error) {
      console.error('[EnhancedAuthProvider] 프로필 새로고침 실패:', error);
    }
  }, [user?.id, fetchUserProfile]);

  // 성능 통계 조회
  const getPerformanceStats = useCallback(() => {
    return PerformanceMetrics.getMetrics();
  }, []);

  // 회로 차단기 상태 조회  
  const getCircuitStats = useCallback(() => {
    return getCircuitBreakerStats();
  }, []);

  // 인증 상태 구독
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[EnhancedAuthProvider] 인증 상태 변경:', event, !!newSession);
      
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserProfile(null);
        setSession(null);
        setError(null);
        profileCache.clear();
        setIsLoading(false);
        setIsInitialized(true);
      } else {
        await handleSession(newSession);
        setIsLoading(false);
        setIsInitialized(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth, handleSession]);

  // 초기 세션 로드 (한 번만 실행)
  useEffect(() => {
    if (initializationAttempted.current) return;
    
    let isMounted = true;
    let initTimeout: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        console.log('[EnhancedAuthProvider] 인증 초기화 시작');
        setIsLoading(true);
        initializationAttempted.current = true;

        // 현재 세션 가져오기 (성능 모니터링 적용)
        const getSessionWithMonitoring = withPerformanceMonitoring(
          async () => {
            const { data: { session: currentSession }, error } = await supabase.auth.getSession();
            
            if (error) {
              console.warn('[EnhancedAuthProvider] 세션 조회 오류:', error);
              // 오류가 있어도 계속 진행 (비로그인 상태로 처리)
            }
            
            return currentSession;
          },
          'session_init'
        );

        const currentSession = await getSessionWithMonitoring();

        // 컴포넌트가 언마운트되었으면 상태 업데이트 중단
        if (!isMounted) return;

        console.log('[EnhancedAuthProvider] 세션 상태:', !!currentSession);
        await handleSession(currentSession || null);
      } catch (error) {
        if (!isMounted) return;

        console.warn('[EnhancedAuthProvider] 초기화 오류 (계속 진행):', error);
        // 오류가 있어도 비로그인 상태로 초기화 완료
        setIsLoading(false);
        setIsInitialized(true);
        setError(null); // 초기화 오류는 사용자에게 표시하지 않음
      }
    };

    // 8초 후에도 초기화가 완료되지 않으면 강제로 완료 처리
    initTimeout = setTimeout(() => {
      if (isMounted && !isInitialized) {
        console.warn('[EnhancedAuthProvider] 초기화 타임아웃 - 강제 완료 처리');
        setIsLoading(false);
        setIsInitialized(true);
        setError(null); // 타임아웃 오류는 사용자에게 표시하지 않음
      }
    }, 8000); // 5초에서 8초로 증가

    initializeAuth();

    return () => {
      isMounted = false;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
    };
  }, [supabase.auth, handleSession, isInitialized]);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useEnhancedAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useEnhancedAuth는 EnhancedAuthProvider 내부에서 사용해야 합니다');
  }
  return context;
} 