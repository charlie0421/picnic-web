/**
 * Comprehensive Logout System for Picnic Application
 * 
 * This module provides a complete logout function that:
 * 1. Clears all localStorage and sessionStorage auth data
 * 2. Resets React context and Zustand store auth state
 * 3. Invalidates sessions server-side
 * 4. Handles WeChat login session termination
 */

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

// Types
interface LogoutOptions {
  clearAllStorage?: boolean;
  redirectTo?: string;
  invalidateServerSession?: boolean;
  clearVotingState?: boolean;
  showNotification?: boolean;
}

interface LogoutResult {
  success: boolean;
  error?: string;
  clearedItems: string[];
}

// Constants for storage keys that need to be cleared
const AUTH_STORAGE_KEYS = [
  // Supabase auth keys
  'sb-auth-token',
  'supabase.auth.token',
  'sb-*-auth-token',
  
  // Custom auth keys
  'user',
  'authUser',
  'currentUser',
  'isAuthenticated',
  'authState',
  
  // Session and token keys
  'accessToken',
  'refreshToken',
  'sessionToken',
  'authToken',
  'jwt',
  'bearer',
  
  // WeChat specific keys
  'wechat_token',
  'wechat_user',
  'wechat_session',
  'social_auth_token',
  
  // Redirect and state keys
  'redirectUrl',
  'returnUrl',
  'authRedirect',
  'loginRedirect',
  'postLoginRedirect',
  'auth_redirect_url',
  
  // User preferences and settings
  'userPreferences',
  'userSettings',
  'lastLoginMethod',
  'rememberMe',
  
  // Note: 'picnic_last_login_provider' is intentionally NOT included here
  // so it persists across logout/login sessions for better UX
  
  // Voting and application state
  'voteState',
  'votingSession',
  'currentVote',
  'userVotes',
  'voteFilters',
  'vote-filter-storage',
  
  // Language and localization
  'locale',
  'language',
  'selectedLanguage',
  
  // Temporary and cache keys
  'tempAuthData',
  'authCache',
  'userCache',
  'sessionCache'
];

/**
 * Clear storage items based on key patterns
 */
function clearStorageItems(storage: Storage, keys: string[], clearedItems: string[], storageType: string): void {
  for (const key of keys) {
    try {
      if (key.includes('*')) {
        // Handle wildcard keys (e.g., 'sb-*-auth-token')
        const pattern = key.replace('*', '');
        const keysToRemove = Object.keys(storage).filter(k => k.includes(pattern));
        keysToRemove.forEach(k => {
          storage.removeItem(k);
          clearedItems.push(`${storageType}.${k}`);
        });
      } else {
        if (storage.getItem(key)) {
          storage.removeItem(key);
          clearedItems.push(`${storageType}.${key}`);
        }
      }
    } catch (err) {
      console.warn(`Error clearing ${storageType} key ${key}:`, err);
    }
  }

  // Clear all auth-related keys (catch-all)
  Object.keys(storage).forEach(key => {
    if (key.toLowerCase().includes('supabase') || 
        key.toLowerCase().includes('auth') ||
        key.toLowerCase().includes('sb-')) {
      try {
        storage.removeItem(key);
        clearedItems.push(`${storageType}.${key}`);
      } catch (err) {
        console.warn(`Error clearing ${storageType} key ${key}:`, err);
      }
    }
  });
}

/**
 * Clear Zustand stores safely
 */
async function clearZustandStores(clearVotingState: boolean, clearedItems: string[]): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Clear stores by calling global reset functions if they exist
    const windowObj = window as any;
    
    // Check for global store reset functions
    if (windowObj.__ZUSTAND_STORES__) {
      Object.keys(windowObj.__ZUSTAND_STORES__).forEach(storeName => {
        try {
          const store = windowObj.__ZUSTAND_STORES__[storeName];
          if (store && store.getState && store.getState().reset) {
            store.getState().reset();
            clearedItems.push(`zustand.${storeName}`);
          }
        } catch (err) {
          console.warn(`Error resetting store ${storeName}:`, err);
        }
      });
    }

    // Reset vote filter store if clearVotingState is true
    if (clearVotingState && windowObj.__VOTE_FILTER_STORE__) {
      try {
        const store = windowObj.__VOTE_FILTER_STORE__;
        if (store.resetFilters) {
          store.resetFilters();
          clearedItems.push('voteFilterStore');
        }
      } catch (err) {
        console.warn('Error resetting vote filter store:', err);
      }
    }

    console.log('✅ Zustand stores cleared');
  } catch (err) {
    console.warn('Error clearing Zustand stores:', err);
  }
}

