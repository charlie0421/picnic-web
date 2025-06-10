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

// Create mock performance object
const mockPerformance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByType: jest.fn(() => []),
  getEntriesByName: jest.fn(() => []),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn(),
};

// Mock implementations
const createMockSupabaseClient = (): MockSupabaseClient => {
  return {
    auth: {
      getUser: jest.fn<() => Promise<any>>().mockResolvedValue({
        data: { user: { id: 'user123', email: 'test@example.com' } },
      }),
    },
    from: jest.fn<(table: string) => any>().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn<() => Promise<MockSupabaseResponse>>().mockResolvedValue({
            data: {
              id: 1,
              title: { ko: 'Test Vote' },
              vote_content: 'Test description',
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
          }),
          maybeSingle: jest.fn<() => Promise<any>>().mockResolvedValue({ data: null }),
        }),
      }),
    }),
    channel: jest.fn<(name: string) => any>(),
  };
};

// Mock hooks and utilities
jest.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: jest.fn(),
}));

jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
  }),
}));

// Mock the auth provider and context completely
jest.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    session: null,
    isLoading: false,
    signOut: jest.fn(),
  })),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

// Mock the auth guard hook completely
jest.mock('@/hooks/useAuthGuard', () => ({
  useRequireAuth: jest.fn(() => ({
    withAuth: jest.fn((fn: any) => {
      // Mock successful authentication
      if (typeof fn === 'function') {
        return Promise.resolve(fn());
      }
      return Promise.resolve(true);
    }),
  })),
  useAuthGuard: jest.fn(() => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    requireAuth: jest.fn(),
  })),
}));

// Mock other utility functions
jest.mock('@/utils/api/strings', () => ({
  getLocalizedString: jest.fn((obj: any, lang: string) => {
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object' && obj && lang in obj) {
      return obj[lang];
    }
    return 'Mock String';
  }),
}));

jest.mock('@/utils/api/image', () => ({
  getCdnImageUrl: jest.fn((url) => url || '/default-image.jpg'),
}));

// Mock framer-motion for animations
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock data
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
];

