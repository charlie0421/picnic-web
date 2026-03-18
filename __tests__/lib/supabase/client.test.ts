import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---

const mockCreateBrowserClient = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: (...args: any[]) => mockCreateBrowserClient(...args),
}));

vi.mock('@/types/supabase', () => ({ Database: {} }));

vi.mock('@/lib/supabase/debug-tools', () => ({
  registerDebugTools: vi.fn(),
}));

vi.mock('@/lib/supabase/events', () => ({
  emitSupabaseAuthRateLimit: vi.fn(),
}));

vi.mock('@/utils/auth-redirect', () => ({
  clearAllAuthData: vi.fn(),
}));

vi.mock('@/lib/supabase/sign-out', () => ({
  signOut: vi.fn().mockResolvedValue({ success: true }),
  simpleSignOut: vi.fn().mockResolvedValue({ success: true }),
  emergencySignOut: vi.fn(),
  getLogoutStatus: vi.fn().mockReturnValue({ isSigningOut: false }),
  resetLogoutStatus: vi.fn(),
  getIsSigningOut: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/supabase/storage-cleanup', () => ({
  clearBrowserAuthState: vi.fn(),
  clearAuthLocalStorage: vi.fn(),
  clearAuthCookies: vi.fn(),
}));

// Track singleton state
let _mockBrowserSupabase: any = null;
let _mockIsCreatingClient = false;

vi.mock('@/lib/supabase/client-internals', () => ({
  supabaseDebug: false,
  debugLog: vi.fn(),
  get browserSupabase() {
    return _mockBrowserSupabase;
  },
  get isCreatingClient() {
    return _mockIsCreatingClient;
  },
  setBrowserSupabase: vi.fn((client: any) => {
    _mockBrowserSupabase = client;
  }),
  setIsCreatingClient: vi.fn((value: boolean) => {
    _mockIsCreatingClient = value;
  }),
  ensureAutoRefreshListener: vi.fn(),
  updateAutoRefreshBehavior: vi.fn(),
  supabaseAuthFetch: vi.fn(),
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key-1234567890',
  setSignOutCallback: vi.fn(),
}));

// --- Import after mocks ---

import {
  createBrowserSupabaseClient,
  getCurrentUser,
  getCurrentSession,
  signOut,
  simpleSignOut,
  emergencySignOut,
  getLogoutStatus,
  resetLogoutStatus,
} from '@/lib/supabase/client';
import {
  setBrowserSupabase,
  ensureAutoRefreshListener,
  updateAutoRefreshBehavior,
} from '@/lib/supabase/client-internals';
import { signOut as signOutImpl } from '@/lib/supabase/sign-out';

function createMockClient(overrides: Partial<{
  getUser: any;
  getSession: any;
  signOut: any;
}> = {}) {
  return {
    auth: {
      getUser: overrides.getUser ?? vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: overrides.getSession ?? vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
    },
    from: vi.fn(),
  };
}

