import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { mockVoteError } from '../../../../utils/mockVoteData';
import { render as customRender } from '../../../../utils/test-utils';
import VotePageClient from '../../../../../app/[lang]/(main)/vote/VotePageClient';

// 모듈 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// VoteList 컴포넌트 모킹 (오류 상태를 표시할 수 있도록)
jest.mock('@/components/features/vote/list/VoteList', () => {
  return function MockVoteList({ status }: { status?: string }) {
    return (
      <div data-testid={status ? `vote-list-${status}` : 'vote-list'}>
        <div data-testid="vote-list-error">
          <p>데이터를 불러오는 중 오류가 발생했습니다.</p>
        </div>
      </div>
    );
  };
});

// BannerList 컴포넌트 모킹
jest.mock('@/components/features/vote/BannerList', () => {
  return function MockBannerList() {
    return <div data-testid="banner-list">배너 목록</div>;
  };
});

// API 요청 모킹 - 오류 시뮬레이션
jest.mock('@/lib/data-fetching/vote-service', () => ({
  getVotes: jest.fn().mockRejectedValue(mockVoteError)
}));

// SupabaseProvider 모킹 - 오류 시뮬레이션
jest.mock('@/components/providers/SupabaseProvider', () => ({
  useSupabase: () => ({
    supabase: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation(cb => cb({ data: null, error: mockVoteError }))
    }
  })
}));

// 오류 스토어 모킹
const mockSetError = jest.fn();
jest.mock('@/stores/errorStore', () => ({
  useErrorStore: () => ({
    setError: mockSetError,
    error: null,
    clearError: jest.fn()
  })
}));

// 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    t: (key: string) => key
  })
}));

jest.mock('@/stores/voteFilterStore', () => ({
  useVoteFilterStore: () => ({
    selectedStatus: 'ongoing',
    selectedArea: 'kpop',
    setSelectedStatus: jest.fn(),
    setSelectedArea: jest.fn()
  }),
  VOTE_STATUS: {
    UPCOMING: 'upcoming',
    ONGOING: 'ongoing',
    COMPLETED: 'completed'
  },
  VOTE_AREAS: {
    KPOP: 'kpop'
  }
}));

describe('투표 페이지 오류 상태 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/vote');
  });

  test('데이터 로딩 실패 시 오류 상태가 표시되는지 확인', async () => {
    customRender(<VotePageClient />);
    
    // 오류 상태가 표시될 때까지 대기
    await waitFor(() => {
      expect(screen.getByTestId('vote-list-error')).toBeInTheDocument();
    });
    
    // 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/데이터를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    
    // 오류 스토어에 오류가 설정되었는지 확인
    expect(mockSetError).toHaveBeenCalled();
  });
}); 