'use client';

import React from 'react';
import { BannerItem } from './BannerItem';
import { Banner } from '@/types/interfaces';
import { useBannerCarousel, MIN_PRIORITY_COUNT } from './useBannerCarousel';

export interface BannerCarouselClientProps {
  banners: Banner[];
  className?: string;
}

export function BannerCarouselClient({
  banners,
  className,
}: BannerCarouselClientProps) {
  const totalSlides = banners.length;
  const hasSlides = totalSlides > 0;
  const containerClassName = ['relative w-full', className]
    .filter(Boolean)
    .join(' ');

  const {
    containerRef,
    slidesPerView,
    pages,
    currentPage,
    heroIndex,
    loadedSet,
    prioritySet,
    trackStyle,
    handleNext,
    handlePrev,
    goToPage,
  } = useBannerCarousel(totalSlides);

  if (!hasSlides) {
    return (
      <div className={containerClassName}>
        <div className='bg-gray-100 p-6 rounded-lg text-center w-full min-h-[180px]'>
          <div className='flex items-center justify-center h-full'>
            <p className='text-gray-500'>현재 표시할 배너가 없습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  if (totalSlides === 1) {
    return (
      <div className={containerClassName}>
        <BannerItem banner={banners[0]} priority fetchPriority='high' />
      </div>
    );
  }

  return (
    <div
      className={`${containerClassName} banner-carousel`}
      role='region'
      aria-label='프로모션 배너 슬라이더'
      ref={containerRef}
    >
      <div className='overflow-hidden relative'>
        <div
          className='flex transition-transform duration-500 ease-out will-change-transform banner-track'
          style={trackStyle}
        >
          {banners.map((banner, index) => {
            const isLoaded = loadedSet.has(index);
            const priority = index === heroIndex || prioritySet.has(index);
            return (
              <div
                key={banner.id}
                className='px-2 md:px-3 lg:px-3 banner-slide'
              >
                {isLoaded ? (
                  <BannerItem
                    banner={banner}
                    priority={priority}
                    fetchPriority={priority ? 'high' : 'auto'}
                  />
                ) : (
                  <div
                    className='relative w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse'
                    style={{ aspectRatio: '700 / 356' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {totalSlides > slidesPerView && (
        <>
          <button
            type='button'
            className='absolute left-2 lg:left-4 top-1/2 -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-all duration-200'
            aria-label='이전 배너'
            onClick={handlePrev}
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
            type='button'
            className='absolute right-2 lg:right-4 top-1/2 -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-all duration-200'
            aria-label='다음 배너'
            onClick={handleNext}
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

      {pages > 1 && (
        <div className='flex justify-center gap-2 mt-4'>
          {Array.from({ length: pages }).map((_, page) => {
            const isActive = page === currentPage;
            return (
              <button
                key={page}
                type='button'
                aria-label={`${page + 1}번째 배너 보기`}
                aria-pressed={isActive}
                className={`h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                  isActive ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/80'
                }`}
                onClick={() => goToPage(page)}
              />
            );
          })}
        </div>
      )}
      <style jsx>{`
        .banner-carousel {
          --banner-slides-per-view: ${MIN_PRIORITY_COUNT};
        }

        @media (min-width: 768px) {
          .banner-carousel {
            --banner-slides-per-view: 2;
          }
        }

        @media (min-width: 1024px) {
          .banner-carousel {
            --banner-slides-per-view: 3;
          }
        }

        .banner-carousel .banner-slide {
          flex: 0 0 calc(100% / var(--banner-slides-per-view, ${MIN_PRIORITY_COUNT}));
        }

        .banner-carousel .banner-track {
          transform: translate3d(
            calc(
              var(--banner-current-index, 0) * -100% /
                var(--banner-slides-per-view, ${MIN_PRIORITY_COUNT})
            ),
            0,
            0
          );
        }
      `}</style>
    </div>
  );
}

export default BannerCarouselClient;
