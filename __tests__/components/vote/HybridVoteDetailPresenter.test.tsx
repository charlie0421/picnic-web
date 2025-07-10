import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { Vote, VoteItem } from '@/types/interfaces';

// Create proper mock types
interface MockSupabaseResponse {
  data: any;
  error?: any;
}

interface MockSupabaseClient {
  auth: {
    getUser: jest.MockedFunction<() => Promise<any>>;
  };
  from: jest.MockedFunction<(table: string) => any>;
  channel: jest.MockedFunction<(name: string) => any>;
}

// Mock Supabase client with explicit typing
const createMockSupabaseClient = (): MockSupabaseClient => ({
  auth: {
    getUser: jest.fn<() => Promise<any>>(),
  },
  from: jest.fn<(table: string) => any>(),
  channel: jest.fn<(name: string) => any>(),
});

const mockSupabaseClient = createMockSupabaseClient();

// Mock hooks
jest.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => mockSupabaseClient,
}));

jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
  }),
}));

// Mock useAuthGuard hook completely
jest.mock('@/hooks/useAuthGuard', () => ({
  useAuthGuard: jest.fn(() => ({
    user: { id: 'user123', email: 'test@example.com' },
    session: { access_token: 'mock-token' },
    isLoading: false,
    signOut: jest.fn(),
    requireAuth: jest.fn(),
  })),
  useRequireAuth: jest.fn(() => ({
    withAuth: jest.fn((fn: any) => (...args: any[]) => (fn as any)(...args)),
  })),
}));

// Mock AuthProvider completely
jest.mock('@/lib/supabase/auth-provider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: jest.fn(() => ({
    user: { id: 'user123', email: 'test@example.com' },
    session: { access_token: 'mock-token' },
    isLoading: false,
    signOut: jest.fn(),
  })),
}));

// Mock data with correct types
const mockVote: Vote = {
  id: 1,
  title: { ko: 'Test Vote' },
  vote_content: 'Test vote description',
  start_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  stop_at: new Date('2024-12-31T23:59:59Z').toISOString(),
  area: 'global',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  main_image: null,
  order: null,
  result_image: null,
  visible_at: null,
  vote_category: null,
  vote_sub_category: null,
  wait_image: null,
};

const mockVoteItems: VoteItem[] = [
  {
    id: 1,
    artist_id: 1,
    group_id: 1,
    vote_id: 1,
    vote_total: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    artist: {
      id: 1,
      name: { ko: 'Artist 1' },
      image: 'https://example.com/artist1.jpg',
      birth_date: null,
      created_at: new Date().toISOString(),
      debut_date: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      deleted_at: null,
      gender: null,
      group_id: null,
      is_kpop: true,
      is_musical: false,
      is_solo: true,
      updated_at: new Date().toISOString(),
      dd: null,
      mm: null,
      yy: null,
    },
  },
  {
    id: 2,
    artist_id: 2,
    group_id: 1,
    vote_id: 1,
    vote_total: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    artist: {
      id: 2,
      name: { ko: 'Artist 2' },
      image: 'https://example.com/artist2.jpg',
      birth_date: null,
      created_at: new Date().toISOString(),
      debut_date: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      deleted_at: null,
      gender: null,
      group_id: null,
      is_kpop: true,
      is_musical: false,
      is_solo: true,
      updated_at: new Date().toISOString(),
      dd: null,
      mm: null,
      yy: null,
    },
  },
];

// Helper function to create mock chain
const createMockChain = (resolveValue?: any, rejectValue?: any) => {
  const mockSingle = jest.fn<() => Promise<MockSupabaseResponse>>();
  
  if (rejectValue) {
    mockSingle.mockRejectedValue(rejectValue);
  } else {
    mockSingle.mockResolvedValue(resolveValue || {
      data: {
        id: 1,
        title: { ko: 'Test Vote' },
        vote_content: 'Test vote description',
        vote_item: [
          {
            id: 1,
            vote_total: 100,
            artist: { id: 1, name: { ko: 'Artist 1' }, image: 'artist1.jpg' },
          },
          {
            id: 2,
            vote_total: 50,
            artist: { id: 2, name: { ko: 'Artist 2' }, image: 'artist2.jpg' },
          },
        ],
      },
    });
  }

  const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
  return { mockSelect, mockEq, mockSingle };
};

// Test Wrapper with complete mocked context
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockAuthContext = React.useMemo(() => ({
    user: { id: 'user123', email: 'test@example.com' },
    session: { access_token: 'mock-token' },
    isLoading: false,
    signOut: jest.fn(),
  }), []);
  
  return (
    <div data-testid="auth-provider">
      {children}
    </div>
  );
};

