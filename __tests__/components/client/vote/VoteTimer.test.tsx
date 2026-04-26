import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/server/utils', () => ({
  getRemainingTime: (endTime: string) => {
    const diff = new Date(endTime).getTime() - Date.now();
    return Math.max(0, diff);
  },
  formatRemainingTime: (ms: number) => {
    if (ms <= 0) return '종료됨';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  },
}));

import { VoteTimer } from '@/components/client/vote/common/VoteTimer';

describe('VoteTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders without crashing', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    render(<VoteTimer endTime="2025-01-01T02:00:00Z" />);
    expect(screen.getByText(/남은 시간/)).toBeInTheDocument();
  });

  it('displays formatted remaining time', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    render(<VoteTimer endTime="2025-01-01T02:30:00Z" />);
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });

  it('displays "종료됨" when time has expired', () => {
    vi.setSystemTime(new Date('2025-01-02T00:00:00Z'));
    render(<VoteTimer endTime="2025-01-01T00:00:00Z" />);
    expect(screen.getByText('종료됨')).toBeInTheDocument();
  });

  it('calls onExpire when timer expires', () => {
    vi.setSystemTime(new Date('2025-01-01T23:59:59Z'));
    const onExpire = vi.fn();
    render(<VoteTimer endTime="2025-01-02T00:00:00Z" onExpire={onExpire} />);

    // Advance past the end time
    vi.setSystemTime(new Date('2025-01-02T00:00:01Z'));
    vi.advanceTimersByTime(1000);

    expect(onExpire).toHaveBeenCalled();
  });

  it('applies custom className', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const { container } = render(
      <VoteTimer endTime="2025-01-01T02:00:00Z" className="test-class" />,
    );
    expect(container.firstChild).toHaveClass('test-class');
  });

  it('renders the label text', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    render(<VoteTimer endTime="2025-01-01T02:00:00Z" />);
    expect(screen.getByText('남은 시간:')).toBeInTheDocument();
  });
});
