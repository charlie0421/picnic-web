import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { render as customRender } from '../../../../utils/test-utils';

// 보상 페이지 목 데이터
const mockRewards = [
  {
    id: 1,
    title: { ko: '보상 제목 1', en: 'Reward Title 1' },
    description: { ko: '보상 설명 1', en: 'Reward Description 1' },
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    deletedAt: null,
    content: '보상 1에 대한 설명입니다.',
    subContent: null,
    thumbnail: 'https://example.com/reward1.jpg',
    images: [],
    status: 'active',
    type: 'reward',
    locationImages: [],
    overviewImages: [],
    sizeGuide: null,
    sizeGuideImages: [],
    location: null,
    order: 1,
    severity: 'normal'
  },
  {
    id: 2,
    title: { ko: '보상 제목 2', en: 'Reward Title 2' },
    description: { ko: '보상 설명 2', en: 'Reward Description 2' },
    createdAt: '2023-01-02T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
    deletedAt: null,
    content: '보상 2에 대한 설명입니다.',
    subContent: null,
    thumbnail: 'https://example.com/reward2.jpg',
    images: [],
    status: 'active',
    type: 'reward',
    locationImages: [],
    overviewImages: [],
    sizeGuide: null,
    sizeGuideImages: [],
    location: null,
    order: 2,
    severity: 'normal'
  }
];

// RewardList 컴포넌트 모킹
jest.mock('@/components/features/reward/RewardList', () => {
  return function MockRewardList({ rewards }: { rewards: any[] }) {
    return (
      <div data-testid="reward-list">
        {rewards.map(reward => (
          <div key={reward.id} data-testid="reward-item">
            {String(reward.title.ko || reward.title.en)}
          </div>
        ))}
      </div>
    );
  };
});

// ClientNavigationSetter 컴포넌트 모킹
jest.mock('@/components/client/ClientNavigationSetter', () => {
  return function MockClientNavigationSetter() {
    return <div data-testid="client-navigation-setter"></div>;
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
jest.mock('@/utils/api/queries', () => ({
  getRewards: jest.fn().mockResolvedValue(mockRewards)
}));

// 실제 페이지 컴포넌트 불러오기
import RewardsPage from '../../../../../app/[lang]/(main)/rewards/page';
import { getRewards } from '@/utils/api/queries';

describe('보상 페이지 테스트', () => {
  const mockParams = { lang: 'ko' };
  
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/rewards');
  });

  test('보상 페이지가 정상적으로 렌더링되는지 확인', async () => {
    (getRewards as jest.Mock).mockResolvedValue(mockRewards);
    
    customRender(
      <RewardsPage params={mockParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('reward-list')).toBeInTheDocument();
      
      // 보상 항목이 정확한 수만큼 표시되는지 확인
      const rewardItems = screen.getAllByTestId('reward-item');
      expect(rewardItems).toHaveLength(mockRewards.length);
      
      // 보상 제목이 올바르게 표시되는지 확인
      mockRewards.forEach(reward => {
        expect(screen.getByText(reward.title.ko)).toBeInTheDocument();
      });
    });
  });
  
  test('데이터가 없을 때 메시지가 표시되는지 확인', async () => {
    (getRewards as jest.Mock).mockResolvedValue([]);
    
    customRender(
      <RewardsPage params={mockParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/데이터를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    });
  });
  
  test('에러 발생 시 에러 메시지가 표시되는지 확인', async () => {
    (getRewards as jest.Mock).mockRejectedValue(new Error('보상 로드 중 오류 발생'));
    
    customRender(
      <RewardsPage params={mockParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/데이터를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
    });
  });
}); 