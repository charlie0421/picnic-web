import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/supabase/auth-provider';
import '@testing-library/jest-dom';

// Mock the client module
jest.mock('@/lib/supabase/client', () => {
  const mockSupabaseClient = {
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({
          data: { session: null },
          error: null,
        }),
      ),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithPassword: jest.fn(() => Promise.resolve({ error: null })),
      signInWithOAuth: jest.fn(() => Promise.resolve({ error: null })),
      signUp: jest.fn(() =>
        Promise.resolve({ error: null, data: { user: { id: 'new-user-id' } } }),
      ),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  };

  return {
    createBrowserSupabaseClient: jest.fn(() => mockSupabaseClient),
    signOut: jest.fn(() => Promise.resolve({ success: true })),
  };
});

// Test component that uses the auth hook
const TestComponent = () => {
  const auth = useAuth();

  return (
    <div>
      <div data-testid='auth-status'>
        {auth.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
      </div>
      <div data-testid='loading-status'>
        {auth.isLoading ? 'Loading' : 'Not Loading'}
      </div>
      <div data-testid='user-info'>
        {auth.user ? `User ID: ${auth.user.id}` : 'No User'}
      </div>
      <button
        onClick={() => auth.signIn('test@example.com', 'password')}
        data-testid='sign-in-button'
      >
        Sign In
      </button>
      <button
        onClick={() => auth.signInWithOAuth('google')}
        data-testid='oauth-button'
      >
        Sign In with Google
      </button>
      <button
        onClick={() => auth.signUp('test@example.com', 'password')}
        data-testid='sign-up-button'
      >
        Sign Up
      </button>
      <button onClick={() => auth.signOut()} data-testid='sign-out-button'>
        Sign Out
      </button>
    </div>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock localStorage for tests
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });
  });

  it('should render children and initialize auth state', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // Initial state should show not authenticated and not loading after initialization
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent(
        'Not Authenticated',
      );
      expect(screen.getByTestId('loading-status')).toHaveTextContent(
        'Not Loading',
      );
    });
  });

  it('should provide authentication methods to children', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // Verify auth methods are available
    expect(screen.getByTestId('sign-in-button')).toBeInTheDocument();
    expect(screen.getByTestId('oauth-button')).toBeInTheDocument();
    expect(screen.getByTestId('sign-up-button')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
  });

  it('should handle sign in correctly', async () => {
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();

    // Mock successful authentication response
    mockClient.auth.signInWithPassword.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          user: { id: 'test-user-id' },
          session: { user: { id: 'test-user-id' } },
        },
        error: null,
      }),
    );

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // Click sign in button
    await act(async () => {
      screen.getByTestId('sign-in-button').click();
    });

    // Verify signInWithPassword was called
    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    });
  });

  it('should handle OAuth sign in correctly', async () => {
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // Click OAuth button
    await act(async () => {
      screen.getByTestId('oauth-button').click();
    });

    // Verify signInWithOAuth was called
    expect(mockClient.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: expect.any(String),
      }),
    });
  });

  it('should handle auth state changes', async () => {
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();

    // Set up the onAuthStateChange to call its callback with a session
    mockClient.auth.onAuthStateChange.mockImplementationOnce((callback) => {
      // Simulate an auth state change
      setTimeout(() => {
        callback('SIGNED_IN', {
          user: { id: 'auth-change-user-id' },
        });
      }, 10);

      return {
        data: { subscription: { unsubscribe: jest.fn() } },
      };
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // Wait for the auth state change to be processed
    await waitFor(() => {
      expect(mockClient.auth.onAuthStateChange).toHaveBeenCalled();
    });
  });

  it('should handle sign out correctly', async () => {
    const {
      createBrowserSupabaseClient,
      signOut,
    } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // Click sign out button
    await act(async () => {
      screen.getByTestId('sign-out-button').click();
    });

    // Verify signOut was called
    expect(signOut).toHaveBeenCalled();
  });

  it('should throw error when useAuth is used outside provider', () => {
    // Suppress expected error logs
    const originalError = console.error;
    console.error = jest.fn();

    // Rendering the TestComponent outside of AuthProvider should throw an error
    expect(() => {
      render(<TestComponent />);
    }).toThrow();

    // Restore console.error
    console.error = originalError;
  });

  it('should initialize with provided session', async () => {
    // 좀 더 완전한 형태의 모의 사용자와 세션 객체 생성
    const mockUser = {
      id: 'initial-session-user-id',
      email: 'test@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { name: '테스트 사용자' },
      role: 'authenticated',
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    };

    const mockSession = {
      user: mockUser,
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600,
    };

    // Supabase 클라이언트 모듈 가져오기 및 모킹
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();

    // getSession을 모킹하여 초기 세션 반환
    mockClient.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // from.select.eq.single 메서드 모킹하여 사용자 프로필 반환
    mockClient.from.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: mockUser.id, nickname: '테스트 사용자' },
            error: null,
          }),
        }),
      }),
    }));

    // 인증 상태 변경 이벤트 리스너 모킹
    mockClient.auth.onAuthStateChange.mockImplementation((callback) => {
      // 컴포넌트 마운트 후 약간의 지연을 두고 이벤트 발생
      setTimeout(() => {
        callback('SIGNED_IN', mockSession);
      }, 100);

      return {
        data: { subscription: { unsubscribe: jest.fn() } },
      };
    });

    // 컴포넌트 렌더링
    await act(async () => {
      render(
        <AuthProvider initialSession={mockSession as any}>
          <TestComponent />
        </AuthProvider>,
      );
    });

    // 충분한 시간을 두고 상태 변경 확인
    await waitFor(
      () => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent(
          'Authenticated',
        );
      },
      { timeout: 3000 },
    );

    // 추가 검증
    expect(screen.getByTestId('loading-status')).toHaveTextContent(
      'Not Loading',
    );
    expect(screen.getByTestId('user-info')).toHaveTextContent(
      'User ID: initial-session-user-id',
    );
  });
});
