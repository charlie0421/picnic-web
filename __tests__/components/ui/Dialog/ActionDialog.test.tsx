import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ActionDialog } from '@/components/ui/Dialog/ActionDialog';

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
    ({ children, isOpen, ...rest }: any) =>
      isOpen !== false ? <div data-testid="dialog-wrapper">{children}</div> : null,
    {
      Footer: ({ children, ...rest }: any) => <div data-testid="dialog-footer">{children}</div>,
      Header: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h3>{children}</h3>,
      Description: ({ children }: any) => <p>{children}</p>,
      Content: ({ children }: any) => <div>{children}</div>,
    },
  ),
}));

describe('ActionDialog', () => {
  const defaultProps = {
    isOpen: true as const,
    onClose: vi.fn(),
    title: 'Test Action',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockT.mockImplementation((key: string) => '');
  });

  it('renders the dialog', () => {
    render(<ActionDialog {...defaultProps} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('dialog-wrapper')).toBeInTheDocument();
  });

  it('shows confirm button when onConfirm is provided', () => {
    render(<ActionDialog {...defaultProps} onConfirm={vi.fn()} />);
    // Fallback text: '확인'
    expect(screen.getByText('확인')).toBeInTheDocument();
  });

  it('shows cancel button when onCancel is provided', () => {
    render(<ActionDialog {...defaultProps} onCancel={vi.fn()} />);
    expect(screen.getByText('취소')).toBeInTheDocument();
  });

  it('does not show confirm button when onConfirm is not provided', () => {
    render(<ActionDialog {...defaultProps} />);
    expect(screen.queryByText('확인')).not.toBeInTheDocument();
  });

  it('does not show cancel button when onCancel is not provided', () => {
    render(<ActionDialog {...defaultProps} onConfirm={vi.fn()} />);
    expect(screen.queryByText('취소')).not.toBeInTheDocument();
  });

  it('uses custom confirm text', () => {
    render(<ActionDialog {...defaultProps} onConfirm={vi.fn()} confirmText="Yes" />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('uses custom cancel text', () => {
    render(<ActionDialog {...defaultProps} onCancel={vi.fn()} cancelText="No" />);
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('uses translated confirm text', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog.action.confirm_button') return 'Translated Confirm';
      return '';
    });
    render(<ActionDialog {...defaultProps} onConfirm={vi.fn()} />);
    expect(screen.getByText('Translated Confirm')).toBeInTheDocument();
  });

  it('uses translated cancel text', () => {
    mockT.mockImplementation((key: string) => {
      if (key === 'dialog.action.cancel_button') return 'Translated Cancel';
      return '';
    });
    render(<ActionDialog {...defaultProps} onCancel={vi.fn()} />);
    expect(screen.getByText('Translated Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ActionDialog {...defaultProps} onConfirm={onConfirm} />);

    await act(async () => {
      fireEvent.click(screen.getByText('확인'));
    });

    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel and onClose when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ActionDialog {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('취소'));

    expect(onCancel).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not call onConfirm when disabled', async () => {
    const onConfirm = vi.fn();
    render(<ActionDialog {...defaultProps} onConfirm={onConfirm} disabled />);

    await act(async () => {
      fireEvent.click(screen.getByText('확인'));
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not call onConfirm when isLoading', async () => {
    const onConfirm = vi.fn();
    render(<ActionDialog {...defaultProps} onConfirm={onConfirm} isLoading />);

    // The button should be disabled due to isLoading
    const button = screen.getByText('확인');
    expect(button).toBeDisabled();
  });

  it('shows loading state during processing', async () => {
    let resolveConfirm: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    mockT.mockImplementation((key: string) => {
      if (key === 'dialog.action.loading') return 'Processing...';
      return '';
    });

    render(<ActionDialog {...defaultProps} onConfirm={onConfirm} />);

    await act(async () => {
      fireEvent.click(screen.getByText('확인'));
    });

    // During processing, loading text should appear
    expect(screen.getByText('Processing...')).toBeInTheDocument();

    await act(async () => {
      resolveConfirm!();
    });
  });

  it('handles confirm error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onConfirm = vi.fn().mockRejectedValue(new Error('fail'));
    render(<ActionDialog {...defaultProps} onConfirm={onConfirm} />);

    await act(async () => {
      fireEvent.click(screen.getByText('확인'));
    });

    expect(consoleSpy).toHaveBeenCalledWith('Action failed:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('shows loading fallback text when no translation for loading', async () => {
    let resolveConfirm: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    mockT.mockImplementation(() => '');

    render(<ActionDialog {...defaultProps} onConfirm={onConfirm} />);

    await act(async () => {
      fireEvent.click(screen.getByText('확인'));
    });

    expect(screen.getByText('처리 중...')).toBeInTheDocument();

    await act(async () => {
      resolveConfirm!();
    });
  });
});
