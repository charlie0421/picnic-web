import React from 'react';
import { render, screen } from '@testing-library/react';
import CountdownTimer from '@/components/features/CountdownTimer';
import { addDays, addHours, addMinutes, format } from 'date-fns';

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: jest.fn(() => ({
    t: jest.fn((key) => key),
  })),
}));

// 글로벌 타이머 모킹
jest.mock('@/utils/global-timer', () => ({
  __esModule: true,
  default: {
    subscribe: jest.fn(() => {
      // unsubscribe 함수 반환
      return jest.fn();
    }),
  },
}));

describe('CountdownTimer', () => {
  const now = new Date();
  
  // 테스트용 날짜 설정
  const futureDate1Day = format(addDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
  const futureDate2Hours = format(addHours(now, 2), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
  const futureDate30Minutes = format(addMinutes(now, 30), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 현재 시간 고정
    jest.spyOn(Date, 'now').mockImplementation(() => now.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders with days remaining (scheduled status)', () => {
    render(
      <CountdownTimer 
        startTime={futureDate1Day} 
        endTime={futureDate1Day} 
        status="scheduled" 
      />
    );
    
    // 상태 텍스트 확인
    expect(screen.getByText('text_vote_countdown_start')).toBeInTheDocument();
    
    // 타임 유닛 확인 (일/시간/분/초)
    expect(screen.getAllByText(/[DHMS]/)).toHaveLength(4);
  });

  it('renders with hours remaining (in_progress status)', () => {
    render(
      <CountdownTimer 
        startTime={now.toISOString()} 
        endTime={futureDate2Hours} 
        status="in_progress" 
      />
    );
    
    // 상태 텍스트 확인
    expect(screen.getByText('text_vote_countdown_end')).toBeInTheDocument();
    
    // 시간 유닛 확인
    expect(screen.getAllByText(/[DHMS]/)).toHaveLength(4);
  });

  it('renders ended status correctly', () => {
    render(
      <CountdownTimer 
        startTime={now.toISOString()} 
        endTime={now.toISOString()} 
        status="ended" 
      />
    );
    
    // 종료 상태 텍스트 확인
    expect(screen.getByText('text_vote_ended')).toBeInTheDocument();
  });

  it('renders null when target date is not provided', () => {
    const { container } = render(
      <CountdownTimer 
        startTime={null} 
        endTime={null} 
        status="scheduled" 
      />
    );
    
    // 컴포넌트가 렌더링되지 않았는지 확인
    expect(container).toBeEmptyDOMElement();
  });
}); 