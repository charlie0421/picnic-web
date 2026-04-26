import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGetAttendanceStatus = vi.fn();
const mockPerformAttendanceCheck = vi.fn();

vi.mock('@/hooks/useTranslations', () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        dialog_content_login_required: 'Please log in.',
        button_retry: 'Retry',
        label_attendance_check_in: 'Check In',
        label_attendance_checked: 'Checked In',
        label_attendance_weekly_bonus: 'Weekly Bonus',
        label_attendance_new_user_notice: 'Welcome! New user bonus available.',
      };
      return map[key] || key;
    },
    currentLanguage: 'en',
  }),
}));

const mockAuthState = { isAuthenticated: true, isLoading: false };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/api/attendance', () => ({
  getAttendanceStatus: (...args: any[]) => mockGetAttendanceStatus(...args),
  performAttendanceCheck: (...args: any[]) => mockPerformAttendanceCheck(...args),
}));

vi.mock('@/components/client/attendance/AttendanceWeeklyCalendar', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid="weekly-calendar">{props.checkedCount}/{props.totalRequired}</div>,
}));

vi.mock('@/components/client/attendance/AttendanceDeadlineTimer', () => ({
  __esModule: true,
  default: () => <div data-testid="deadline-timer" />,
}));

import AttendanceCheck from '@/components/client/attendance/AttendanceCheck';

