import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { render as customRender } from '../../../../utils/test-utils';

// 미디어 페이지 목 데이터
const mockMedias = [
  {
    id: 1,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    deletedAt: null,
    thumbnailUrl: 'https://example.com/thumbnail1.jpg',
    videoUrl: 'https://example.com/video1.mp4',
    videoId: 'video1',
    title: { ko: '미디어 제목 1', en: 'Media Title 1' }
  },
  {
    id: 2,
    createdAt: '2023-01-02T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
    deletedAt: null,
    thumbnailUrl: 'https://example.com/thumbnail2.jpg',
    videoUrl: 'https://example.com/video2.mp4',
    videoId: 'video2',
    title: { ko: '미디어 제목 2', en: 'Media Title 2' }
  }
];

// MediaServer 컴포넌트 모킹
jest.mock('@/components/server/MediaServer', () => {
  return function MockMediaServer() {
    return (
      <div data-testid="media-list">
        {mockMedias.map(media => (
          <div key={media.id} data-testid="media-item">
            {String(media.title.ko || media.title.en)}
          </div>
        ))}
      </div>
    );
  };
});

// LoadingState 컴포넌트 모킹
jest.mock('@/components/server/LoadingState', () => {
  return function MockLoadingState() {
    return <div data-testid="media-skeleton">로딩 중...</div>;
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
  getMedias: jest.fn().mockResolvedValue(mockMedias)
}));

// 실제 페이지 컴포넌트 불러오기
import MediaPage from '../../../../../app/[lang]/(main)/media/page';
import { getMedias } from '@/utils/api/queries';

describe('미디어 페이지 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/media');
  });

  test('미디어 페이지가 정상적으로 렌더링되는지 확인', async () => {
    (getMedias as jest.Mock).mockResolvedValue(mockMedias);
    
    customRender(<MediaPage />);
    
    await waitFor(() => {
      expect(screen.getByTestId('media-list')).toBeInTheDocument();
      
      // 미디어 항목이 정확한 수만큼 표시되는지 확인
      const mediaItems = screen.getAllByTestId('media-item');
      expect(mediaItems).toHaveLength(mockMedias.length);
      
      // 미디어 제목이 올바르게 표시되는지 확인
      mockMedias.forEach(media => {
        expect(screen.getByText(media.title.ko)).toBeInTheDocument();
      });
    });
  });
  
  test('데이터가 없을 때 메시지가 표시되는지 확인', async () => {
    const emptyMediaServer = jest.requireMock('@/components/server/MediaServer');
    emptyMediaServer.default = () => <div>미디어가 없습니다</div>;
    
    (getMedias as jest.Mock).mockResolvedValue([]);
    
    customRender(<MediaPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/미디어가 없습니다/i)).toBeInTheDocument();
    });
  });
  
  test('로딩 중에 스켈레톤이 표시되는지 확인', async () => {
    // getMedias가 resolve되기 전에 스켈레톤이 보여야 함
    const mockPromise = new Promise<any>(resolve => {
      setTimeout(() => resolve(mockMedias), 100);
    });
    
    (getMedias as jest.Mock).mockReturnValue(mockPromise);
    
    customRender(<MediaPage />);
    
    // 스켈레톤이 먼저 렌더링되어야 함
    expect(screen.getByTestId('media-skeleton')).toBeInTheDocument();
    
    // 데이터가 로드된 후에는 미디어 목록이 표시되어야 함
    await waitFor(() => {
      expect(screen.getByTestId('media-list')).toBeInTheDocument();
    });
  });
  
  test('에러 발생 시 에러 메시지가 표시되는지 확인', async () => {
    const errorMediaServer = jest.requireMock('@/components/server/MediaServer');
    errorMediaServer.default = () => <div>오류가 발생했습니다</div>;
    
    (getMedias as jest.Mock).mockRejectedValue(new Error('미디어 로드 중 오류 발생'));
    
    customRender(<MediaPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/오류가 발생했습니다/i)).toBeInTheDocument();
    });
  });
}); 