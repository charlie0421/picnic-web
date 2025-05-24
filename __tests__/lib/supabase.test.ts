/**
 * lib/supabase.ts 테스트
 *
 * 이 테스트는 Supabase 클라이언트 생성 로직을 검증합니다.
 * 테스트 대상: supabase 클라이언트 인스턴스
 */

// Supabase 모킹
const mockCreateClient = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

describe('lib/supabase', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // 환경 변수 초기화
    process.env = { ...originalEnv };
    // 모듈 캐시 초기화
    jest.resetModules();
  });

  afterEach(() => {
    // 환경 변수 복원
    process.env = originalEnv;
  });

  it('환경 변수가 설정되어 있을 때 Supabase 클라이언트를 생성한다', () => {
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    // 모킹된 클라이언트 반환값 설정
    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드
    const { supabase } = require('@/lib/supabase');

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key'
    );
    expect(supabase).toBe(mockClient);
  });

  it('createClient가 올바른 매개변수로 호출된다', () => {
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://valid.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key';

    // 모킹된 클라이언트 반환값 설정
    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드
    require('@/lib/supabase');

    // createClient가 정확히 한 번 호출되었는지 확인
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://valid.supabase.co',
      'valid-anon-key'
    );
  });

  it('다양한 URL 형식을 처리할 수 있다', () => {
    const testCases = [
      { url: 'https://test.supabase.co', key: 'test-key-1' },
      { url: 'https://my-project.supabase.co', key: 'test-key-2' },
      { url: 'https://localhost:54321', key: 'test-key-3' },
    ];

    testCases.forEach(({ url, key }) => {
      // 각 테스트 케이스마다 환경 초기화
      jest.resetModules();
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;

      const mockClient = { from: jest.fn() };
      mockCreateClient.mockReturnValue(mockClient);

      // 모듈 로드
      const { supabase } = require('@/lib/supabase');

      expect(mockCreateClient).toHaveBeenCalledWith(url, key);
      expect(supabase).toBe(mockClient);

      // 다음 테스트를 위해 모킹 초기화
      mockCreateClient.mockClear();
    });
  });

  it('특수 문자가 포함된 키를 처리할 수 있다', () => {
    // 특수 문자가 포함된 키 테스트
    const specialKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key-with-special-chars_123';
    
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = specialKey;

    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드
    const { supabase } = require('@/lib/supabase');

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      specialKey
    );
    expect(supabase).toBe(mockClient);
  });

  it('Supabase 클라이언트가 올바른 메서드를 가지고 있다', () => {
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    // 실제 Supabase 클라이언트와 유사한 모킹
    const mockClient = { 
      from: jest.fn(),
      auth: { signIn: jest.fn(), signOut: jest.fn() },
      storage: { from: jest.fn() }
    };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드
    const { supabase } = require('@/lib/supabase');

    expect(supabase).toHaveProperty('from');
    expect(supabase).toHaveProperty('auth');
    expect(supabase).toHaveProperty('storage');
  });

  it('모듈이 올바르게 export된다', () => {
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드
    const supabaseModule = require('@/lib/supabase');

    expect(supabaseModule).toHaveProperty('supabase');
    expect(typeof supabaseModule.supabase).toBe('object');
  });

  it('환경 변수가 정의되어 있으면 클라이언트를 생성한다', () => {
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'example-key';

    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드 시 에러가 발생하지 않아야 함
    expect(() => {
      require('@/lib/supabase');
    }).not.toThrow();

    expect(mockCreateClient).toHaveBeenCalled();
  });

  it('createClient 함수가 정확한 순서로 매개변수를 받는다', () => {
    const testUrl = 'https://order-test.supabase.co';
    const testKey = 'order-test-key';

    process.env.NEXT_PUBLIC_SUPABASE_URL = testUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = testKey;

    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 모듈 로드
    require('@/lib/supabase');

    // 첫 번째 매개변수가 URL, 두 번째가 키인지 확인
    const [firstArg, secondArg] = mockCreateClient.mock.calls[0];
    expect(firstArg).toBe(testUrl);
    expect(secondArg).toBe(testKey);
  });

  it('여러 번 require해도 동일한 인스턴스를 반환한다', () => {
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://singleton.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'singleton-key';

    const mockClient = { from: jest.fn() };
    mockCreateClient.mockReturnValue(mockClient);

    // 첫 번째 require
    const { supabase: supabase1 } = require('@/lib/supabase');
    
    // 두 번째 require (모듈 캐시에서 가져옴)
    const { supabase: supabase2 } = require('@/lib/supabase');

    expect(supabase1).toBe(supabase2);
    // createClient는 한 번만 호출되어야 함
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });
}); 