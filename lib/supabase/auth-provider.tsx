'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { User, Session, Provider } from '@supabase/supabase-js';
import {
  createBrowserSupabaseClient,
  signOut as supabaseSignOut,
} from './client';
import { Database } from '@/types/supabase';
import { UserProfiles } from '@/types/interfaces';
import { extractAvatarFromProvider, isValidImageUrl } from '@/utils/image-utils';

// 프로필 캐시 저장소 (메모리 내 캐싱)
const profileCache = new Map<
  string,
  { profile: UserProfiles; timestamp: number }
>();
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
  signInWithOAuth: (
    provider: 'google' | 'apple' | 'kakao' | 'wechat',
  ) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<{ error: Error | null; data: { user: User | null } }>;
  signOut: () => Promise<{ success: boolean; error?: unknown }>;
  refreshSession: () => Promise<void>;

  // 프로필 관리
  updateUserProfile: (
    profile: Partial<UserProfiles>,
  ) => Promise<{ success: boolean; error?: unknown }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: React.ReactNode;
  initialSession?: Session | null;
};

export function AuthProvider({ children, initialSession }: AuthProviderProps) {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [session, setSession] = useState<Session | null>(
    initialSession || null,
  );
  const [user, setUser] = useState<User | null>(initialSession?.user || null);
  const [userProfile, setUserProfile] = useState<UserProfiles | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!session?.user);

  // 사용자 프로필 정보 가져오기 (동기적 처리)
  // 🚫 DB 조회 완전 제거됨 - 성능 문제로 fetchUserProfile 함수 삭제
  // 이제 기본 프로필 생성만 사용하여 즉시 로딩 완료

  // 세션 검증 함수 (즉시 처리)
  const validateSession = (session: Session): Session => {
    if (session && session.access_token && session.user?.id) {
      console.log('✅ [AuthProvider] 세션 검증 완료:', {
        userId: session.user.id,
        hasAccessToken: !!session.access_token,
      });
      return session;
    }
    
    console.warn('⚠️ [AuthProvider] 세션이 불완전하지만 계속 진행');
    return session;
  };

  // 세션 기반 즉시 프로필 생성 (DB 조회 없음)
  const createSessionBasedProfile = async (
    userId: string, 
    currentSession: Session | null, 
    timestamp: number
  ): Promise<UserProfiles | null> => {
    try {
      if (currentSession?.user?.id === userId) {
        const user = currentSession.user;
        const email = user.email || null;
        
        // 세션에서 가져올 수 있는 정보들
        const userMetadata = user.user_metadata || {};
        const appMetadata = user.app_metadata || {};
        
        // 소셜 로그인에서 제공되는 정보 활용
        const displayName = userMetadata.full_name || userMetadata.name || userMetadata.display_name;
        
        // 🖼️ 제공자별 최적화된 아바타 URL 추출
        const provider = appMetadata.provider;
        const extractedAvatarUrl = extractAvatarFromProvider(userMetadata, provider);
        
        // URL 검증 후 안전한 URL만 사용
        const avatarUrl = extractedAvatarUrl && isValidImageUrl(extractedAvatarUrl) 
          ? extractedAvatarUrl 
          : null;
          
        const defaultNickname = displayName || (email ? email.split('@')[0] : `user_${userId.slice(-8)}`);
        
        // 세션 기반 즉시 프로필 (DB 조회 불필요)
        const sessionProfile: UserProfiles = {
          id: userId,
          email: email,
          nickname: defaultNickname,
          avatar_url: avatarUrl || null,
          is_admin: false, // 기본값 (필요시 별도 조회)
          star_candy: 0,   // 기본값 (필요시 별도 조회)
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // 추가 정보는 필요시 지연 로딩
        } as UserProfiles;

        console.log('⚡ [AuthProvider] 세션 기반 프로필 생성 완료:', {
          nickname: sessionProfile.nickname,
          avatarUrl: sessionProfile.avatar_url,
          hasAvatar: !!sessionProfile.avatar_url,
          provider: appMetadata.provider,
          source: '세션 기반 (DB 조회 없음)'
        });

        // 🔍 디버깅: 세션에서 사용 가능한 모든 이미지 관련 데이터 로깅
        console.log('🖼️ [AuthProvider] 세션 이미지 데이터 분석:', {
          provider: provider,
          extractedUrl: extractedAvatarUrl,
          isValidUrl: extractedAvatarUrl ? isValidImageUrl(extractedAvatarUrl) : false,
          finalAvatarUrl: avatarUrl,
          availableImageFields: {
            avatar_url: userMetadata.avatar_url,
            picture: userMetadata.picture,
            photo: userMetadata.photo,
            image: userMetadata.image,
            profile_image_url: userMetadata.profile_image_url,
            profile_picture: userMetadata.profile_picture,
          },
          // 민감한 전체 메타데이터는 개발 환경에서만 로깅
          ...(process.env.NODE_ENV === 'development' && {
            fullUserMetadata: userMetadata
          })
        });
        
        profileCache.set(userId, {
          profile: sessionProfile,
          timestamp,
        });
        setUserProfile(sessionProfile);
        return sessionProfile;
      }

      setUserProfile(null);
      return null;
    } catch (error) {
      console.error('[AuthProvider] 세션 기반 프로필 생성 오류:', error);
      setUserProfile(null);
      return null;
    }
  };

    // 인증 상태 처리 함수 - 스마트 프로필 로딩
  const handleSession = useCallback(
    async (newSession: Session | null, skipProfileLoad = false) => {
      try {
        console.log('🔄 [AuthProvider] 세션 처리 시작:', {
          hasSession: !!newSession,
          userId: newSession?.user?.id,
          userEmail: newSession?.user?.email,
          sessionExpiry: newSession?.expires_at,
          skipProfileLoad,
          timestamp: new Date().toISOString(),
        });

        // 1. 기본 세션 상태 설정
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setIsAuthenticated(!!newSession?.user);

        // 2. 세션이 있고 프로필 로딩을 건너뛰지 않는 경우에만 프로필 로딩
        if (newSession?.user && !skipProfileLoad) {
          console.log('👤 [AuthProvider] 로그인 시점 프로필 로딩 시작 - 동기적 처리');
          
          // 로그인 시점에서는 항상 최신 프로필을 로드하여 캐시에 저장
          // 🚀 DB 조회 완전 우회 - 성능 문제로 인한 즉시 기본 프로필 생성
          try {
            console.log('🚀 [AuthProvider] DB 조회 우회 - 즉시 기본 프로필 생성 (성능 최적화)');
            const profileStart = Date.now();
            
            // DB 조회 없이 바로 세션 기반 프로필 생성
            await createSessionBasedProfile(newSession.user.id, newSession, Date.now());
            
            const profileDuration = Date.now() - profileStart;
            console.log(`⚡ [AuthProvider] 기본 프로필 생성 완료 (${profileDuration}ms) - DB 조회 우회`);
            
          } catch (profileError) {
            console.error('❌ [AuthProvider] 기본 프로필 생성 실패:', profileError);
            
            // 기본 프로필 생성도 실패 시 null로 유지 (인증 상태는 유지)
            setUserProfile(null);
            console.warn('⚠️ [AuthProvider] 프로필 없이 인증 상태만 유지');
          }
        } else if (!newSession?.user) {
          console.log('🚫 [AuthProvider] 세션 없음 - 프로필 초기화');
          setUserProfile(null);
        } else if (skipProfileLoad) {
          console.log('⏩ [AuthProvider] 프로필 로딩 건너뛰기 - 캐시 확인');
          
          // INITIAL_SESSION 이벤트에서도 캐시된 프로필이 있으면 설정
          const cached = profileCache.get(newSession.user.id);
          const now = Date.now();
          
          if (cached && now - cached.timestamp < CACHE_TTL) {
            console.log('✅ [AuthProvider] INITIAL_SESSION - 캐시된 프로필 사용');
            setUserProfile(cached.profile);
          } else {
            console.log('🔄 [AuthProvider] INITIAL_SESSION - 캐시 없음, 기본 프로필 생성');
            try {
              await createSessionBasedProfile(newSession.user.id, newSession, now);
              console.log('✅ [AuthProvider] INITIAL_SESSION - 세션 기반 프로필 생성 완료');
            } catch (defaultError) {
              console.warn('⚠️ [AuthProvider] INITIAL_SESSION - 세션 기반 프로필 생성 실패:', defaultError);
              setUserProfile(null);
            }
          }
        }

        // 3. 모든 처리 완료 후 로딩 상태 해제
        setIsLoading(false);
        
        // 4. 초기화 완료 처리 (로그인 성공 시 즉시 완료)
        if (!isInitialized) {
          setIsInitialized(true);
          console.log('🎯 [AuthProvider] 세션 처리로 초기화 완료');
        }

        console.log('✅ [AuthProvider] 세션 처리 완료:', {
          isAuthenticated: !!newSession?.user,
          hasProfile: !!userProfile,
          isLoading: false,
          isInitialized: true,
        });

      } catch (error) {
        console.error('❌ [AuthProvider] 세션 처리 중 치명적 오류:', error);
        
        // 치명적 오류 시에도 최소한의 인증 상태는 설정
        if (newSession?.user) {
          console.log('🔧 [AuthProvider] 오류 복구 - 최소 인증 상태 유지');
          setSession(newSession);
          setUser(newSession.user);
          setIsAuthenticated(true);
          setError(null); // 사용자에게는 에러 표시하지 않음
        } else {
          setSession(null);
          setUser(null);
          setIsAuthenticated(false);
          setError(error instanceof Error ? error.message : '세션 처리 오류');
        }
        
        // 오류 상황에서도 로딩 및 초기화 상태 정리
        setIsLoading(false);
        if (!isInitialized) {
          setIsInitialized(true);
        }
      } finally {
        console.log('🏁 [AuthProvider] 세션 처리 최종 완료');
      }
    },
    [isInitialized, userProfile],
  );

  // 초기 세션 로드 (한 번만 실행)
  useEffect(() => {
    let isMounted = true;
    let initTimeout: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        // 이미 초기화가 완료되었거나 진행 중이면 건너뛰기
        if (isInitialized) {
          console.log('✅ [AuthProvider] 이미 초기화 완료 - 건너뛰기');
          return;
        }
        
        // 이미 인증된 상태라면 가벼운 확인만 수행
        if (isAuthenticated && user) {
          console.log('🔄 [AuthProvider] 이미 인증된 상태 - 빠른 초기화');
          setIsLoading(false);
          setIsInitialized(true);
          return;
        }
        
        console.log('🔄 [AuthProvider] 빠른 초기화 시작');
        setIsLoading(true);

        // 간단한 세션 조회 (2초 타임아웃)
        console.log('🔍 [AuthProvider] 세션 조회 시작');
        const sessionStart = Date.now();
        
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('세션 조회 타임아웃 (2초)')), 2000);
        });

        const {
          data: { session: currentSession },
          error,
        } = (await Promise.race([sessionPromise, timeoutPromise])) as any;
        
        const sessionDuration = Date.now() - sessionStart;
        console.log(`📊 [AuthProvider] 세션 조회 완료 (${sessionDuration}ms)`);

        if (error) {
          console.warn('[AuthProvider] 세션 조회 오류:', error);
          // 오류가 있어도 계속 진행 (비로그인 상태로 처리)
        }

        // 컴포넌트가 언마운트되었으면 상태 업데이트 중단
        if (!isMounted) return;

        console.log('[AuthProvider] 세션 상태:', {
          hasSession: !!currentSession,
          userId: currentSession?.user?.id,
          provider: currentSession?.user?.app_metadata?.provider
        });

                // 로그인 상태 확인 및 캐시된 프로필 사용
        if (currentSession) {
          console.log('👤 [AuthProvider] 세션 발견 - 캐시된 프로필 확인');
          
          // 1. 기본 인증 상태 즉시 설정
          setSession(currentSession);
          setUser(currentSession.user);
          setIsAuthenticated(true);
          
          // 2. 캐시된 프로필이 있는지 확인
          const cached = profileCache.get(currentSession.user.id);
          const now = Date.now();
          
          if (cached && now - cached.timestamp < CACHE_TTL) {
            console.log('✅ [AuthProvider] 캐시된 프로필 사용 - 즉시 완료');
            setUserProfile(cached.profile);
            setIsLoading(false);
            setIsInitialized(true);
            
            console.log('🎯 [AuthProvider] 캐시를 통한 빠른 초기화 완료');
          } else {
            console.log('🔄 [AuthProvider] 캐시 없음 - 기본 프로필 생성');
            
            // 캐시가 없으면 세션 기반 프로필 생성으로 즉시 완료
            try {
              await createSessionBasedProfile(currentSession.user.id, currentSession, now);
              console.log('✅ [AuthProvider] 세션 기반 프로필 생성 완료');
            } catch (defaultError) {
              console.warn('⚠️ [AuthProvider] 세션 기반 프로필 생성 실패 - 프로필 없이 진행:', defaultError);
              setUserProfile(null);
            }
            
            setIsLoading(false);
            setIsInitialized(true);
            console.log('🎯 [AuthProvider] 기본 프로필로 초기화 완료');
          }
        } else {
          // 세션이 없으면 비로그인 상태로 설정
          setSession(null);
          setUser(null);
          setUserProfile(null);
          setIsAuthenticated(false);
          setIsLoading(false);
          setIsInitialized(true);
          
          console.log('✅ [AuthProvider] 비로그인 상태 설정 완료');
        }

      } catch (error) {
        if (!isMounted) return;

        console.warn('[AuthProvider] 초기화 오류 (계속 진행):', error);
        // 오류가 있어도 비로그인 상태로 초기화 완료
        setSession(null);
        setUser(null);
        setUserProfile(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        setIsInitialized(true);
        setError(null); // 초기화 오류는 사용자에게 표시하지 않음
      }
    };



    // 5초 후에도 초기화가 완료되지 않으면 강제로 완료 처리
    initTimeout = setTimeout(() => {
      if (isMounted && !isInitialized) {
        console.warn('[AuthProvider] 초기화 타임아웃 (5초) - 강제 완료');
        setIsLoading(false);
        setIsInitialized(true);
        setError(null); // 타임아웃 오류는 사용자에게 표시하지 않음
      }
    }, 5000);

    initializeAuth();

    return () => {
      isMounted = false;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
    };
  }, []);

  // 인증 상태 변경 구독 (별도 useEffect)
  useEffect(() => {
    let lastProcessedEventTime = 0;
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const currentTime = Date.now();
      
      console.log('🔔 [AuthProvider] 인증 상태 변경 감지:', {
        event,
        hasSession: !!newSession,
        userId: newSession?.user?.id,
        userEmail: newSession?.user?.email,
        provider: newSession?.user?.app_metadata?.provider,
        timestamp: new Date().toISOString(),
      });

      // 중복 이벤트 처리 방지 (500ms 내의 중복 이벤트 무시)
      if (currentTime - lastProcessedEventTime < 500) {
        console.log('⏩ [AuthProvider] 중복 이벤트 무시 (500ms 내 중복)');
        return;
      }
      lastProcessedEventTime = currentTime;

      // INITIAL_SESSION은 프로필 로딩을 건너뛰도록 처리 (중복 방지)
      const shouldSkipProfileLoad = event === 'INITIAL_SESSION';
      
      await handleSession(newSession, shouldSkipProfileLoad);

      // 세션이 생성되었을 때 로컬 스토리지에 저장
      if (event === 'SIGNED_IN' && newSession) {
        console.log('✅ [AuthProvider] 로그인 성공 - 로컬 스토리지 저장');
        try {
          localStorage.setItem('auth_success', 'true');
          localStorage.setItem(
            'auth_provider',
            newSession.user?.app_metadata?.provider || 'unknown',
          );
          localStorage.setItem('auth_timestamp', Date.now().toString());
          console.log('💾 [AuthProvider] 로컬 스토리지 저장 완료:', {
            auth_success: 'true',
            auth_provider: newSession.user?.app_metadata?.provider || 'unknown',
            auth_timestamp: Date.now().toString(),
          });
        } catch (e) {
          console.warn('⚠️ [AuthProvider] 로컬 스토리지 저장 오류:', e);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('🚪 [AuthProvider] 로그아웃 감지');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 [AuthProvider] 토큰 갱신 감지');
      }
    });

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

  const signInWithOAuth = async (
    provider: 'google' | 'apple' | 'kakao' | 'wechat',
  ) => {
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
      const {
        data: { session },
        error,
      } = await supabase.auth.refreshSession();

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
      const updatedProfile = userProfile
        ? { ...userProfile, ...profile }
        : null;
      setUserProfile(updatedProfile);

      // 캐시 업데이트
      if (updatedProfile) {
        profileCache.set(currentUserId, {
          profile: updatedProfile,
          timestamp: Date.now(),
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

  // signOut 메서드 개선 - 프로필 캐시 정리 포함
  const signOut = useCallback(async () => {
    try {
      console.log('🚪 [AuthProvider] signOut 시작');
      setIsLoading(true);
      setError(null);

      // 1. 현재 사용자 정보 로깅 (로그아웃 전)
      if (user) {
        console.log('👤 [AuthProvider] 로그아웃 사용자:', {
          userId: user.id,
          email: user.email,
          provider: user.app_metadata?.provider,
        });
      }

      // 2. UI 상태 즉시 초기화 (빠른 피드백)
      setSession(null);
      setUser(null);
      setUserProfile(null);
      setIsAuthenticated(false);

      // 3. 프로필 캐시 완전 정리
      try {
        profileCache.clear();
        console.log('✅ [AuthProvider] 프로필 캐시 정리 완료');
      } catch (e) {
        console.warn('⚠️ [AuthProvider] 프로필 캐시 정리 오류:', e);
      }

      // 4. 로그아웃 전 localStorage 상태 진단
      const preLogoutDiagnosis = diagnoseLocalStorage();
      console.log('🔍 [AuthProvider] 로그아웃 전 localStorage 진단:', preLogoutDiagnosis);

      // 5. 종합적인 로그아웃 실행 (supabaseSignOut 호출)
      const result = await supabaseSignOut();
      
      if (result.success) {
        console.log('✅ [AuthProvider] 종합 로그아웃 성공:', result.message);
      } else {
        console.warn('⚠️ [AuthProvider] 로그아웃 중 일부 오류:', result.error);
        // 오류가 있어도 UI 상태는 이미 초기화되었으므로 계속 진행
      }

      // 6. 추가적인 localStorage 정리 (강화된 버전)
      await performAdditionalCleanup();

      // 7. 로그아웃 후 localStorage 상태 진단
      const postLogoutDiagnosis = diagnoseLocalStorage();
      console.log('🔍 [AuthProvider] 로그아웃 후 localStorage 진단:', postLogoutDiagnosis);

      // 8. 정리되지 않은 항목들에 대한 강제 정리 시도
      if (postLogoutDiagnosis.authRelatedCount > 0) {
        console.warn('⚠️ [AuthProvider] 일부 인증 데이터가 남아있음 - 강제 정리 시도');
        await forceCleanRemainingAuthData(postLogoutDiagnosis.authRelatedKeys);
        
        // 최종 진단
        const finalDiagnosis = diagnoseLocalStorage();
        console.log('🔍 [AuthProvider] 최종 localStorage 진단:', finalDiagnosis);
      }

      // 9. 최종 상태 확인 및 정리
      setIsLoading(false);
      setError(null); // 로그아웃 오류는 사용자에게 표시하지 않음
      
      console.log('✅ [AuthProvider] signOut 완료');
      
      return result;
      
    } catch (error) {
      console.error('❌ [AuthProvider] signOut 중 예외:', error);
      
      // 예외가 발생해도 UI 상태는 초기화
      setSession(null);
      setUser(null);
      setUserProfile(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      
      // 프로필 캐시 정리 재시도
      try {
        profileCache.clear();
      } catch (e) {
        console.warn('⚠️ [AuthProvider] 예외 시 프로필 캐시 정리 오류:', e);
      }

      // 예외 상황에서도 강제 localStorage 정리 시도
      try {
        await performEmergencyCleanup();
      } catch (cleanupError) {
        console.error('💥 [AuthProvider] 응급 정리마저 실패:', cleanupError);
      }
      
      // 예외가 발생해도 성공으로 처리 (UI는 이미 로그아웃 상태)
      const result = { 
        success: true, 
        error,
        message: '로그아웃 중 오류가 발생했지만 인증 상태는 초기화되었습니다.'
      };
      
      return result;
    }
  }, [user, supabaseSignOut]);

  // localStorage 진단 함수
  const diagnoseLocalStorage = () => {
    if (typeof window === 'undefined') {
      return { authRelatedCount: 0, authRelatedKeys: [], totalKeys: 0 };
    }

    const authRelatedKeys: string[] = [];
    const allKeys: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          allKeys.push(key);
          
          // 인증 관련 키워드 패턴 확장
          const authPatterns = [
            'supabase', 'auth', 'login', 'session', 'token', 'jwt', 
            'oauth', 'wechat', 'google', 'kakao', 'apple', 'user',
            'profile', 'sb-', 'bearer', 'refresh', 'access'
          ];
          
          if (authPatterns.some(pattern => key.toLowerCase().includes(pattern))) {
            authRelatedKeys.push(key);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [AuthProvider] localStorage 진단 중 오류:', e);
    }

    return {
      authRelatedCount: authRelatedKeys.length,
      authRelatedKeys,
      totalKeys: allKeys.length,
      allKeys
    };
  };

  // 추가적인 localStorage 정리 함수
  const performAdditionalCleanup = async (): Promise<void> => {
    if (typeof window === 'undefined') return;

    try {
      console.log('🧹 [AuthProvider] 추가 스토리지 정리 시작');

      // 1. localStorage 정리
      await cleanupLocalStorage();
      
      // 2. sessionStorage 정리
      await cleanupSessionStorage();
      
      // 3. 쿠키 정리
      await cleanupCookies();

      console.log('✅ [AuthProvider] 추가 스토리지 정리 완료');

    } catch (e) {
      console.warn('⚠️ [AuthProvider] 추가 정리 중 오류:', e);
    }
  };

  // localStorage 정리 함수
  const cleanupLocalStorage = async (): Promise<void> => {
    try {
      console.log('🧹 [AuthProvider] localStorage 정리 시작');

      // Supabase SDK가 사용할 수 있는 모든 키 패턴
      const additionalPatterns = [
        // Supabase 내부 키들
        'sb-',
        'supabase-auth-token',
        'supabase.auth.',
        'postgrest',
        
        // 인증 상태 관련
        'auth_session_active',
        'auth_provider',
        'auth_timestamp',
        'auth_success',
        'isAuthenticated',
        'currentUser',
        'authUser',
        
        // 소셜 로그인 상태
        'oauth_state',
        'oauth_verifier',
        'oauth_token',
        'wechat_',
        'google_auth',
        'kakao_auth',
        'apple_auth',
        
        // 리다이렉트 관련
        'redirect_url',
        'auth_redirect',
        'login_redirect',
        'return_url',
        'postLoginRedirect',
        
        // 프로필 캐시
        'user_profile',
        'profile_cache',
        'userCache',
        
        // 기타 세션 데이터
        'sessionToken',
        'accessToken',
        'refreshToken',
        'bearerToken',
        'jwtToken'
      ];

      let cleanedCount = 0;
      const keysToClean: string[] = [];

      // 현재 저장된 모든 키 검사
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key) {
          // 패턴 매칭으로 정리할 키 찾기
          if (additionalPatterns.some(pattern => key.includes(pattern))) {
            keysToClean.push(key);
          }
        }
      }

      // 찾은 키들 정리
      for (const key of keysToClean) {
        try {
          localStorage.removeItem(key);
          cleanedCount++;
          console.log(`🗑️ [AuthProvider] localStorage 정리: ${key}`);
        } catch (e) {
          console.warn(`⚠️ [AuthProvider] localStorage 키 정리 실패: ${key}`, e);
        }
      }

      console.log(`✅ [AuthProvider] localStorage 정리 완료: ${cleanedCount}개 키 정리`);

    } catch (e) {
      console.warn('⚠️ [AuthProvider] localStorage 정리 중 오류:', e);
    }
  };

  // sessionStorage 정리 함수
  const cleanupSessionStorage = async (): Promise<void> => {
    try {
      console.log('🧹 [AuthProvider] sessionStorage 정리 시작');

      const sessionPatterns = [
        'auth', 'login', 'oauth', 'supabase', 'session', 'token',
        'redirect', 'wechat', 'google', 'kakao', 'apple', 'user',
        'profile', 'sb-', 'jwt', 'bearer', 'refresh', 'access'
      ];

      let sessionCleanedCount = 0;
      const sessionKeysToClean: string[] = [];

      // sessionStorage 키 검사
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && sessionPatterns.some(pattern => key.toLowerCase().includes(pattern))) {
          sessionKeysToClean.push(key);
        }
      }

      // sessionStorage 키 정리
      for (const key of sessionKeysToClean) {
        try {
          sessionStorage.removeItem(key);
          sessionCleanedCount++;
          console.log(`🗑️ [AuthProvider] sessionStorage 정리: ${key}`);
        } catch (e) {
          console.warn(`⚠️ [AuthProvider] sessionStorage 키 정리 실패: ${key}`, e);
        }
      }

      console.log(`✅ [AuthProvider] sessionStorage 정리 완료: ${sessionCleanedCount}개 키 정리`);

    } catch (e) {
      console.warn('⚠️ [AuthProvider] sessionStorage 정리 중 오류:', e);
    }
  };

  // 강화된 쿠키 정리 함수
  const cleanupCookies = async (): Promise<void> => {
    try {
      console.log('🧹 [AuthProvider] 강화된 쿠키 정리 시작');
      
      // 0. 현재 쿠키 상태 로깅
      console.log('🔍 [AuthProvider] 정리 전 현재 쿠키:', document.cookie);

      // 1. 모든 인증 관련 쿠키 검색 및 수집
      const allAuthCookies = new Set<string>();
      
      // 기본 쿠키 목록
      const basicCookiesToClear = [
        // Supabase 관련 쿠키
        'supabase-auth-token',
        'sb-auth-token', 
        'supabase.auth.token',
        
        // 일반 인증 쿠키
        'auth-token',
        'access-token',
        'refresh-token',
        'session-token',
        'jwt-token',
        'bearer-token',
        
        // 소셜 로그인 쿠키
        'oauth-token',
        'oauth-state',
        'wechat-token',
        'google-auth',
        'kakao-auth',
        'apple-auth',
        
        // 세션 관련
        'session-id',
        'auth-session',
        'login-session',
        
        // 리다이렉트 관련
        'auth-redirect',
        'login-redirect',
        'return-url'
      ];

      // 기본 쿠키들 추가
      basicCookiesToClear.forEach(cookie => allAuthCookies.add(cookie));

      // 2. 현재 존재하는 모든 쿠키에서 인증 관련 쿠키 찾기
      try {
        if (document.cookie) {
          const cookiePairs = document.cookie.split(';');
          
          for (const cookiePair of cookiePairs) {
            const [fullName] = cookiePair.trim().split('=');
            const name = fullName?.trim();
            
            if (name && (
              // Supabase 분할 쿠키 패턴들
              /^sb-[a-z0-9]{20}-auth-token(\.\d+)?$/.test(name) ||
              /^supabase-auth-token/.test(name) ||
              // 기타 인증 관련 패턴들 (대소문자 구분 없이)
              name.toLowerCase().includes('auth') ||
              name.toLowerCase().includes('token') ||
              name.toLowerCase().includes('session') ||
              name.toLowerCase().includes('supabase') ||
              name.toLowerCase().includes('oauth') ||
              name.toLowerCase().includes('login') ||
              name.toLowerCase().includes('sb-')
            )) {
              allAuthCookies.add(name);
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ [AuthProvider] 현재 쿠키 검사 중 오류:', e);
      }

      // 3. Supabase 프로젝트 ID 추출 및 분할 쿠키 추가
      try {
        let projectIds: string[] = [];
        
        // 환경변수에서 프로젝트 ID 추출
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          const urlMatch = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/);
          if (urlMatch) {
            projectIds.push(urlMatch[1]);
            console.log('🔍 [AuthProvider] 환경변수에서 Supabase 프로젝트 ID 추출:', urlMatch[1]);
          }
        }
        
        // 현재 쿠키에서 프로젝트 ID들 추출 (여러 개 있을 수 있음)
        const cookieProjectMatches = document.cookie.match(/sb-([a-z0-9]{20})-auth-token/g);
        if (cookieProjectMatches) {
          cookieProjectMatches.forEach(match => {
            const idMatch = match.match(/sb-([a-z0-9]{20})-auth-token/);
            if (idMatch && !projectIds.includes(idMatch[1])) {
              projectIds.push(idMatch[1]);
              console.log('🔍 [AuthProvider] 쿠키에서 Supabase 프로젝트 ID 추출:', idMatch[1]);
            }
          });
        }
        
        // 각 프로젝트 ID에 대해 분할 쿠키들 추가
        for (const projectId of projectIds) {
          console.log('📋 [AuthProvider] 프로젝트 ID별 쿠키 수집:', projectId);
          
          // 분할 쿠키들 (최대 30개까지 확인 - 큰 토큰 대응)
          for (let i = 0; i <= 30; i++) {
            allAuthCookies.add(`sb-${projectId}-auth-token.${i}`);
          }
          
          // 추가 패턴들
          allAuthCookies.add(`sb-${projectId}-auth-token`);
          allAuthCookies.add(`supabase-auth-token-${projectId}`);
          allAuthCookies.add(`supabase.auth.token.${projectId}`);
        }
      } catch (e) {
        console.warn('⚠️ [AuthProvider] Supabase 프로젝트 쿠키 수집 중 오류:', e);
      }

      console.log('📋 [AuthProvider] 정리할 쿠키 목록 (총 ' + allAuthCookies.size + '개):', Array.from(allAuthCookies));

      // 4. 모든 수집된 쿠키들을 강화된 방법으로 정리
      let totalCleanedCount = 0;
      const cleanedCookies: string[] = [];
      
      for (const cookieName of Array.from(allAuthCookies)) {
        const wasCleanedCount = await clearSingleCookieEnhanced(cookieName);
        if (wasCleanedCount > 0) {
          totalCleanedCount += wasCleanedCount;
          cleanedCookies.push(cookieName);
        }
      }

      // 5. 정리 후 상태 확인
      console.log('🔍 [AuthProvider] 정리 후 남은 쿠키:', document.cookie);
      
      // 6. 여전히 남아있는 인증 쿠키가 있는지 확인
      const remainingAuthCookies: string[] = [];
      if (document.cookie) {
        const remainingCookies = document.cookie.split(';');
        for (const cookie of remainingCookies) {
          const [name] = cookie.trim().split('=');
          if (name && (
            name.toLowerCase().includes('auth') ||
            name.toLowerCase().includes('token') ||
            name.toLowerCase().includes('supabase') ||
            name.toLowerCase().includes('sb-')
          )) {
            remainingAuthCookies.push(name.trim());
          }
        }
      }

      if (remainingAuthCookies.length > 0) {
        console.warn('⚠️ [AuthProvider] 여전히 남아있는 인증 쿠키들:', remainingAuthCookies);
        // 남은 쿠키들에 대해 추가 정리 시도
        for (const cookieName of remainingAuthCookies) {
          await clearSingleCookieEnhanced(cookieName);
        }
      }

      console.log(`✅ [AuthProvider] 강화된 쿠키 정리 완료: ${totalCleanedCount}개 처리, 성공 정리된 쿠키: ${cleanedCookies.length}개`);
      console.log('🧹 [AuthProvider] 정리된 쿠키들:', cleanedCookies);

    } catch (e) {
      console.warn('⚠️ [AuthProvider] 강화된 쿠키 정리 중 오류:', e);
    }
  };

  // 단일 쿠키 정리 헬퍼 함수 (기본)
  const clearSingleCookie = async (cookieName: string): Promise<number> => {
    try {
      let cleared = 0;
      
      // 현재 도메인에서 쿠키 삭제
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      cleared++;
      
      // 서브도메인을 포함한 쿠키 삭제
      const hostname = window.location.hostname;
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${hostname};`;
      cleared++;
      
      // 루트 도메인에서 쿠키 삭제 (예: .example.com)
      const rootDomain = hostname.split('.').slice(-2).join('.');
      if (rootDomain !== hostname) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${rootDomain};`;
        cleared++;
      }
      
      // 다양한 경로에서 쿠키 삭제
      const commonPaths = ['/', '/auth', '/auth/callback'];
      for (const path of commonPaths) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
        cleared++;
      }
      
      console.log(`🗑️ [AuthProvider] 쿠키 정리: ${cookieName} (${cleared}회 시도)`);
      return 1; // 성공적으로 처리된 쿠키 개수
    } catch (e) {
      console.warn(`⚠️ [AuthProvider] 쿠키 정리 실패: ${cookieName}`, e);
      return 0;
    }
  };

  // 강화된 단일 쿠키 정리 함수
  const clearSingleCookieEnhanced = async (cookieName: string): Promise<number> => {
    try {
      // 쿠키가 실제로 존재하는지 먼저 확인
      const cookieExists = document.cookie.split(';').some(
        cookie => cookie.trim().startsWith(`${cookieName}=`)
      );
      
      if (!cookieExists) {
        return 0; // 쿠키가 존재하지 않으면 정리할 필요 없음
      }

      console.log(`🔍 [AuthProvider] 강화된 쿠키 정리 시작: ${cookieName}`);
      
      let totalAttempts = 0;
      const hostname = window.location.hostname;
      
      // 1. 기본 경로들과 도메인 조합으로 정리
      const pathsToTry = [
        '/',
        '/auth',
        '/auth/callback',
        '/api',
        '/api/auth',
        '/login',
        '/logout'
      ];
      
      const domainsToTry = [
        '', // 도메인 지정 없음
        hostname,
        `.${hostname}`,
      ];
      
      // 루트 도메인이 다른 경우 추가
      const parts = hostname.split('.');
      if (parts.length > 2) {
        const rootDomain = parts.slice(-2).join('.');
        domainsToTry.push(`.${rootDomain}`);
      }
      
      // 2. 모든 경로와 도메인 조합으로 쿠키 삭제 시도
      const expireStrings = [
        'Thu, 01 Jan 1970 00:00:00 UTC',
        'Thu, 01 Jan 1970 00:00:00 GMT',
        'Wed, 31 Dec 1969 23:59:59 GMT'
      ];
      
      for (const expireString of expireStrings) {
        for (const path of pathsToTry) {
          for (const domain of domainsToTry) {
            try {
              let cookieString = `${cookieName}=; expires=${expireString}; path=${path};`;
              if (domain) {
                cookieString += ` domain=${domain};`;
              }
              // SameSite와 Secure 속성도 추가 (일부 브라우저에서 필요)
              cookieString += ' SameSite=None; Secure;';
              
              document.cookie = cookieString;
              totalAttempts++;
              
              // 즉시 다시 한번 (속성 없이)
              document.cookie = `${cookieName}=; expires=${expireString}; path=${path};${domain ? ` domain=${domain};` : ''}`;
              totalAttempts++;
              
            } catch (e) {
              // 개별 시도 실패는 무시하고 계속
            }
          }
        }
      }
      
      // 3. 몇 밀리초 후 정리 상태 재확인
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 4. 여전히 남아있는지 확인
      const stillExists = document.cookie.split(';').some(
        cookie => cookie.trim().startsWith(`${cookieName}=`)
      );
      
      if (stillExists) {
        console.warn(`⚠️ [AuthProvider] 쿠키가 여전히 존재함 - 추가 정리 시도: ${cookieName}`);
        
        // 5. 최후의 수단 - 더 공격적인 정리
        for (let i = 0; i < 5; i++) {
          try {
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=; SameSite=None;`;
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            document.cookie = `${cookieName}=; Max-Age=0; path=/;`;
            document.cookie = `${cookieName}=deleted; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            totalAttempts += 4;
          } catch (e) {
            // 무시
          }
        }
        
        // 6. 최종 확인
        await new Promise(resolve => setTimeout(resolve, 100));
        const finalCheck = document.cookie.split(';').some(
          cookie => cookie.trim().startsWith(`${cookieName}=`)
        );
        
        if (finalCheck) {
          console.error(`❌ [AuthProvider] 쿠키 정리 최종 실패: ${cookieName}`);
          return 0;
        } else {
          console.log(`✅ [AuthProvider] 쿠키 정리 최종 성공: ${cookieName} (${totalAttempts}회 시도)`);
          return 1;
        }
      } else {
        console.log(`✅ [AuthProvider] 쿠키 정리 성공: ${cookieName} (${totalAttempts}회 시도)`);
        return 1;
      }
      
    } catch (e) {
      console.error(`❌ [AuthProvider] 강화된 쿠키 정리 실패: ${cookieName}`, e);
      return 0;
    }
  };

  // 남은 인증 데이터 강제 정리 함수
  const forceCleanRemainingAuthData = async (remainingKeys: string[]): Promise<void> => {
    if (typeof window === 'undefined' || remainingKeys.length === 0) return;

    try {
      console.log('🔧 [AuthProvider] 남은 인증 데이터 강제 정리 시작:', remainingKeys);

      let forceCleanedCount = 0;

      for (const key of remainingKeys) {
        try {
          // 3번 시도해서 정리
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              localStorage.removeItem(key);
              // 정리 확인
              if (!localStorage.getItem(key)) {
                forceCleanedCount++;
                console.log(`🗑️ [AuthProvider] 강제 정리 성공 (시도 ${attempt}): ${key}`);
                break;
              }
            } catch (e) {
              console.warn(`⚠️ [AuthProvider] 강제 정리 시도 ${attempt} 실패: ${key}`, e);
              if (attempt < 3) {
                // 짧은 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            }
          }
        } catch (e) {
          console.error(`❌ [AuthProvider] 강제 정리 완전 실패: ${key}`, e);
        }
      }

      console.log(`✅ [AuthProvider] 강제 정리 완료: ${forceCleanedCount}/${remainingKeys.length}개 키 정리`);

    } catch (e) {
      console.error('❌ [AuthProvider] 강제 정리 중 오류:', e);
    }
  };

  // 응급 상황 정리 함수
  const performEmergencyCleanup = async (): Promise<void> => {
    if (typeof window === 'undefined') return;

    try {
      console.log('🚨 [AuthProvider] 응급 스토리지 정리 시작');

      // 1. 가장 중요한 localStorage 키들 우선 정리
      const criticalLocalStorageKeys = [
        'supabase.auth.token',
        'sb-auth-token',
        'auth_session_active',
        'auth_success',
        'currentUser',
        'authUser'
      ];

      let emergencyCleanedCount = 0;

      for (const key of criticalLocalStorageKeys) {
        try {
          localStorage.removeItem(key);
          emergencyCleanedCount++;
          console.log(`🗑️ [AuthProvider] 응급 localStorage 정리: ${key}`);
        } catch (e) {
          console.warn(`⚠️ [AuthProvider] 응급 localStorage 정리 실패: ${key}`, e);
        }
      }

      // 2. localStorage 전체 순회하여 인증 관련 데이터 응급 정리
      try {
        const keysToEmergencyClean: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.includes('auth') || 
            key.includes('supabase') || 
            key.includes('login') ||
            key.includes('token') ||
            key.includes('session')
          )) {
            keysToEmergencyClean.push(key);
          }
        }

        for (const key of keysToEmergencyClean) {
          try {
            localStorage.removeItem(key);
            emergencyCleanedCount++;
          } catch (e) {
            // 무시하고 계속
          }
        }
      } catch (e) {
        console.warn('⚠️ [AuthProvider] localStorage 응급 순회 정리 오류:', e);
      }

      // 3. sessionStorage 응급 정리
      try {
        const sessionKeysToClean: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (
            key.includes('auth') || 
            key.includes('supabase') || 
            key.includes('login') ||
            key.includes('token') ||
            key.includes('session')
          )) {
            sessionKeysToClean.push(key);
          }
        }

        for (const key of sessionKeysToClean) {
          try {
            sessionStorage.removeItem(key);
            emergencyCleanedCount++;
            console.log(`🗑️ [AuthProvider] 응급 sessionStorage 정리: ${key}`);
          } catch (e) {
            // 무시하고 계속
          }
        }
      } catch (e) {
        console.warn('⚠️ [AuthProvider] sessionStorage 응급 정리 오류:', e);
      }

      // 4. 가장 중요한 쿠키들 응급 정리
      try {
        const criticalCookies = [
          'supabase-auth-token',
          'sb-auth-token',
          'auth-token',
          'session-token',
          'access-token',
          'refresh-token'
        ];

        for (const cookieName of criticalCookies) {
          try {
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            emergencyCleanedCount++;
            console.log(`🗑️ [AuthProvider] 응급 쿠키 정리: ${cookieName}`);
          } catch (e) {
            // 무시하고 계속
          }
        }
      } catch (e) {
        console.warn('⚠️ [AuthProvider] 쿠키 응급 정리 오류:', e);
      }

      console.log(`✅ [AuthProvider] 응급 정리 완료: 총 ${emergencyCleanedCount}개 항목 정리`);

    } catch (e) {
      console.error('💥 [AuthProvider] 응급 정리 중 오류:', e);
      
      // 최후의 수단: 가능한 모든 스토리지를 완전 정리 시도
      try {
        console.log('🚨 [AuthProvider] 최후의 수단: 전체 스토리지 정리 시도');
        localStorage.clear();
        sessionStorage.clear();
        console.log('✅ [AuthProvider] 전체 스토리지 정리 완료');
      } catch (finalError) {
        console.error('💥 [AuthProvider] 전체 스토리지 정리마저 실패:', finalError);
      }
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
        signOut,
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

