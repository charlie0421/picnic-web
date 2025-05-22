import {
  createServerSupabaseClient,
  createServerSupabaseClientWithCookies,
  createServerSupabaseClientWithRequest,
  getServerSession,
  getServerUser,
  withAuth
} from '@/lib/supabase/server';

// Mock the @supabase/ssr dependency
jest.mock('@supabase/ssr', () => {
  const mockServerClient = {
    auth: {
      getSession: jest.fn(() => Promise.resolve({
        data: {
          session: {
            user: {
              id: 'test-server-user-id',
              email: 'test@example.com'
            }
          }
        },
        error: null
      })),
      getUser: jest.fn(() => Promise.resolve({
        data: { user: { id: 'test-server-user-id' } },
        error: null
      })),
    }
  };
  
  return {
    createServerClient: jest.fn(() => mockServerClient),
  };
});

// Mocking environment variables
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-supabase-url.com';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

describe('createServerSupabaseClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a server Supabase client', () => {
    const client = createServerSupabaseClient();
    expect(client).toBeDefined();
  });

  it('should throw an error if NEXT_PUBLIC_SUPABASE_URL is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    expect(() => createServerSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.'
    );
  });

  it('should throw an error if NEXT_PUBLIC_SUPABASE_ANON_KEY is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    expect(() => createServerSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.'
    );
  });
});

describe('createServerSupabaseClientWithCookies', () => {
  it('should create a client with the provided cookie store', () => {
    const mockCookieStore = {
      get: jest.fn(name => ({ name, value: `value-for-${name}` })),
      set: jest.fn(),
      remove: jest.fn()
    };

    const client = createServerSupabaseClientWithCookies(mockCookieStore);
    expect(client).toBeDefined();
  });

  it('should handle cookie store without remove method', async () => {
    const mockCookieStore = {
      get: jest.fn(name => ({ name, value: `value-for-${name}` })),
      set: jest.fn()
    };

    const client = createServerSupabaseClientWithCookies(mockCookieStore);
    
    // Accessing private cookies object to test implementation
    // @ts-ignore - Accessing private property for testing
    const cookiesObj = client.cookies;
    
    // Call the remove method to ensure it uses set instead when remove is not available
    await cookiesObj.remove('test-cookie', { path: '/' });
    
    expect(mockCookieStore.set).toHaveBeenCalledWith(expect.objectContaining({
      name: 'test-cookie',
      value: '',
      maxAge: 0
    }));
  });
});

describe('createServerSupabaseClientWithRequest', () => {
  it('should create a client with req/res objects', () => {
    const mockReq = {
      cookies: {
        'test-cookie': 'test-value'
      }
    };
    
    const mockRes = {
      setHeader: jest.fn()
    };

    const client = createServerSupabaseClientWithRequest(mockReq, mockRes);
    expect(client).toBeDefined();
  });

  it('should access cookies from request object', async () => {
    const mockReq = {
      cookies: {
        'test-cookie': 'test-value'
      }
    };
    
    const mockRes = {
      setHeader: jest.fn()
    };

    const client = createServerSupabaseClientWithRequest(mockReq, mockRes);
    
    // @ts-ignore - Accessing private property for testing
    const cookiesObj = client.cookies;
    const cookieValue = await cookiesObj.get('test-cookie');
    
    expect(cookieValue).toBe('test-value');
  });

  it('should set cookies on response object', async () => {
    const mockReq = { cookies: {} };
    const mockRes = { setHeader: jest.fn() };

    const client = createServerSupabaseClientWithRequest(mockReq, mockRes);
    
    // @ts-ignore - Accessing private property for testing
    const cookiesObj = client.cookies;
    await cookiesObj.set('test-cookie', 'new-value', { 
      maxAge: 3600, 
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax'
    });
    
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('test-cookie=new-value')
    );
  });
});

describe('getServerSession', () => {
  it('should return the current session', async () => {
    const { data } = await getServerSession();
    expect(data.session.user.id).toBe('test-server-user-id');
  });
});

describe('getServerUser', () => {
  it('should return the current user', async () => {
    const user = await getServerUser();
    expect(user).toEqual({
      id: 'test-server-user-id',
      email: 'test@example.com'
    });
  });

  it('should return null when no session exists', async () => {
    // Mock getSession to return no session
    const { createServerClient } = require('@supabase/ssr');
    const mockClient = createServerClient();
    mockClient.auth.getSession.mockImplementationOnce(() => 
      Promise.resolve({ data: { session: null }, error: null })
    );

    const user = await getServerUser();
    expect(user).toBeNull();
  });
});

describe('withAuth', () => {
  it('should call the callback with user ID when authenticated', async () => {
    const mockCallback = jest.fn(() => Promise.resolve('result'));
    const result = await withAuth(mockCallback);
    
    expect(mockCallback).toHaveBeenCalledWith('test-server-user-id');
    expect(result).toBe('result');
  });

  it('should throw an error when not authenticated', async () => {
    // Mock getSession to return no session
    const { createServerClient } = require('@supabase/ssr');
    const mockClient = createServerClient();
    mockClient.auth.getSession.mockImplementationOnce(() => 
      Promise.resolve({ data: { session: null }, error: null })
    );

    const mockCallback = jest.fn();
    
    await expect(withAuth(mockCallback)).rejects.toThrow('인증이 필요합니다');
    expect(mockCallback).not.toHaveBeenCalled();
  });
}); 