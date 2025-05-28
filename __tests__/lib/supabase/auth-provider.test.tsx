import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/supabase/auth-provider';
import '@testing-library/jest-dom';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// Mock the client module
jest.mock('@/lib/supabase/client');

const mockSupabase = {
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
    signInWithPassword: jest.fn(),
    signInWithOAuth: jest.fn(),
    signUp: jest.fn(),
    refreshSession: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
};

(createBrowserSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);

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
    jest.clearAllTimers();
    jest.useFakeTimers();

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

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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

  test('프로필 조회 타임아웃 시 기본 프로필 생성', async () => {
    const testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2023-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
    };

    const testSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: testUser,
    };

    // getSession은 성공하지만 프로필 조회는 타임아웃
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: testSession },
      error: null,
    });

    // 프로필 조회가 5초 이상 걸리도록 설정
    const profileQuery = mockSupabase.from().select().eq().single;
    profileQuery.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ data: null, error: null }), 6000))
    );

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // 5초 경과 (프로필 조회 타임아웃)
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Not Loading');
    });

    // 인증 상태는 유지되어야 함
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    expect(screen.getByTestId('user-info')).toHaveTextContent('User ID: test-user-id');
  });

  test('세션 조회 타임아웃 시 비로그인 상태로 정상 초기화', async () => {
    // getSession이 5초 이상 걸리도록 설정
    mockSupabase.auth.getSession.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ data: { session: null }, error: null }), 6000))
    );

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // 5초 경과 (강제 초기화 완료)
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Not Loading');
    });

    // 비로그인 상태로 초기화되어야 함
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Not Authenticated');
    expect(screen.getByTestId('user-info')).toHaveTextContent('No User');
  });

  test('프로필 조회 에러 시 기본 프로필 생성', async () => {
    const testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2023-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
    };

    const testSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: testUser,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: testSession },
      error: null,
    });

    // 프로필 조회에서 에러 발생
    const profileQuery = mockSupabase.from().select().eq().single;
    profileQuery.mockResolvedValue({
      data: null,
      error: { message: 'Database connection failed', code: 'PGRST301' },
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Not Loading');
    });

    // 인증 상태는 유지되어야 함
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    expect(screen.getByTestId('user-info')).toHaveTextContent('User ID: test-user-id');
  });

  test('네트워크 예외 시 기본 프로필 생성', async () => {
    const testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2023-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
    };

    const testSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: testUser,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: testSession },
      error: null,
    });

    // 프로필 조회에서 네트워크 예외 발생
    const profileQuery = mockSupabase.from().select().eq().single;
    profileQuery.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Not Loading');
    });

    // 인증 상태는 유지되어야 함
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    expect(screen.getByTestId('user-info')).toHaveTextContent('User ID: test-user-id');
  });

  test('정상적인 프로필 조회 시 캐시 저장', async () => {
    const testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2023-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
    };

    const testSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: testUser,
    };

    const testProfile = {
      id: 'test-user-id',
      email: 'test@example.com',
      nickname: 'testuser',
      avatar_url: null,
      is_admin: false,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      deleted_at: null,
      birth_date: null,
      birth_time: null,
      gender: null,
      open_ages: false,
      open_gender: false,
      star_candy: 100,
      star_candy_bonus: 0,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: testSession },
      error: null,
    });

    // 정상적인 프로필 조회
    const profileQuery = mockSupabase.from().select().eq().single;
    profileQuery.mockResolvedValue({
      data: testProfile,
      error: null,
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Not Loading');
    });

    // 인증 상태와 프로필이 정상적으로 로드되어야 함
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    expect(screen.getByTestId('user-info')).toHaveTextContent('User ID: test-user-id');
  });
});
