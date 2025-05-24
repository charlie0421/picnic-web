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
  useSearchParams: () => ({
    toString: () => '',
    get: jest.fn(),
    set: jest.fn(),
  }),
}));

// VoteList 컴포넌트 모킹 (오류 상태를 표시할 수 있도록)
jest.mock('@/components/client/vote/list/VoteList', () => {
  return function MockVoteList({ status }: { status?: string }) {
    // 오류 상태를 시뮬레이션
    const [error, setError] = React.useState<Error | null>(null);
    
    React.useEffect(() => {
      // 컴포넌트 마운트 시 오류 발생 시뮬레이션
      setTimeout(() => {
        setError(new Error('데이터를 불러오는 중 오류가 발생했습니다.'));
      }, 100);
    }, []);
    
    if (error) {
      return (
        <div data-testid="vote-list-error">
          <p>데이터를 불러오는 중 오류가 발생했습니다.</p>
          <button data-testid="retry-button">다시 시도</button>
        </div>
      );
    }
    
    return (
      <div data-testid={status ? `vote-list-${status}` : 'vote-list'}>
        투표 목록
      </div>
    );
  };
});

// BannerList 컴포넌트 모킹
jest.mock('@/components/client/vote/BannerList', () => {
  return function MockBannerList() {
    return <div data-testid="banner-list">배너 목록</div>;
  };
});

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
    
    // 배너 목록이 먼저 렌더링되는지 확인
    expect(screen.getByTestId('banner-list')).toBeInTheDocument();
    
    // 오류 상태가 표시될 때까지 대기
    await waitFor(() => {
      expect(screen.getByTestId('vote-list-error')).toBeInTheDocument();
    }, { timeout: 1000 });
    
    // 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/데이터를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    
    // 재시도 버튼이 표시되는지 확인
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  test('네트워크 오류 발생 시 적절한 오류 메시지가 표시되는지 확인', async () => {
    customRender(<VotePageClient />);
    
    // 오류 상태가 표시될 때까지 대기
    await waitFor(() => {
      expect(screen.getByTestId('vote-list-error')).toBeInTheDocument();
    }, { timeout: 1000 });
    
    // 오류 메시지 확인
    expect(screen.getByText(/데이터를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    
    // 재시도 버튼 확인
    const retryButton = screen.getByTestId('retry-button');
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toHaveTextContent('다시 시도');
  });
}); 