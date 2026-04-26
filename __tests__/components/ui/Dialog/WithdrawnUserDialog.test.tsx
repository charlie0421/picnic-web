import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WithdrawnUserDialog } from '@/components/ui/Dialog/WithdrawnUserDialog';

const mockT = vi.fn((key: string) => '');
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: mockT,
    currentLanguage: 'ko',
    isHydrated: true,
  }),
}));

// Mock Dialog to render children directly
vi.mock('@/components/ui/Dialog/Dialog', () => ({
  Dialog: Object.assign(
    ({ children, isOpen }: any) =>
      isOpen ? <div data-testid="dialog-wrapper">{children}</div> : null,
    {
      Footer: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
      Header: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h3>{children}</h3>,
      Description: ({ children }: any) => <p>{children}</p>,
      Content: ({ children }: any) => <div>{children}</div>,
    },
  ),
}));

describe('WithdrawnUserDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockT.mockImplementation((key: string) => '');
  });

  it('renders when isOpen is true', () => {
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog-wrapper')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<WithdrawnUserDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('dialog-wrapper')).not.toBeInTheDocument();
  });

  it('shows custom title when provided', () => {
    render(<WithdrawnUserDialog {...defaultProps} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('shows translated title from error_message_withdrawal_title', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'error_message_withdrawal_title') return 'Translated Title';
      return '';
    });
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByText('Translated Title')).toBeInTheDocument();
  });

  it('falls back to error_message_withdrawal when title translation starts with "["', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'error_message_withdrawal_title') return '[missing]';
      if (key === 'error_message_withdrawal') return 'Withdrawal fallback';
      return '';
    });
    render(<WithdrawnUserDialog {...defaultProps} />);
    // Both title and description may share the same fallback; just check it's present
    expect(screen.getAllByText('Withdrawal fallback').length).toBeGreaterThanOrEqual(1);
  });

  it('shows hardcoded Korean fallback when no translations exist for title', () => {
    mockT.mockImplementation(() => '');
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByText('탈퇴한 회원입니다')).toBeInTheDocument();
  });

  it('shows custom description when provided', () => {
    render(<WithdrawnUserDialog {...defaultProps} description="Custom Desc" />);
    expect(screen.getByText('Custom Desc')).toBeInTheDocument();
  });

  it('shows translated description from error_message_withdrawal_description', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'error_message_withdrawal_description') return 'Translated Desc';
      return '';
    });
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByText('Translated Desc')).toBeInTheDocument();
  });

  it('falls back to error_message_withdrawal for description when translation starts with "["', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'error_message_withdrawal_description') return '[missing]';
      if (key === 'error_message_withdrawal') return 'Withdrawal desc fallback';
      return '';
    });
    render(<WithdrawnUserDialog {...defaultProps} />);
    // Both title and description share the same fallback key; verify at least one rendered
    expect(screen.getAllByText('Withdrawal desc fallback').length).toBeGreaterThanOrEqual(1);
  });

  it('shows hardcoded Korean fallback for description', () => {
    mockT.mockImplementation(() => '');
    render(<WithdrawnUserDialog {...defaultProps} />);
    // The fallback for description is error_message_withdrawal || hardcoded
    expect(screen.getByText('탈퇴한 회원은 이 기능을 사용할 수 없습니다.')).toBeInTheDocument();
  });

  it('shows custom confirm text when provided', () => {
    render(<WithdrawnUserDialog {...defaultProps} confirmText="OK" />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('shows translated confirm text from dialog.alert.confirm_button', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog.alert.confirm_button') return 'Got it';
      return '';
    });
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByText('Got it')).toBeInTheDocument();
  });

  it('shows hardcoded Korean confirm text fallback', () => {
    mockT.mockImplementation(() => '');
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('calls onClose when confirm button is clicked', () => {
    render(<WithdrawnUserDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles confirm text translation starting with "["', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog.alert.confirm_button') return '[broken]';
      return '';
    });
    render(<WithdrawnUserDialog {...defaultProps} />);
    expect(screen.getByText('확인')).toBeInTheDocument();
  });
});
