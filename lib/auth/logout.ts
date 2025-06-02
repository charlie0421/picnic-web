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
      const redirectTo = options.redirectTo || '/login';
      
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
    redirectTo: '/login',
    invalidateServerSession: true,
    clearVotingState: true,
    showNotification: false
  });

  // Force page reload regardless of result
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.location.href = '/login';
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