/**
 * Supabase 모킹 유틸리티
 * 
 * Supabase 클라이언트의 쉬운 모킹을 위한 유틸리티 함수들을 제공합니다.
 */

import { User, Session } from '@supabase/supabase-js';

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
  
  // @supabase/ssr의 __testUtils 접근
  const ssrTestUtils = require('@supabase/ssr').__testUtils;
  if (ssrTestUtils) {
    ssrTestUtils.setUser(user);
    ssrTestUtils.setSession(session);
    
    // 데이터 설정
    if (options?.data) {
      Object.entries(options.data).forEach(([table, items]) => {
        items.forEach((item) => {
          if (item.id) {
            ssrTestUtils.setData(table, 'id', item.id, [item]);
          }
        });
        // 전체 테이블 데이터도 설정
        ssrTestUtils.setData(table, 'all', 'all', items);
      });
    }
  }
  
  // 프로젝트의 Supabase 클라이언트 모듈 모킹 설정
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