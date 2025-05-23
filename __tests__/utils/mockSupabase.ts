/**
 * Supabase 모킹 유틸리티
 *
 * 테스트에서 Supabase 클라이언트와 인증 기능을 모킹합니다.
 */

import { Session, User } from "@supabase/supabase-js";
import { SupabaseClient } from "@supabase/supabase-js";
import React from "react";

// 타입 오류 해결을 위한 인터페이스 정의
interface MockUser extends Omit<User, "factors"> {
  factors: any; // 타입 호환성을 위해 any로 설정
}

// 기본 사용자 정보
export const mockUser: MockUser = {
  id: "test-user-id",
  app_metadata: {},
  user_metadata: {
    name: "테스트 사용자",
    avatar_url: "https://example.com/avatar.png",
  },
  aud: "authenticated",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  email: "test@example.com",
  email_confirmed_at: new Date().toISOString(),
  phone: "",
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  role: "authenticated",
  factors: null,
};

// 기본 모의 세션
export const mockSession = {
  user: {
    id: "test-user-id",
    email: "test@example.com",
    app_metadata: {
      provider: "email",
    },
  },
  refresh_token: "mock-refresh-token",
  access_token: "mock-access-token",
  expires_at: Date.now() + 3600,
};

// 기본 모의 데이터
export const mockData = {
  votes: [],
  rewards: [],
  user_profiles: [],
};

// 모의 Supabase 클라이언트
export const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        maybeSingle: jest.fn(() =>
          Promise.resolve({ data: null, error: null })
        ),
      })),
      limit: jest.fn(() => ({
        order: jest.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      order: jest.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    insert: jest.fn(() =>
      Promise.resolve({ data: { id: "new-id" }, error: null })
    ),
    update: jest.fn(() =>
      Promise.resolve({ data: { id: "updated-id" }, error: null })
    ),
    delete: jest.fn(() => Promise.resolve({ data: null, error: null })),
  })),
  auth: {
    getSession: jest.fn(() =>
      Promise.resolve({ data: { session: mockSession }, error: null })
    ),
    getUser: jest.fn(() =>
      Promise.resolve({ data: { user: mockSession.user }, error: null })
    ),
    signInWithPassword: jest.fn(() =>
      Promise.resolve({
        data: { user: mockSession.user, session: mockSession },
        error: null,
      })
    ),
    signInWithOAuth: jest.fn(() =>
      Promise.resolve({
        data: { provider: "google", url: "https://example.com/auth" },
        error: null,
      })
    ),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
  },
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(() =>
        Promise.resolve({ data: { path: "test-path" }, error: null })
      ),
      getPublicUrl: jest.fn(() => ({
        data: { publicUrl: "https://test-url.com/test-path" },
      })),
    })),
  },
};

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
  const session = options?.session !== undefined
    ? options.session
    : mockSession as unknown as Session;
  const error = options?.error || null;
  const data = options?.data || mockData;

  // 실시간 채널 맵
  const channels: Record<string, MockRealtimeChannel> = {};

  // 모킹된 from 메소드 생성
  const mockFrom = (table: string) => {
    return {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: data[table]?.[0] || null,
          error,
        }),
        maybeSingle: jest.fn().mockResolvedValue({
          data: data[table]?.[0] || null,
          error,
        }),
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: data[table]?.[0] || null,
            error,
          }),
          maybeSingle: jest.fn().mockResolvedValue({
            data: data[table]?.[0] || null,
            error,
          }),
          limit: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: data[table] || [],
              error,
            }),
          }),
          order: jest.fn().mockResolvedValue({
            data: data[table] || [],
            error,
          }),
        }),
        limit: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: data[table] || [],
            error,
          }),
        }),
        order: jest.fn().mockResolvedValue({ data: data[table] || [], error }),
      }),
      insert: jest.fn().mockResolvedValue({
        data: { id: "new-id", ...data[table]?.[0] },
        error,
      }),
      update: jest.fn().mockResolvedValue({
        data: { id: "updated-id", ...data[table]?.[0] },
        error,
      }),
      delete: jest.fn().mockResolvedValue({
        data: null,
        error,
      }),
    };
  };

  // 모킹된 Auth 객체 생성
  const mockAuth = {
    getSession: jest.fn().mockResolvedValue({
      data: { session },
      error,
    }),
    getUser: jest.fn().mockResolvedValue({
      data: { user },
      error,
    }),
    signInWithPassword: jest.fn().mockResolvedValue({
      data: { user, session },
      error,
    }),
    signInWithOAuth: jest.fn().mockResolvedValue({
      data: { provider: "google", url: "https://example.com/auth" },
      error,
    }),
    signUp: jest.fn().mockResolvedValue({
      data: { user, session },
      error,
    }),
    signOut: jest.fn().mockResolvedValue({ error }),
    onAuthStateChange: jest.fn().mockImplementation((callback) => {
      callback("SIGNED_IN", { session });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  };

  // 모킹된 Storage 객체 생성
  const mockStorage = {
    from: jest.fn().mockImplementation((bucket: string) => ({
      upload: jest.fn().mockResolvedValue({
        data: { path: "test-path" },
        error,
      }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: `https://test-url.com/${bucket}/test-path` },
      }),
    })),
  };

  // 모킹된 Realtime 객체 생성
  const mockRealtime = {
    channel: jest.fn().mockImplementation((name: string) => {
      if (!channels[name]) {
        channels[name] = new MockRealtimeChannel(name);
      }
      return channels[name];
    }),
  };

  // 클라이언트 객체 리턴
  return {
    from: mockFrom,
    auth: mockAuth,
    storage: mockStorage,
    realtime: mockRealtime,
    // 추가 메소드가 필요하면 여기에 구현
  } as unknown as Partial<SupabaseClient>;
};

