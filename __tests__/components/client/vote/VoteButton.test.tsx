import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockT = vi.fn((key: string) => {
  const map: Record<string, string> = {
    vote_button_completed: 'Voted',
    vote_button_voting: 'Voting...',
    vote_button_vote: 'Vote',
    vote_button_login_to_vote: 'Login to Vote',
    vote_login_required_title: 'Login Required',
    vote_login_required_description: 'Please log in to vote.',
    vote_error_general: 'An error occurred.',
    button_login: 'Login',
    button_cancel: 'Cancel',
  };
  return map[key] || key;
});

const mockWithAuth = vi.fn(async (fn: () => Promise<void>) => fn());
const mockIsAuthenticated = { value: true };

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: mockT,
    currentLanguage: 'en',
    isHydrated: true,
  }),
}));

vi.mock('@/hooks/useAuthGuard', () => ({
  useRequireAuth: () => ({
    withAuth: mockWithAuth,
    isAuthenticated: mockIsAuthenticated.value,
  }),
}));

vi.mock('@/hooks/useWithdrawalGuard', () => ({
  useWithdrawalGuard: () => vi.fn(async () => false),
}));

vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, disabled, loading, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-loading={loading} {...props}>
      {children}
    </button>
  ),
}));

import { VoteButton } from '@/components/client/vote/common/VoteButton';

describe('VoteButton', () => {
  const defaultProps = {
    voteId: 'vote-1',
    voteItemId: 'item-1',
    onVote: vi.fn(async () => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated.value = true;
  });

  it('renders without crashing', () => {
    render(<VoteButton {...defaultProps} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows "Vote" text when authenticated and not voted', () => {
    render(<VoteButton {...defaultProps} />);
    expect(screen.getByText('Vote')).toBeInTheDocument();
  });

  it('shows "Login to Vote" when not authenticated', () => {
    mockIsAuthenticated.value = false;
    render(<VoteButton {...defaultProps} />);
    expect(screen.getByText('Login to Vote')).toBeInTheDocument();
  });

  it('shows "Voted" when hasVoted is true', () => {
    render(<VoteButton {...defaultProps} hasVoted={true} />);
    expect(screen.getByText('Voted')).toBeInTheDocument();
  });

  it('button is disabled when hasVoted is true', () => {
    render(<VoteButton {...defaultProps} hasVoted={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('button is disabled when disabled prop is true', () => {
    render(<VoteButton {...defaultProps} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onVote with correct params when clicked', async () => {
    const onVote = vi.fn(async () => {});
    render(<VoteButton {...defaultProps} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onVote).toHaveBeenCalledWith('vote-1', 'item-1');
    });
  });

  it('does not call onVote when disabled', () => {
    const onVote = vi.fn(async () => {});
    render(<VoteButton {...defaultProps} onVote={onVote} disabled={true} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onVote).not.toHaveBeenCalled();
  });

  it('does not call onVote when hasVoted', () => {
    const onVote = vi.fn(async () => {});
    render(<VoteButton {...defaultProps} onVote={onVote} hasVoted={true} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onVote).not.toHaveBeenCalled();
  });

  it('shows error message when vote fails', async () => {
    const onVote = vi.fn(async () => {
      throw new Error('Network error');
    });
    render(<VoteButton {...defaultProps} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('An error occurred.')).toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    const { container } = render(
      <VoteButton {...defaultProps} className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
