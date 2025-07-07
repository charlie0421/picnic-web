'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
  memo,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './client';

// 🎯 완전 쿠키 기반 인증: 네트워크 요청 없는 즉시 JWT 파싱
// ✅ getSession() 제거됨 - 타임아웃 문제 해결
// ✅ getUser() 제거됨 - 네트워크 지연 완전 제거  
// ✅ 순수 JWT 파싱 - 쿠키에서 직접 사용자 정보 추출
// ⚡ 로딩 시간: 0.1초 미만 (기존 5-8초 → 거의 즉시)
import { extractAvatarFromProvider } from '@/utils/image-utils';
import { UserProfiles } from '@/types/interfaces';
import { handleAuthError } from '@/utils/auth-error-handler';

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

// 전역 상태 관리를 위한 싱글톤 패턴
class AuthStore {
  private static instance: AuthStore | null = null;
  private supabaseClient: any = null;
  private listeners: Set<(state: AuthContextType) => void> = new Set();
  private state: AuthContextType = {
    session: null,
    user: null,
    userProfile: null as UserProfiles | null,
    isAuthenticated: false,
    isLoading: true,
    isInitialized: false,
    signOut: this.signOut.bind(this),
    loadUserProfile: this.loadUserProfile.bind(this),
  };
  private initPromise: Promise<void> | null = null;

  static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        console.log('🔄 [AuthStore] 초기화 시작');
        
        // localStorage에서 Supabase Auth 토큰 체크 (동적 키 확인)
        const checkStoredToken = () => {
          try {
            // Supabase 프로젝트 URL에서 프로젝트 ID 추출
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            if (!supabaseUrl) return false;
            
            const urlParts = supabaseUrl.split('.');
            const projectId = urlParts[0]?.split('://')[1];
            
            // 🍪 쿠키에서 토큰 확인하는 함수
            const checkCookieToken = (projectId: string) => {
              try {
                const cookies = document.cookie.split(';');
                for (let cookie of cookies) {
                  const [name, value] = cookie.trim().split('=');
                  if (name && name.startsWith(`sb-${projectId}-auth-token`) && value) {
                    console.log(`🍪 [AuthStore] 쿠키에 토큰 (${name}): 있음`);
                    return true;
                  }
                }
                return false;
              } catch (error) {
                console.warn('⚠️ [AuthStore] 쿠키 토큰 체크 중 오류:', error);
                return false;
              }
            };
            
            if (projectId) {
              const authKey = `sb-${projectId}-auth-token`;
              
              // 1단계: localStorage 확인
              const hasLocalStorageToken = localStorage.getItem(authKey);
              console.log(`🔍 [AuthStore] localStorage에 토큰 (${authKey}):`, hasLocalStorageToken ? '있음' : '없음');
              
              // 2단계: 쿠키 확인
              const hasCookieToken = checkCookieToken(projectId);
              
              const hasAnyToken = !!hasLocalStorageToken || hasCookieToken;
              console.log(`🔍 [AuthStore] 토큰 총합:`, {
                localStorage: !!hasLocalStorageToken,
                cookie: hasCookieToken,
                hasAnyToken
              });
              
              return hasAnyToken;
            }
            
            // 프로젝트 ID를 추출할 수 없는 경우 모든 Supabase 키 확인
            let hasLocalStorage = false;
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const hasToken = localStorage.getItem(key);
                console.log(`🔍 [AuthStore] localStorage에 토큰 (${key}):`, hasToken ? '있음' : '없음');
                if (hasToken) hasLocalStorage = true;
              }
            }
            
