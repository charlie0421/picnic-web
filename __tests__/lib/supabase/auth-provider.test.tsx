import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/supabase/auth-provider';
import '@testing-library/jest-dom';

// Mock the client module
jest.mock('@/lib/supabase/client', () => {
  const mockSupabaseClient = {
    auth: {
      getSession: jest.fn(() => Promise.resolve({
        data: { session: null },
        error: null
      })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      })),
      signInWithPassword: jest.fn(() => Promise.resolve({ error: null })),
      signInWithOAuth: jest.fn(() => Promise.resolve({ error: null })),
      signUp: jest.fn(() => Promise.resolve({ error: null, data: { user: { id: 'new-user-id' } } })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    }))
  };

  return {
    createBrowserSupabaseClient: jest.fn(() => mockSupabaseClient),
    signOut: jest.fn(() => Promise.resolve({ success: true }))
  };
});

// Test component that uses the auth hook
const TestComponent = () => {
  const auth = useAuth();
  
  return (
    <div>
      <div data-testid="auth-status">
        {auth.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
      </div>
      <div data-testid="loading-status">
        {auth.isLoading ? 'Loading' : 'Not Loading'}
      </div>
      <div data-testid="user-info">
        {auth.user ? `User ID: ${auth.user.id}` : 'No User'}
      </div>
      <button 
        onClick={() => auth.signIn('test@example.com', 'password')} 
        data-testid="sign-in-button"
      >
        Sign In
      </button>
      <button 
        onClick={() => auth.signInWithOAuth('google')} 
        data-testid="oauth-button"
      >
        Sign In with Google
      </button>
      <button 
        onClick={() => auth.signUp('test@example.com', 'password')} 
        data-testid="sign-up-button"
      >
        Sign Up
      </button>
      <button 
        onClick={() => auth.signOut()} 
        data-testid="sign-out-button"
      >
        Sign Out
      </button>
    </div>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock localStorage for tests
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });
  });

  it('should render children and initialize auth state', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });
    
    // Initial state should show not authenticated and not loading after initialization
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Not Authenticated');
      expect(screen.getByTestId('loading-status')).toHaveTextContent('Not Loading');
    });
  });

  it('should provide authentication methods to children', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });
    
    // Verify auth methods are available
    expect(screen.getByTestId('sign-in-button')).toBeInTheDocument();
    expect(screen.getByTestId('oauth-button')).toBeInTheDocument();
    expect(screen.getByTestId('sign-up-button')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
  });

  it('should handle sign in correctly', async () => {
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();
    
    // Mock successful authentication response
    mockClient.auth.signInWithPassword.mockImplementationOnce(() => 
      Promise.resolve({
        data: { 
          user: { id: 'test-user-id' },
          session: { user: { id: 'test-user-id' } }
        }, 
        error: null
      })
    );

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // Click sign in button
    await act(async () => {
      screen.getByTestId('sign-in-button').click();
    });

    // Verify signInWithPassword was called
    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password'
    });
  });

  it('should handle OAuth sign in correctly', async () => {
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();
    
    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // Click OAuth button
    await act(async () => {
      screen.getByTestId('oauth-button').click();
    });

    // Verify signInWithOAuth was called
    expect(mockClient.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: expect.any(String)
      })
    });
  });

  it('should handle auth state changes', async () => {
    const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();
    
    // Set up the onAuthStateChange to call its callback with a session
    mockClient.auth.onAuthStateChange.mockImplementationOnce((callback) => {
      // Simulate an auth state change
      setTimeout(() => {
        callback('SIGNED_IN', {
          user: { id: 'auth-change-user-id' },
        });
      }, 10);
      
      return {
        data: { subscription: { unsubscribe: jest.fn() } }
      };
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // Wait for the auth state change to be processed
    await waitFor(() => {
      expect(mockClient.auth.onAuthStateChange).toHaveBeenCalled();
    });
  });

  it('should handle sign out correctly', async () => {
    const { createBrowserSupabaseClient, signOut } = require('@/lib/supabase/client');
    const mockClient = createBrowserSupabaseClient();
    
    await act(async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // Click sign out button
    await act(async () => {
      screen.getByTestId('sign-out-button').click();
    });

    // Verify signOut was called
    expect(signOut).toHaveBeenCalled();
  });

  it('should throw error when useAuth is used outside provider', () => {
    // Suppress expected error logs
    const originalError = console.error;
    console.error = jest.fn();
    
    // Rendering the TestComponent outside of AuthProvider should throw an error
    expect(() => {
      render(<TestComponent />);
    }).toThrow();
    
    // Restore console.error
    console.error = originalError;
  });

  it('should initialize with provided session', async () => {
    const mockSession = {
      user: { id: 'initial-session-user-id' }
    };
    
    await act(async () => {
      render(
        <AuthProvider initialSession={mockSession as any}>
          <TestComponent />
        </AuthProvider>
      );
    });
    
    // Should show authenticated with the user from the initial session
    await waitFor(() => {
      expect(screen.getByTestId('user-info')).toHaveTextContent('User ID: initial-session-user-id');
    });
  });
}); 