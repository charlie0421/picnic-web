'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { BannerItem } from './BannerItem';
import { Button } from '@/components/common';

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  link?: string;
  order: number;
}

export interface BannerListProps {
  banners: Banner[];
  className?: string;
}

export function BannerList({ banners, className }: BannerListProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [banners.length]);

  const nextBanner = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const prevBanner = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  if (!mounted) {
    return (
      <div className={`h-48 bg-gray-100 rounded-lg ${className}`} />
    );
  }

  if (banners.length === 0) {
    return (
      <div className={`bg-gray-100 p-6 rounded-lg text-center ${className}`}>
        <p className='text-gray-500'>현재 표시할 배너가 없습니다.</p>
      </div>
    );
  }

  // 배너가 3개 이하인 경우 그리드로 표시
  if (banners.length <= 3) {
    return (
      <div className={`grid grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {banners.map((banner) => (
          <BannerItem key={banner.id} banner={banner} />
        ))}
      </div>
    );
  }

  // 캐러셀 표시
  return (
    <div className={`relative ${className}`}>
      <div className='relative overflow-hidden rounded-lg'>
        <div className='flex transition-transform duration-500 ease-in-out'
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
          }}
        >
          {banners.map((banner) => (
            <div key={banner.id} className='w-full flex-shrink-0'>
              <BannerItem banner={banner} />
            </div>
          ))}
        </div>
      </div>

      {/* 네비게이션 버튼 */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prevBanner}
            className='absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 focus:outline-none z-10'
            aria-label='이전 배너'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              viewBox='0 0 20 20'
              fill='currentColor'
            >
              <path
                fillRule='evenodd'
                d='M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z'
                clipRule='evenodd'
              />
            </svg>
          </button>
          <button
            onClick={nextBanner}
            className='absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 focus:outline-none z-10'
            aria-label='다음 배너'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              viewBox='0 0 20 20'
              fill='currentColor'
            >
              <path
                fillRule='evenodd'
                d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z'
                clipRule='evenodd'
              />
            </svg>
          </button>
        </>
      )}

      {/* 인디케이터 */}
      {banners.length > 1 && (
        <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2'>
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-white' : 'bg-white/50'
              }`}
              aria-label={`배너 ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
} 