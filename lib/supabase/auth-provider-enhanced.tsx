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
  const initializationAttempted = useRef(false);
  const authSubscription = useRef<ReturnType<typeof supabase.auth.onAuthStateChange> | null>(null);

  // 🔍 컴포넌트 로드 확인 (즉시 실행)
  console.log('[EnhancedAuthProvider] 🎬 컴포넌트 로드됨!', {
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    isClient: typeof window !== 'undefined'
  });

  // 🔍 의존성 상태 확인
  console.log('[EnhancedAuthProvider] 🔧 의존성 상태:', {
    supabaseAuth: !!supabase?.auth,
    supabaseObject: typeof supabase,
    isClientSide: typeof window !== 'undefined'
  });

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
              is_super_admin: null,
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
              is_super_admin: null,
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
            is_super_admin: null,
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
    [supabase]
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
              is_super_admin: null,
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
            is_super_admin: null,
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
    console.log('[EnhancedAuthProvider] 🎪 useEffect 시작 - initializationAttempted:', initializationAttempted.current);
    
    if (initializationAttempted.current) {
      console.log('[EnhancedAuthProvider] 🔄 이미 초기화 시도됨, 건너뜀');
      return;
    }
    
    let isMounted = true;
    let initTimeout: NodeJS.Timeout;
    
    console.log('[EnhancedAuthProvider] 🎯 초기화 준비 시작');

    const initializeAuth = async () => {
      try {
        console.log('[EnhancedAuthProvider] 🚀 인증 초기화 시작');
        console.log('[EnhancedAuthProvider] 📍 환경 정보:', {
          isClient: typeof window !== 'undefined',
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
          hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent.substring(0, 50) : 'server'
        });
        
        setIsLoading(true);
        initializationAttempted.current = true;

        // 현재 세션 가져오기 (성능 모니터링 적용)
        console.log('[EnhancedAuthProvider] 📡 세션 조회 시작');
        const getSessionWithMonitoring = withPerformanceMonitoring(
          async () => {
            const startTime = Date.now();
            const { data: { session: currentSession }, error } = await supabase.auth.getSession();
            const duration = Date.now() - startTime;
            
            console.log('[EnhancedAuthProvider] 📡 세션 조회 완료:', {
              duration: `${duration}ms`,
              hasSession: !!currentSession,
              sessionId: currentSession?.access_token?.substring(0, 20) + '...' || 'none',
              error: error?.message || 'none'
            });
            
            if (error) {
              console.warn('[EnhancedAuthProvider] ⚠️ 세션 조회 오류:', {
                message: error.message,
                status: error.status,
                name: error.name
              });
              
              // 리프레시 토큰 오류 처리
              const handled = await handleAuthError(error);
              if (!handled) {
                console.error('[EnhancedAuthProvider] ❌ 처리되지 않은 인증 오류:', error);
                throw error;
              }
              return null;
            }
            
            return currentSession;
          },
          'get-session'
        );

        const session = await getSessionWithMonitoring();
        
        if (!isMounted) {
          console.log('[EnhancedAuthProvider] 🚫 컴포넌트 언마운트됨, 초기화 중단');
          return;
        }

        console.log('[EnhancedAuthProvider] 👤 세션 처리 시작:', {
          hasSession: !!session,
          userId: session?.user?.id || 'none'
        });

        // 세션 상태 업데이트
        await handleSession(session);
        
        // 사용자별 프로필 캐시 워밍업
        if (session?.user?.id) {
          console.log('[EnhancedAuthProvider] 👤 프로필 조회 시작');
          await fetchUserProfile(session.user.id);
        }

        // Auth state change listener 설정
        console.log('[EnhancedAuthProvider] 👂 인증 상태 리스너 설정');
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[EnhancedAuthProvider] 🔔 인증 상태 변경:', {
              event,
              hasSession: !!session,
              userId: session?.user?.id || 'none',
              timestamp: new Date().toISOString()
            });
            
            if (isMounted) {
              await handleSession(session);
            }
          }
        );

        if (!isMounted) {
          console.log('[EnhancedAuthProvider] 🚫 컴포넌트 언마운트됨, 구독 해제');
          subscription.unsubscribe();
          return;
        }

        // 구독 정리 함수 저장
        authSubscription.current = { data: { subscription } };
        
        console.log('[EnhancedAuthProvider] ✅ 초기화 완료:', {
          isLoading: false,
          isInitialized: true,
          hasUser: !!session?.user,
          subscriptionActive: true
        });
        
        setIsLoading(false);
        setIsInitialized(true);

      } catch (error) {
        console.error('[EnhancedAuthProvider] ❌ 초기화 실패:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack?.substring(0, 200) : 'No stack',
          type: typeof error,
          isMounted
        });
        
        if (isMounted) {
          setIsLoading(false);
          setError(error instanceof Error ? error.message : '인증 초기화 실패');
          
          // 5초 후 재시도
          console.log('[EnhancedAuthProvider] 🔄 5초 후 재시도 예약');
          initTimeout = setTimeout(() => {
            if (isMounted) {
              console.log('[EnhancedAuthProvider] 🔄 재시도 실행');
              initializationAttempted.current = false;
              setError(null);
              initializeAuth();
            }
          }, 5000);
        }
      }
    };

    // 초기화 실행
    console.log('[EnhancedAuthProvider] 🎬 초기화 함수 호출');
    initializeAuth();

    // 정리 함수
    return () => {
      console.log('[EnhancedAuthProvider] 🧹 useEffect 정리 시작');
      isMounted = false;
      if (initTimeout) {
        console.log('[EnhancedAuthProvider] ⏰ 타임아웃 취소');
        clearTimeout(initTimeout);
      }
      if (authSubscription.current) {
        console.log('[EnhancedAuthProvider] 📴 인증 구독 해제');
        authSubscription.current.data.subscription.unsubscribe();
      }
    };
  }, [supabase.auth, handleSession]);

  // 🔍 강제 초기화 타이머 (10초 후)
  useEffect(() => {
    console.log('[EnhancedAuthProvider] ⏰ 강제 초기화 타이머 설정 (10초)');
    const forceInitTimer = setTimeout(() => {
      console.log('[EnhancedAuthProvider] 🚨 10초 경과 - 강제 초기화 시도');
      if (!isInitialized) {
        console.log('[EnhancedAuthProvider] 🔄 강제로 초기화 상태 변경');
        setIsLoading(false);
        setIsInitialized(true);
        setError('초기화 타임아웃으로 인한 강제 완료');
      }
    }, 10000);

    return () => {
      console.log('[EnhancedAuthProvider] ⏰ 강제 초기화 타이머 제거');
      clearTimeout(forceInitTimer);
    };
  }, [isInitialized]);  // isInitialized 의존성으로 한 번만 실행

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
  if (!context) {
    throw new Error('useEnhancedAuth는 EnhancedAuthProvider 내부에서 사용해야 합니다');
  }
  return context;
}

// 기존 코드와의 호환성을 위해 useAuth로도 export
export const useAuth = useEnhancedAuth; 