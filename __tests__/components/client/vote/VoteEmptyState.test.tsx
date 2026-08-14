import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockStatusParam = { value: 'ongoing' as string | null };

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

// 필터의 진실은 URL 쿼리다 (스토어는 저장하지 않으므로 항상 기본값에 머문다).
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'status' ? mockStatusParam.value : null),
  }),
}));

import VoteEmptyState from '@/components/client/vote/list/VoteEmptyState';

describe('VoteEmptyState', () => {
  beforeEach(() => {
    mockStatusParam.value = 'ongoing';
  });

  it('renders without crashing', () => {
    const { container } = render(<VoteEmptyState />);
    expect(container).toBeTruthy();
  });

  it('shows ongoing empty message', () => {
    mockStatusParam.value = 'ongoing';
    render(<VoteEmptyState />);
    expect(screen.getByText('No ongoing votes.')).toBeInTheDocument();
  });

  it('shows upcoming empty message', () => {
    mockStatusParam.value = 'upcoming';
    render(<VoteEmptyState />);
    expect(screen.getByText('No upcoming votes.')).toBeInTheDocument();
  });

  it('shows completed empty message', () => {
    mockStatusParam.value = 'completed';
    render(<VoteEmptyState />);
    expect(screen.getByText('No completed votes.')).toBeInTheDocument();
  });

  it('falls back to ongoing message for an unknown status in the URL', () => {
    // 알 수 없는 값은 normalizeVoteStatus 가 기본값(ongoing)으로 좁힌다.
    mockStatusParam.value = 'unknown';
    render(<VoteEmptyState />);
    expect(screen.getByText('No ongoing votes.')).toBeInTheDocument();
  });

  it('prefers an explicit selectedStatus prop over the URL', () => {
    mockStatusParam.value = 'ongoing';
    render(<VoteEmptyState selectedStatus='completed' />);
    expect(screen.getByText('No completed votes.')).toBeInTheDocument();
  });

  it('renders with text-center class', () => {
    render(<VoteEmptyState />);
    const container = screen.getByText('No ongoing votes.').parentElement;
    expect(container).toHaveClass('text-center');
  });
});
