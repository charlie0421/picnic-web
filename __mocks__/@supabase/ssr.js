/**
 * @supabase/ssr 모듈 모킹
 * 
 * Supabase SSR 클라이언트에 대한 모의 구현을 제공합니다.
 */

// 기본 사용자 정보
let mockUser = null;

// 기본 세션 정보
let mockSession = null;

// 기본 데이터 저장소
const mockDataStore = new Map();

// 기본 Supabase 클라이언트 팩토리
const createMockClient = () => ({
  auth: {
    getUser: jest.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
    getSession: jest.fn(() => Promise.resolve({ data: { session: mockSession }, error: null })),
    signInWithOAuth: jest.fn(() => Promise.resolve({ error: null })),
    signInWithPassword: jest.fn(() => Promise.resolve({ error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: jest.fn((callback) => {
      // 콜백 즉시 호출 (테스트용)
      callback('SIGNED_IN', { session: mockSession });
      // 구독 취소 함수 반환
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  },
  from: jest.fn((table) => ({
    select: jest.fn((columns = '*') => ({
      eq: jest.fn((column, value) => {
        const key = `${table}:${column}:${value}`;
        const data = mockDataStore.has(key) ? mockDataStore.get(key) : [];
        return Promise.resolve({ data, error: null });
      }),
      in: jest.fn((column, values) => {
        const results = [];
        values.forEach(value => {
          const key = `${table}:${column}:${value}`;
          if (mockDataStore.has(key)) {
            results.push(...mockDataStore.get(key));
          }
        });
        return Promise.resolve({ data: results, error: null });
      }),
      order: jest.fn(() => ({
        limit: jest.fn(() => ({
          range: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
      single: jest.fn(() => {
        const key = `${table}:single`;
        const data = mockDataStore.has(key) ? mockDataStore.get(key) : null;
        return Promise.resolve({ data, error: null });
      }),
    })),
    insert: jest.fn((data) => Promise.resolve({ data, error: null })),
    update: jest.fn((data) => Promise.resolve({ data, error: null })),
    delete: jest.fn(() => Promise.resolve({ data: null, error: null })),
    upsert: jest.fn((data) => Promise.resolve({ data, error: null })),
  })),
  rpc: jest.fn((fn, params) => {
    const key = `rpc:${fn}:${JSON.stringify(params)}`;
    const data = mockDataStore.has(key) ? mockDataStore.get(key) : null;
    return Promise.resolve({ data, error: null });
  }),
});

// 브라우저 클라이언트 생성 함수
export const createBrowserClient = jest.fn(() => createMockClient());

// 서버 클라이언트 생성 함수
export const createServerClient = jest.fn(() => createMockClient());

// 쿠키 저장소 클래스
export const createServerComponentClient = jest.fn(() => createMockClient());

// 테스트에서 사용할 수 있는 유틸리티 함수들
export const __testUtils = {
  setUser: (user) => {
    mockUser = user;
  },
  setSession: (session) => {
    mockSession = session;
  },
  clearAuth: () => {
    mockUser = null;
    mockSession = null;
  },
  setData: (table, column, value, data) => {
    const key = `${table}:${column}:${value}`;
    mockDataStore.set(key, data);
  },
  setSingleData: (table, data) => {
    const key = `${table}:single`;
    mockDataStore.set(key, data);
  },
  setRpcData: (fn, params, data) => {
    const key = `rpc:${fn}:${JSON.stringify(params)}`;
    mockDataStore.set(key, data);
  },
  clearData: () => {
    mockDataStore.clear();
  },
}; 