import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { mockVotes, emptyVotes, mockVoteError, getVotesByStatus } from '../../../../utils/mockVoteData';
import { mockGetVotes } from '../../../../utils/mockVoteFunctions';
import VotePageClient from '../../../../../app/[lang]/(main)/vote/VotePageClient';
import { render as customRender } from '../../../../utils/test-utils';
import { Vote, Json } from '@/types/interfaces';

// 모듈 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// API 요청 모킹
jest.mock('@/lib/data-fetching/vote-service', () => ({
  getVotes: jest.fn(),
}));

// JSON 타입에서 제목 표시 헬퍼 함수
const getDisplayTitle = (title: Vote['title'] | null | undefined): string => {
  if (!title) return '';
  
  // Json 객체에서 한글/영어 제목 추출
  if (typeof title === 'object' && title !== null) {
    if ('ko' in title && typeof title.ko === 'string') {
      return title.ko;
    }
    if ('en' in title && typeof title.en === 'string') {
      return title.en;
    }
  }
  
  // 다른 타입은 문자열 변환
  return String(title);
};

// VoteList 컴포넌트 모킹
jest.mock('@/components/features/vote/list/VoteList', () => {
  return function MockVoteList({ status }: { status?: string }) {
    const testId = status ? `vote-list-${status}` : 'vote-list';
    return (
      <div data-testid={testId}>
        {mockVotes.map(vote => (
          <div key={vote.id} data-testid="vote-item">
            {getDisplayTitle(vote.title)}
          </div>
        ))}
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

// SupabaseProvider 모킹 추가
jest.mock('@/components/providers/SupabaseProvider', () => ({
  useSupabase: () => ({
    supabase: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation(cb => cb({ data: mockVotes, error: null }))
    }
  })
}));

// 스토어 모킹 추가
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko'
  })
}));

jest.mock('@/stores/voteFilterStore', () => ({
  useVoteFilterStore: () => ({
    selectedStatus: 'ongoing',
    selectedArea: 'kpop'
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

import { getVotes } from '@/lib/data-fetching/vote-service';

describe('투표 페이지 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/vote');
    (getVotes as jest.Mock).mockImplementation(mockGetVotes);
  });

  test('투표 페이지가 정상적으로 렌더링되는지 확인', async () => {
    customRender(<VotePageClient />);
    
    // 페이지 컴포넌트들이 렌더링되었는지 확인
    expect(screen.getByTestId('banner-list')).toBeInTheDocument();
    expect(screen.getByTestId('vote-list')).toBeInTheDocument();
    
    // 투표 항목이 정확한 수만큼 표시되는지 확인
    const voteItems = screen.getAllByTestId('vote-item');
    expect(voteItems).toHaveLength(mockVotes.length);
    
    // 투표 제목이 올바르게 표시되는지 확인
    mockVotes.forEach(vote => {
      const displayTitle = getDisplayTitle(vote.title);
      if (displayTitle) {
        expect(screen.getByText(displayTitle)).toBeInTheDocument();
      }
    });
  });
  
  test('VoteList 컴포넌트가 올바르게 로드되는지 확인', () => {
    customRender(<VotePageClient />);
    
    expect(screen.getByTestId('vote-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('vote-item')).toHaveLength(mockVotes.length);
  });

  test('데이터가 없을 때 메시지가 표시되는지 확인', async () => {
    (getVotes as jest.Mock).mockResolvedValue(emptyVotes);
    
    customRender(<VotePageClient />);
    
    await waitFor(() => {
      expect(screen.getByText(/투표가 없습니다/i)).toBeInTheDocument();
    });
  });
  
  test('에러 발생 시 에러 메시지가 표시되는지 확인', async () => {
    (getVotes as jest.Mock).mockRejectedValue(mockVoteError);
    
    customRender(<VotePageClient />);
    
    await waitFor(() => {
      expect(screen.getByText(/오류가 발생했습니다/i)).toBeInTheDocument();
    });
  });
  
  test('필터링된 투표 목록이 정상적으로 표시되는지 확인', async () => {
    const ongoingVotes = getVotesByStatus('ongoing');
    (getVotes as jest.Mock).mockResolvedValue(ongoingVotes);
    
    customRender(<VotePageClient filter="ongoing" />);
    
    await waitFor(() => {
      ongoingVotes.forEach(vote => {
        const displayTitle = getDisplayTitle(vote.title);
        if (displayTitle) {
          expect(screen.getByText(displayTitle)).toBeInTheDocument();
        }
      });
      
      const filteredVoteItems = screen.getAllByTestId('vote-item');
      expect(filteredVoteItems).toHaveLength(ongoingVotes.length);
    });
  });
  
  test('종료된 투표 목록이 정상적으로 표시되는지 확인', async () => {
    const completedVotes = getVotesByStatus('completed');
    (getVotes as jest.Mock).mockResolvedValue(completedVotes);
    
    customRender(<VotePageClient filter="completed" />);
    
    await waitFor(() => {
      completedVotes.forEach(vote => {
        const displayTitle = getDisplayTitle(vote.title);
        if (displayTitle) {
          expect(screen.getByText(displayTitle)).toBeInTheDocument();
        }
      });
      
      const completedVoteItems = screen.getAllByTestId('vote-item');
      expect(completedVoteItems).toHaveLength(completedVotes.length);
    });
  });
  
  test('다가오는 투표 목록이 정상적으로 표시되는지 확인', async () => {
    const upcomingVotes = getVotesByStatus('upcoming');
    (getVotes as jest.Mock).mockResolvedValue(upcomingVotes);
    
    customRender(<VotePageClient filter="upcoming" />);
    
    await waitFor(() => {
      upcomingVotes.forEach(vote => {
        const displayTitle = getDisplayTitle(vote.title);
        if (displayTitle) {
          expect(screen.getByText(displayTitle)).toBeInTheDocument();
        }
      });
      
      const upcomingVoteItems = screen.getAllByTestId('vote-item');
      expect(upcomingVoteItems).toHaveLength(upcomingVotes.length);
    });
  });
}); 