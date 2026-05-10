import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RateLimitedDialog } from '@/components/anti-abuse/RateLimitedDialog';

// Stub the language store — return the key as the translation (so tests assert on key).
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (k: string) => `t(${k})`,
  }),
}));

// Stub Dialog primitives — Headless UI portals + transitions complicate jsdom assertions.
// We render a minimal implementation that surfaces title/description/footer for the test.
vi.mock('@/components/ui/Dialog/Dialog', () => {
  const Dialog: any = ({ isOpen, title, description, children, onClose }: any) =>
    isOpen ? (
      <div role='dialog'>
        <h3>{title}</h3>
        <p>{description}</p>
        <button onClick={onClose}>__close__</button>
        {children}
      </div>
    ) : null;
  Dialog.Footer = ({ children }: any) => <div>{children}</div>;
  return { Dialog };
});

vi.mock('@/components/ui/Dialog/theme', () => ({
  buttonTheme: {
    base: '',
    sizes: { md: '' },
    variants: { primary: '', secondary: '' },
  },
}));

describe('RateLimitedDialog', () => {
  it('signup channel shows CS inquiry mailto link', () => {
    render(
      <RateLimitedDialog isOpen channel='signup' onClose={() => {}} />,
    );
    expect(screen.getByText('t(error_anti_abuse_signup_title)')).toBeInTheDocument();
    expect(screen.getByText('t(error_anti_abuse_signup_message)')).toBeInTheDocument();
    const csLink = screen.getByText('t(button_cs_inquiry)');
    expect(csLink.closest('a')?.getAttribute('href')).toBe('mailto:cs@picnic.fan');
  });

  it('ad_watch channel shows ambiguous tone, no CS link', () => {
    render(
      <RateLimitedDialog isOpen channel='ad_watch' onClose={() => {}} />,
    );
    expect(screen.getByText('t(error_anti_abuse_ad_title)')).toBeInTheDocument();
    expect(screen.queryByText('t(button_cs_inquiry)')).toBeNull();
  });

  it('attendance / artist_request render their copy without CS link', () => {
    const { rerender } = render(
      <RateLimitedDialog isOpen channel='attendance' onClose={() => {}} />,
    );
    expect(screen.getByText('t(error_anti_abuse_attendance_title)')).toBeInTheDocument();
    rerender(
      <RateLimitedDialog isOpen channel='artist_request' onClose={() => {}} />,
    );
    expect(screen.getByText('t(error_anti_abuse_artist_request_title)')).toBeInTheDocument();
    expect(screen.queryByText('t(button_cs_inquiry)')).toBeNull();
  });

  it('unknown channel falls back to ambiguous attendance copy', () => {
    render(
      <RateLimitedDialog
        isOpen
        channel={'totally_unexpected_channel' as any}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('t(error_anti_abuse_attendance_title)')).toBeInTheDocument();
    expect(screen.queryByText('t(button_cs_inquiry)')).toBeNull();
  });

  it('OK button calls onClose', () => {
    const onClose = vi.fn();
    render(<RateLimitedDialog isOpen channel='ad_watch' onClose={onClose} />);
    fireEvent.click(screen.getByText('t(dialog_button_ok)'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('custom csEmail prop overrides default', () => {
    render(
      <RateLimitedDialog
        isOpen
        channel='signup'
        onClose={() => {}}
        csEmail='custom@example.com'
      />,
    );
    const csLink = screen.getByText('t(button_cs_inquiry)');
    expect(csLink.closest('a')?.getAttribute('href')).toBe(
      'mailto:custom@example.com',
    );
  });
});
