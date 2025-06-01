'use client';

import React from 'react';
import { Banner } from '@/types/interfaces';

export interface BannerListProps {
  banners?: Banner[];
  isLoading?: boolean;
  className?: string;
}

/**
 * 투표 페이지에서 사용하는 배너 목록 컴포넌트
 */
export default function BannerList({ 
  banners = [], 
  isLoading = false, 
  className = '' 
}: BannerListProps) {
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`} data-testid="banner-list-loading">
        {[...Array(3)].map((_, index) => (
          <div 
            key={index}
            className="h-40 bg-gray-200 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!banners.length) {
    return (
      <div className={`text-center py-8 ${className}`} data-testid="banner-list-empty">
        <p className="text-gray-500">표시할 배너가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="banner-list">
      {banners.map((banner) => (
        <div 
          key={banner.id}
          className="relative rounded-lg overflow-hidden shadow-md"
        >
          <img 
            src={banner.image_url} 
            alt={banner.title}
            className="w-full h-40 object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-4 left-4 text-white">
            <h3 className="text-lg font-bold">{banner.title}</h3>
            {banner.description && (
              <p className="text-sm opacity-90">{banner.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}