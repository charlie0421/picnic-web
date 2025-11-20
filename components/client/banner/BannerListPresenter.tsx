'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BannerItem } from './BannerItem';
import { Banner } from '@/types/interfaces';

export interface BannerListProps {
  banners: Banner[];
  className?: string;
}

const INITIAL_VISIBLE = 3;
const AUTO_PLAY_DELAY = 5000;

const getSlidesPerView = (width: number) => {
  if (width >= 1024) {
    return 3;
  }
  if (width >= 768) {
    return 2;
  }
  return 1;
};

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function BannerListPresenter({ banners, className }: BannerListProps) {
  const totalSlides = banners.length;
  const hasSlides = totalSlides > 0;
  const containerClassName = ['relative w-full', className]
    .filter(Boolean)
    .join(' ');

  const initialLoadedCount =
    totalSlides === 0 ? 0 : Math.min(INITIAL_VISIBLE, totalSlides);
  const initialSlidesPerView =
    typeof window !== 'undefined'
      ? getSlidesPerView(window.innerWidth)
      : Math.max(1, Math.min(INITIAL_VISIBLE, totalSlides || INITIAL_VISIBLE));
  const [slidesPerView, setSlidesPerView] = useState(initialSlidesPerView);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedIndices, setLoadedIndices] = useState<Set<number>>(
    () => new Set(Array.from({ length: initialLoadedCount }, (_, i) => i)),
  );
  const autoplayRef = useRef<number>();
  const prefersReducedMotionRef = useRef<boolean>(false);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateSlidesPerView = () => {
      setSlidesPerView(getSlidesPerView(window.innerWidth));
    };

    prefersReducedMotionRef.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    updateSlidesPerView();

    window.addEventListener('resize', updateSlidesPerView);
    return () => window.removeEventListener('resize', updateSlidesPerView);
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
    setLoadedIndices(
      new Set(Array.from({ length: initialLoadedCount }, (_, i) => i)),
    );
  }, [totalSlides, initialLoadedCount]);

  const maxIndex = useMemo(
    () => Math.max(totalSlides - slidesPerView, 0),
    [totalSlides, slidesPerView],
  );

  const markVisibleAsLoaded = useCallback(
    (nextIndex: number) => {
      const start = nextIndex;
      const end = Math.min(nextIndex + slidesPerView, totalSlides);
      setLoadedIndices((prev) => {
        const next = new Set(prev);
        for (let i = start; i < end; i += 1) {
          next.add(i);
        }
        return next;
      });
    },
    [slidesPerView, totalSlides],
  );

  useEffect(() => {
    markVisibleAsLoaded(currentIndex);
  }, [currentIndex, markVisibleAsLoaded]);

  const computeNextIndex = useCallback(
    (index: number) => {
      if (index >= maxIndex) {
        return 0;
      }
      const candidate = index + slidesPerView;
      return candidate > maxIndex ? maxIndex : candidate;
    },
    [maxIndex, slidesPerView],
  );

  const computePrevIndex = useCallback(
    (index: number) => {
      if (index === 0) {
        return maxIndex;
      }
      const candidate = index - slidesPerView;
      return candidate < 0 ? 0 : candidate;
    },
    [maxIndex, slidesPerView],
  );

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      window.clearInterval(autoplayRef.current);
      autoplayRef.current = undefined;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    if (totalSlides <= slidesPerView || prefersReducedMotionRef.current) {
      return;
    }

    stopAutoplay();
    autoplayRef.current = window.setInterval(() => {
      setCurrentIndex((index) => computeNextIndex(index));
    }, AUTO_PLAY_DELAY);
  }, [computeNextIndex, slidesPerView, stopAutoplay, totalSlides]);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  const handleNext = useCallback(() => {
    stopAutoplay();
    setCurrentIndex((index) => computeNextIndex(index));
    startAutoplay();
  }, [computeNextIndex, startAutoplay, stopAutoplay]);

  const handlePrev = useCallback(() => {
    stopAutoplay();
    setCurrentIndex((index) => computePrevIndex(index));
    startAutoplay();
  }, [computePrevIndex, startAutoplay, stopAutoplay]);

  const goToPage = useCallback(
    (page: number) => {
      stopAutoplay();
      const target = Math.min(page * slidesPerView, maxIndex);
      setCurrentIndex(target);
      startAutoplay();
    },
    [maxIndex, slidesPerView, startAutoplay, stopAutoplay],
  );

  const pages = Math.ceil(totalSlides / slidesPerView);
  const currentPage = Math.min(
    pages - 1,
    Math.floor(currentIndex / slidesPerView),
  );
  const slideWidthPercent = 100 / slidesPerView;
  const translateX = currentIndex * slideWidthPercent;

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
    >
      <div className='overflow-hidden relative'>
        <div
          className='flex transition-transform duration-500 ease-out will-change-transform'
          style={{ transform: `translate3d(-${translateX}%, 0, 0)` }}
        >
          {banners.map((banner, index) => {
            const isLoaded = loadedIndices.has(index);
            const priority = index < INITIAL_VISIBLE;
            return (
              <div
                key={banner.id}
                className='px-2 md:px-3 lg:px-3'
                style={{ flex: `0 0 ${slideWidthPercent}%` }}
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
    </div>
  );
}