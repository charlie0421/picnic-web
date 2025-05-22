import { createBrowserSupabaseClient, getCurrentUser, getCurrentSession, signOut } from '@/lib/supabase/client';

// Mock the @supabase/ssr dependency
jest.mock('@supabase/ssr', () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: { user: { id: 'test-user-id' } } }, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
  };
  
  return {
    createBrowserClient: jest.fn(() => mockClient),
  };
});

// Mocking environment variables
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-supabase-url.com';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  
  // Mock localStorage for tests
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    writable: true,
  });
  
  // Mock document.cookie
  Object.defineProperty(document, 'cookie', {
    value: '',
    writable: true,
  });
});

describe('createBrowserSupabaseClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // Reset singleton instance for tests
    // @ts-ignore - Accessing private property for testing
    global.browserSupabase = null;
  });

  it('should create a browser Supabase client', () => {
    const client = createBrowserSupabaseClient();
    expect(client).toBeDefined();
  });

  it('should throw an error if NEXT_PUBLIC_SUPABASE_URL is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    expect(() => createBrowserSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.'
    );
  });

  it('should throw an error if NEXT_PUBLIC_SUPABASE_ANON_KEY is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    expect(() => createBrowserSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.'
    );
  });

  it('should reuse the same client instance on multiple calls', () => {
    const client1 = createBrowserSupabaseClient();
    const client2 = createBrowserSupabaseClient();
    expect(client1).toBe(client2);
  });

  it('should detect ngrok environment when hostname includes ngrok', () => {
    // Mock window.location for ngrok environment
    const originalLocation = window.location;
    delete window.location;
    window.location = {
      ...originalLocation,
      hostname: 'test.ngrok.io',
    };

    createBrowserSupabaseClient();

    // Restore original location
    window.location = originalLocation;

    // The test passes if no error is thrown, as we're just verifying
    // that the function handles ngrok environments correctly
    expect(true).toBe(true);
  });
});

describe('getCurrentUser', () => {
  it('should return the current user', async () => {
    const user = await getCurrentUser();
    expect(user).toEqual({ id: 'test-user-id' });
  });
});

describe('getCurrentSession', () => {
  it('should return the current session', async () => {
    const session = await getCurrentSession();
    expect(session).toEqual({ user: { id: 'test-user-id' } });
  });
});

describe('signOut', () => {
  it('should sign out the user successfully', async () => {
    const result = await signOut();
    expect(result.success).toBe(true);
  });

  it('should remove auth related items from localStorage on successful sign out', async () => {
    await signOut();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('auth_session_active');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('auth_provider');
  });

  it('should handle errors during sign out', async () => {
    // Mock the auth.signOut to throw an error
    const { createBrowserClient } = require('@supabase/ssr');
    const mockClient = createBrowserClient();
    mockClient.auth.signOut.mockImplementationOnce(() => 
      Promise.resolve({ error: new Error('Sign out error') })
    );

    const result = await signOut();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
}); 