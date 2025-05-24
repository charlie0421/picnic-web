'use client';

import React, { useEffect, useState } from 'react';
import { BannerList, Banner } from './BannerList';

export interface BannerListWrapperProps {
  className?: string;
}

// 클라이언트 컴포넌트에서 사용하기 위한 래퍼
// 실제로는 API 호출이나 상태 관리를 통해 배너 데이터를 가져옵니다
export function BannerListWrapper({ className }: BannerListWrapperProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: 실제 API 호출로 대체
    const fetchBanners = async () => {
      try {
        // const response = await fetch('/api/banners');
        // const data = await response.json();
        // setBanners(data);
        
        // 임시 데이터 - 존재하는 이미지를 사용하거나 빈 imageUrl 사용
        setBanners([
          {
            id: '1',
            title: '첫 번째 배너',
            imageUrl: '/images/logo.png', // 존재하는 이미지 사용
            link: '/vote/1',
            order: 1
          },
          {
            id: '2',
            title: '두 번째 배너',
            imageUrl: '/images/default-artist.png', // 존재하는 이미지 사용
            link: '/vote/2',
            order: 2
          },
          {
            id: '3',
            title: '세 번째 배너',
            imageUrl: '', // 빈 이미지 URL - BannerItem에서 fallback 처리됨
            link: '/vote/3',
            order: 3
          }
        ]);
      } catch (error) {
        console.error('Failed to fetch banners:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, []);

  if (loading) {
    return <div className={`h-48 bg-gray-100 rounded-lg animate-pulse ${className}`} />;
  }

  return <BannerList banners={banners} className={className} />;
} 