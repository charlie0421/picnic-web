import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
    },
    from: vi.fn(),
  })),
}));

vi.mock('@/utils/storage', () => ({
  setLastLoginInfo: vi.fn(),
  getProviderDisplayName: vi.fn((p: string) => p),
}));

vi.mock('@/lib/supabase/auth-token-utils', () => ({
  detectStoredAuthToken: vi.fn().mockReturnValue(false),
}));

vi.mock('@/utils/jwt-parser', () => ({
  getInstantUserFromCookies: vi.fn().mockReturnValue(null),
  getTokenExpiry: vi.fn().mockReturnValue(null),
  isTokenExpiringSoon: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/supabase/auth-store-auth', () => ({
  performInstantUserAuthImpl: vi.fn().mockResolvedValue(undefined),
  checkTokenStatusFromCookiesImpl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/auth-store-profile', () => ({
  signOutImpl: vi.fn().mockResolvedValue(undefined),
  loadUserProfileImpl: vi.fn().mockResolvedValue(null),
}));

// --- Import after mocks ---

import { AuthStore } from '@/lib/supabase/auth-store';
import type { AuthContextType } from '@/lib/supabase/auth-store-types';

describe('AuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton
    (AuthStore as any).instance = null;
  });

  afterEach(() => {
    (AuthStore as any).instance = null;
  });

  describe('singleton pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = AuthStore.getInstance();
      const instance2 = AuthStore.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance after resetting', () => {
      const instance1 = AuthStore.getInstance();
      (AuthStore as any).instance = null;
      const instance2 = AuthStore.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('initial state', () => {
    it('should start with default unauthenticated state', () => {
      const store = AuthStore.getInstance();
      const state = store.getState();

      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.userProfile).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      // isLoading may be true or false depending on initialization path
      expect(typeof state.isLoading).toBe('boolean');
      expect(typeof state.signOut).toBe('function');
      expect(typeof state.loadUserProfile).toBe('function');
    });
  });

  describe('updateState', () => {
    it('should update state and notify listeners', () => {
      const store = AuthStore.getInstance();
      const listener = vi.fn();
      store.subscribe(listener);

      // listener is called immediately on subscribe with current state
      expect(listener).toHaveBeenCalledTimes(1);

      const newState: AuthContextType = {
        session: null,
        user: { id: 'user-1' } as any,
        userProfile: null,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        signOut: store.getSignOutFn(),
        loadUserProfile: store.getLoadUserProfileFn(),
      };

      store.updateState(newState);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(store.getState().isAuthenticated).toBe(true);
      expect(store.getState().user?.id).toBe('user-1');
    });
  });

  describe('subscribe', () => {
    it('should call listener immediately with current state', () => {
      const store = AuthStore.getInstance();
      const listener = vi.fn();

      store.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(store.getState());
    });

    it('should return unsubscribe function', () => {
      const store = AuthStore.getInstance();
      const listener = vi.fn();

      const unsubscribe = store.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Updating state should not call the listener again
      store.updateState({
        ...store.getState(),
        isLoading: false,
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners', () => {
      const store = AuthStore.getInstance();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);

      store.updateState({
        ...store.getState(),
        isAuthenticated: true,
      });

      // 1 immediate call + 1 update call = 2 each
      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);
    });
  });

  describe('accessor methods', () => {
    it('getIsAuthEvaluating should return boolean', () => {
      const store = AuthStore.getInstance();
      expect(typeof store.getIsAuthEvaluating()).toBe('boolean');
    });

    it('setIsAuthEvaluating should update flag', () => {
      const store = AuthStore.getInstance();
      store.setIsAuthEvaluating(true);
      expect(store.getIsAuthEvaluating()).toBe(true);
      store.setIsAuthEvaluating(false);
      expect(store.getIsAuthEvaluating()).toBe(false);
    });

    it('getLastExpiryWarningKey should initially return null', () => {
      const store = AuthStore.getInstance();
      expect(store.getLastExpiryWarningKey()).toBeNull();
    });

    it('setLastExpiryWarningKey should update key', () => {
      const store = AuthStore.getInstance();
      store.setLastExpiryWarningKey('2024-01-01T00:00:00Z');
      expect(store.getLastExpiryWarningKey()).toBe('2024-01-01T00:00:00Z');
    });

    it('getProfileLoadPromises should return a Map', () => {
      const store = AuthStore.getInstance();
      expect(store.getProfileLoadPromises()).toBeInstanceOf(Map);
    });

    it('getSignOutFn should return a function', () => {
      const store = AuthStore.getInstance();
      expect(typeof store.getSignOutFn()).toBe('function');
    });

    it('getLoadUserProfileFn should return a function', () => {
      const store = AuthStore.getInstance();
      expect(typeof store.getLoadUserProfileFn()).toBe('function');
    });
  });

  describe('waitForInitialization', () => {
    it('should resolve when no initPromise', async () => {
      const store = AuthStore.getInstance();
      await expect(store.waitForInitialization()).resolves.toBeUndefined();
    });
  });

  describe('loadUserProfile', () => {
    it('should delegate to loadUserProfileImpl', async () => {
      const { loadUserProfileImpl } = await import('@/lib/supabase/auth-store-profile');
      const store = AuthStore.getInstance();
      await store.loadUserProfile('user-123');
      expect(loadUserProfileImpl).toHaveBeenCalledWith(store, 'user-123');
    });
  });
});

describe('auth-store-types', () => {
  it('should export AuthContextType interface fields', async () => {
    const types = await import('@/lib/supabase/auth-store-types');
    // Verify the debugLog export exists
    expect(typeof types.debugLog).toBe('function');
    expect(typeof types.debugWarn).toBe('function');
    expect(typeof types.authDebug).toBe('boolean');
  });
});
