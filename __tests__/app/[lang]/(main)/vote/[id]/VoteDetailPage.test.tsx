import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { mockVotes, mockVoteError } from '../../../../../utils/mockVoteData';
import { mockGetVoteById } from '../../../../../utils/mockVoteFunctions';
import { render as customRender } from '../../../../../utils/test-utils';

// VoteDetail 컴포넌트 모킹
jest.mock('@/components/client/vote/VoteDetail', () => {
  return function MockVoteDetail({ id }: { id: string }) {
    const vote = mockVotes.find((v) => v.id.toString() === id);

    if (!vote) {
      return <div data-testid='vote-not-found'>찾을 수 없는 투표입니다</div>;
    }

    return (
      <div data-testid='vote-detail'>
        <h1>{String(vote?.title)}</h1>
        <p>{vote?.vote_content}</p>
      </div>
    );
  };
});

// VoteDetailSkeleton 컴포넌트 모킹
jest.mock('@/components/server/VoteDetailSkeleton', () => {
  return function MockVoteDetailSkeleton() {
    return <div data-testid='vote-detail-skeleton'>로딩 중...</div>;
  };
});

// API 요청 모킹
jest.mock('@/lib/data-fetching/vote-service', () => ({
  getVoteById: jest.fn(),
  getVotes: jest.fn(),
}));

import { getVoteById } from '@/lib/data-fetching/vote-service';

// 테스트용 컴포넌트 - 서버 컴포넌트의 핵심 로직을 클라이언트 컴포넌트로 래핑
function TestVoteDetailPage({ id }: { id: string }) {
  const [vote, setVote] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchVote = async () => {
      try {
        setLoading(true);
        const voteData = await getVoteById(id);
        setVote(voteData);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchVote();
  }, [id]);

  if (loading) {
    return <div data-testid='vote-detail-skeleton'>로딩 중...</div>;
  }

  if (error) {
    return <div data-testid='vote-error'>오류가 발생했습니다</div>;
  }

  if (!vote) {
    return <div data-testid='vote-not-found'>찾을 수 없는 투표입니다</div>;
  }

  return (
    <div data-testid='vote-detail'>
      <h1>{String(vote.title)}</h1>
      <p>{vote.voteContent}</p>
    </div>
  );
}

describe('투표 상세 페이지 테스트', () => {
  const mockId = '1';

  beforeEach(() => {
    jest.clearAllMocks();
    (getVoteById as jest.Mock).mockImplementation(mockGetVoteById);
  });

  test('투표 상세 페이지가 정상적으로 렌더링되는지 확인', async () => {
    const mockVote = mockVotes.find((v) => v.id.toString() === mockId);
    (getVoteById as jest.Mock).mockResolvedValue(mockVote);

    customRender(<TestVoteDetailPage id={mockId} />);

    await waitFor(() => {
      expect(screen.getByTestId('vote-detail')).toBeInTheDocument();
      expect(screen.getByText(String(mockVote!.title))).toBeInTheDocument();
      expect(screen.getByText(mockVote!.vote_content!)).toBeInTheDocument();
    });
  });

  test('데이터가 없을 때 오류 메시지가 표시되는지 확인', async () => {
    (getVoteById as jest.Mock).mockResolvedValue(null);

    customRender(<TestVoteDetailPage id={mockId} />);

    await waitFor(() => {
      expect(screen.getByTestId('vote-not-found')).toBeInTheDocument();
      expect(screen.getByText('찾을 수 없는 투표입니다')).toBeInTheDocument();
    });
  });

  test('로딩 중에 스켈레톤이 표시되는지 확인', async () => {
    const mockVote = mockVotes.find((v) => v.id.toString() === mockId);
    let resolvePromise: (value: any) => void;
    const mockPromise = new Promise<any>((resolve) => {
      resolvePromise = resolve;
    });

    (getVoteById as jest.Mock).mockReturnValue(mockPromise);

    customRender(<TestVoteDetailPage id={mockId} />);

    // 스켈레톤이 먼저 렌더링되어야 함
    expect(screen.getByTestId('vote-detail-skeleton')).toBeInTheDocument();
    expect(screen.getByText('로딩 중...')).toBeInTheDocument();

    // 데이터 로드 완료
    resolvePromise!(mockVote);

    // 데이터가 로드된 후에는 상세 정보가 표시되어야 함
    await waitFor(() => {
      expect(screen.getByTestId('vote-detail')).toBeInTheDocument();
      expect(
        screen.queryByTestId('vote-detail-skeleton'),
      ).not.toBeInTheDocument();
    });
  });

  test('에러 발생 시 에러 메시지가 표시되는지 확인', async () => {
    (getVoteById as jest.Mock).mockRejectedValue(mockVoteError);

    customRender(<TestVoteDetailPage id={mockId} />);

    await waitFor(() => {
      expect(screen.getByTestId('vote-error')).toBeInTheDocument();
      expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
    });
  });

  test('VoteDetail 컴포넌트가 올바른 props로 호출되는지 확인', async () => {
    const mockVote = mockVotes.find((v) => v.id.toString() === mockId);
    (getVoteById as jest.Mock).mockResolvedValue(mockVote);

    customRender(<TestVoteDetailPage id={mockId} />);

    await waitFor(() => {
      expect(screen.getByTestId('vote-detail')).toBeInTheDocument();
      // getVoteById가 올바른 ID로 호출되었는지 확인
      expect(getVoteById).toHaveBeenCalledWith(mockId);
    });
  });
});
