/**
 * AuthProvider 성능 개선 통합 테스트
 * 
 * 타임아웃 개선, 에러 처리, 기본 프로필 생성 등
 * 실제 시나리오를 시뮬레이션하여 검증
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// AuthProvider 두 버전 모두 테스트
import { AuthProvider as OriginalAuthProvider, useAuth } from '@/lib/supabase/auth-provider';

// Mock Supabase client
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

(createBrowserSupabaseClient as jest.MockedFunction<typeof createBrowserSupabaseClient>)
  .mockReturnValue(mockSupabase as any);

// 테스트용 컴포넌트
const TestComponent = () => {
  const { user, userProfile, isLoading, isInitialized } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{isLoading.toString()}</div>
      <div data-testid="initialized">{isInitialized.toString()}</div>
      <div data-testid="user">{user?.id || 'null'}</div>
      <div data-testid="profile-id">{userProfile?.id || 'null'}</div>
      <div data-testid="profile-email">{userProfile?.email || 'null'}</div>
      <div data-testid="profile-nickname">{userProfile?.nickname || 'null'}</div>
    </div>
  );
};

const renderWithAuth = (AuthProvider: React.ComponentType<any>) => {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
};

describe('AuthProvider 성능 개선 통합 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('타임아웃 개선 테스트', () => {
    test('프로필 조회 5초 타임아웃 내에서 성공', async () => {
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
        nickname: 'TestUser',
        avatar_url: null,
        birth_date: null,
        birth_time: null,
        gender: null,
        is_admin: false,
        open_ages: false,
        open_gender: false,
        star_candy: 100,
        star_candy_bonus: 10,
        deleted_at: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      // 세션 조회 성공
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: testSession },
        error: null,
      });

      // 프로필 조회가 4초 후 성공 (5초 타임아웃 내)
      const profileQuery = mockSupabase.from().select().eq().single;
      profileQuery.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          data: testProfile,
          error: null
        }), 4000))
      );

      renderWithAuth(OriginalAuthProvider);

      // 초기 로딩 상태 확인
      expect(screen.getByTestId('loading')).toHaveTextContent('true');
      expect(screen.getByTestId('initialized')).toHaveTextContent('false');

      // 4초 진행 (프로필 조회 완료)
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test-user-id');
        expect(screen.getByTestId('profile-id')).toHaveTextContent('test-user-id');
        expect(screen.getByTestId('profile-email')).toHaveTextContent('test@example.com');
        expect(screen.getByTestId('profile-nickname')).toHaveTextContent('TestUser');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('initialized')).toHaveTextContent('true');
      });
    });

    test('프로필 조회 5초 타임아웃 시 기본 프로필 생성', async () => {
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

      // 세션 조회 성공
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: testSession },
        error: null,
      });

      // 프로필 조회가 6초 후 응답 (5초 타임아웃 초과)
      const profileQuery = mockSupabase.from().select().eq().single;
      profileQuery.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          data: null,
          error: { message: 'Timeout' }
        }), 6000))
      );

      renderWithAuth(OriginalAuthProvider);

      // 5초 진행 (타임아웃 발생)
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        // 사용자는 인증되어 있어야 함
        expect(screen.getByTestId('user')).toHaveTextContent('test-user-id');
        
        // 기본 프로필이 생성되어야 함
        expect(screen.getByTestId('profile-id')).toHaveTextContent('test-user-id');
        expect(screen.getByTestId('profile-email')).toHaveTextContent('test@example.com');
        expect(screen.getByTestId('profile-nickname')).toHaveTextContent('test'); // email 앞부분
        
        // 로딩 완료 및 초기화 완료
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('initialized')).toHaveTextContent('true');
        

      });
    });
  });

  describe('에러 처리 개선 테스트', () => {
    test('프로필 조회 네트워크 에러 시 기본 프로필 생성', async () => {
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

      // 세션 조회 성공
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: testSession },
        error: null,
      });

      // 프로필 조회 네트워크 에러
      const profileQuery = mockSupabase.from().select().eq().single;
      profileQuery.mockRejectedValue(new Error('Network Error'));

      renderWithAuth(OriginalAuthProvider);

      await waitFor(() => {
        // 사용자는 인증되어 있어야 함
        expect(screen.getByTestId('user')).toHaveTextContent('test-user-id');
        
        // 기본 프로필이 생성되어야 함
        expect(screen.getByTestId('profile-id')).toHaveTextContent('test-user-id');
        expect(screen.getByTestId('profile-email')).toHaveTextContent('test@example.com');
        
        // 초기화 완료
        expect(screen.getByTestId('initialized')).toHaveTextContent('true');
      });
    });

    test('프로필 데이터 없음 시 기본 프로필 생성', async () => {
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

      // 세션 조회 성공
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: testSession },
        error: null,
      });

      // 프로필 조회 결과가 없음
      const profileQuery = mockSupabase.from().select().eq().single;
      profileQuery.mockResolvedValue({
        data: null,
        error: null
      });

      renderWithAuth(OriginalAuthProvider);

      await waitFor(() => {
        // 기본 프로필이 생성되어야 함
        expect(screen.getByTestId('profile-id')).toHaveTextContent('test-user-id');
        expect(screen.getByTestId('profile-email')).toHaveTextContent('test@example.com');
        expect(screen.getByTestId('profile-nickname')).toHaveTextContent('test');
      });
    });
  });

  describe('초기화 성능 테스트', () => {
    test('초기화 강제 완료 타임아웃이 5초로 연장됨', async () => {
      // 세션 조회가 매우 느림
      mockSupabase.auth.getSession.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          data: { session: null },
          error: null
        }), 7000)) // 7초 소요
      );

      renderWithAuth(OriginalAuthProvider);

      // 4초 진행 (기존 2초 타임아웃보다 길지만 새로운 5초 타임아웃보다 짧음)
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      // 아직 초기화가 강제 완료되지 않아야 함
      expect(screen.getByTestId('initialized')).toHaveTextContent('false');
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      // 5초 진행 (새로운 타임아웃 도달)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        // 5초 후 강제 초기화 완료
        expect(screen.getByTestId('initialized')).toHaveTextContent('true');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });
  });

  describe('세션 처리 안정성 테스트', () => {
    test('세션 조회 실패 시에도 안정적으로 처리', async () => {
      // 세션 조회 실패
      mockSupabase.auth.getSession.mockRejectedValue(new Error('Session Error'));

      renderWithAuth(OriginalAuthProvider);

      await waitFor(() => {
        // 에러가 발생해도 초기화는 완료되어야 함
        expect(screen.getByTestId('initialized')).toHaveTextContent('true');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        
        // 사용자는 로그아웃 상태
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('profile-id')).toHaveTextContent('null');
      });
    });
  });
}); 