describe('lib/supabase/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockBrowserSupabase = null;
    _mockIsCreatingClient = false;
    mockCreateBrowserClient.mockReturnValue(createMockClient());
  });

  afterEach(() => {
    _mockBrowserSupabase = null;
    _mockIsCreatingClient = false;
  });

  describe('createBrowserSupabaseClient', () => {
    it('should create a new client when none exists', () => {
      const client = createBrowserSupabaseClient();
      expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
      expect(client).toBeDefined();
    });

    it('should return existing client (singleton pattern)', () => {
      const client1 = createBrowserSupabaseClient();
      const client2 = createBrowserSupabaseClient();
      // createBrowserClient should only be called once
      expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });

    it('should call ensureAutoRefreshListener on reuse', () => {
      createBrowserSupabaseClient();
      createBrowserSupabaseClient();
      expect(ensureAutoRefreshListener).toHaveBeenCalledTimes(2);
    });

    it('should call updateAutoRefreshBehavior on creation', () => {
      createBrowserSupabaseClient();
      expect(updateAutoRefreshBehavior).toHaveBeenCalled();
    });

    it('should call setBrowserSupabase on creation', () => {
      createBrowserSupabaseClient();
      expect(setBrowserSupabase).toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return user from supabase auth', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockCreateBrowserClient.mockReturnValue(
        createMockClient({
          getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
        })
      );

      const user = await getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    it('should return null when no user', async () => {
      mockCreateBrowserClient.mockReturnValue(
        createMockClient({
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        })
      );

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('getCurrentSession', () => {
    it('should return session-like object when user exists', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockCreateBrowserClient.mockReturnValue(
        createMockClient({
          getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
        })
      );

      const session = await getCurrentSession();
      expect(session).toEqual({
        user: mockUser,
        access_token: 'token-from-cookies',
        refresh_token: null,
        expires_at: null,
        token_type: 'bearer',
      });
    });

    it('should return null when getUser returns error', async () => {
      mockCreateBrowserClient.mockReturnValue(
        createMockClient({
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
        })
      );

      const session = await getCurrentSession();
      expect(session).toBeNull();
    });

    it('should return null when no user and no error', async () => {
      mockCreateBrowserClient.mockReturnValue(
        createMockClient({
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        })
      );

      const session = await getCurrentSession();
      expect(session).toBeNull();
    });
  });

  describe('signOut', () => {
    it('should call signOutImpl and reset singleton', async () => {
      await signOut();
      expect(signOutImpl).toHaveBeenCalled();
      expect(setBrowserSupabase).toHaveBeenCalledWith(null);
    });
  });

  describe('re-exported functions', () => {
    it('should export simpleSignOut', () => {
      expect(typeof simpleSignOut).toBe('function');
    });

    it('should export emergencySignOut', () => {
      expect(typeof emergencySignOut).toBe('function');
    });

    it('should export getLogoutStatus', () => {
      expect(typeof getLogoutStatus).toBe('function');
    });

    it('should export resetLogoutStatus', () => {
      expect(typeof resetLogoutStatus).toBe('function');
    });
  });
});

describe('lib/supabase/storage-cleanup', () => {
  let storageCleanup: typeof import('@/lib/supabase/storage-cleanup');

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    // Use the real implementation for storage-cleanup
    vi.doUnmock('@/lib/supabase/storage-cleanup');
    storageCleanup = await import('@/lib/supabase/storage-cleanup');
  });

  afterEach(() => {
    // Re-mock for other tests
    vi.doMock('@/lib/supabase/storage-cleanup', () => ({
      clearBrowserAuthState: vi.fn(),
      clearAuthLocalStorage: vi.fn(),
      clearAuthCookies: vi.fn(),
    }));
  });

  describe('clearAuthLocalStorage', () => {
    it('should remove known auth keys from localStorage', () => {
      localStorage.setItem('auth_session_active', 'true');
      localStorage.setItem('auth_provider', 'google');
      localStorage.setItem('unrelated_key', 'keep');

      storageCleanup.clearAuthLocalStorage();

      expect(localStorage.getItem('auth_session_active')).toBeNull();
      expect(localStorage.getItem('auth_provider')).toBeNull();
      expect(localStorage.getItem('unrelated_key')).toBe('keep');
    });

    it('should remove pattern-matched keys', () => {
      localStorage.setItem('sb-test-auth-token', 'token');
      localStorage.setItem('supabase_session', 'data');
      localStorage.setItem('random_key', 'keep');

      storageCleanup.clearAuthLocalStorage();

      expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
      expect(localStorage.getItem('supabase_session')).toBeNull();
      expect(localStorage.getItem('random_key')).toBe('keep');
    });

    it('should preserve specified keys', () => {
      localStorage.clear();
      localStorage.setItem('picnic_last_login', 'saved');
      localStorage.setItem('auth_session_active', 'true');

      storageCleanup.clearAuthLocalStorage({ preserve: new Set(['picnic_last_login']) });

      expect(localStorage.getItem('picnic_last_login')).toBe('saved');
      expect(localStorage.getItem('auth_session_active')).toBeNull();
    });
  });

  describe('clearAuthSessionStorage', () => {
    it('should remove known session auth keys', () => {
      sessionStorage.setItem('redirect_url', 'http://example.com');
      sessionStorage.setItem('oauth_state', 'state');
      sessionStorage.setItem('unrelated', 'keep');

      storageCleanup.clearAuthSessionStorage();

      expect(sessionStorage.getItem('redirect_url')).toBeNull();
      expect(sessionStorage.getItem('oauth_state')).toBeNull();
      expect(sessionStorage.getItem('unrelated')).toBe('keep');
    });
  });

  describe('clearAuthCookies', () => {
    it('should attempt to clear auth-related cookies without errors', () => {
      expect(() => storageCleanup.clearAuthCookies()).not.toThrow();
    });
  });

  describe('clearBrowserAuthState', () => {
    it('should clear localStorage, sessionStorage, and cookies', () => {
      localStorage.setItem('auth_session_active', 'true');
      sessionStorage.setItem('redirect_url', 'http://example.com');

      storageCleanup.clearBrowserAuthState();

      expect(localStorage.getItem('auth_session_active')).toBeNull();
      expect(sessionStorage.getItem('redirect_url')).toBeNull();
    });

    it('should not throw when storage operations fail', () => {
      expect(() => storageCleanup.clearBrowserAuthState()).not.toThrow();
    });
  });
});
