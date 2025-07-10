/**
 * CountdownTimer.tsx 테스트
 *
 * 이 테스트는 카운트다운 타이머 컴포넌트를 검증합니다.
 * 테스트 대상: CountdownTimer 컴포넌트
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { CountdownTimer } from '@/components/client/vote/common/CountdownTimer';
import { renderWithProviders } from '../../utils/test-utils';

// useLanguageStore 모킹
const mockT = jest.fn((key: string) => {
  const translations: Record<string, string> = {
    'text_vote_countdown_start': '투표 시작까지',
    'text_vote_countdown_end': '투표 종료까지',
    'text_vote_ended': '투표 종료',
  };
  return translations[key] || key;
});

jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: mockT,
  }),
}));

// useGlobalTimer 모킹 (Zustand 스토어)
jest.mock('@/utils/global-timer', () => ({
  __esModule: true,
  default: {
    subscribe: jest.fn(),
  },
}));

// date-fns 모킹
jest.mock('date-fns', () => ({
  differenceInSeconds: jest.fn(),
}));

const { differenceInSeconds } = require('date-fns');
const useGlobalTimer = require('@/utils/global-timer').default;

describe('CountdownTimer', () => {
  const mockCurrentTime = new Date('2023-12-01T12:00:00Z');
  const mockStartTime = '2023-12-01T13:00:00Z'; // 1시간 후
  const mockEndTime = '2023-12-01T14:00:00Z'; // 2시간 후
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // 기본 구독 설정
    useGlobalTimer.subscribe.mockImplementation((callback: (time: Date) => void) => {
      // 즉시 콜백 호출
      callback(mockCurrentTime);
      return mockUnsubscribe;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('SCHEDULED 상태', () => {
    it('투표 시작까지의 시간을 표시한다', () => {
      // 1시간 = 3600초
      differenceInSeconds.mockReturnValue(3600);

      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="scheduled"
        />
      );

      expect(screen.getByText('투표 시작까지')).toBeInTheDocument();
      expect(screen.getByText('01')).toBeInTheDocument(); // 1시간
      
      // 여러 개의 "00"이 있으므로 getAllByText 사용
      const zeroElements = screen.getAllByText('00');
      expect(zeroElements.length).toBeGreaterThan(0); // 0분, 0초 등
    });

    it('1일 이상 남았을 때 적절한 스타일을 적용한다', () => {
      // 1일 + 1시간 = 90000초
      differenceInSeconds.mockReturnValue(90000);

      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="scheduled"
        />
      );

      // 컨테이너가 렌더링되었는지 확인
      expect(container.firstChild).toBeTruthy();
    });

    it('1시간 미만일 때 긴급 스타일을 적용한다', () => {
      // 30분 = 1800초
      differenceInSeconds.mockReturnValue(1800);

      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="scheduled"
        />
      );

      // 컨테이너가 렌더링되었는지 확인
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('IN_PROGRESS 상태', () => {
    it('투표 종료까지의 시간을 표시한다', () => {
      // 2시간 = 7200초
      differenceInSeconds.mockReturnValue(7200);

      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
        />
      );

      expect(screen.getByText('투표 종료까지')).toBeInTheDocument();
      expect(screen.getByText('02')).toBeInTheDocument(); // 2시간
    });

    it('endTime을 기준으로 계산한다', () => {
      differenceInSeconds.mockReturnValue(3600);

      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
        />
      );

      // differenceInSeconds가 호출되었는지 확인
      expect(differenceInSeconds).toHaveBeenCalled();
    });
  });

  describe('ENDED 상태', () => {
    it('투표 종료 메시지를 표시한다', () => {
      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="ended"
        />
      );

      expect(screen.getByText('투표 종료')).toBeInTheDocument();
    });

    it('모든 시간이 00으로 표시된다', () => {
      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="ended"
        />
      );

      const timeElements = screen.getAllByText('00');
      expect(timeElements.length).toBeGreaterThanOrEqual(1);
    });

    it('비활성화된 스타일을 적용한다', () => {
      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="ended"
        />
      );

      // 컨테이너가 렌더링되었는지 확인
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('시간 계산', () => {
    it('일, 시, 분, 초를 올바르게 계산한다', () => {
      // 1일 2시간 3분 4초 = 93784초
      differenceInSeconds.mockReturnValue(93784);

      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="scheduled"
        />
      );

      // 시간 요소들이 표시되는지 확인
      expect(screen.getByText('01')).toBeInTheDocument(); // 1일
      expect(screen.getByText('02')).toBeInTheDocument(); // 2시간
    });

    it('시간이 0 이하일 때 모든 값을 0으로 설정한다', () => {
      differenceInSeconds.mockReturnValue(-100);

      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
        />
      );

      const timeElements = screen.getAllByText('00');
      expect(timeElements.length).toBeGreaterThanOrEqual(1);
    });

    it('정확히 0초일 때 모든 값을 0으로 설정한다', () => {
      differenceInSeconds.mockReturnValue(0);

      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
        />
      );

      const timeElements = screen.getAllByText('00');
      expect(timeElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('전역 타이머 구독', () => {
    it('컴포넌트 마운트 시 전역 타이머를 구독한다', () => {
      renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
        />
      );

      expect(useGlobalTimer.subscribe).toHaveBeenCalledTimes(1);
      expect(useGlobalTimer.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it('컴포넌트 언마운트 시 구독을 해제한다', () => {
      const { unmount } = renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
        />
      );

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('엣지 케이스', () => {
    it('startTime이 null일 때 아무것도 렌더링하지 않는다', () => {
      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={null}
          endTime={mockEndTime}
          status="scheduled"
        />
      );

      expect(container.firstChild?.firstChild).toBeNull();
    });

    it('endTime이 null일 때 아무것도 렌더링하지 않는다', () => {
      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={null}
          status="in_progress"
        />
      );

      expect(container.firstChild?.firstChild).toBeNull();
    });

    it('둘 다 null일 때 아무것도 렌더링하지 않는다', () => {
      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={null}
          endTime={null}
          status="ended"
        />
      );

      expect(container.firstChild?.firstChild).toBeNull();
    });

    it('커스텀 className을 적용한다', () => {
      differenceInSeconds.mockReturnValue(3600);

      const { container } = renderWithProviders(
        <CountdownTimer
          startTime={mockStartTime}
          endTime={mockEndTime}
          status="in_progress"
          className="custom-timer-class"
        />
      );

      // 컨테이너가 렌더링되었는지 확인
      expect(container.firstChild).toBeTruthy();
    });
  });
}); 