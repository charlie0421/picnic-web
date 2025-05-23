/**
 * Supabase 모킹 유틸리티
 * 
 * 테스트에서 Supabase 클라이언트와 인증 기능을 모킹합니다.
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

// 기본 모의 세션
export const mockSession = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: {
      provider: 'email'
    }
  },
  refresh_token: 'mock-refresh-token',
  access_token: 'mock-access-token',
  expires_at: Date.now() + 3600
};

// 기본 모의 데이터
export const mockData = {
  votes: [],
  rewards: [],
  user_profiles: []
};

// 모의 Supabase 클라이언트
export const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      limit: jest.fn(() => ({
        order: jest.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      order: jest.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    insert: jest.fn(() => Promise.resolve({ data: { id: 'new-id' }, error: null })),
    update: jest.fn(() => Promise.resolve({ data: { id: 'updated-id' }, error: null })),
    delete: jest.fn(() => Promise.resolve({ data: null, error: null }))
  })),
  auth: {
    getSession: jest.fn(() => Promise.resolve({ data: { session: mockSession }, error: null })),
    getUser: jest.fn(() => Promise.resolve({ data: { user: mockSession.user }, error: null })),
    signInWithPassword: jest.fn(() => Promise.resolve({ data: { user: mockSession.user, session: mockSession }, error: null })),
    signInWithOAuth: jest.fn(() => Promise.resolve({ data: { provider: 'google', url: 'https://example.com/auth' }, error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null }))
  },
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(() => Promise.resolve({ data: { path: 'test-path' }, error: null })),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://test-url.com/test-path' } }))
    }))
  }
};

/**
 * Supabase 모킹 설정 함수
 * 테스트에 필요한 모의 데이터와 응답을 구성합니다.
 */
export function setupSupabaseMock(options) {
  // 사용자 지정 세션 설정
  if (options?.session) {
    Object.assign(mockSession, options.session);
  } else if (options?.user) {
    Object.assign(mockSession.user, options.user);
  }

  // 사용자 지정 데이터 설정
  if (options?.data) {
    Object.assign(mockData, options.data);
  }

  // 로그인 오류 설정
  if (options?.signInError) {
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: options.signInError
    });
    
    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: '' },
      error: options.signInError
    });
  }

  return mockSupabaseClient;
}

// 모의 Supabase 응답 생성 헬퍼
export function mockSupabaseResponse(data = null, error = null) {
  return Promise.resolve({ data, error });
}

// 모든 Supabase 관련 모킹 초기화
export function resetSupabaseMocks() {
  jest.resetAllMocks();
  Object.assign(mockSession, {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      app_metadata: { provider: 'email' }
    },
    refresh_token: 'mock-refresh-token',
    access_token: 'mock-access-token',
    expires_at: Date.now() + 3600
  });
  
  Object.assign(mockData, {
    votes: [],
    rewards: [],
    user_profiles: []
  });
}

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

// 실제 모듈을 모킹합니다
jest.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: jest.fn(() => mockSupabaseClient),
  getCurrentUser: jest.fn(() => Promise.resolve(mockSession.user)),
  getCurrentSession: jest.fn(() => Promise.resolve(mockSession)),
  signOut: jest.fn(() => Promise.resolve({ success: true }))
}));

// AuthProvider 관련 기능 모킹
jest.mock('@/lib/supabase/auth-provider', () => {
  const React = require('react');
  
  // 모킹된 useAuth 훅
  const useAuth = jest.fn(() => ({
    user: mockSession.user || null,
    userProfile: null,
    session: mockSession,
    isLoading: false,
    isAuthenticated: !!mockSession.user,
    isInitialized: true,
    error: null,
    signIn: jest.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: jest.fn().mockResolvedValue({ error: null }),
    signUp: jest.fn().mockResolvedValue({ error: null, data: { user: mockSession.user || null } }),
    signOut: jest.fn().mockResolvedValue({ success: true }),
    refreshSession: jest.fn().mockResolvedValue(undefined),
    updateUserProfile: jest.fn().mockResolvedValue({ success: true }),
  }));

  // 모킹된 AuthProvider 컴포넌트
  const AuthProvider = ({ children }) => {
    return React.createElement('div', { 'data-testid': 'auth-provider' }, children);
  };

  return {
    useAuth,
    AuthProvider,
  };
});

// 서버 측 Supabase 함수 모킹
jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(() => mockSupabaseClient),
  getServerSession: jest.fn(() => Promise.resolve({ data: { session: mockSession }, error: null })),
  getServerUser: jest.fn(() => Promise.resolve(mockSession.user)),
  withAuth: jest.fn((callback) => {
    if (mockSession.user) {
      return callback(mockSession.user.id);
    }
    throw new Error('인증이 필요합니다');
  })
})); 