/**
 * Supabase 모킹 설정 함수
 * 테스트에 필요한 모의 데이터와 응답을 구성합니다.
 */
export const setupSupabaseMock = (options?: {
  user?: User | null;
  session?: Session | null;
  signInError?: Error | null;
  data?: Record<string, any[]>;
}) => {
  // 기본 설정 초기화
  const user = options?.user !== undefined ? options.user : (mockUser as User);
  const session = options?.session !== undefined
    ? options.session
    : mockSession as unknown as Session;

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
      data: { user: null as any, session: null as any },
      error: options.signInError as any,
    });

    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: "" },
      error: options.signInError as any,
    });
  } else {
    // 정상 응답으로 재설정
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockSession.user, session: mockSession },
      error: null,
    });

    mockSupabaseClient.auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: "https://example.com/auth" },
      error: null,
    });
  }

  // 향상된 모킹 구성
  const mockClient = createMockSupabaseClient({
    user,
    session: session as Session | null,
    data: options?.data || mockData,
    error: options?.signInError || null,
  });

  // 향상된 클라이언트를 반환할지, 기본 클라이언트를 반환할지 결정
  // 기존 코드와의 호환성을 위해 기본 mockSupabaseClient를 반환
  return mockSupabaseClient;
};

// 모의 Supabase 응답 생성 헬퍼
export function mockSupabaseResponse(data = null, error = null) {
  return Promise.resolve({ data, error });
}

// 모든 Supabase 관련 모킹 초기화
export function resetSupabaseMocks() {
  jest.resetAllMocks();
  Object.assign(mockSession, {
    user: {
      id: "test-user-id",
      email: "test@example.com",
      app_metadata: { provider: "email" },
    },
    refresh_token: "mock-refresh-token",
    access_token: "mock-access-token",
    expires_at: Date.now() + 3600,
  });

  Object.assign(mockData, {
    votes: [],
    rewards: [],
    user_profiles: [],
  });
}

/**
 * 다양한 소셜 로그인 사용자 정보 모킹
 */
