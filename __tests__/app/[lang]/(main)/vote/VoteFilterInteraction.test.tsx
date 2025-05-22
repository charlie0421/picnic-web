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
}));

// 필터 스토어 모킹을 위한 준비
const mockSetSelectedStatus = jest.fn();
const mockSetSelectedArea = jest.fn();

// 스토어 모킹
jest.mock('@/stores/voteFilterStore', () => {
  const selectedStatus = jest.requireActual('react').createRef();
  selectedStatus.current = 'ongoing';
  
  const selectedArea = jest.requireActual('react').createRef();
  selectedArea.current = 'kpop';
  
  return {
    useVoteFilterStore: () => ({
      selectedStatus: selectedStatus.current,
      selectedArea: selectedArea.current,
      setSelectedStatus: (status: string) => {
        selectedStatus.current = status;
        mockSetSelectedStatus(status);
      },
      setSelectedArea: (area: string) => {
        selectedArea.current = area;
        mockSetSelectedArea(area);
      }
    }),
    VOTE_STATUS: {
      ALL: 'all',
      UPCOMING: 'upcoming',
      ONGOING: 'ongoing',
      COMPLETED: 'completed'
    },
    VOTE_AREAS: {
      ALL: 'all',
      KPOP: 'kpop',
      JPOP: 'jpop',
      CPOP: 'cpop'
    }
  };
});

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    t: (key: string) => {
      const translations: Record<string, string> = {
        'label_vote_status_all': '전체',
        'label_vote_status_upcoming': '예정',
        'label_vote_status_ongoing': '진행 중',
        'label_vote_status_completed': '완료',
        'label_vote_area_all': '전체',
        'label_vote_area_kpop': 'K-POP',
        'label_vote_area_jpop': 'J-POP',
        'label_vote_area_cpop': 'C-POP'
      };
      return translations[key] || key;
    }
  })
}));

describe('투표 필터 상호작용 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    
    // "완료" 상태 필터 클릭
    act(() => {
      fireEvent.click(getByText('완료'));
    });
    
    // 상태 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('completed');
    
    // "전체" 상태 필터 클릭
    act(() => {
      fireEvent.click(getByText('전체'));
    });
    
    // 상태 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('all');
  });

  test('영역 필터 변경 시 상태가 올바르게 업데이트되는지 확인', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    // 필터가 로드될 때까지 대기
    await waitFor(() => {
      expect(getByText('K-POP')).toBeInTheDocument();
    });
    
    // "J-POP" 영역 필터 클릭
    act(() => {
      fireEvent.click(getByText('J-POP'));
    });
    
    // 영역 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedArea).toHaveBeenCalledWith('jpop');
    
    // "C-POP" 영역 필터 클릭
    act(() => {
      fireEvent.click(getByText('C-POP'));
    });
    
    // 영역 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedArea).toHaveBeenCalledWith('cpop');
    
    // "전체" 영역 필터 클릭
    act(() => {
      fireEvent.click(getByText('전체'));
    });
    
    // 영역 업데이트 함수가 올바른 값으로 호출되었는지 확인
    expect(mockSetSelectedArea).toHaveBeenCalledWith('all');
  });
  
  test('필터 이중 전환 (상태 필터와 영역 필터 조합) 테스트', async () => {
    const { getByText } = customRender(<VoteFilterSection />);
    
    // 초기 필터가 로드될 때까지 대기
    await waitFor(() => {
      expect(getByText('진행 중')).toBeInTheDocument();
      expect(getByText('K-POP')).toBeInTheDocument();
    });
    
    // 필터 조합 1: 예정 + J-POP
    act(() => {
      fireEvent.click(getByText('예정'));
      fireEvent.click(getByText('J-POP'));
    });
    
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('upcoming');
    expect(mockSetSelectedArea).toHaveBeenCalledWith('jpop');
    
    // 필터 조합 2: 완료 + C-POP
    act(() => {
      fireEvent.click(getByText('완료'));
      fireEvent.click(getByText('C-POP'));
    });
    
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('completed');
    expect(mockSetSelectedArea).toHaveBeenCalledWith('cpop');
    
    // 필터 조합 3: 전체 + 전체
    act(() => {
      fireEvent.click(getByText('전체'));
      fireEvent.click(getByText('전체'));
    });
    
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('all');
    expect(mockSetSelectedArea).toHaveBeenCalledWith('all');
  });
}); 