/**
 * Comprehensive logout function
 */
export async function performLogout(options: LogoutOptions = {}): Promise<LogoutResult> {
  const {
    clearAllStorage = true,
    redirectTo = '/login',
    invalidateServerSession = true,
    clearVotingState = true,
    showNotification = false
  } = options;

  const clearedItems: string[] = [];
  let error: string | undefined;

  try {
    console.log('🔄 Starting comprehensive logout process...');

    // 1. Clear Supabase session
    if (invalidateServerSession) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.warn('Supabase sign out error:', signOutError.message);
        } else {
          clearedItems.push('Supabase session');
          console.log('✅ Supabase session cleared');
        }
      } catch (err) {
        console.warn('Error clearing Supabase session:', err);
      }
    }

    // 2. Clear localStorage
    if (clearAllStorage && typeof window !== 'undefined') {
      console.log('🧹 Clearing localStorage...');
      clearStorageItems(localStorage, AUTH_STORAGE_KEYS, clearedItems, 'localStorage');
      console.log(`✅ Cleared ${clearedItems.filter(item => item.startsWith('localStorage')).length} localStorage items`);
    }

    // 3. Clear sessionStorage
    if (clearAllStorage && typeof window !== 'undefined') {
      console.log('🧹 Clearing sessionStorage...');
      clearStorageItems(sessionStorage, AUTH_STORAGE_KEYS, clearedItems, 'sessionStorage');
      console.log(`✅ Cleared ${clearedItems.filter(item => item.startsWith('sessionStorage')).length} sessionStorage items`);
    }

    // 4. Clear cookies (auth-related)
    if (typeof window !== 'undefined') {
      console.log('🍪 Clearing auth cookies...');
      
      const authCookies = [
        'supabase-auth-token',
        'sb-auth-token',
        'auth-token',
        'access-token',
        'refresh-token',
        'session-token',
        'wechat-token',
        'locale',
        'language'
      ];

      authCookies.forEach(cookieName => {
        try {
          // Clear cookie for current domain
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
          // Clear cookie for current domain and subdomain
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
          clearedItems.push(`cookie.${cookieName}`);
        } catch (err) {
          console.warn(`Error clearing cookie ${cookieName}:`, err);
        }
      });

      console.log(`✅ Cleared ${clearedItems.filter(item => item.startsWith('cookie')).length} cookies`);
    }

    // 5. Reset Zustand stores
    console.log('🔄 Resetting Zustand stores...');
    await clearZustandStores(clearVotingState, clearedItems);

    // 6. Clear any React Query/SWR cache
    try {
      console.log('🔄 Clearing query cache...');
      
      // Clear React Query cache if it exists
      if (typeof window !== 'undefined') {
        const queryClient = (window as any).__REACT_QUERY_CLIENT__;
        if (queryClient && queryClient.clear) {
          queryClient.clear();
          clearedItems.push('React Query cache');
        }
      }

      console.log('✅ Query cache cleared');
    } catch (err) {
      console.warn('Error clearing query cache:', err);
    }

    // 7. Clear WeChat-specific session data
    try {
      console.log('🔄 Clearing WeChat session...');
      
      // Clear WeChat web auth if available
      if (typeof window !== 'undefined' && (window as any).WeixinJSBridge) {
        try {
          // WeChat specific cleanup would go here
          clearedItems.push('WeChat session');
        } catch (err) {
          console.warn('Error clearing WeChat session:', err);
        }
      }

      console.log('✅ WeChat session cleared');
    } catch (err) {
      console.warn('Error clearing WeChat session:', err);
    }

    // 8. Notify server of logout (optional)
    if (invalidateServerSession) {
      try {
        console.log('🔄 Notifying server of logout...');
        
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            timestamp: new Date().toISOString(),
            clearAll: true 
          })
        });

        clearedItems.push('Server session');
        console.log('✅ Server notified of logout');
      } catch (err) {
        console.warn('Error notifying server:', err);
      }
    }

    // 9. Show notification if requested
    if (showNotification && typeof window !== 'undefined') {
      try {
        // Try to use any available toast library
        const windowObj = window as any;
        if (windowObj.toast) {
          windowObj.toast.success('Successfully logged out');
        } else if (windowObj.showNotification) {
          windowObj.showNotification('Successfully logged out', 'success');
        } else {
          // Fallback to console log for development
          console.log('✅ Successfully logged out');
          
          // Simple notification fallback
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Picnic', {
              body: 'Successfully logged out',
              icon: '/favicon.ico'
            });
          }
        }
      } catch (err) {
        // Silent fail for notifications
        console.log('✅ Successfully logged out (notification failed)');
      }
    }

    console.log(`✅ Logout completed successfully. Cleared ${clearedItems.length} items.`);
    
    return {
      success: true,
      clearedItems
    };

  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error occurred during logout';
    console.error('❌ Error during logout:', error);
    
    return {
      success: false,
      error,
      clearedItems
    };
  }
}