export const mockUsers = {
  google: {
    ...mockUser,
    id: "google-user-id",
    user_metadata: {
      ...mockUser.user_metadata,
      provider: "google",
      name: "Google 사용자",
    },
  } as MockUser,
  apple: {
    ...mockUser,
    id: "apple-user-id",
    user_metadata: {
      ...mockUser.user_metadata,
      provider: "apple",
      name: "Apple 사용자",
    },
  } as MockUser,
  kakao: {
    ...mockUser,
    id: "kakao-user-id",
    user_metadata: {
      ...mockUser.user_metadata,
      provider: "kakao",
      name: "Kakao 사용자",
    },
  } as MockUser,
  wechat: {
    ...mockUser,
    id: "wechat-user-id",
    user_metadata: {
      ...mockUser.user_metadata,
      provider: "wechat",
      name: "WeChat 사용자",
    },
  } as MockUser,
};

/**
 * 모킹된 실시간 구독 인터페이스
 */
export interface MockRealtimeSubscription {
  unsubscribe: () => void;
  on: (
    event: string,
    callback: (payload: any) => void,
  ) => MockRealtimeSubscription;
}

/**
 * 실시간 구독 모킹 클래스
 */
export class MockRealtimeChannel {
  private callbacks: Record<string, ((payload: any) => void)[]> = {};

  constructor(private channelName: string) {}

  on(
    event: string,
    callback: (payload: any) => void,
  ): MockRealtimeSubscription {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);

    return {
      unsubscribe: () => {
        this.callbacks[event] = this.callbacks[event].filter((cb) =>
          cb !== callback
        );
      },
      on: (ev: string, cb: (payload: any) => void) => this.on(ev, cb),
    };
  }

  // 테스트에서 이벤트 트리거
  simulateEvent(event: string, payload: any): void {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach((callback) => callback(payload));
    }
  }

  // 구독 해제
  unsubscribe(): void {
    this.callbacks = {};
  }
}

/**
 * 모든 Supabase 모킹을 초기화하는 함수
 */
export const clearSupabaseMocks = () => {
  // 모든 mocks 초기화
  jest.clearAllMocks();

  // 세션 정보 초기화
  Object.assign(mockSession, {
    user: {
      id: "test-user-id",
      email: "test@example.com",
      app_metadata: { provider: "email" },
    },
    refresh_token: "mock-refresh-token",
    access_token: "mock-access-token",
    expires_at: Date.now() + 3600,
  });

  // 데이터 초기화
  Object.assign(mockData, {
    votes: [],
    rewards: [],
    user_profiles: [],
  });
};

// AuthProvider 테스트를 위한 모킹 설정
export const setupAuthProviderTest = () => {
  // 인증 상태 변경 모킹
  const mockAuthStateChange = jest.fn().mockImplementation((callback) => {
    // 초기 인증 상태 전달
    callback("SIGNED_IN", { session: mockSession });

    // 구독 객체 반환
    return {
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    };
  });

  // Auth 객체 모킹
  const mockAuth = {
    getSession: jest.fn().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    }),
    onAuthStateChange: mockAuthStateChange,
    signOut: jest.fn().mockResolvedValue({ error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    }),
    signInWithOAuth: jest.fn().mockResolvedValue({
      data: { provider: "google", url: "https://example.com/oauth" },
      error: null,
    }),
  };

  // 전체 Supabase 클라이언트 모킹
  const mockClient = {
    auth: mockAuth,
    // 필요한 다른 기능 추가
  };

  return {
    mockClient,
    mockAuth,
    mockAuthStateChange,
  };
};

// 모의 컴포넌트를 위한 AuthProvider 구현
export const MockAuthProvider: React.FC<React.PropsWithChildren<{}>> = (
  { children },
) => {
  return React.createElement(
    "div",
    { "data-testid": "auth-provider-mock" },
    children,
  );
};
