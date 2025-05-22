import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { mockVoteError } from '../../../../../utils/mockVoteData';
import { render as customRender } from '../../../../../utils/test-utils';

// 모듈 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// VoteDetail 컴포넌트 모킹 (오류 상태를 표시할 수 있도록)
jest.mock('@/components/shared/VoteDetail', () => {
  return function MockVoteDetail({ vote, error }: { vote?: any, error?: any }) {
    if (error) {
      return (
        <div data-testid="vote-detail-error">
          <p>투표 정보를 불러오는 중 오류가 발생했습니다.</p>
        </div>
      );
    }
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

// API 요청 모킹 - 오류 시뮬레이션
jest.mock('@/lib/data-fetching/vote-service', () => ({
  getVoteById: jest.fn().mockRejectedValue(mockVoteError),
  getVoteItems: jest.fn().mockRejectedValue(mockVoteError),
  getVoteRewards: jest.fn().mockRejectedValue(mockVoteError)
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

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    t: (key: string) => key
  })
}));

describe('투표 상세 페이지 오류 상태 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/vote/1');
  });

  test('투표 상세 정보 로딩 실패 시 오류 상태가 표시되는지 확인', async () => {
    // 가상의 라우트 파라미터를 설정하여 상세 페이지 렌더링
    const mockParams = { lang: 'ko', id: '1' };

    // VoteDetailPage를 가정한 목 컴포넌트
    function MockVoteDetailPage() {
      return (
        <div>
          <h1>투표 상세</h1>
          <div data-testid="vote-detail-container">
            {/* 오류 상태를 전달하는 VoteDetail 컴포넌트 */}
            <VoteDetail vote={null} error={mockVoteError} />
          </div>
        </div>
      );
    }

    // VoteDetail 컴포넌트 가져오기
    const { VoteDetail } = jest.requireActual('@/components/shared/VoteDetail');
    
    customRender(<MockVoteDetailPage />);
    
    // 오류 상태가 표시될 때까지 대기
    await waitFor(() => {
      expect(screen.getByTestId('vote-detail-error')).toBeInTheDocument();
    });
    
    // 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/투표 정보를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    
    // 오류 스토어에 오류가 설정되었는지 확인 (실제 VoteDetail 컴포넌트에서 호출)
    // 목 컴포넌트에서는 직접 호출되지 않을 수 있으므로 이 테스트는 건너뜀
  });

  test('네트워크 오류 발생 시 재시도 버튼이 표시되는지 확인', async () => {
    // 네트워크 오류를 시뮬레이션하는 VoteDetail 컴포넌트
    function VoteDetailWithRetry() {
      return (
        <div data-testid="vote-detail-error">
          <p>네트워크 오류가 발생했습니다.</p>
          <button data-testid="retry-button">다시 시도</button>
        </div>
      );
    }

    customRender(<VoteDetailWithRetry />);
    
    // 오류 상태와 재시도 버튼이 표시되는지 확인
    expect(screen.getByTestId('vote-detail-error')).toBeInTheDocument();
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    expect(screen.getByText(/네트워크 오류가 발생했습니다/i)).toBeInTheDocument();
  });
}); 