import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const singlePortal = [
  { id: 'vote', path: '/vote', name: 'VOTE', isActive: true, should_login: false },
];

const multiplePortals = [
  { id: 'vote', path: '/vote', name: 'VOTE', isActive: true, should_login: false },
  { id: 'mypage', path: '/mypage', name: 'MYPAGE', isActive: false, should_login: false },
];

const mockUseMenu = vi.fn();

vi.mock('@/hooks/useMenu', () => ({
  useMenu: () => mockUseMenu(),
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

import Header from '@/components/layouts/Header';

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMenu.mockReturnValue({ isAdmin: false, portalMenuItems: singlePortal, activePortal: null });
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

  it('renders navigation menu items when multiple portals exist', () => {
    mockUseMenu.mockReturnValue({ isAdmin: false, portalMenuItems: multiplePortals, activePortal: null });
    render(<Header />);
    expect(screen.getByText('VOTE')).toBeInTheDocument();
    expect(screen.getByText('MYPAGE')).toBeInTheDocument();
    const voteLink = screen.getByText('VOTE').closest('a');
    expect(voteLink).toHaveClass('text-blue-600');
  });

  it('포털이 VOTE 하나뿐이면 포털 선택 메뉴를 렌더하지 않는다', () => {
    render(<Header />);
    expect(screen.queryByText('VOTE')).toBeNull();
    expect(screen.queryByText('MYPAGE')).toBeNull();
  });

  it('renders language selector', () => {
    render(<Header />);
    expect(screen.getByTestId('language-selector')).toBeInTheDocument();
  });

  it('renders link to home page for logo', () => {
    render(<Header />);
    const homeLink = screen.getByAltText('logo').closest('a');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('renders header element with border', () => {
    const { container } = render(<Header />);
    const header = container.querySelector('header');
    expect(header).toHaveClass('border-b');
  });
});
