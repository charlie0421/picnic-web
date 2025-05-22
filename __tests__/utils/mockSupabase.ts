/**
 * Supabase 모킹 유틸리티
 * 
 * Supabase 클라이언트의 쉬운 모킹을 위한 유틸리티 함수들을 제공합니다.
 */

import { User, Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';

// 타입 오류 해결을 위한 인터페이스 정의
interface MockUser extends Omit<User, 'factors'> {
  factors: any; // 타입 호환성을 위해 any로 설정
}

// 기본 사용자 정보
export const mockUser: MockUser = {
  id: 'test-user-id',
  app_metadata: {},
  user_metadata: {
    name: '테스트 사용자',
    avatar_url: 'https://example.com/avatar.png',
  },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  email: 'test@example.com',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  role: 'authenticated',
  factors: null,
};

// 기본 세션 정보
export const mockSession: Session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: mockUser as User, // 타입 단언으로 호환성 확보
  provider_token: null,
  provider_refresh_token: null,
};

/**
 * 다양한 소셜 로그인 사용자 정보 모킹
 */
export const mockUsers = {
  google: {
    ...mockUser,
    id: 'google-user-id',
    user_metadata: {
      ...mockUser.user_metadata,
      provider: 'google',
      name: 'Google 사용자',
    },
  } as MockUser,
  apple: {
    ...mockUser,
    id: 'apple-user-id',
    user_metadata: {
      ...mockUser.user_metadata,
      provider: 'apple',
      name: 'Apple 사용자',
    },
  } as MockUser,
  kakao: {
    ...mockUser,
    id: 'kakao-user-id',
    user_metadata: {
      ...mockUser.user_metadata,
      provider: 'kakao',
      name: 'Kakao 사용자',
    },
  } as MockUser,
  wechat: {
    ...mockUser,
    id: 'wechat-user-id',
    user_metadata: {
      ...mockUser.user_metadata,
      provider: 'wechat',
      name: 'WeChat 사용자',
    },
  } as MockUser,
};

/**
 * 기본 데이터베이스 테이블 응답 모킹
 */
