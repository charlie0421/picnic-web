import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { mockVotes, mockVoteError } from '../../../../../utils/mockVoteData';
import { mockGetVoteById } from '../../../../../utils/mockVoteFunctions';
import { render as customRender } from '../../../../../utils/test-utils';

// VoteDetail 컴포넌트 모킹
jest.mock('@/components/shared/VoteDetail', () => {
  return function MockVoteDetail({ vote }: { vote: any }) {
    return (
      <div data-testid="vote-detail">
        <h1>{String(vote?.title)}</h1>
        <p>{vote?.voteContent}</p>
      </div>
    );
  };
});

// VoteDetailSkeleton 컴포넌트 모킹
jest.mock('@/components/server/VoteDetailSkeleton', () => {
  return function MockVoteDetailSkeleton() {
    return <div data-testid="vote-detail-skeleton">로딩 중...</div>;
  };
});

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
  getVoteById: jest.fn(),
  getVotes: jest.fn(),
}));

import { getVoteById } from '@/lib/data-fetching/vote-service';

// 실제 페이지 컴포넌트 불러오기
import VoteDetailPage from '../../../../../../app/[lang]/(main)/vote/[id]/page';

describe('투표 상세 페이지 테스트', () => {
  const mockParams = { id: '1', lang: 'ko' };
  const mockSearchParams = {};
  
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue(`/ko/vote/${mockParams.id}`);
    (getVoteById as jest.Mock).mockImplementation(mockGetVoteById);
  });

  test('투표 상세 페이지가 정상적으로 렌더링되는지 확인', async () => {
    const mockVote = mockVotes.find(v => v.id.toString() === mockParams.id);
    (getVoteById as jest.Mock).mockResolvedValue(mockVote);
    
    const { container } = customRender(
      <VoteDetailPage params={mockParams} searchParams={mockSearchParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('vote-detail')).toBeInTheDocument();
      expect(screen.getByText(String(mockVote!.title))).toBeInTheDocument();
      expect(screen.getByText(mockVote!.voteContent!)).toBeInTheDocument();
    });
  });
  
  test('데이터가 없을 때 오류 메시지가 표시되는지 확인', async () => {
    (getVoteById as jest.Mock).mockResolvedValue(null);
    
    customRender(
      <VoteDetailPage params={mockParams} searchParams={mockSearchParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/찾을 수 없는 투표입니다/i)).toBeInTheDocument();
    });
  });
  
  test('로딩 중에 스켈레톤이 표시되는지 확인', async () => {
    // getVoteById가 resolve되기 전에 스켈레톤이 보여야 함
    const mockVote = mockVotes.find(v => v.id.toString() === mockParams.id);
    const mockPromise = new Promise<any>(resolve => {
      setTimeout(() => resolve(mockVote), 100);
    });
    
    (getVoteById as jest.Mock).mockReturnValue(mockPromise);
    
    customRender(
      <VoteDetailPage params={mockParams} searchParams={mockSearchParams} />
    );
    
    // 스켈레톤이 먼저 렌더링되어야 함
    expect(screen.getByTestId('vote-detail-skeleton')).toBeInTheDocument();
    
    // 데이터가 로드된 후에는 상세 정보가 표시되어야 함
    await waitFor(() => {
      expect(screen.getByTestId('vote-detail')).toBeInTheDocument();
    });
  });
  
  test('에러 발생 시 에러 메시지가 표시되는지 확인', async () => {
    (getVoteById as jest.Mock).mockRejectedValue(mockVoteError);
    
    customRender(
      <VoteDetailPage params={mockParams} searchParams={mockSearchParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/오류가 발생했습니다/i)).toBeInTheDocument();
    });
  });
}); 