/**
 * React hook for logout functionality
 */
export function useLogout() {
  const router = useRouter();

  const logout = async (options: LogoutOptions = {}) => {
    const result = await performLogout(options);
    
    if (result.success) {
      // Redirect after successful logout
      const redirectTo = options.redirectTo || '/ko/mypage';
      
      // Small delay to ensure all cleanup is complete
      setTimeout(() => {
        router.push(redirectTo);
        
        // Force page reload to ensure clean state
        if (typeof window !== 'undefined') {
          window.location.href = redirectTo;
        }
      }, 100);
    }
    
    return result;
  };

  return { logout };
}

/**
 * Quick logout function for emergency use
 */
export async function emergencyLogout(): Promise<LogoutResult> {
  console.log('🚨 Emergency logout initiated');
  
  const result = await performLogout({
    clearAllStorage: true,
    redirectTo: '/ko/mypage',
    invalidateServerSession: true,
    clearVotingState: true,
    showNotification: false
  });

  // Force page reload regardless of result
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.location.href = '/ko/mypage';
    }, 100);
  }

  return result;
}

/**
 * Check if user is properly logged out
 */
export function isLoggedOut(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    // Check for any remaining auth tokens
    const hasLocalStorageAuth = AUTH_STORAGE_KEYS.some(key => {
      if (key.includes('*')) {
        const pattern = key.replace('*', '');
        return Object.keys(localStorage).some(k => k.includes(pattern));
      }
      return localStorage.getItem(key) !== null;
    });

    const hasSessionStorageAuth = AUTH_STORAGE_KEYS.some(key => {
      if (key.includes('*')) {
        const pattern = key.replace('*', '');
        return Object.keys(sessionStorage).some(k => k.includes(pattern));
      }
      return sessionStorage.getItem(key) !== null;
    });

    return !hasLocalStorageAuth && !hasSessionStorageAuth;
  } catch (err) {
    console.warn('Error checking logout status:', err);
    return false;
  }
}

/**
 * Get list of remaining auth items (for debugging)
 */
export function getRemainingAuthItems(): string[] {
  if (typeof window === 'undefined') return [];

  const remainingItems: string[] = [];

  try {
    // Check localStorage
    AUTH_STORAGE_KEYS.forEach(key => {
      if (key.includes('*')) {
        const pattern = key.replace('*', '');
        Object.keys(localStorage).forEach(k => {
          if (k.includes(pattern) && localStorage.getItem(k)) {
            remainingItems.push(`localStorage.${k}`);
          }
        });
      } else {
        if (localStorage.getItem(key)) {
          remainingItems.push(`localStorage.${key}`);
        }
      }
    });

    // Check sessionStorage
    AUTH_STORAGE_KEYS.forEach(key => {
      if (key.includes('*')) {
        const pattern = key.replace('*', '');
        Object.keys(sessionStorage).forEach(k => {
          if (k.includes(pattern) && sessionStorage.getItem(k)) {
            remainingItems.push(`sessionStorage.${k}`);
          }
        });
      } else {
        if (sessionStorage.getItem(key)) {
          remainingItems.push(`sessionStorage.${key}`);
        }
      }
    });
  } catch (err) {
    console.warn('Error getting remaining auth items:', err);
  }

  return remainingItems;
}

