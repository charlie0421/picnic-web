import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginRequiredDialog } from '@/components/ui/Dialog/LoginRequiredDialog';

// Mock dependencies
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/ko',
  useSearchParams: () => new URLSearchParams(),
}));

const mockT = vi.fn((key: string) => '');
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: mockT,
    currentLanguage: 'ko',
    isHydrated: true,
  }),
}));

const mockRedirectToLogin = vi.fn();
const mockSaveRedirectUrl = vi.fn();
vi.mock('@/utils/auth-redirect', () => ({
  redirectToLogin: (...args: any[]) => mockRedirectToLogin(...args),
  saveRedirectUrl: (...args: any[]) => mockSaveRedirectUrl(...args),
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} />,
}));

// Mock the Dialog component to render children directly
vi.mock('@/components/ui/Dialog/Dialog', () => ({
  Dialog: Object.assign(
    ({ children, isOpen, ...rest }: any) =>
      isOpen ? <div data-testid="dialog-wrapper">{children}</div> : null,
    {
      Footer: ({ children, ...rest }: any) => <div data-testid="dialog-footer">{children}</div>,
      Header: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h3>{children}</h3>,
      Description: ({ children }: any) => <p>{children}</p>,
      Content: ({ children }: any) => <div>{children}</div>,
    },
  ),
}));

describe('LoginRequiredDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockT.mockImplementation((key: string) => '');
    // Suppress console.log from component
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('renders when isOpen is true', () => {
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog-wrapper')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<LoginRequiredDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('dialog-wrapper')).not.toBeInTheDocument();
  });

  it('shows fallback title "Login Required" when no title and no translation', () => {
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Login Required')).toBeInTheDocument();
  });

  it('shows custom title when provided', () => {
    render(<LoginRequiredDialog {...defaultProps} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('shows translated title when translation available', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog_content_login_required') return 'Translated Title';
      return '';
    });
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Translated Title')).toBeInTheDocument();
  });

  it('shows fallback title when translation starts with "["', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog_content_login_required') return '[missing]';
      return '';
    });
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Login Required')).toBeInTheDocument();
  });

  it('shows custom description when provided', () => {
    render(<LoginRequiredDialog {...defaultProps} description="Custom Desc" />);
    expect(screen.getByText('Custom Desc')).toBeInTheDocument();
  });

  it('shows fallback description when no translation', () => {
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(
      screen.getByText('Please log in to continue using this service.'),
    ).toBeInTheDocument();
  });

  it('shows custom login text when provided', () => {
    render(<LoginRequiredDialog {...defaultProps} loginText="Sign In" />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('shows fallback login text "Login" when no translation', () => {
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('shows custom cancel text when provided', () => {
    render(<LoginRequiredDialog {...defaultProps} cancelText="Dismiss" />);
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('shows fallback cancel text "Cancel" when no translation', () => {
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onCancel and onClose when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<LoginRequiredDialog {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose even without onCancel when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<LoginRequiredDialog isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls redirectToLogin when login button clicked without onLogin', () => {
    render(<LoginRequiredDialog {...defaultProps} />);

    fireEvent.click(screen.getByText('Login'));

    expect(mockRedirectToLogin).toHaveBeenCalled();
  });

  it('calls redirectToLogin with redirectUrl when provided and no onLogin', () => {
    render(
      <LoginRequiredDialog {...defaultProps} redirectUrl="/some-page" />,
    );

    fireEvent.click(screen.getByText('Login'));

    expect(mockSaveRedirectUrl).toHaveBeenCalledWith('/some-page');
    expect(mockRedirectToLogin).toHaveBeenCalledWith('/some-page');
  });

  it('calls custom onLogin when provided', () => {
    const onLogin = vi.fn();
    render(<LoginRequiredDialog {...defaultProps} onLogin={onLogin} redirectUrl="/target" />);

    fireEvent.click(screen.getByText('Login'));

    expect(onLogin).toHaveBeenCalledWith('/target');
  });

  it('falls back to redirectToLogin when custom onLogin does not change location', () => {
    const onLogin = vi.fn(); // Does not change location
    render(<LoginRequiredDialog {...defaultProps} onLogin={onLogin} redirectUrl="/target" />);

    fireEvent.click(screen.getByText('Login'));

    // onLogin was called but since location did not change, redirectToLogin should be called as fallback
    expect(onLogin).toHaveBeenCalled();
    expect(mockRedirectToLogin).toHaveBeenCalled();
  });

  it('handles onLogin throwing an error gracefully', () => {
    const onLogin = vi.fn(() => {
      throw new Error('Login handler error');
    });
    render(<LoginRequiredDialog {...defaultProps} onLogin={onLogin} />);

    // Should not throw
    fireEvent.click(screen.getByText('Login'));

    expect(onLogin).toHaveBeenCalled();
    // Falls back to redirectToLogin
    expect(mockRedirectToLogin).toHaveBeenCalled();
  });

  it('shows translated description when translation available', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog_login_required_description') return 'Translated Desc';
      return '';
    });
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Translated Desc')).toBeInTheDocument();
  });

  it('shows translated login button text when translation available', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog_login_required_login_button') return 'Go Login';
      return '';
    });
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Go Login')).toBeInTheDocument();
  });

  it('shows translated cancel button text when translation available', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog_login_required_cancel_button') return 'Nope';
      return '';
    });
    render(<LoginRequiredDialog {...defaultProps} />);
    expect(screen.getByText('Nope')).toBeInTheDocument();
  });
});
