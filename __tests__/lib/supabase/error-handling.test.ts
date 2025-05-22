import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient, withAuth } from '@/lib/supabase/server';

// Mock the @supabase/ssr dependency for testing error handling
jest.mock('@supabase/ssr', () => {
  // Mock for browser client that throws errors
  const createBrowserClientMock = jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => Promise.resolve({
        data: { user: null },
        error: new Error('Authentication error: Failed to get user')
      })),
      getSession: jest.fn(() => Promise.resolve({
        data: { session: null },
        error: new Error('Authentication error: Failed to get session')
      })),
      signOut: jest.fn(() => Promise.resolve({
        error: new Error('Failed to sign out')
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: null,
            error: new Error('Database error: Record not found')
          }))
        }))
      }))
    }))
  }));

  // Mock for server client that throws errors
  const createServerClientMock = jest.fn(() => ({
    auth: {
      getSession: jest.fn(() => Promise.resolve({
        data: { session: null },
        error: new Error('Server authentication error')
      })),
      getUser: jest.fn(() => Promise.resolve({
        data: { user: null },
        error: new Error('Failed to get user on server')
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: null,
            error: new Error('Server database error: Record not found')
          }))
        }))
      }))
    }))
  }));

  return {
    createBrowserClient: createBrowserClientMock,
    createServerClient: createServerClientMock,
  };
});

// Mocking environment variables
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-supabase-url.com';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  
  // Reset console.error spy between tests
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
  // @ts-ignore - Resetting singleton instance for tests
  global.browserSupabase = null;
});

describe('Browser Client Error Handling', () => {
  it('should handle auth.getUser errors gracefully', async () => {
    const { createBrowserClient } = require('@supabase/ssr');
    
    // Create the client
    const client = createBrowserSupabaseClient();
    
    // Mock the getUser to return an error
    const mockGetUser = createBrowserClient().auth.getUser;
    
    // Call the function that will encounter an error
    const { data, error } = await client.auth.getUser();
    
    // Verify the function was called
    expect(mockGetUser).toHaveBeenCalled();
    
    // Verify error handling
    expect(data.user).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Authentication error: Failed to get user');
  });

  it('should handle auth.getSession errors gracefully', async () => {
    const { createBrowserClient } = require('@supabase/ssr');
    
    // Create the client
    const client = createBrowserSupabaseClient();
    
    // Mock the getSession to return an error
    const mockGetSession = createBrowserClient().auth.getSession;
    
    // Call the function that will encounter an error
    const { data, error } = await client.auth.getSession();
    
    // Verify the function was called
    expect(mockGetSession).toHaveBeenCalled();
    
    // Verify error handling
    expect(data.session).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Authentication error: Failed to get session');
  });

  it('should handle database query errors gracefully', async () => {
    const { createBrowserClient } = require('@supabase/ssr');
    
    // Create the client
    const client = createBrowserSupabaseClient();
    
    // Call a query that will result in an error
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', 'non-existent-id')
      .single();
    
    // Verify error handling
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Database error: Record not found');
  });

  it('should handle sign out errors and return failure status', async () => {
    const { signOut } = require('@/lib/supabase/client');
    
    // Call sign out, which will encounter an error
    const result = await signOut();
    
    // Verify error is caught and returned in result
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('Failed to sign out');
  });
});

describe('Server Client Error Handling', () => {
  it('should handle getServerSession errors gracefully', async () => {
    const { getServerSession } = require('@/lib/supabase/server');
    
    // Call getServerSession which will encounter an error
    const { data, error } = await getServerSession();
    
    // Verify error handling
    expect(data.session).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Server authentication error');
  });

  it('should handle withAuth errors when not authenticated', async () => {
    // Attempting to use withAuth should throw an error when no session
    await expect(withAuth(async (userId) => {
      return `User ID: ${userId}`;
    })).rejects.toThrow('인증이 필요합니다');
  });

  it('should handle database query errors on server', async () => {
    // Get a server client
    const client = createServerSupabaseClient();
    
    // Perform a query that will result in an error
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', 'non-existent-id')
      .single();
    
    // Verify error handling
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Server database error: Record not found');
  });
});

describe('Environment Variables Validation', () => {
  it('should throw error when NEXT_PUBLIC_SUPABASE_URL is not set in browser client', () => {
    // Temporarily unset the URL
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    
    // Creating client should throw error
    expect(() => createBrowserSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.'
    );
    
    // Restore URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });

  it('should throw error when NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in browser client', () => {
    // Temporarily unset the key
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    
    // Creating client should throw error
    expect(() => createBrowserSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.'
    );
    
    // Restore key
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('should throw error when NEXT_PUBLIC_SUPABASE_URL is not set in server client', () => {
    // Temporarily unset the URL
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    
    // Creating client should throw error
    expect(() => createServerSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.'
    );
    
    // Restore URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });

  it('should throw error when NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in server client', () => {
    // Temporarily unset the key
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    
    // Creating client should throw error
    expect(() => createServerSupabaseClient()).toThrow(
      '환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.'
    );
    
    // Restore key
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });
}); 