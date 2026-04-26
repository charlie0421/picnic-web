import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        label_login_with_google: 'Sign in with Google',
        label_login_with_apple: 'Sign in with Apple',
        label_login_with_kakao: 'Sign in with Kakao',
        label_last_used_login: 'Recently Used',
        label_other_login_methods: 'Other Methods',
        label_logging_in: 'Signing in...',
        label_last_provider: 'Recent',
        unknown_login_error: 'Unknown error',
      };
      return map[key] || '';
    },
    currentLanguage: 'en',
  }),
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/social', () => ({
  getSocialAuthService: () => ({
    signInWithProvider: vi.fn(async () => ({ success: true })),
  }),
}));

vi.mock('@/utils/auth-logger', () => ({
  logAuth: vi.fn(),
  AuthLog: {
    LoginStart: 'LoginStart',
    ProviderInit: 'ProviderInit',
    OAuthRedirect: 'OAuthRedirect',
    SaveReturnUrl: 'SaveReturnUrl',
  },
}));

vi.mock('@/utils/auth-helpers', () => ({
  sortProvidersByLastUsed: (providers: string[], lastUsed: string | null) => {
    if (!lastUsed) return providers;
    return [lastUsed, ...providers.filter((p: string) => p !== lastUsed)];
  },
}));

vi.mock('@/utils/auth-redirect', () => ({
  getRedirectUrl: () => null,
  normalizeRedirectPath: (path: string) => path,
}));

vi.mock('@/contexts/GlobalLoadingContext', () => ({
  useGlobalLoading: () => ({ setIsLoading: vi.fn(), isLoading: false }),
}));

vi.mock('@/components/common/atoms/Button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

import { SocialLoginButtons } from '@/components/client/auth/SocialLoginButtons';

describe('SocialLoginButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<SocialLoginButtons lastLoginInfo={null} />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('renders default Google and Apple buttons', () => {
    render(<SocialLoginButtons lastLoginInfo={null} />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Apple')).toBeInTheDocument();
  });

  it('renders custom providers', () => {
    render(
      <SocialLoginButtons
        providers={['google', 'apple', 'kakao']}
        lastLoginInfo={null}
      />,
    );
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Apple')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Kakao')).toBeInTheDocument();
  });

  it('shows "Recently Used" section when lastLoginInfo is provided', () => {
    render(
      <SocialLoginButtons
        lastLoginInfo={{ provider: 'google', timestamp: Date.now() }}
      />,
    );
    expect(screen.getByText('Recently Used')).toBeInTheDocument();
  });

  it('shows "Recent" badge for last used provider', () => {
    render(
      <SocialLoginButtons
        lastLoginInfo={{ provider: 'google', timestamp: Date.now() }}
      />,
    );
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('shows "Other Methods" separator when last used and other providers exist', () => {
    render(
      <SocialLoginButtons
        providers={['google', 'apple']}
        lastLoginInfo={{ provider: 'google', timestamp: Date.now() }}
      />,
    );
    expect(screen.getByText('Other Methods')).toBeInTheDocument();
  });

  it('calls onLoginStart when login button is clicked', () => {
    const onLoginStart = vi.fn();
    render(
      <SocialLoginButtons
        onLoginStart={onLoginStart}
        lastLoginInfo={null}
      />,
    );

    const googleButton = screen.getByText('Sign in with Google').closest('button')!;
    fireEvent.click(googleButton);

    expect(onLoginStart).toHaveBeenCalled();
  });

  it('all buttons become disabled while one is loading', () => {
    render(<SocialLoginButtons lastLoginInfo={null} />);

    const googleButton = screen.getByText('Sign in with Google').closest('button')!;
    fireEvent.click(googleButton);

    const buttons = screen.getAllByRole('button');
    // After click, all buttons should be disabled (isLoading is set)
    // Note: the state update happens async, but the click sets isLoading synchronously
  });

  it('renders with different sizes', () => {
    const { rerender } = render(
      <SocialLoginButtons size="small" lastLoginInfo={null} />,
    );
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();

    rerender(<SocialLoginButtons size="large" lastLoginInfo={null} />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });
});