/**
 * Clear all data including recent login provider (for complete data wipe)
 */
export async function performCompleteDataWipe(options: LogoutOptions = {}): Promise<LogoutResult> {
  console.log('🧹 Starting complete data wipe (including recent login provider)...');
  
  // First perform normal logout
  const logoutResult = await performLogout(options);
  
  // Then clear the recent login provider data
  try {
    if (typeof window !== 'undefined') {
      const { clearLastLoginProvider } = await import('@/utils/auth-helpers');
      clearLastLoginProvider();
      logoutResult.clearedItems.push('localStorage.picnic_last_login_provider');
      console.log('✅ Recent login provider data cleared');
    }
  } catch (error) {
    console.warn('Error clearing recent login provider:', error);
  }
  
  return logoutResult;
}

/**
 * React hook for complete logout with data wipe
 */
export function useCompleteLogout() {
  const router = useRouter();

  const completeLogout = async (options: LogoutOptions = {}) => {
    const result = await performCompleteDataWipe(options);
    
    if (result.success) {
      // Redirect after successful logout
      const redirectTo = options.redirectTo || '/ko/mypage';
      
      // Small delay to ensure all cleanup is complete
      setTimeout(() => {
        router.push(redirectTo);
        
        // Force page reload to ensure clean state
        if (typeof window !== 'undefined') {
          window.location.href = redirectTo;
        }
      }, 100);
    }
    
    return result;
  };

  return { completeLogout };
}

/**
 * 🚀 Next.js 15 호환 간단하고 확실한 로그아웃 함수
 * 복잡한 로직 없이 즉시 리다이렉트하고 스토리지를 정리합니다.
 */
