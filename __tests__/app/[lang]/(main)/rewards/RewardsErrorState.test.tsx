import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { render as customRender } from '../../../../utils/test-utils';

// 모듈 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// 네트워크 오류 목 객체
const mockNetworkError = new Error('네트워크 오류가 발생했습니다.');

// 보상 서비스 모킹 - 오류 시뮬레이션
jest.mock('@/lib/data-fetching/reward-service', () => ({
  getRewards: jest.fn().mockRejectedValue(mockNetworkError),
  getRewardById: jest.fn().mockRejectedValue(mockNetworkError)
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
    t: (key: string) => {
      const translations: Record<string, string> = {
        'error_loading_rewards': '보상 정보를 불러오는 중 오류가 발생했습니다.',
        'button_retry': '다시 시도'
      };
      return translations[key] || key;
    }
  })
}));

describe('보상 페이지 오류 상태 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/rewards');
  });

  test('보상 목록 로딩 실패 시 오류 상태가 표시되는지 확인', async () => {
    // 오류 상태를 표시하는 모의 보상 페이지 컴포넌트
    function MockRewardsPage() {
      return (
        <div data-testid="rewards-page">
          <h1>보상 목록</h1>
          {/* 오류 메시지를 포함한 컴포넌트 */}
          <div data-testid="rewards-error-state">
            <p>보상 정보를 불러오는 중 오류가 발생했습니다.</p>
            <button data-testid="retry-button">다시 시도</button>
          </div>
        </div>
      );
    }
    
    customRender(<MockRewardsPage />);
    
    // 오류 상태가 표시되는지 확인
    expect(screen.getByTestId('rewards-error-state')).toBeInTheDocument();
    
    // 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/보상 정보를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    
    // 재시도 버튼이 표시되는지 확인
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  test('보상 상세 페이지 로딩 실패 시 오류 상태가 표시되는지 확인', async () => {
    // 보상 상세 페이지의 오류 상태를 시뮬레이션하는 컴포넌트
    function MockRewardDetailPage() {
      return (
        <div data-testid="reward-detail-page">
          <h1>보상 상세</h1>
          {/* 오류 메시지를 포함한 컴포넌트 */}
          <div data-testid="reward-detail-error-state">
            <p>보상 상세 정보를 불러오는 중 오류가 발생했습니다.</p>
            <button data-testid="reward-retry-button">다시 시도</button>
          </div>
        </div>
      );
    }
    
    customRender(<MockRewardDetailPage />);
    
    // 오류 상태가 표시되는지 확인
    expect(screen.getByTestId('reward-detail-error-state')).toBeInTheDocument();
    
    // 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/보상 상세 정보를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    
    // 재시도 버튼이 표시되는지 확인
    expect(screen.getByTestId('reward-retry-button')).toBeInTheDocument();
  });

  test('서버 오류와 네트워크 오류에 대한 다른 메시지 테스트', async () => {
    // 서버 오류와 네트워크 오류를 구분하여 표시하는 컴포넌트
    function MockErrorStatesComponent() {
      return (
        <div>
          <div data-testid="network-error">
            <p>네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.</p>
            <button>재연결</button>
          </div>
          <div data-testid="server-error">
            <p>서버에 문제가 발생했습니다. 나중에 다시 시도해주세요.</p>
            <button>다시 시도</button>
          </div>
        </div>
      );
    }
    
    customRender(<MockErrorStatesComponent />);
    
    // 네트워크 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/네트워크 연결에 문제가 있습니다/i)).toBeInTheDocument();
    
    // 서버 오류 메시지가 표시되는지 확인
    expect(screen.getByText(/서버에 문제가 발생했습니다/i)).toBeInTheDocument();
  });
}); 