export const mockData = {
  profiles: [
    {
      id: mockUser.id,
      user_id: mockUser.id,
      username: 'testuser',
      full_name: '테스트 사용자',
      avatar_url: 'https://example.com/avatar.png',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
  posts: [
    {
      id: 1,
      title: '테스트 게시물 1',
      content: '테스트 게시물 내용입니다',
      user_id: mockUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      title: '테스트 게시물 2',
      content: '테스트 게시물 내용입니다 2',
      user_id: mockUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
  comments: [
    {
      id: 1,
      post_id: 1,
      content: '테스트 댓글입니다',
      user_id: mockUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
  votes: [
    {
      id: 1,
      title: '테스트 투표',
      description: '테스트 투표 설명',
      user_id: mockUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
    }
  ],
  rewards: [
    {
      id: 1,
      title: '테스트 리워드',
      description: '테스트 리워드 설명',
      points: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
};

/**
 * 모킹된 실시간 구독 인터페이스
 */
export interface MockRealtimeSubscription {
  unsubscribe: () => void;
  on: (event: string, callback: (payload: any) => void) => MockRealtimeSubscription;
}

/**
 * 실시간 구독 모킹 클래스
 */
export class MockRealtimeChannel {
  private callbacks: Record<string, ((payload: any) => void)[]> = {};

  constructor(private channelName: string) {}

  on(event: string, callback: (payload: any) => void): MockRealtimeSubscription {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
    
    return {
      unsubscribe: () => {
        this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
      },
      on: (ev: string, cb: (payload: any) => void) => this.on(ev, cb)
    };
  }

  // 테스트에서 이벤트 트리거
  simulateEvent(event: string, payload: any): void {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => callback(payload));
    }
  }

  // 구독 해제
  unsubscribe(): void {
    this.callbacks = {};
  }
}

/**
 * 전체 Supabase 클라이언트 모킹
 */
export const createMockSupabaseClient = (options?: {
  user?: User | null;
  session?: Session | null;
  data?: Record<string, any[]>;
  error?: Error | null;
}): Partial<SupabaseClient> => {
  const user = options?.user !== undefined ? options.user : (mockUser as User);
  const session = options?.session !== undefined ? options.session : mockSession;
  const error = options?.error || null;
  const data = options?.data || mockData;
  
  // 실시간 채널 맵
  const channels: Record<string, MockRealtimeChannel> = {};
  
  // 모킹된 from 메소드 생성
  const mockFrom = (table: string) => {
    const tableData = data[table] || [];
    
    return {
      select: (columns = '*') => ({
        eq: (column: string, value: any) => {
          const filtered = tableData.filter(item => item[column] === value);
          return Promise.resolve({ data: filtered, error });
        },
        in: (column: string, values: any[]) => {
          const filtered = tableData.filter(item => values.includes(item[column]));
          return Promise.resolve({ data: filtered, error });
        },
        order: (column: string, { ascending = true } = {}) => {
          const sorted = [...tableData].sort((a, b) => {
            return ascending 
              ? String(a[column]).localeCompare(String(b[column]))
              : String(b[column]).localeCompare(String(a[column]));
          });
          
          return {
            limit: (limit: number) => {
              const limited = sorted.slice(0, limit);
              return Promise.resolve({ data: limited, error });
            },
            range: (from: number, to: number) => {
              const ranged = sorted.slice(from, to + 1);
              return Promise.resolve({ data: ranged, error });
            }
          };
        },
        limit: (limit: number) => {
          const limited = tableData.slice(0, limit);
          return Promise.resolve({ data: limited, error });
        },
        single: () => {
          return Promise.resolve({ data: tableData[0] || null, error });
        },
        maybeSingle: () => {
          return Promise.resolve({ data: tableData[0] || null, error });
        },
      }),
      insert: (newData: any) => {
        // 단일 항목 또는 배열 처리
        const items = Array.isArray(newData) ? newData : [newData];
        return Promise.resolve({ data: items, error });
      },
      update: (updateData: any) => {
        return Promise.resolve({ data: updateData, error });
      },
      delete: () => {
        return Promise.resolve({ data: null, error });
      },
      upsert: (upsertData: any) => {
        return Promise.resolve({ data: upsertData, error });
      },
    };
  };
  
  // 모킹된 Supabase 클라이언트
  return {
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user }, error })),
      getSession: jest.fn(() => Promise.resolve({ data: { session }, error })),
      signInWithOAuth: jest.fn(({ provider }) => {
        // 소셜 로그인 시뮬레이션
        if (provider && mockUsers[provider as keyof typeof mockUsers]) {
          return Promise.resolve({ 
            data: { url: `https://example.com/auth/${provider}` }, 
            error: null 
          });
        }
        return Promise.resolve({ data: null, error: new Error(`Unknown provider: ${provider}`) });
      }),
      signInWithPassword: jest.fn(() => Promise.resolve({ data: { user, session }, error })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: jest.fn((callback) => {
        // 즉시 콜백 호출 (테스트용)
        callback('SIGNED_IN', { session });
        
        // 구독 취소 함수 반환
        return { 
          data: { 
            subscription: { 
              unsubscribe: jest.fn() 
            } 
          } 
        };
      }),
      getUser: jest.fn(() => Promise.resolve({ data: { user }, error })),
      getSession: jest.fn(() => Promise.resolve({ data: { session }, error })),
    },
    from: jest.fn(mockFrom),
    rpc: jest.fn((fn: string, params: any) => {
      return Promise.resolve({ data: null, error });
    }),
    storage: {
      from: (bucket: string) => ({
        upload: jest.fn(() => Promise.resolve({ data: { path: 'test-file.jpg' }, error: null })),
        download: jest.fn(() => Promise.resolve({ data: new Blob(), error: null })),
        getPublicUrl: jest.fn((path) => ({ data: { publicUrl: `https://example.com/${path}` } })),
        list: jest.fn(() => Promise.resolve({ data: [], error: null })),
        remove: jest.fn(() => Promise.resolve({ data: null, error: null })),
      }),
    },
    realtime: {
      channel: (name: string) => {
        if (!channels[name]) {
          channels[name] = new MockRealtimeChannel(name);
        }
        return channels[name];
      },
    },
    // 테스트 헬퍼 메소드
    __simulateRealtimeEvent: (channel: string, event: string, payload: any) => {
      if (channels[channel]) {
        channels[channel].simulateEvent(event, payload);
      }
    },
  };
};

/**
 * Supabase 클라이언트 모킹 설정
 * 
 * Supabase 클라이언트를 모킹하기 위한 설정 함수입니다.
 * 
 * @param options 모킹 옵션 객체
 */
export const setupSupabaseMock = (options?: {
  user?: User | null;
  session?: Session | null;
  signInError?: Error | null;
  data?: Record<string, any[]>;
}) => {
  const user = options?.user !== undefined ? options.user : (mockUser as User);
  const session = options?.session !== undefined ? options.session : mockSession;
  const signInError = options?.signInError || null;
  const data = options?.data || mockData;
  
  // @supabase/ssr의 __testUtils 접근
  const ssrTestUtils = require('@supabase/ssr').__testUtils;
  if (ssrTestUtils) {
    ssrTestUtils.setUser(user);
    ssrTestUtils.setSession(session);
    
    // 데이터 설정
    if (data) {
      Object.entries(data).forEach(([table, items]) => {
        if (Array.isArray(items)) {
          items.forEach((item) => {
            if (item.id) {
              ssrTestUtils.setData(table, 'id', item.id, [item]);
            }
          });
          // 전체 테이블 데이터도 설정
          ssrTestUtils.setData(table, 'all', 'all', items);
        }
      });
    }
  }
  
  // 프로젝트의 Supabase 클라이언트 모듈 모킹 설정
  jest.spyOn(require('@/lib/supabase/client'), 'createBrowserSupabaseClient')
    .mockImplementation(() => createMockSupabaseClient({ user, session, data }));
  
  jest.spyOn(require('@/lib/supabase/client'), 'getCurrentUser').mockResolvedValue(user);
  jest.spyOn(require('@/lib/supabase/client'), 'getCurrentSession').mockResolvedValue(session);
  
  // auth 모킹 - 타입 오류 수정
  if (signInError) {
    const authMock = {
      signInWithOAuth: jest.fn().mockResolvedValue({ error: signInError }),
      signInWithPassword: jest.fn().mockResolvedValue({ error: signInError }),
    };
    
    const clientModule = require('@/lib/supabase/client');
    const mockClient = clientModule.createBrowserSupabaseClient();
    
    // 기존 auth 객체 보존하면서 오버라이드
    mockClient.auth = {
      ...mockClient.auth,
      ...authMock
    };
  }
  
  // 서버 클라이언트 모킹
  jest.spyOn(require('@/lib/supabase/server'), 'createServerSupabaseClient')
    .mockImplementation(() => createMockSupabaseClient({ user, session, data }));
  
  jest.spyOn(require('@/lib/supabase/server'), 'getServerUser').mockResolvedValue(user);
  jest.spyOn(require('@/lib/supabase/server'), 'getServerSession').mockResolvedValue(session);
};

/**
 * Supabase 모킹 정리
 * 
 * 모든 Supabase 관련 모의 설정을 초기화합니다.
 */
export const clearSupabaseMocks = () => {
  // @supabase/ssr의 __testUtils 접근
  const ssrTestUtils = require('@supabase/ssr').__testUtils;
  if (ssrTestUtils) {
    ssrTestUtils.clearAuth();
    ssrTestUtils.clearData();
  }
  
  // 모든 Supabase 관련 모킹 초기화
  jest.restoreAllMocks();
}; 