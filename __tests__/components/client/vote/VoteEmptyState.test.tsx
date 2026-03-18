import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockSelectedStatus = { value: 'ongoing' };

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        vote_empty_state_ongoing: 'No ongoing votes.',
        vote_empty_state_upcoming: 'No upcoming votes.',
        vote_empty_state_completed: 'No completed votes.',
        vote_empty_state_default: 'No votes available.',
      };
      return map[key] || key;
    },
    currentLanguage: 'en',
  }),
}));

vi.mock('@/stores/voteFilterStore', () => ({
  VOTE_STATUS: {
    ONGOING: 'ongoing',
    UPCOMING: 'upcoming',
    COMPLETED: 'completed',
  },
  useVoteFilterStore: () => ({
    selectedStatus: mockSelectedStatus.value,
  }),
}));

import VoteEmptyState from '@/components/client/vote/list/VoteEmptyState';

describe('VoteEmptyState', () => {
  beforeEach(() => {
    mockSelectedStatus.value = 'ongoing';
  });

  it('renders without crashing', () => {
    const { container } = render(<VoteEmptyState />);
    expect(container).toBeTruthy();
  });

  it('shows ongoing empty message', () => {
    mockSelectedStatus.value = 'ongoing';
    render(<VoteEmptyState />);
    expect(screen.getByText('No ongoing votes.')).toBeInTheDocument();
  });

  it('shows upcoming empty message', () => {
    mockSelectedStatus.value = 'upcoming';
    render(<VoteEmptyState />);
    expect(screen.getByText('No upcoming votes.')).toBeInTheDocument();
  });

  it('shows completed empty message', () => {
    mockSelectedStatus.value = 'completed';
    render(<VoteEmptyState />);
    expect(screen.getByText('No completed votes.')).toBeInTheDocument();
  });

  it('shows default empty message for unknown status', () => {
    mockSelectedStatus.value = 'unknown';
    render(<VoteEmptyState />);
    expect(screen.getByText('No votes available.')).toBeInTheDocument();
  });

  it('renders with text-center class', () => {
    render(<VoteEmptyState />);
    const container = screen.getByText('No ongoing votes.').parentElement;
    expect(container).toHaveClass('text-center');
  });
});
