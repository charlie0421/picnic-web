import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockMenuItems = [
  { id: 'vote', path: '/vote', name: 'Vote', isActive: true, should_login: false },
  { id: 'community', path: '/community', name: 'Community', isActive: false, should_login: false },
];

vi.mock('@/hooks/useMenu', () => ({
  useMenu: () => ({
    isAdmin: false,
    portalMenuItems: mockMenuItems,
    activePortal: null,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    userProfile: null,
    loadUserProfile: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLocaleRouter', () => ({
  useLocaleRouter: () => ({
    currentLocale: 'en',
    extractLocaleFromPath: (p: string) => ({ locale: 'en', path: p }),
    getLocalizedPath: (p: string) => `/en${p}`,
    changeLocale: vi.fn(),
  }),
}));

vi.mock('@/contexts/GlobalLoadingContext', () => ({
  useGlobalLoading: () => ({
    isLoading: false,
    setIsLoading: vi.fn(),
    forceStopLoading: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTranslations', () => ({
  useTranslations: () => ({
    tDynamic: (key: string) => '',
    translations: { nav: { menu: {} } },
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
  useAuthGuard: () => ({ navigateWithAuth: vi.fn() }),
}));

vi.mock('@/components/ui/ProfileImageContainer', () => ({
  DefaultAvatar: () => <div data-testid="default-avatar" />,
  ProfileImageContainer: () => <div data-testid="profile-image" />,
}));

vi.mock('@/components/layouts/LanguageSelector', () => ({
  __esModule: true,
  default: () => <div data-testid="language-selector" />,
}));

vi.mock('@/components/client/NavigationLink', () => ({
  __esModule: true,
  default: ({ href, children, className, ...props }: any) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/data-fetching/client/notification-service', () => ({
  NotificationInboxService: {
    getUnreadCount: vi.fn(async () => 0),
  },
}));

vi.mock('@/components/client/attendance/AttendanceIconButton', () => ({
  __esModule: true,
  default: () => <div data-testid="attendance-icon" />,
}));

import Header from '@/components/layouts/Header';

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<Header />);
    expect(container.querySelector('header')).toBeTruthy();
  });

  it('renders the logo', () => {
    render(<Header />);
    const logo = screen.getByAltText('logo');
    expect(logo).toBeInTheDocument();
  });

  it('renders navigation menu items', () => {
    render(<Header />);
    expect(screen.getByText('Vote')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('renders language selector', () => {
    render(<Header />);
    expect(screen.getByTestId('language-selector')).toBeInTheDocument();
  });

  it('renders attendance icon', () => {
    render(<Header />);
    expect(screen.getByTestId('attendance-icon')).toBeInTheDocument();
  });

  it('renders link to home page for logo', () => {
    render(<Header />);
    const homeLink = screen.getByAltText('logo').closest('a');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('shows active indicator on active menu item', () => {
    render(<Header />);
    const voteLink = screen.getByText('Vote').closest('a');
    expect(voteLink).toHaveClass('text-blue-600');
  });

  it('renders header element with border', () => {
    const { container } = render(<Header />);
    const header = container.querySelector('header');
    expect(header).toHaveClass('border-b');
  });
});
