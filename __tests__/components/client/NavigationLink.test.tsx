import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();
const mockSetIsLoading = vi.fn();
const mockNavigateWithAuth = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/en/vote',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/contexts/GlobalLoadingContext', () => ({
  useGlobalLoading: () => ({
    setIsLoading: mockSetIsLoading,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useLocaleRouter', () => ({
  useLocaleRouter: () => ({
    currentLocale: 'en',
    extractLocaleFromPath: (path: string) => {
      const match = path.match(/^\/([a-z]{2}(?:-[a-z]+)?)(\/.*)?$/);
      if (match) return { locale: match[1], path: match[2] || '/' };
      return { locale: '', path };
    },
    getLocalizedPath: (path: string, locale: string) => `/${locale}${path}`,
    changeLocale: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAuthGuard', () => ({
  useAuthGuard: () => ({
    navigateWithAuth: mockNavigateWithAuth,
  }),
}));

import NavigationLink from '@/components/client/NavigationLink';

describe('NavigationLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<NavigationLink href="/vote">Vote</NavigationLink>);
    expect(screen.getByText('Vote')).toBeInTheDocument();
  });

  it('renders a link element', () => {
    render(<NavigationLink href="/vote">Vote</NavigationLink>);
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('resolves href with locale', () => {
    render(<NavigationLink href="/vote">Vote</NavigationLink>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/en/vote');
  });

  it('does not add locale prefix when already present', () => {
    render(<NavigationLink href="/en/vote">Vote</NavigationLink>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/en/vote');
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(
      <NavigationLink href="/community" onClick={onClick}>
        Community
      </NavigationLink>,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(onClick).toHaveBeenCalled();
  });

  it('navigates to different path on click', () => {
    render(
      <NavigationLink href="/community">Community</NavigationLink>,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(mockPush).toHaveBeenCalledWith('/en/community');
  });

  it('does not navigate when clicking link to current path', () => {
    render(
      <NavigationLink href="/vote">Vote</NavigationLink>,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows loading state when navigating', () => {
    render(
      <NavigationLink href="/community">Community</NavigationLink>,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(mockSetIsLoading).toHaveBeenCalledWith(true);
  });

  it('uses navigateWithAuth for should_login links when not authenticated', () => {
    render(
      <NavigationLink href="/mypage/settings" should_login>
        Settings
      </NavigationLink>,
    );

    fireEvent.click(screen.getByRole('link'));
    expect(mockNavigateWithAuth).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(
      <NavigationLink href="/vote" className="test-class">
        Vote
      </NavigationLink>,
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('test-class');
  });

  it('passes through aria props', () => {
    render(
      <NavigationLink href="/vote" aria-label="Go to vote" title="Vote page">
        Vote
      </NavigationLink>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', 'Go to vote');
    expect(link).toHaveAttribute('title', 'Vote page');
  });

  it('renders children correctly', () => {
    render(
      <NavigationLink href="/vote">
        <span data-testid="child">Vote Content</span>
      </NavigationLink>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
