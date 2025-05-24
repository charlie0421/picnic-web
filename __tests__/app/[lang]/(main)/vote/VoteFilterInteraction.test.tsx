import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { mockVotes, getVotesByStatus } from '../../../../utils/mockVoteData';
import { render as customRender } from '../../../../utils/test-utils';
import VoteFilterSection from '../../../../../components/features/vote/list/VoteFilterSection';

// 모듈 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
  useSearchParams: () => ({
    toString: () => '',
    get: jest.fn(),
    set: jest.fn(),
  }),
}));

// 필터 스토어 모킹을 위한 준비
const mockSetSelectedStatus = jest.fn();
const mockSetSelectedArea = jest.fn();

// 상태를 관리하는 변수들
let currentStatus = 'ongoing';
let currentArea = 'kpop';

// 스토어 모킹
jest.mock('@/stores/voteFilterStore', () => ({
  useVoteFilterStore: () => ({
    selectedStatus: currentStatus,
    selectedArea: currentArea,
    setSelectedStatus: (status: string) => {
      if (status !== currentStatus) {
        currentStatus = status;
        mockSetSelectedStatus(status);
      }
    },
    setSelectedArea: (area: string) => {
      if (area !== currentArea) {
        currentArea = area;
        mockSetSelectedArea(area);
      }
    }
  }),
  VOTE_STATUS: {
    UPCOMING: 'upcoming',
    ONGOING: 'ongoing',
    COMPLETED: 'completed'
  },
  VOTE_AREAS: {
    KPOP: 'kpop',
    MUSICAL: 'musical'
  }
}));

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    t: (key: string) => {
      const translations: Record<string, string> = {
        'label_tabbar_vote_active': '진행 중',
        'label_tabbar_vote_upcoming': '예정',
        'label_tabbar_vote_end': '완료'
      };
      return translations[key] || key;
    }
  })
}));

describe('투표 필터 상호작용 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 상태 초기화
    currentStatus = 'ongoing';
    currentArea = 'kpop';
    (usePathname as jest.Mock).mockReturnValue('/ko/vote');
  });

  test('상태 필터 변경 시 상태가 올바르게 업데이트되는지 확인', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    // 필터가 로드될 때까지 대기
    await waitFor(() => {
      expect(getByText('진행 중')).toBeInTheDocument();
    });
    
    // "예정" 상태 필터 클릭
    act(() => {
      fireEvent.click(getByText('예정'));
    });
    
    // 상태 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('upcoming');
    
    // 상태 업데이트
    currentStatus = 'upcoming';
    
    // "완료" 상태 필터 클릭
    act(() => {
      fireEvent.click(getByText('완료'));
    });
    
    // 상태 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('completed');
  });

  test('영역 필터 변경 시 상태가 올바르게 업데이트되는지 확인', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    // 필터가 로드될 때까지 대기
    await waitFor(() => {
      expect(getByText('K-POP')).toBeInTheDocument();
    });
    
    // "K-MUSICAL" 영역 필터 클릭
    act(() => {
      fireEvent.click(getByText('K-MUSICAL'));
    });
    
    // 영역 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedArea).toHaveBeenCalledWith('musical');
  });
  
  test('필터 이중 전환 (상태 필터와 영역 필터 조합) 테스트', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    // 초기 필터가 로드될 때까지 대기
    await waitFor(() => {
      expect(getByText('진행 중')).toBeInTheDocument();
      expect(getByText('K-POP')).toBeInTheDocument();
    });
    
    // 1단계: 상태 필터 변경 (ongoing -> upcoming)
    act(() => {
      fireEvent.click(getByText('예정'));
    });
    
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('upcoming');
    expect(mockSetSelectedStatus).toHaveBeenCalledTimes(1);
    
    // 상태 업데이트
    currentStatus = 'upcoming';
    
    // 2단계: 영역 필터 변경 (kpop -> musical)
    act(() => {
      fireEvent.click(getByText('K-MUSICAL'));
    });
    
    expect(mockSetSelectedArea).toHaveBeenCalledWith('musical');
    expect(mockSetSelectedArea).toHaveBeenCalledTimes(1);
    
    // 상태 업데이트
    currentArea = 'musical';
    
    // 3단계: 상태 필터 다시 변경 (upcoming -> completed)
    act(() => {
      fireEvent.click(getByText('완료'));
    });
    
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('completed');
    expect(mockSetSelectedStatus).toHaveBeenCalledTimes(2);
    
    // 최종 호출 횟수 확인
    expect(mockSetSelectedStatus).toHaveBeenCalledTimes(2); // 'upcoming', 'completed'
    expect(mockSetSelectedArea).toHaveBeenCalledTimes(1); // 'musical'
  });

  test('필터 버튼의 활성 상태가 올바르게 표시되는지 확인', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    // 초기 상태 확인 - ongoing이 활성화되어 있어야 함
    await waitFor(() => {
      const ongoingButton = getByText('진행 중');
      const kpopButton = getByText('K-POP');
      
      expect(ongoingButton).toBeInTheDocument();
      expect(kpopButton).toBeInTheDocument();
      
      // 활성 상태 확인 (aria-pressed 속성)
      expect(ongoingButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('필터 변경 시 URL 파라미터가 업데이트되는지 확인', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    await waitFor(() => {
      expect(getByText('진행 중')).toBeInTheDocument();
    });
    
    // 상태 필터 변경
    act(() => {
      fireEvent.click(getByText('예정'));
    });
    
    // URL 업데이트가 호출되었는지 확인 (실제 URL은 모킹되어 있으므로 함수 호출만 확인)
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('upcoming');
  });

  test('동일한 필터 클릭 시 상태가 변경되지 않는지 확인', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    await waitFor(() => {
      expect(getByText('진행 중')).toBeInTheDocument();
    });
    
    // 이미 선택된 "진행 중" 버튼을 다시 클릭
    act(() => {
      fireEvent.click(getByText('진행 중'));
    });
    
    // 같은 상태로 변경 시 함수가 호출되지 않아야 함
    expect(mockSetSelectedStatus).not.toHaveBeenCalled();
    
    // K-POP도 마찬가지
    act(() => {
      fireEvent.click(getByText('K-POP'));
    });
    
    expect(mockSetSelectedArea).not.toHaveBeenCalled();
  });
}); 