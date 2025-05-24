import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { usePathname, useRouter } from 'next/navigation';
import { mockVotes } from '../../../../utils/mockVoteData';
import { render as customRender } from '../../../../utils/test-utils';
import VotePageClient from '../../../../../app/[lang]/(main)/vote/VotePageClient';

// 라우터 모킹
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// 목 컴포넌트에서 이벤트를 트리거하기 위한 클릭 핸들러 구현
jest.mock('@/components/client/vote/list/VoteList', () => {
  return function MockVoteList({ status }: { status?: string }) {
    const router = useRouter();
    
    const handleVoteClick = (id: number) => {
      router.push(`/vote/${id}`);
    };
    
    return (
      <div data-testid={status ? `vote-list-${status}` : 'vote-list'}>
        {mockVotes.map(vote => (
          <div 
            key={vote.id} 
            data-testid="vote-item"
            onClick={() => handleVoteClick(vote.id)}
            role="button"
            tabIndex={0}
          >
            {String(vote.title)}
          </div>
        ))}
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

// API 요청 모킹
jest.mock('@/lib/data-fetching/vote-service', () => ({
  getVotes: jest.fn().mockResolvedValue(mockVotes)
}));

// SupabaseProvider 모킹
jest.mock('@/components/providers/SupabaseProvider', () => ({
  useSupabase: () => ({
    supabase: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation(cb => cb({ data: mockVotes, error: null }))
    }
  })
}));

// 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko'
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

describe('투표 페이지 상호작용 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/vote');
  });

  test('투표 항목 클릭 시 상세 페이지로 이동하는지 확인', async () => {
    customRender(<VotePageClient />);
    
    // 투표 목록이 로드될 때까지 대기
    await waitFor(() => {
      expect(screen.getByTestId('vote-list')).toBeInTheDocument();
    });
    
    // 첫 번째 투표 항목 클릭
    const firstVoteItem = screen.getAllByTestId('vote-item')[0];
    fireEvent.click(firstVoteItem);
    
    // 라우터의 push 메서드가 올바른 경로로 호출되었는지 확인
    expect(mockPush).toHaveBeenCalledWith(`/vote/${mockVotes[0].id}`);
  });

  test('여러 투표 항목을 순차적으로 클릭하는 시나리오', async () => {
    customRender(<VotePageClient />);
    
    // 투표 목록이 로드될 때까지 대기
    await waitFor(() => {
      expect(screen.getAllByTestId('vote-item').length).toBeGreaterThan(0);
    });
    
    // 여러 투표 항목을 순차적으로 클릭
    const voteItems = screen.getAllByTestId('vote-item');
    
    // 첫 번째 항목 클릭
    fireEvent.click(voteItems[0]);
    expect(mockPush).toHaveBeenLastCalledWith(`/vote/${mockVotes[0].id}`);
    
    // 두 번째 항목 클릭
    fireEvent.click(voteItems[1]);
    expect(mockPush).toHaveBeenLastCalledWith(`/vote/${mockVotes[1].id}`);
    
    // 세 번째 항목 클릭 (있다면)
    if (voteItems.length > 2) {
      fireEvent.click(voteItems[2]);
      expect(mockPush).toHaveBeenLastCalledWith(`/vote/${mockVotes[2].id}`);
    }
    
    // push 메서드 호출 횟수 확인
    const expectedCalls = Math.min(3, voteItems.length);
    expect(mockPush).toHaveBeenCalledTimes(expectedCalls);
  });
}); 