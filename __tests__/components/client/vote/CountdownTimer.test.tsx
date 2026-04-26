import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        text_vote_ended: 'Vote Ended',
        vote_status_closed: 'Closed',
        text_vote_countdown_start: 'Until Start',
        text_vote_countdown_end: 'Until End',
        time_unit_day: 'd',
        time_unit_hour: 'h',
        time_unit_minute: 'm',
        time_unit_second: 's',
      };
      return map[key] || '';
    },
    currentLanguage: 'en',
  }),
}));

vi.mock('@/hooks/useTranslationReady', () => ({
  useTranslationReady: () => true,
}));

import { CountdownTimer } from '@/components/client/vote/common/CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders null when voteStatus is upcoming', () => {
    const { container } = render(
      <CountdownTimer
        timeLeft={{ days: 1, hours: 2, minutes: 3, seconds: 4 }}
        voteStatus="upcoming"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders countdown for ongoing voteStatus with timeLeft prop', () => {
    render(
      <CountdownTimer
        timeLeft={{ days: 1, hours: 2, minutes: 3, seconds: 4 }}
        voteStatus="ongoing"
        variant="decorated"
      />,
    );
    // Should display padded values
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
  });

  it('renders "Vote Ended" for ended status without propTimeLeft', () => {
    render(<CountdownTimer status="ended" />);
    expect(screen.getByText('Vote Ended')).toBeInTheDocument();
  });

  it('renders "Closed" when timeLeft is all zeros', () => {
    render(
      <CountdownTimer
        timeLeft={{ days: 0, hours: 0, minutes: 0, seconds: 0 }}
        status="in_progress"
      />,
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('renders simple variant with labels and units', () => {
    render(
      <CountdownTimer
        timeLeft={{ days: 5, hours: 10, minutes: 30, seconds: 15 }}
        status="in_progress"
        variant="simple"
        showLabel
        showUnits
      />,
    );
    expect(screen.getByText('Until End')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders simple variant with scheduled status showing "Until Start"', () => {
    render(
      <CountdownTimer
        timeLeft={{ days: 3, hours: 0, minutes: 0, seconds: 0 }}
        status="scheduled"
        variant="simple"
        showLabel
      />,
    );
    expect(screen.getByText('Until Start')).toBeInTheDocument();
  });

  it('hides emoji when showEmoji is false', () => {
    const { container } = render(
      <CountdownTimer
        timeLeft={{ days: 0, hours: 0, minutes: 0, seconds: 0 }}
        status="in_progress"
        showEmoji={false}
      />,
    );
    expect(container.textContent).not.toContain('\u{1F6AB}');
  });

  it('shows emoji by default when expired', () => {
    render(
      <CountdownTimer
        timeLeft={{ days: 0, hours: 0, minutes: 0, seconds: 0 }}
        status="in_progress"
        showEmoji={true}
      />,
    );
    expect(screen.getByText('\u{1F6AB}')).toBeInTheDocument();
  });

  it('renders decorated variant without units when showUnits is false', () => {
    render(
      <CountdownTimer
        timeLeft={{ days: 1, hours: 2, minutes: 3, seconds: 4 }}
        voteStatus="ongoing"
        variant="decorated"
        showUnits={false}
      />,
    );
    // Units should not be present
    expect(screen.queryByText('d')).not.toBeInTheDocument();
    expect(screen.queryByText('h')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <CountdownTimer
        timeLeft={{ days: 1, hours: 0, minutes: 0, seconds: 0 }}
        voteStatus="ongoing"
        className="my-custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('calculates countdown from startTime/endTime when propTimeLeft not provided', () => {
    const now = new Date('2025-06-01T00:00:00Z');
    vi.setSystemTime(now);

    render(
      <CountdownTimer
        startTime="2025-06-02T00:00:00Z"
        status="scheduled"
        variant="simple"
        showLabel
      />,
    );
    expect(screen.getByText('Until Start')).toBeInTheDocument();
  });
});
