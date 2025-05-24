'use client';

import React, { useMemo } from 'react';
import { Banner } from '@/types/interfaces';
import { useBanner } from '@/hooks/useBanner';
import { useBannerCarousel } from '@/hooks/useBannerCarousel';
import BannerItem from './BannerItem';

const BannerList: React.FC = () => {
  const { banners, isLoading, error } = useBanner();
  const {
    currentIndex,
    isMobile,
    isTablet,
    isPaused,
    mounted,
    nextBanner,
    prevBanner,
    setIsPaused,
  } = useBannerCarousel({ totalBanners: banners.length });

  // 현재 보이는 배너들 계산
  const getVisibleBanners = useMemo((): Banner[] => {
    if (banners.length === 0) return [];

    const countToShow = isMobile || isTablet ? 2 : 3;
    const result: Banner[] = [];

    for (let i = 0; i < countToShow; i++) {
      const index = (currentIndex + i) % banners.length;
      result.push(banners[index]);
    }

    return result;
  }, [banners, currentIndex, isMobile, isTablet]);

  // 서버 사이드에서는 스켈레톤 반환
  if (!mounted) {
    return (
      <section>
        <div className="h-48 bg-gray-100 rounded-lg" />
      </section>
    );
  }

  if (isLoading) {
    return (
      <section>
        <div className="h-48 bg-gray-100 animate-pulse rounded-lg" />
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <div className='mb-4'>
          <div className='bg-red-100 p-6 rounded-lg text-center'>
            <p className='text-red-700'>{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (banners.length === 0) {
    return (
      <section>
        <div className='mb-4'>
          <div className='bg-gray-100 p-6 rounded-lg text-center'>
            <p className='text-gray-500'>현재 표시할 배너가 없습니다.</p>
          </div>
        </div>
      </section>
    );
  }

  // 배너가 3개 이하인 경우 그리드로 표시
  if (banners.length <= 3) {
    return (
      <section>
        <div className='grid grid-cols-2 lg:grid-cols-3 gap-4'>
          {banners.map((banner) => (
            <div key={banner.id} className='w-full'>
              <BannerItem banner={banner} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // 캐러셀 표시
  return (
    <section>
      <div
        className='relative'
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className='relative overflow-hidden rounded-lg'>
          <div className='w-full overflow-hidden'>
            <div
              className='flex transition-all duration-500 ease-in-out'
              style={{
                transform:
                  isMobile || isTablet
                    ? `translateX(-${currentIndex * 100}%)`
                    : `translateX(0%)`,
              }}
            >
              {isMobile || isTablet ? (
                // 모바일/태블릿: 쌍으로 슬라이드
                [...Array(Math.ceil(banners.length / 2))].map((_, groupIndex) => {
                  const startIdx = (groupIndex * 2) % banners.length;
                  const bannerPair = [
                    banners[startIdx],
                    banners[(startIdx + 1) % banners.length],
                  ].filter(Boolean);

                  return (
                    <div key={`group-${groupIndex}`} className='w-full flex-shrink-0'>
                      <div className='grid grid-cols-2 gap-2'>
                        {bannerPair.map((banner) => (
                          <div key={banner.id} className='w-full'>
                            <BannerItem banner={banner} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                // 데스크탑: 현재 보이는 3개의 배너만 표시
                <div className='w-full grid grid-cols-3 gap-4 transition-all duration-500 ease-in-out'>
                  {getVisibleBanners.map((banner, index) => (
                    <div key={`${banner.id}-${index}`} className='w-full'>
                      <BannerItem banner={banner} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 네비게이션 버튼 */}
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
        </div>
      </div>
    </section>
  );
};

export default BannerList;