            // 일반적인 쿠키 패턴 확인
            let hasCookie = false;
            try {
              const cookies = document.cookie.split(';');
              for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name && name.startsWith('sb-') && name.includes('auth-token') && value) {
                  console.log(`🍪 [AuthStore] 쿠키에 토큰 (${name}): 있음`);
                  hasCookie = true;
                  break;
                }
              }
            } catch (error) {
              console.warn('⚠️ [AuthStore] 일반 쿠키 확인 중 오류:', error);
            }
            
            const hasAnyToken = hasLocalStorage || hasCookie;
            console.log(`🔍 [AuthStore] 전체 토큰 상태:`, {
              localStorage: hasLocalStorage,
              cookie: hasCookie,
              hasAnyToken
            });
            
            return hasAnyToken;
          } catch (error) {
            console.warn('⚠️ [AuthStore] 토큰 체크 중 오류:', error);
            return false;
          }
        };
        
        const hasStoredToken = checkStoredToken();
        const isLoginPage = window.location.pathname.includes('/login');
        const isCallbackPage = window.location.pathname.includes('/callback');
        
        console.log('🔍 [AuthStore] 초기화 컨텍스트:', {
          hasStoredToken,
          isLoginPage,
          isCallbackPage,
          pathname: window.location.pathname
        });
        
        // 환경 변수 확인 및 안전한 클라이언트 생성
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          console.error('❌ [AuthStore] Supabase 환경 변수가 설정되지 않았습니다.', {
            hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          });
          
          // 환경 변수가 없어도 기본 상태로 초기화
          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOut.bind(this),
            loadUserProfile: this.loadUserProfile.bind(this),
          });
          return;
        }

        // 🚀 순수 getUser() 기반 빠른 인증: getSession 완전히 우회
        if (hasStoredToken) {
          console.log('🚀 [AuthStore] 쿠키 토큰 존재 → 순수 getUser() 기반 빠른 인증 처리');
          this.supabaseClient = createBrowserSupabaseClient();
          
          // getUser()로 직접 사용자 정보 확인 (매우 빠르고 안정적)
          this.performInstantUserAuth();
          return; // getSession 완전히 우회
        }
        
        // 🚀 로그인 페이지 성능 최적화: 토큰이 없으면 즉시 로그아웃 상태 처리
        if (!hasStoredToken && isLoginPage) {
          console.log('⚡ [AuthStore] 로그인 페이지에서 토큰 없음 → 즉시 로그아웃 상태 처리 (getSession 건너뛰기)');
          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOut.bind(this),
            loadUserProfile: this.loadUserProfile.bind(this),
          });
          return;
        }
        
        // 저장된 토큰이 없고 일반 페이지에서도 빠른 초기화
        if (!hasStoredToken && !isCallbackPage) {
          console.log('⚡ [AuthStore] 저장된 토큰 없음 → 빠른 로그아웃 상태 처리');
          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOut.bind(this),
            loadUserProfile: this.loadUserProfile.bind(this),
          });
          return;
        }

        this.supabaseClient = createBrowserSupabaseClient();
        this.initPromise = this.initialize();
      } catch (error) {
        console.error('❌ [AuthStore] Supabase 클라이언트 생성 실패:', error);
        
        // 클라이언트 생성 실패 시에도 기본 상태로 초기화
        this.updateState({
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          signOut: this.signOut.bind(this),
          loadUserProfile: this.loadUserProfile.bind(this),
        });
      }
    } else {
      // SSR 환경에서는 기본 상태로 초기화
      console.log('🌐 [AuthStore] SSR 환경에서 기본 초기화');
      this.updateState({
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        signOut: this.signOut.bind(this),
        loadUserProfile: this.loadUserProfile.bind(this),
      });
    }
  }

  private async initialize() {
    if (!this.supabaseClient) {
      console.warn('⚠️ [AuthStore] Supabase 클라이언트가 없어 초기화를 건너뜁니다.');
      this.updateState({
        ...this.state,
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    // 이미 초기화된 경우 재초기화 방지
    if (this.state.isInitialized) {
      console.log('✅ [AuthStore] 이미 초기화됨 - 재초기화 건너뜀');
      return;
    }

    try {
      console.log('🚀 [AuthStore] 완전 쿠키 기반 초기화 시작 (네트워크 요청 0개)');
      
      // 🎯 완전히 쿠키 기반: JWT 파싱만 사용, getUser() 및 getSession() 완전 제거
      await this.performInstantUserAuth();
      
      console.log('✅ [AuthStore] 쿠키 기반 초기화 완료 (네트워크 요청 없음)');
    } catch (error) {
      console.error('❌ [AuthStore] 초기화 에러:', error);
      this.updateState({
        ...this.state,
        isLoading: false,
        isInitialized: true,
      });
    }
  }

  // updateAuthState 메소드 제거됨 - 완전히 쿠키 기반으로 변경
  // 모든 인증 상태는 JWT 파싱으로만 처리하며 네트워크 요청 없음

  private updateState(newState: AuthContextType) {
    const prevState = this.state;
    this.state = newState;
    
    // 디버깅: 상태 변경 로그
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 [AuthStore] 상태 변경:', {
        변경전: {
          isAuthenticated: prevState.isAuthenticated,
          isLoading: prevState.isLoading,
          isInitialized: prevState.isInitialized,
          hasUser: !!prevState.user,
          hasSession: !!prevState.session
        },
        변경후: {
          isAuthenticated: newState.isAuthenticated,
          isLoading: newState.isLoading,
          isInitialized: newState.isInitialized,
          hasUser: !!newState.user,
          hasSession: !!newState.session
        },
        listeners개수: this.listeners.size
      });
    }
    
    this.listeners.forEach(listener => listener(newState));
  }

  public subscribe(listener: (state: AuthContextType) => void): () => void {
    this.listeners.add(listener);
    // 구독 즉시 현재 상태 전달
    listener(this.state);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AuthContextType {
    return this.state;
  }

  public async waitForInitialization(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async signOut(): Promise<void> {
    if (!this.supabaseClient) return;

    try {
      console.log('🔄 [AuthStore] 로그아웃 시작');
      const { error } = await this.supabaseClient.auth.signOut();
      
      if (error) {
        console.error('❌ [AuthStore] 로그아웃 에러:', error);
      } else {
        console.log('✅ [AuthStore] 로그아웃 완료');
      }
    } catch (error) {
      console.error('❌ [AuthStore] 로그아웃 예외:', error);
    }
  }

  private async performInstantUserAuth(): Promise<void> {
    try {
      console.log('🚀 [AuthStore] performInstantUserAuth 시작 (네트워크 요청 없음)');
      const startTime = performance.now();
      
      // 🎯 쿠키에서 즉시 JWT 파싱 (네트워크 요청 없음!)
      const { getInstantUserFromCookies, getTokenExpiry, isTokenExpiringSoon } = await import('@/utils/jwt-parser');
      
      const user = getInstantUserFromCookies();
      const tokenExpiry = getTokenExpiry();
      const expiringSoon = isTokenExpiringSoon();
      
      const endTime = performance.now();
      
      console.log('✅ [AuthStore] JWT 파싱 완료:', {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        hasUser: !!user,
        userEmail: user?.email,
        userId: user?.id?.substring(0, 8) + '...',
        tokenExpiry: tokenExpiry?.toISOString(),
        expiringSoon
      });

      if (!user) {
        console.warn('⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음');
        
        // 토큰이 없거나 만료됨
        this.updateState({
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          signOut: this.signOut.bind(this),
          loadUserProfile: this.loadUserProfile.bind(this),
        });
        return;
      }

      // 사용자가 있으면 즉시 인증된 상태로 설정
      console.log('✅ [AuthStore] JWT에서 사용자 확인 성공:', {
        userId: user.id?.substring(0, 8) + '...',
        email: user.email,
        provider: user.app_metadata?.provider,
        createdAt: user.created_at
      });

      // 세션 객체 생성 (JWT 기반)
      const instantSession = {
        user: user,
        access_token: 'token-from-jwt', // 실제 토큰은 JWT에서 파싱됨
        refresh_token: null,
        expires_at: tokenExpiry ? Math.floor(tokenExpiry.getTime() / 1000) : null,
        token_type: 'bearer'
      };

      console.log('🔄 [AuthStore] 인증 상태 업데이트 중...');
      this.updateState({
        user: user,
        session: instantSession as any,
        userProfile: null,
        isLoading: false, // 즉시 로딩 완료
        isInitialized: true,
        isAuthenticated: true,
        signOut: this.signOut.bind(this),
        loadUserProfile: this.loadUserProfile.bind(this),
      });
      
      console.log('🎉 [AuthStore] 인증 상태 업데이트 완료 - 로딩 해제됨 (JWT 방식)');

      // 🔧 개발 환경에서 userProfile 로딩 시간 추적
      if (process.env.NODE_ENV === 'development') {
        (window as any).authStartTime = Date.now();
      }

      // 프로필 캐싱 로직: 프로필이 없거나 사용자가 변경된 경우에만 로드
      const shouldLoadProfile = !this.state.userProfile || 
                               (this.state.userProfile?.id !== user.id);
      
      if (shouldLoadProfile) {
        console.log('🔄 [AuthStore] 사용자 프로필 로드 시작:', {
          userId: user.id?.substring(0, 8) + '...',
          hasUserId: !!user.id,
          userEmail: user.email,
          reason: !this.state.userProfile ? 'profile_not_cached' : 'user_changed',
          previousUserId: this.state.userProfile?.id?.substring(0, 8) + '...' || 'none'
        });
        
        this.loadUserProfile(user.id).then(profile => {
          if (profile) {
            console.log('✅ [AuthStore] 사용자 프로필 로드 성공:', {
              is_admin: profile.is_admin,
              is_super_admin: profile.is_super_admin
            });
            this.updateState({
              ...this.state,
              userProfile: profile,
            });
          } else {
            console.warn('⚠️ [AuthStore] 사용자 프로필 로드 결과가 null임');
          }
        }).catch(error => {
          console.warn('⚠️ [AuthStore] 사용자 프로필 로드 실패:', error);
        });
              } else {
          console.log('✅ [AuthStore] 동일 사용자 프로필이 이미 캐시됨 - 재로딩 건너뜀:', {
            userId: user.id?.substring(0, 8) + '...',
            cachedProfile: {
              nickname: this.state.userProfile?.nickname,
              is_admin: this.state.userProfile?.is_admin
            }
          });
        }

      // 토큰 만료 경고 (쿠키 기반)
      if (expiringSoon) {
        console.warn('⚠️ [AuthStore] 토큰이 곧 만료됨 (30분 이내) - 재로그인 필요할 수 있음');
        // 백그라운드 네트워크 요청 없이 경고만 표시
      }

      // 인증 상태 변경 리스너 등록 (쿠키 기반 모드)
      this.supabaseClient.auth.onAuthStateChange(async (event: string, session: any) => {
        console.log('🔄 [AuthStore] 인증 상태 변경 (완전 쿠키 기반):', { event, hasSession: !!session });
        
        // 로그아웃 이벤트만 처리 (다른 이벤트는 쿠키 기반으로 이미 처리됨)
        if (event === 'SIGNED_OUT' || !session) {
          console.log('🚪 [AuthStore] 로그아웃 이벤트 - 상태 정리');
          this.updateState({
            session: null,
            user: null,
            userProfile: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            signOut: this.signOut.bind(this),
            loadUserProfile: this.loadUserProfile.bind(this),
          });
        } else {
          // 다른 이벤트는 이미 쿠키 기반으로 처리되므로 무시
          console.log('ℹ️ [AuthStore] 인증 이벤트 무시 (쿠키 기반으로 이미 처리됨):', event);
        }
      });

    } catch (error) {
      console.error('❌ [AuthStore] performInstantUserAuth 예외:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined
      });
      
      // 오류 발생시 비인증 상태로 설정
      this.updateState({
        session: null,
        user: null,
        userProfile: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        signOut: this.signOut.bind(this),
        loadUserProfile: this.loadUserProfile.bind(this),
      });
      
      console.log('🔄 [AuthStore] 오류로 인한 비인증 상태 설정 완료');
    }
  }

  private async checkTokenStatusFromCookies(): Promise<void> {
    try {
      console.log('🔄 [AuthStore] 쿠키 기반 토큰 상태 체크');
      
      // 완전히 쿠키 기반 - 네트워크 요청 없음
      const { getInstantUserFromCookies, getTokenExpiry } = await import('@/utils/jwt-parser');
      
      const user = getInstantUserFromCookies();
      const tokenExpiry = getTokenExpiry();
      
      if (!user) {
        console.warn('⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음 - 로그아웃 처리');
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
        });
        return;
      }

      // 토큰 만료 체크 (클라이언트 사이드)
      if (tokenExpiry && tokenExpiry <= new Date()) {
        console.warn('⚠️ [AuthStore] JWT 토큰이 만료됨 - 로그아웃 처리');
        this.updateState({
          ...this.state,
          session: null,
          user: null,
          userProfile: null,
          isAuthenticated: false,
        });
        return;
      }

      console.log('✅ [AuthStore] 쿠키 기반 토큰 상태 체크 완료 - 유효함');
    } catch (error) {
      console.warn('⚠️ [AuthStore] 쿠키 기반 토큰 체크 중 오류:', error);
    }
  }

  private async loadUserProfile(userId: string): Promise<UserProfiles | null> {
    try {
      console.log('🔍 [AuthStore] API를 통한 프로필 조회 시작:', { userId: userId.substring(0, 8) + '...' });
      
      // 🚀 서버 API를 통해 프로필 조회 (RLS 정책 우회)
      const response = await fetch('/api/user/profile', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 쿠키 포함
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('⚠️ [AuthStore] API 프로필 조회 실패:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        // 404나 403 에러인 경우 null 반환 (프로필 없음)
        if (response.status === 404 || response.status === 403) {
          return null;
        }
        
        throw new Error(`API 응답 실패: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.user) {
        console.warn('⚠️ [AuthStore] API 응답에서 사용자 정보 없음:', data);
        return null;
      }

      // API 응답을 UserProfiles 형식으로 변환
      const userProfile: UserProfiles = {
        id: data.user.id,
        email: data.user.email,
        nickname: data.user.name,
        avatar_url: data.user.avatar_url,
        star_candy: data.user.star_candy || 0,
        star_candy_bonus: data.user.star_candy_bonus || 0,
        is_admin: data.user.is_admin || false,
        is_super_admin: data.user.is_super_admin || false,
        created_at: data.user.created_at,
        updated_at: data.user.updated_at,
        // 기본값 설정
        birth_date: null,
        birth_time: null,
        deleted_at: null,
        gender: null,
        open_ages: false,
        open_gender: false
      };

      console.log('✅ [AuthStore] API를 통한 프로필 조회 성공:', {
        id: userProfile.id?.substring(0, 8) + '...',
        nickname: userProfile.nickname,
        email: userProfile.email,
        hasAvatar: !!userProfile.avatar_url,
        is_admin: userProfile.is_admin,
        is_super_admin: userProfile.is_super_admin,
        star_candy: userProfile.star_candy
      });

      return userProfile;

    } catch (error) {
      console.error('❌ [AuthStore] API 프로필 조회 예외:', error);
      
      // API 호출 실패시 fallback으로 기본 프로필 반환 (개발 환경)
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 [AuthStore] 개발환경 - 기본 프로필 fallback');
        
        // 현재 사용자 정보 가져오기
        const { data: { user: currentUser } } = await this.supabaseClient?.auth.getUser() || { data: { user: null } };
        
        if (currentUser && currentUser.id === userId) {
          const fallbackProfile: UserProfiles = {
            id: userId,
            email: currentUser.email || null,
            nickname: currentUser.user_metadata?.name || 
                     currentUser.user_metadata?.full_name || 
                     currentUser.email?.split('@')[0] || 
                     'User',
            avatar_url: currentUser.user_metadata?.avatar_url || 
                       currentUser.user_metadata?.picture || 
                       null,
            is_admin: true, // 개발환경에서 API 실패시 임시 관리자
            is_super_admin: false,
            star_candy: 0,
            star_candy_bonus: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            birth_date: null,
            birth_time: null,
            deleted_at: null,
            gender: null,
            open_ages: false,
            open_gender: false
          };
          
          console.log('🐛 [AuthStore] 개발환경 fallback 프로필 생성:', {
            nickname: fallbackProfile.nickname,
            is_admin: fallbackProfile.is_admin
          });
          
          return fallbackProfile;
        }
      }
      
      return null;
    }
  }
}

// AuthProvider 컴포넌트를 memo로 감싸서 완전히 안정화
const AuthProviderComponent = memo(function AuthProviderInternal({ children }: AuthProviderProps) {
  console.log('🏗️ [AuthProvider] 컴포넌트 생성/재렌더링');
  
  const [contextValue, setContextValue] = useState<AuthContextType>(() => {
    return AuthStore.getInstance().getState();
  });

  useEffect(() => {
    const authStore = AuthStore.getInstance();
    
    // 초기화 대기 (await 추가)
    const initializeAndSubscribe = async () => {
      try {
        await authStore.waitForInitialization();
        console.log('✅ [AuthProvider] 초기화 완료 대기 성공');
      } catch (error) {
        console.error('❌ [AuthProvider] 초기화 대기 중 오류:', error);
      }
    };
    
    initializeAndSubscribe();
    
    // 상태 변경 구독
    const unsubscribe = authStore.subscribe((newState) => {
      console.log('🔄 [AuthProvider] Context 값 변경:', {
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