describe('HybridVoteDetailPresenter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup default mocks with proper typing
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user123', email: 'test@example.com' } },
    });
    
    const { mockSelect } = createMockChain();
    mockSupabaseClient.from.mockReturnValue({ select: mockSelect });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('기본 렌더링 테스트', () => {
    it('컴포넌트가 정상적으로 렌더링되어야 함', () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
        />
      );

      // 투표 제목 확인 (JSON 객체에서 한국어 제목 추출)
      expect(screen.getByText('Test Vote')).toBeInTheDocument();
    });

    it('초기 투표 아이템들이 표시되어야 함', () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
        />
      );

      // Artist 이름이 JSON 객체로 저장되므로 적절한 텍스트를 찾아야 함
      expect(screen.getByText(/Artist 1|아티스트/)).toBeInTheDocument();
    });
  });

  describe('폴링 모드 테스트', () => {
    it('폴링 모드에서 지정된 간격으로 데이터를 가져와야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={1000}
        />
      );

      // 초기 호출
      await waitFor(() => {
        expect(mockSupabaseClient.from).toHaveBeenCalled();
      });

      const initialCallCount = mockSupabaseClient.from.mock.calls.length;

      // 1초 후 추가 호출 확인
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(mockSupabaseClient.from.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('폴링 에러 발생 시 에러 알림이 표시되어야 함', async () => {
      const { mockSelect } = createMockChain(undefined, new Error('Network error'));
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // 에러 알림이 표시되는지 확인
      await waitFor(() => {
        expect(screen.queryByText(/데이터 로딩 오류|오류|error/i)).toBeInTheDocument();
      });
    });

    it('폴링 성공 시 투표 데이터가 업데이트되어야 함', async () => {
      const updatedData = {
        data: {
          id: 1,
          title: { ko: 'Updated Vote' },
          vote_content: 'Updated description',
          vote_item: [
            {
              id: 1,
              vote_total: 150, // 업데이트된 투표 수
              artist: { id: 1, name: { ko: 'Artist 1' }, image: 'artist1.jpg' },
            },
          ],
        },
      };

      const { mockSelect } = createMockChain(updatedData);
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // 업데이트된 데이터가 표시되는지 확인 (150이라는 숫자가 화면에 있는지 확인)
      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument();
      });
    });
  });

  describe('정적 모드 테스트', () => {
    it('정적 모드에서는 자동 업데이트가 발생하지 않아야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={0} // 폴링 비활성화
        />
      );

      const initialCallCount = mockSupabaseClient.from.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(5000); // 5초 대기
      });

      // API 호출이 추가로 발생하지 않았는지 확인
      expect(mockSupabaseClient.from.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('실시간 모드 테스트', () => {
    it('실시간 모드가 활성화될 때 Supabase 채널을 구독해야 함', async () => {
      const mockSubscribe = jest.fn();
      const mockOn = jest.fn().mockReturnValue({ subscribe: mockSubscribe });
      
      mockSupabaseClient.channel.mockReturnValue({ on: mockOn });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      await waitFor(() => {
        expect(mockSupabaseClient.channel).toHaveBeenCalledWith('supabase_realtime');
      });
    });

    it('실시간 연결 실패 시 폴링 모드로 자동 전환되어야 함', async () => {
      const mockSubscribe = jest.fn<(callback: (status: string, error?: Error) => void) => any>();
      mockSubscribe.mockImplementation((callback: (status: string, error?: Error) => void) => {
        // 연결 실패 시뮬레이션
        setTimeout(() => callback('CHANNEL_ERROR', new Error('Connection failed')), 100);
        return { unsubscribe: jest.fn() };
      });
      const mockOn = jest.fn().mockReturnValue({ subscribe: mockSubscribe });
      mockSupabaseClient.channel.mockReturnValue({ on: mockOn });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // 폴링 모드로 전환 확인 (API 호출이 시작되었는지 확인)
      await waitFor(() => {
        expect(mockSupabaseClient.from).toHaveBeenCalled();
      });
    });
  });

  describe('연결 품질 모니터링 테스트', () => {
    it('연속 에러 발생 시 에러가 누적되어야 함', async () => {
      // 에러를 반환하는 모킹 설정
      const { mockSelect } = createMockChain(undefined, new Error('Network error'));
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 여러 번의 폴링으로 연속 에러 발생
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }

      // 에러 메시지가 표시되는지 확인
      await waitFor(() => {
        expect(screen.queryByText(/오류|error/i)).toBeInTheDocument();
      });
    });
  });

  describe('성능 테스트', () => {
    it('빈번한 데이터 업데이트 시 메모리 누수가 발생하지 않아야 함', async () => {
      const { unmount } = render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 여러 번의 빠른 업데이트 시뮬레이션
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          jest.advanceTimersByTime(100);
        });
      }

      // 컴포넌트 언마운트
      unmount();

      // 타이머가 정리되었는지 확인
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('에러 복구 테스트', () => {
    it('네트워크 복구 후 정상 동작으로 돌아와야 함', async () => {
      let shouldError = true;
      
      const mockSingle = jest.fn<() => Promise<MockSupabaseResponse>>();
      mockSingle.mockImplementation(() => {
        if (shouldError) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          data: {
            id: 1,
            vote_item: [
              {
                id: 1,
                vote_total: 100,
                artist: { id: 1, name: { ko: 'Artist 1' }, image: 'artist1.jpg' },
              },
            ],
          },
        });
      });

      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 초기 에러 상태
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByText(/오류|error/i)).toBeInTheDocument();
      });

      // 네트워크 복구 시뮬레이션
      shouldError = false;

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // 정상 동작 복구 확인 (에러 메시지가 사라졌는지 확인)
      await waitFor(() => {
        expect(screen.queryByText(/데이터 로딩 오류/)).not.toBeInTheDocument();
      });
    });
  });
});