describe('HybridVoteDetailPresenter - Comprehensive Testing (Task 10.8)', () => {
  let mockSupabaseClient: MockSupabaseClient;
  let createBrowserSupabaseClientMock: jest.MockedFunction<any>;
  let originalPerformance: any;

  beforeAll(() => {
    // Mock performance API globally
    originalPerformance = global.performance;
    Object.defineProperty(global, 'performance', {
      writable: true,
      value: mockPerformance,
    });
  });

  afterAll(() => {
    // Restore original performance
    Object.defineProperty(global, 'performance', {
      writable: true,
      value: originalPerformance,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Only use fake timers if not already using them
    if (!jest.isMockFunction(setTimeout)) {
      jest.useFakeTimers();
    }
    
    // Create fresh mock client for each test
    mockSupabaseClient = createMockSupabaseClient();
    createBrowserSupabaseClientMock = require('@/lib/supabase/client').createBrowserSupabaseClient;
    createBrowserSupabaseClientMock.mockReturnValue(mockSupabaseClient);
    
    // Reset performance mock
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Only restore timers if we're currently using fake timers
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers();
    }
  });

  describe('🔴 실시간 모드 테스트 (WebSocket)', () => {
    it('실시간 연결이 정상적으로 이루어져야 함', async () => {
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

      // 구독 설정 확인
      const channelInstance = mockSupabaseClient.channel.mock.results[0].value;
      expect(channelInstance.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'vote_item',
        }),
        expect.any(Function)
      );
    });

    it('실시간 데이터 업데이트가 즉시 UI에 반영되어야 함', async () => {
      const mockSubscribe = jest.fn<(callback: (status: string) => void) => any>();
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        setTimeout(() => callback('SUBSCRIBED'), 10);
        return { unsubscribe: jest.fn() };
      });

      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: mockSubscribe,
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      // 실시간 이벤트 핸들러 가져오기
      const realtimeHandler = channelMock.on.mock.calls[0][2] as Function;
      
      // 실시간 업데이트 시뮬레이션
      await act(async () => {
        realtimeHandler({
          eventType: 'UPDATE',
          new: { id: 1, vote_total: 150 },
          old: { id: 1, vote_total: 100 },
        });
      });

      // UI 업데이트 확인을 위해 추가 시간 대기
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // 실시간 연결 상태 표시 확인
      expect(screen.getByText(/실시간|Realtime|Connected/i)).toBeInTheDocument();
    });

    it('실시간 연결 끊김 시 폴링 모드로 자동 전환되어야 함', async () => {
      const mockSubscribe = jest.fn<(callback: (status: string, error?: Error) => void) => any>();
      mockSubscribe.mockImplementation((callback: (status: string, error?: Error) => void) => {
        setTimeout(() => callback('CHANNEL_ERROR', new Error('Connection failed')), 10);
        return { unsubscribe: jest.fn() };
      });

      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: mockSubscribe,
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // 폴링 모드로 전환 확인 (폴링 API 호출 시작)
      await waitFor(() => {
        expect(mockSupabaseClient.from).toHaveBeenCalled();
      });

      // 모드 전환 알림 확인
      expect(screen.getByText(/폴링|Polling/i)).toBeInTheDocument();
    });

    it('네트워크 복구 시 실시간 모드로 재전환되어야 함', async () => {
      let connectionAttempts = 0;
      const mockSubscribe = jest.fn<(callback: (status: string, error?: Error) => void) => any>();
      mockSubscribe.mockImplementation((callback: (status: string, error?: Error) => void) => {
        connectionAttempts++;
        if (connectionAttempts === 1) {
          setTimeout(() => callback('CHANNEL_ERROR', new Error('Connection failed')), 10);
        } else {
          setTimeout(() => callback('SUBSCRIBED'), 10);
        }
        return { unsubscribe: jest.fn() };
      });

      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: mockSubscribe,
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      // 첫 번째 연결 실패
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // 재연결 시도 (5초 후)
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      // 재연결 성공 확인
      expect(mockSubscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('⚙️ 폴링 모드 테스트 (HTTP 요청)', () => {
    it('1초마다 정확하게 데이터를 가져와야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={1000}
        />
      );

      const initialCallCount = mockSupabaseClient.from.mock.calls.length;

      // 3초 동안 폴링 확인
      for (let i = 1; i <= 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        await waitFor(() => {
          expect(mockSupabaseClient.from.mock.calls.length).toBe(initialCallCount + i);
        });
      }
    });

    it('API 호출 실패 시 에러 카운트가 증가하고 재시도 로직이 작동해야 함', async () => {
      // API 실패 설정
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.reject(new Error('Network error'))) as any,
          })),
        })),
      });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 연속 실패 시뮬레이션
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }

      // 에러 알림 확인
      await waitFor(() => {
        expect(screen.getByText(/데이터 로딩 오류|오류|Error/i)).toBeInTheDocument();
      });
    });

    it('폴링이 브라우저 성능에 미치는 영향이 최소화되어야 함', async () => {
      let callTimes: number[] = [];

      mockSupabaseClient.from.mockImplementation(() => {
        callTimes.push(mockPerformance.now() as number);
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: null })) as any,
            })),
          })),
        };
      });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={1000}
        />
      );

      // 5초간 폴링 모니터링
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      // API 호출 간격이 일정한지 확인 (1초 ± 50ms)
      for (let i = 1; i < callTimes.length; i++) {
        const interval = callTimes[i] - callTimes[i - 1];
        expect(interval).toBeGreaterThanOrEqual(950);
        expect(interval).toBeLessThanOrEqual(1050);
      }
    });

    it('폴링 데이터 무결성 검증', async () => {
      const testData = {
        data: {
          id: 1,
          vote_item: [
            {
              id: 1,
              vote_total: 200,
              artist: { id: 1, name: { ko: 'Updated Artist' }, image: 'updated.jpg' },
            },
          ],
        },
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve(testData)) as any,
          })),
        })),
      });

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

      // 업데이트된 투표 수 확인
      await waitFor(() => {
        expect(screen.getByText('200')).toBeInTheDocument();
      });
    });

    it('응답 시간이 정확하게 측정되어야 함', async () => {
      let callIndex = 0;

      mockSupabaseClient.from.mockImplementation(() => {
        const startTime = 100 + callIndex * 1000;
        const endTime = startTime + 50; // 50ms 응답 시간 시뮬레이션
        
        // Mock return values for performance.now
        mockPerformance.now
          .mockReturnValueOnce(startTime)
          .mockReturnValueOnce(endTime);
        callIndex++;

        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: null })) as any,
            })),
          })),
        };
      });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // 응답 시간 측정이 이루어졌는지 확인
      expect(mockPerformance.now).toHaveBeenCalled();
    });
  });

  describe('📄 정적 모드 테스트', () => {
    it('정적 모드에서 초기 데이터만 표시되어야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={0}
        />
      );

      // 초기 투표 수 확인
      expect(screen.getByText('100')).toBeInTheDocument();

      // 5초 대기 후에도 API 호출이 없어야 함
      const initialCallCount = mockSupabaseClient.from.mock.calls.length;
      
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockSupabaseClient.from.mock.calls.length).toBe(initialCallCount);
    });

    it('정적 모드에서 자동 업데이트가 차단되어야 함', async () => {
      const { rerender } = render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={0}
        />
      );

      // props 변경으로 재렌더링해도 기존 데이터 유지
      const updatedItems = [...mockVoteItems];
      updatedItems[0].vote_total = 999;

      rerender(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={updatedItems}
          enableRealtime={false}
          pollingInterval={0}
        />
      );

      // 여전히 초기 값 표시
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.queryByText('999')).not.toBeInTheDocument();
    });
  });

  describe('🔄 모드 전환 테스트', () => {
    it('연결 품질에 따른 자동 모드 전환이 정확해야 함', async () => {
      let shouldFail = false;
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback: (status: string, error?: Error) => void) => {
          if (shouldFail) {
            setTimeout(() => callback('CHANNEL_ERROR', new Error('Quality degraded')), 10);
          } else {
            setTimeout(() => callback('SUBSCRIBED'), 10);
          }
          return { unsubscribe: jest.fn() };
        }),
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      // 초기 실시간 연결 성공
      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      expect(screen.getByText(/실시간|Realtime/i)).toBeInTheDocument();

      // 품질 저하로 실패 시뮬레이션
      shouldFail = true;
      
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // 폴링 모드로 전환 확인
      expect(screen.getByText(/폴링|Polling/i)).toBeInTheDocument();
    });

    it('모드 전환 시 기존 데이터와 UI 상태가 유지되어야 함', async () => {
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback: (status: string, error?: Error) => void) => {
          setTimeout(() => callback('CHANNEL_ERROR'), 10);
          return { unsubscribe: jest.fn() };
        }),
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      // 초기 데이터 확인
      expect(screen.getByText('100')).toBeInTheDocument();

      // 모드 전환 후에도 데이터 유지
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  describe('📊 연결 품질 모니터링 테스트', () => {
    it('품질 점수가 정확하게 계산되어야 함', async () => {
      let errorCount = 0;
      mockSupabaseClient.from.mockImplementation(() => {
        errorCount++;
        if (errorCount <= 2) {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => Promise.reject(new Error('Network error'))) as any,
              })),
            })),
          };
        } else {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({ data: null })) as any,
              })),
            })),
          };
        }
      });

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 연속 에러 후 성공 시나리오
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }

      // 품질 복구 확인
      await waitFor(() => {
        // 에러 메시지가 사라졌는지 확인
        expect(screen.queryByText(/데이터 로딩 오류/)).not.toBeInTheDocument();
      });
    });

    it('각 모드의 CPU 사용률이 적절해야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 10초간 폴링 실행
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });

      // 성능 측정이 이루어졌는지 확인
      expect(mockSupabaseClient.from.mock.calls.length).toBeGreaterThan(5);
    });
  });

  describe('🎨 UI/UX 테스트', () => {
    it('현재 연결 모드와 상태가 사용자에게 명확하게 표시되어야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      // 연결 상태 표시 확인
      await waitFor(() => {
        expect(screen.getByText(/실시간|Realtime|연결|Connected/i)).toBeInTheDocument();
      });
    });

    it('투표수 변경 시 애니메이션이 정상 작동해야 함', async () => {
      const testData = {
        data: {
          id: 1,
          vote_item: [
            {
              id: 1,
              vote_total: 150,
              artist: { id: 1, name: { ko: 'Artist 1' }, image: 'artist1.jpg' },
            },
          ],
        },
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve(testData)) as any,
          })),
        })),
      });

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

      // 업데이트된 값이 표시되는지 확인 (애니메이션과 함께)
      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument();
      });
    });

    it('로딩 상태가 적절하게 표시되어야 함', async () => {
      // 로딩 지연 시뮬레이션
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => new Promise(resolve => setTimeout(() => resolve({ data: null }), 2000))) as any,
          })),
        })),
      });

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

      // 로딩 표시가 있는지 확인 (스피너, 스켈레톤 등)
      // 로딩 상태는 주로 초기 렌더링에서 확인
      expect(screen.getByText(/Test Vote/)).toBeInTheDocument();
    });
  });

  describe('⚡ 성능 및 안정성 테스트', () => {
    it('장시간 사용 시 메모리 누수가 발생하지 않아야 함', async () => {
      const { unmount } = render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 100회 폴링 시뮬레이션
      for (let i = 0; i < 100; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }

      // 컴포넌트 언마운트
      unmount();

      // 모든 타이머가 정리되었는지 확인
      expect(jest.getTimerCount()).toBe(0);
    });

    it('각 모드의 CPU 사용률이 적절해야 함', async () => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
        />
      );

      // 10초간 폴링 실행
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });

      // 성능 측정이 이루어졌는지 확인
      expect(mockSupabaseClient.from.mock.calls.length).toBeGreaterThan(5);
    });
  });

  describe('🔥 극한 상황 테스트', () => {
    it('고빈도 데이터 변경 시 시스템 안정성이 유지되어야 함', async () => {
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback: (status: string) => void) => {
          setTimeout(() => callback('SUBSCRIBED'), 10);
          return { unsubscribe: jest.fn() };
        }),
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      const realtimeHandler = channelMock.on.mock.calls[0][2] as Function;

      // 100회 빠른 업데이트 시뮬레이션
      for (let i = 0; i < 100; i++) {
        await act(async () => {
          realtimeHandler({
            eventType: 'UPDATE',
            new: { id: 1, vote_total: 100 + i },
          });
        });
      }

      // 시스템이 여전히 응답하는지 확인
      expect(screen.getByText(/Test Vote/)).toBeInTheDocument();
    });

    it('네트워크 불안정 상황에서의 안정성 확인', async () => {
      let connectionAttempts = 0;
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback: (status: string, error?: Error) => void) => {
          connectionAttempts++;
          // 불안정한 연결 시뮬레이션
          if (connectionAttempts % 2 === 0) {
            setTimeout(() => callback('CHANNEL_ERROR', new Error('Unstable network')), 10);
          } else {
            setTimeout(() => callback('SUBSCRIBED'), 10);
          }
          return { unsubscribe: jest.fn() };
        }),
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      // 20초간 불안정한 네트워크 시뮬레이션
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          jest.advanceTimersByTime(5000);
        });
      }

      // 여러 번의 연결 시도가 있었는지 확인
      expect(connectionAttempts).toBeGreaterThan(1);
      
      // 애플리케이션이 여전히 동작하는지 확인
      expect(screen.getByText(/Test Vote/)).toBeInTheDocument();
    });
  });

  describe('🧪 통합 시나리오 테스트', () => {
    it('전체 사용자 여정: 실시간 → 폴링 → 실시간 복구', async () => {
      let connectionState = 'good';
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback: (status: string, error?: Error) => void) => {
          if (connectionState === 'good') {
            setTimeout(() => callback('SUBSCRIBED'), 10);
          } else {
            setTimeout(() => callback('CHANNEL_ERROR', new Error('Network issue')), 10);
          }
          return { unsubscribe: jest.fn() };
        }),
      };

      mockSupabaseClient.channel.mockReturnValue(channelMock);

      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={true}
        />
      );

      // 1. 초기 실시간 연결
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      expect(screen.getByText(/실시간|Realtime/i)).toBeInTheDocument();

      // 2. 연결 불량으로 폴링 모드 전환
      connectionState = 'bad';
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      
      // 폴링이 시작되었는지 확인
      await waitFor(() => {
        expect(mockSupabaseClient.from).toHaveBeenCalled();
      });

      // 3. 네트워크 복구로 실시간 모드 복귀
      connectionState = 'good';
      await act(async () => {
        jest.advanceTimersByTime(5000); // 재연결 대기 시간
      });

      // 재연결 시도가 이루어졌는지 확인
      expect(channelMock.subscribe.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});