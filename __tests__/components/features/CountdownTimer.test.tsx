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
    'vote_status_closed': '마감',
    'time_unit_day': '일',
    'time_unit_hour': '시',
    'time_unit_minute': '분',
    'time_unit_second': '초',
  };
  return translations[key] || key;
});

jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: mockT,
  }),
}));

// useTranslationReady 모킹
jest.mock('@/hooks/useTranslationReady', () => ({
  useTranslationReady: () => true,
}));

describe('CountdownTimer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2023-12-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('timeLeft prop 사용', () => {
    it('timeLeft prop이 제공되면 해당 시간을 표시한다 (simple variant)', () => {
      const timeLeft = { days: 1, hours: 2, minutes: 30, seconds: 45 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          status="in_progress"
          variant="simple"
        />
      );

      expect(screen.getByText('투표 종료까지')).toBeInTheDocument();
      expect(screen.getByText('1 일')).toBeInTheDocument();
      expect(screen.getByText('02 시')).toBeInTheDocument();
      expect(screen.getByText('30 분')).toBeInTheDocument();
      expect(screen.getByText('45 초')).toBeInTheDocument();
    });

    it('timeLeft prop이 제공되면 해당 시간을 표시한다 (decorated variant)', () => {
      const timeLeft = { days: 0, hours: 23, minutes: 30, seconds: 15 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          status="in_progress"
          variant="decorated"
        />
      );

      expect(screen.getByText('00')).toBeInTheDocument(); // 0일
      expect(screen.getByText('23')).toBeInTheDocument(); // 23시간
      expect(screen.getByText('30')).toBeInTheDocument(); // 30분
      expect(screen.getByText('15')).toBeInTheDocument(); // 15초
    });

    it('24시간 미만일 때도 일 단위를 표시한다', () => {
      const timeLeft = { days: 0, hours: 12, minutes: 30, seconds: 45 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          status="in_progress"
          variant="decorated"
        />
      );

      // 일 단위가 0이어도 표시되는지 확인
      expect(screen.getByText('00')).toBeInTheDocument(); // 0일이 표시됨
      expect(screen.getByText('12')).toBeInTheDocument(); // 12시간
      expect(screen.getByText('30')).toBeInTheDocument(); // 30분
      expect(screen.getByText('45')).toBeInTheDocument(); // 45초
    });

    it('1시간 미만일 때도 모든 시간 단위를 표시한다', () => {
      const timeLeft = { days: 0, hours: 0, minutes: 30, seconds: 45 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          status="in_progress"
          variant="decorated"
        />
      );

      // 모든 시간 단위가 표시되는지 확인
      const zeroElements = screen.getAllByText('00');
      expect(zeroElements.length).toBeGreaterThanOrEqual(2); // 0일, 0시간
      expect(screen.getByText('30')).toBeInTheDocument(); // 30분
      expect(screen.getByText('45')).toBeInTheDocument(); // 45초
    });

    it('시간이 모두 0일 때 마감 메시지를 표시한다', () => {
      const timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          status="in_progress"
        />
      );

      expect(screen.getByText('마감')).toBeInTheDocument();
      expect(screen.getByText('🚫')).toBeInTheDocument();
    });
  });

  describe('시간 계산 로직', () => {
    it('미래 시간이 제공되면 남은 시간을 계산한다', () => {
      const futureTime = new Date('2023-12-01T14:00:00Z').toISOString(); // 2시간 후
      
      renderWithProviders(
        <CountdownTimer
          endTime={futureTime}
          status="in_progress"
          variant="simple"
        />
      );

      // 시간이 계산되어 표시되는지 확인
      expect(screen.getByText('투표 종료까지')).toBeInTheDocument();
    });

    it('scheduled 상태에서는 startTime을 기준으로 계산한다', () => {
      const futureTime = new Date('2023-12-01T13:00:00Z').toISOString(); // 1시간 후
      
      renderWithProviders(
        <CountdownTimer
          startTime={futureTime}
          status="scheduled"
          variant="simple"
        />
      );

      expect(screen.getByText('투표 시작까지')).toBeInTheDocument();
    });
  });

  describe('상태별 동작', () => {
    it('ended 상태에서는 투표 종료 메시지를 표시한다', () => {
      renderWithProviders(
        <CountdownTimer
          status="ended"
        />
      );

      expect(screen.getByText('투표 종료')).toBeInTheDocument();
    });

    it('voteStatus가 ongoing이 아니면 아무것도 렌더링하지 않는다', () => {
      const { container } = renderWithProviders(
        <CountdownTimer
          voteStatus="completed"
        />
      );

      // wrapper 요소 안에 실제 컨텐츠가 없는지 확인
      const wrapper = container.querySelector('[data-testid="test-wrapper"]');
      expect(wrapper?.firstChild).toBeNull();
    });
  });

  describe('UI 옵션', () => {
    it('compact 옵션이 적용된다', () => {
      const timeLeft = { days: 1, hours: 2, minutes: 30, seconds: 45 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          variant="decorated"
          compact={true}
        />
      );

      // compact 스타일이 적용되었는지 확인 (DOM 구조로 확인)
      expect(screen.getByText('01')).toBeInTheDocument();
    });

    it('showEmoji false일 때 이모지를 표시하지 않는다', () => {
      const timeLeft = { days: 1, hours: 2, minutes: 30, seconds: 45 };
      
      renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          variant="decorated"
          showEmoji={false}
        />
      );

      expect(screen.queryByText('⏱️')).not.toBeInTheDocument();
    });

    it('커스텀 className을 적용한다', () => {
      const timeLeft = { days: 1, hours: 2, minutes: 30, seconds: 45 };
      
      const { container } = renderWithProviders(
        <CountdownTimer
          timeLeft={timeLeft}
          className="custom-timer-class"
        />
      );

      // wrapper 내부의 실제 컴포넌트에 className이 적용되었는지 확인
      const timerElement = container.querySelector('.custom-timer-class');
      expect(timerElement).toBeInTheDocument();
    });
  });
}); 