describe('AttendanceCheck', () => {
  const mockStatus = {
    todayChecked: false,
    deadlineKST: '2025-12-31T23:59:59Z',
    weeklyStatus: {
      days: [
        { date: '2025-01-06', dayOfWeek: 0, checked: true, isToday: false, isFuture: false },
        { date: '2025-01-07', dayOfWeek: 1, checked: false, isToday: true, isFuture: false },
        { date: '2025-01-08', dayOfWeek: 2, checked: false, isToday: false, isFuture: true },
        { date: '2025-01-09', dayOfWeek: 3, checked: false, isToday: false, isFuture: true },
        { date: '2025-01-10', dayOfWeek: 4, checked: false, isToday: false, isFuture: true },
        { date: '2025-01-11', dayOfWeek: 5, checked: false, isToday: false, isFuture: true },
        { date: '2025-01-12', dayOfWeek: 6, checked: false, isToday: false, isFuture: true },
      ],
      checkedCount: 1,
      totalRequired: 7,
      isWeeklyBonusEligible: false,
      isNewUser: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;
    mockGetAttendanceStatus.mockResolvedValue(mockStatus);
  });

  it('renders loading state while fetching', () => {
    mockGetAttendanceStatus.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<AttendanceCheck />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows login prompt when not authenticated', async () => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;
    render(<AttendanceCheck />);
    await waitFor(() => {
      expect(screen.getByText('Please log in.')).toBeInTheDocument();
    });
  });

  it('renders check-in button when authenticated and not checked in', async () => {
    render(<AttendanceCheck />);
    await waitFor(() => {
      // "Check In" appears in both the info box and the button; use getAllByText
      const checkInElements = screen.getAllByText('Check In');
      expect(checkInElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows progress count badge', async () => {
    render(<AttendanceCheck />);
    await waitFor(() => {
      // "1/7" appears in both the badge and the mocked calendar
      const elements = screen.getAllByText('1/7');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders weekly calendar', async () => {
    render(<AttendanceCheck />);
    await waitFor(() => {
      expect(screen.getByTestId('weekly-calendar')).toBeInTheDocument();
    });
  });

  it('disables button when already checked in today', async () => {
    mockGetAttendanceStatus.mockResolvedValue({
      ...mockStatus,
      todayChecked: true,
    });
    render(<AttendanceCheck />);
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  it('performs check-in on button click', async () => {
    mockPerformAttendanceCheck.mockResolvedValue({
      totalReward: 60,
      weeklyBonusAmount: 0,
      weeklyStatus: mockStatus.weeklyStatus,
      serverTimeKST: '2025-01-07T12:00:00+09:00',
    });

    render(<AttendanceCheck />);
    await waitFor(() => {
      // Wait for the button to render
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockPerformAttendanceCheck).toHaveBeenCalled();
    });
  });

  it('shows reward animation after check-in', async () => {
    mockPerformAttendanceCheck.mockResolvedValue({
      totalReward: 60,
      weeklyBonusAmount: 0,
      weeklyStatus: mockStatus.weeklyStatus,
      serverTimeKST: '2025-01-07T12:00:00+09:00',
    });

    render(<AttendanceCheck />);
    await waitFor(() => screen.getByRole('button'));

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      // The reward +60 should appear in the result animation
      const rewardElements = screen.getAllByText('+60');
      expect(rewardElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error state and retry button on fetch failure', async () => {
    mockGetAttendanceStatus.mockRejectedValue(new Error('Network error'));
    render(<AttendanceCheck />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('refetches status on retry click', async () => {
    mockGetAttendanceStatus.mockRejectedValueOnce(new Error('Network error'));
    render(<AttendanceCheck />);
    await waitFor(() => screen.getByText('Retry'));

    mockGetAttendanceStatus.mockResolvedValue(mockStatus);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(mockGetAttendanceStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('shows new user notice when isNewUser is true', async () => {
    mockGetAttendanceStatus.mockResolvedValue({
      ...mockStatus,
      weeklyStatus: { ...mockStatus.weeklyStatus, isNewUser: true },
    });
    render(<AttendanceCheck />);
    await waitFor(() => {
      expect(screen.getByText('Welcome! New user bonus available.')).toBeInTheDocument();
    });
  });

  it('renders reward info banner', async () => {
    render(<AttendanceCheck />);
    await waitFor(() => {
      // Check for the +60 reward info
      expect(screen.getAllByText('+60').length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================
// AttendanceWeeklyCalendar tests (separate file import, no mock)
// ============================
// Since we mocked AttendanceWeeklyCalendar above for AttendanceCheck tests,
// we import the real module directly for unit testing
import AttendanceWeeklyCalendarReal from '@/components/client/attendance/AttendanceWeeklyCalendar';

// The mock above will still be in effect, so we test it indirectly
// Instead, let's test the real component by importing it before the mock takes effect
// Unfortunately vi.mock is hoisted, so we need a workaround

// We'll test the calendar component via its rendered output in a separate describe
// using vi.importActual
describe('AttendanceWeeklyCalendar (via actual import)', () => {
  const baseDays = [
    { date: '2025-01-06', dayOfWeek: 0, checked: true, isToday: false, isFuture: false },
    { date: '2025-01-07', dayOfWeek: 1, checked: false, isToday: true, isFuture: false },
    { date: '2025-01-08', dayOfWeek: 2, checked: false, isToday: false, isFuture: true },
    { date: '2025-01-09', dayOfWeek: 3, checked: false, isToday: false, isFuture: true },
    { date: '2025-01-10', dayOfWeek: 4, checked: false, isToday: false, isFuture: true },
    { date: '2025-01-11', dayOfWeek: 5, checked: false, isToday: false, isFuture: true },
    { date: '2025-01-12', dayOfWeek: 6, checked: false, isToday: false, isFuture: true },
  ];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let RealCalendar: typeof AttendanceWeeklyCalendarReal;

  beforeEach(async () => {
    const mod = await vi.importActual<typeof import('@/components/client/attendance/AttendanceWeeklyCalendar')>(
      '@/components/client/attendance/AttendanceWeeklyCalendar',
    );
    RealCalendar = mod.default;
  });

  it('renders without crashing', () => {
    const { container } = render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={false}
        todayChecked={false}
        totalRequired={7}
        checkedCount={1}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('renders all 7 day labels', () => {
    render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={false}
        todayChecked={false}
        totalRequired={7}
        checkedCount={1}
      />,
    );
    dayLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('shows progress count', () => {
    render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={false}
        todayChecked={false}
        totalRequired={7}
        checkedCount={3}
      />,
    );
    expect(screen.getByText('3 / 7')).toBeInTheDocument();
  });

  it('renders 7 day grid items', () => {
    const { container } = render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={false}
        todayChecked={false}
        totalRequired={7}
        checkedCount={1}
      />,
    );
    const gridItems = container.querySelectorAll('.grid-cols-7 > div');
    expect(gridItems).toHaveLength(7);
  });

  it('shows pulse indicator for today', () => {
    const { container } = render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={false}
        todayChecked={false}
        totalRequired={7}
        checkedCount={1}
      />,
    );
    const pulseElement = container.querySelector('.animate-pulse');
    expect(pulseElement).toBeTruthy();
  });

  it('shows 60p reward text for checked days', () => {
    render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={false}
        todayChecked={false}
        totalRequired={7}
        checkedCount={1}
      />,
    );
    const rewards = screen.getAllByText('60p');
    expect(rewards.length).toBeGreaterThan(0);
  });

  it('shows 120p for Sunday when weekly bonus eligible', () => {
    render(
      <RealCalendar
        days={baseDays}
        dayLabels={dayLabels}
        weeklyBonusEligible={true}
        todayChecked={false}
        totalRequired={7}
        checkedCount={1}
      />,
    );
    expect(screen.getByText('120p')).toBeInTheDocument();
  });
});
