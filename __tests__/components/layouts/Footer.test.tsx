import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'en',
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/useLocaleRouter', () => ({
  useLocaleRouter: () => ({
    getLocalizedPath: (path: string) => `/en${path}`,
    currentLocale: 'en',
  }),
}));

import Footer from '@/components/layouts/Footer';

describe('Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('footer')).toBeTruthy();
  });

  it('renders footer element', () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer).toBeInTheDocument();
  });

  it('renders copyright text', () => {
    render(<Footer />);
    expect(
      screen.getByText(/IconCasting Inc\. All rights reserved/),
    ).toBeInTheDocument();
  });

  it('renders Privacy Policy link', () => {
    render(<Footer />);
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    const link = screen.getByText('Privacy Policy').closest('a');
    expect(link).toHaveAttribute('href', '/en/privacy');
  });

  it('renders Terms of Service link', () => {
    render(<Footer />);
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
    const link = screen.getByText('Terms of Service').closest('a');
    expect(link).toHaveAttribute('href', '/en/terms');
  });

  it('renders company information in English by default', () => {
    render(<Footer />);
    expect(screen.getByText(/Company: IconCasting Inc/)).toBeInTheDocument();
  });

  it('renders address information', () => {
    render(<Footer />);
    expect(
      screen.getByText(/Address.*Goyang/),
    ).toBeInTheDocument();
  });

  it('renders contact information', () => {
    render(<Footer />);
    expect(screen.getByText(/Phone: 070-8058-9950/)).toBeInTheDocument();
  });

  it('has border-t class', () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('border-t');
  });
});