export async function quickLogout(): Promise<void> {
  console.log('🔄 Starting comprehensive logout process...');
  
  try {
    // 🚀 서버사이드 세션 무효화 API 호출 (가장 먼저 수행)
    try {
      console.log('🔄 [QuickLogout] 서버사이드 세션 무효화 시도...');
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clearAll: true, timestamp: new Date().toISOString() })
      });
      console.log('✅ [QuickLogout] 서버사이드 세션 무효화 요청 완료');
    } catch (serverError) {
      console.warn('⚠️ [QuickLogout] 서버사이드 로그아웃 요청 실패 (계속 진행):', serverError);
    }

    // 0. 기존 Supabase 인스턴스 정리 먼저 시도
    try {
      // 기존 클라이언트가 있다면 먼저 정리
      if (typeof window !== 'undefined' && (window as any).__supabaseClient) {
        console.log('🔄 [QuickLogout] 기존 Supabase 클라이언트 감지, 정리 중...');
        delete (window as any).__supabaseClient;
      }
      
      const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserSupabaseClient();
      
      // 로컬 범위로 제한하여 로그아웃
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.warn('🔄 [QuickLogout] Supabase 로그아웃 에러 (무시하고 계속):', error.message);
      } else {
        console.log('✅ [QuickLogout] Supabase 세션 정리 완료');
      }
    } catch (supabaseError) {
      console.warn('🔄 [QuickLogout] Supabase 로그아웃 실패 (무시하고 계속):', supabaseError);
    }
    
    // 1. 즉시 모든 스토리지 정리 (동기)
    if (typeof window !== 'undefined') {
      // localStorage 정리
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('sb-') ||
          key.includes('session') ||
          key.includes('token')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // sessionStorage 정리
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.includes('auth') || 
          key.includes('redirect') ||
          key.includes('login')
        )) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
      
      console.log(`🧹 [QuickLogout] 스토리지 정리 완료 (${keysToRemove.length + sessionKeysToRemove.length}개 항목)`);
    }
    
    // 2. 더욱 강력한 쿠키 정리 (분할된 Supabase 쿠키 포함)
    if (typeof document !== 'undefined') {
      // Supabase 프로젝트 ID 추출
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectIdMatch = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
      const projectId = projectIdMatch ? projectIdMatch[1] : null;
      
      console.log('🧩 [JWT Parser] Supabase 프로젝트 ID:', projectId);
      
      // 현재 모든 쿠키 분석
      const allCookies = document.cookie.split(';');
      const cookiesToClear: string[] = [];
      
      allCookies.forEach(cookie => {
        const cookieName = cookie.split('=')[0].trim();
        const cookieValue = cookie.split('=')[1] || '';
        
        if (cookieName && (
          cookieName.includes('sb-') ||
          cookieName.includes('supabase') ||
          cookieName.includes('auth-token') ||
          cookieName.includes('auth') ||
          cookieName.includes('session') ||
          cookieName.includes('token') ||
          // 분할된 쿠키 패턴 감지 (더 정확한 패턴)
          /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(cookieName)
        )) {
          cookiesToClear.push(cookieName);
          
          // 분할된 쿠키인 경우 로깅
          if (/^sb-[a-z0-9]+-auth-token\.\d+$/.test(cookieName)) {
            console.log(`🧩 [JWT Parser] 쿠키 조각 발견: ${cookieName} (${cookieValue.length}자)`);
          }
        }
      });
      
      // 프로젝트 ID가 있다면 특정 패턴으로 추가 검색
      if (projectId) {
        // 분할된 쿠키들을 더 체계적으로 찾기 (최대 20개 조각까지)
        for (let i = 0; i < 20; i++) {
          const splitCookieName = `sb-${projectId}-auth-token.${i}`;
          if (document.cookie.includes(splitCookieName) && !cookiesToClear.includes(splitCookieName)) {
            cookiesToClear.push(splitCookieName);
            console.log(`🧩 [JWT Parser] 추가 쿠키 조각 발견: ${splitCookieName}`);
          }
        }
        
        // 기본 토큰도 확인
        const baseCookieName = `sb-${projectId}-auth-token`;
        if (document.cookie.includes(baseCookieName) && !cookiesToClear.includes(baseCookieName)) {
          cookiesToClear.push(baseCookieName);
        }
        
        // refresh token도 확인
        const refreshCookieName = `sb-${projectId}-auth-token-code-verifier`;
        if (document.cookie.includes(refreshCookieName) && !cookiesToClear.includes(refreshCookieName)) {
          cookiesToClear.push(refreshCookieName);
        }
      }
      
      console.log(`🍪 [QuickLogout] 삭제할 쿠키 목록 (${cookiesToClear.length}개):`, cookiesToClear);
      
      // 각 쿠키를 매우 다양한 경로와 도메인으로 삭제 시도
      cookiesToClear.forEach(cookieName => {
        // 기본 삭제 시도들
        const deleteOptions = [
          // 기본 삭제
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; max-age=0;`,
          // 현재 도메인
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; max-age=0;`,
          // 다양한 경로
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/auth; max-age=0;`,
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/api; max-age=0;`,
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/api/auth; max-age=0;`,
          // Secure 옵션
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; max-age=0;`,
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; secure; max-age=0;`,
          // SameSite 옵션들
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict; max-age=0;`,
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax; max-age=0;`,
          `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=none; secure; max-age=0;`,
        ];
        
        // 상위 도메인 삭제도 시도
        if (window.location.hostname.includes('.')) {
          const domainParts = window.location.hostname.split('.');
          
          // 루트 도메인 (.example.com)
          if (domainParts.length >= 2) {
            const rootDomain = '.' + domainParts.slice(-2).join('.');
            deleteOptions.push(
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; secure; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; samesite=strict; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; samesite=lax; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; samesite=none; secure; max-age=0;`
            );
          }
          
          // 서브도메인도 시도 (.sub.example.com)
          if (domainParts.length >= 3) {
            const subDomain = '.' + domainParts.slice(-3).join('.');
            deleteOptions.push(
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${subDomain}; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${subDomain}; secure; max-age=0;`
            );
          }
        }
        
        // 모든 삭제 옵션 시도
        deleteOptions.forEach(option => {
          try {
            document.cookie = option;
          } catch (e) {
            // 무시 (일부 옵션은 클라이언트에서 설정할 수 없을 수 있음)
          }
        });
      });
      
      console.log(`🍪 [QuickLogout] ${cookiesToClear.length}개 쿠키 삭제 시도 완료`);
    }
    
    // 3. 강화된 쿠키 삭제 확인 및 재시도
    if (typeof document !== 'undefined') {
      let retryCount = 0;
      const maxRetries = 5; // 재시도 횟수 증가
      
      const verifyCookieClearing = () => {
        // 남은 쿠키들 더 정확하게 탐지
        const allCurrentCookies = document.cookie.split(';');
        const remainingAuthCookies: string[] = [];
        
        allCurrentCookies.forEach(cookie => {
          const cookieName = cookie.split('=')[0].trim();
          if (cookieName && (
            cookieName.includes('sb-') ||
            cookieName.includes('supabase') ||
            cookieName.includes('auth-token') ||
            cookieName.includes('auth') ||
            cookieName.includes('session') ||
            cookieName.includes('token') ||
            // 분할된 쿠키 패턴도 검사 (더 정확한 패턴)
            /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(cookieName)
          )) {
            remainingAuthCookies.push(cookieName);
          }
        });
        
        if (remainingAuthCookies.length > 0 && retryCount < maxRetries) {
          retryCount++;
          console.log(`🔄 [QuickLogout] 남은 쿠키 발견 (재시도 ${retryCount}/${maxRetries}):`, remainingAuthCookies);
          
          // 남은 쿠키들을 더 강력하게 재삭제
          remainingAuthCookies.forEach(cookieName => {
            // 더욱 공격적인 삭제 시도
            const aggressiveDeleteOptions = [
              // 기본 삭제 (다양한 형태)
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; max-age=0; secure;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; max-age=0; httponly;`,
              // 도메인 포함
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname}; max-age=0;`,
              // 다양한 경로
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/auth; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/api; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/api/auth; max-age=0;`,
              // SameSite 옵션들
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=none; secure; max-age=0;`,
              // 조합 옵션들
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; secure; samesite=strict; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; secure; samesite=lax; max-age=0;`,
              `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; secure; samesite=none; max-age=0;`,
            ];
            
            // 루트 도메인 추가
            if (window.location.hostname.includes('.')) {
              const rootDomain = '.' + window.location.hostname.split('.').slice(-2).join('.');
              aggressiveDeleteOptions.push(
                `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; max-age=0;`,
                `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; secure; max-age=0;`,
                `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; secure; samesite=strict; max-age=0;`,
                `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; secure; samesite=lax; max-age=0;`,
                `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${rootDomain}; secure; samesite=none; max-age=0;`
              );
            }
            
            // 모든 옵션 시도
            aggressiveDeleteOptions.forEach(option => {
              try {
                document.cookie = option;
              } catch (e) {
                // 무시
              }
            });
          });
          
          // 재귀적으로 다시 확인 (더 긴 대기 시간)
          setTimeout(verifyCookieClearing, 200);
          return;
        }
        
        if (remainingAuthCookies.length > 0) {
          console.warn(`⚠️ [QuickLogout] ${remainingAuthCookies.length}개 쿠키가 여전히 남아있음:`, remainingAuthCookies);
        } else {
          console.log('✅ [QuickLogout] 모든 인증 쿠키 정리 완료');
        }
        
        // 4. 확실한 정리 후 리다이렉트
        console.log('🔄 [QuickLogout] 마이페이지로 리다이렉트');
        window.location.href = '/ko/mypage';
      };
      
      // 초기 쿠키 삭제 확인 (더 긴 대기 시간)
      setTimeout(verifyCookieClearing, 100);
      return; // 리다이렉트는 콜백에서 처리
    }
    
  } catch (error) {
    console.error('❌ [QuickLogout] 오류:', error);
    // 오류가 발생해도 강제 리다이렉트
    if (typeof window !== 'undefined') {
      window.location.href = '/ko/mypage';
    }
  }
}

/**
 * React Hook으로 quickLogout 사용
 */
export function useQuickLogout() {
  const logout = async () => {
    await quickLogout();
  };
  
  return { logout };
}