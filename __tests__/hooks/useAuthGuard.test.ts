import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Mocks ---

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: vi.fn().mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    user: null,
  }),
}));

vi.mock('@/components/ui/Dialog', () => ({
  useLoginRequired: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}));

vi.mock('@/utils/auth-redirect', () => ({
  saveRedirectUrl: vi.fn(),
  securityUtils: {
    validateUserAgent: vi.fn().mockReturnValue(true),
    isValidRedirectUrl: vi.fn().mockReturnValue(true),
  },
  redirectToLogin: vi.fn(),
}));

// --- Import after mocks ---

import { useAuthGuard, useRequireAuth, useOptionalAuth } from '@/hooks/useAuthGuard';
import { useAuth } from '@/lib/supabase/auth-provider';
import { securityUtils, saveRedirectUrl } from '@/utils/auth-redirect';
import { useLoginRequired } from '@/components/ui/Dialog';

const mockUseAuth = vi.mocked(useAuth);
const mockSecurityUtils = vi.mocked(securityUtils);
const mockSaveRedirectUrl = vi.mocked(saveRedirectUrl);
const mockShowLoginRequired = vi.fn().mockResolvedValue(undefined);

describe('useAuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    } as any);
    mockSecurityUtils.validateUserAgent.mockReturnValue(true);
    mockSecurityUtils.isValidRedirectUrl.mockReturnValue(true);
    vi.mocked(useLoginRequired).mockReturnValue(mockShowLoginRequired);
  });

  describe('initial state', () => {
    it('should return unauthenticated state when user is not logged in', () => {
      const { result } = renderHook(() => useAuthGuard());

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should return authenticated state when user is logged in', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', email: 'test@example.com' },
      } as any);

      const { result } = renderHook(() => useAuthGuard());

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.id).toBe('user-1');
    });

    it('should return loading state', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        user: null,
      } as any);

      const { result } = renderHook(() => useAuthGuard());
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('checkAuth', () => {
    it('should return false when loading', async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        user: null,
      } as any);

      const { result } = renderHook(() => useAuthGuard());
      let authResult = false;

      await act(async () => {
        authResult = await result.current.checkAuth();
      });

      expect(authResult).toBe(false);
    });

    it('should return true when requireAuth is false', async () => {
      const { result } = renderHook(() =>
        useAuthGuard({ requireAuth: false })
      );
      let authResult = false;

      await act(async () => {
        authResult = await result.current.checkAuth();
      });

      expect(authResult).toBe(true);
    });

    it('should return true when authenticated', async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', email: 'test@example.com' },
      } as any);

      const { result } = renderHook(() => useAuthGuard());
      let authResult = false;

      await act(async () => {
        authResult = await result.current.checkAuth();
      });

      expect(authResult).toBe(true);
    });

    it('should return false when not authenticated', async () => {
      const { result } = renderHook(() => useAuthGuard());
      let authResult = true;

      await act(async () => {
        authResult = await result.current.checkAuth();
      });

      expect(authResult).toBe(false);
    });

    it('should call onAuthSuccess when authenticated', async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1' },
      } as any);

      const onAuthSuccess = vi.fn();
      const { result } = renderHook(() =>
        useAuthGuard({ onAuthSuccess })
      );

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(onAuthSuccess).toHaveBeenCalled();
    });

    it('should call onAuthRequired when not authenticated', async () => {
      const onAuthRequired = vi.fn();
      const { result } = renderHook(() =>
        useAuthGuard({ onAuthRequired })
      );

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(onAuthRequired).toHaveBeenCalled();
    });

    it('should return false when user agent validation fails', async () => {
      mockSecurityUtils.validateUserAgent.mockReturnValue(false);

      const onError = vi.fn();
      const { result } = renderHook(() => useAuthGuard({ onError }));

      let authResult = true;
      await act(async () => {
        authResult = await result.current.checkAuth();
      });

      expect(authResult).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should call onError when an exception occurs', async () => {
      mockSecurityUtils.validateUserAgent.mockImplementation(() => {
        throw new Error('Security check failed');
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useAuthGuard({ onError }));

      let authResult = true;
      await act(async () => {
        authResult = await result.current.checkAuth();
      });

      expect(authResult).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('withAuth', () => {
    it('should execute action when authenticated', async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1' },
      } as any);

      const action = vi.fn().mockResolvedValue('result');
      const { result } = renderHook(() => useAuthGuard());

      let actionResult: any;
      await act(async () => {
        actionResult = await result.current.withAuth(action);
      });

      expect(action).toHaveBeenCalled();
      expect(actionResult).toBe('result');
    });

    it('should show login dialog when not authenticated', async () => {
      const { result } = renderHook(() => useAuthGuard());
      const action = vi.fn();

      await act(async () => {
        await result.current.withAuth(action);
      });

      expect(action).not.toHaveBeenCalled();
      expect(mockShowLoginRequired).toHaveBeenCalled();
    });

    it('should return null when not authenticated', async () => {
      const { result } = renderHook(() => useAuthGuard());
      const action = vi.fn().mockResolvedValue('value');

      let actionResult: any;
      await act(async () => {
        actionResult = await result.current.withAuth(action);
      });

      expect(actionResult).toBeNull();
    });

    it('should save redirect URL when not authenticated', async () => {
      const { result } = renderHook(() =>
        useAuthGuard({ redirectUrl: '/some/path' })
      );

      await act(async () => {
        await result.current.withAuth(vi.fn());
      });

      expect(mockSaveRedirectUrl).toHaveBeenCalled();
    });
  });

  describe('navigateWithAuth', () => {
    it('should return false for invalid paths', async () => {
      mockSecurityUtils.isValidRedirectUrl.mockReturnValue(false);

      const { result } = renderHook(() => useAuthGuard());
      let navResult = true;

      await act(async () => {
        navResult = await result.current.navigateWithAuth('javascript:alert(1)');
      });

      expect(navResult).toBe(false);
    });

    it('should show login dialog when not authenticated', async () => {
      mockSecurityUtils.isValidRedirectUrl.mockReturnValue(true);

      const { result } = renderHook(() => useAuthGuard());

      await act(async () => {
        await result.current.navigateWithAuth('/protected/page');
      });

      expect(mockShowLoginRequired).toHaveBeenCalled();
    });
  });
});

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    } as any);
    vi.mocked(useLoginRequired).mockReturnValue(vi.fn().mockResolvedValue(undefined));
  });

  it('should have requireAuth set to true by default', () => {
    const { result } = renderHook(() => useRequireAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('useOptionalAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    } as any);
    vi.mocked(useLoginRequired).mockReturnValue(vi.fn().mockResolvedValue(undefined));
  });

  it('should pass requireAuth as false', async () => {
    const { result } = renderHook(() => useOptionalAuth());

    let authResult = false;
    await act(async () => {
      authResult = await result.current.checkAuth();
    });

    // With requireAuth=false, checkAuth should return true
    expect(authResult).toBe(true);
  });
});
