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
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';

export interface BannerCarouselClientProps {
  banners: Banner[];
  className?: string;
}

const MIN_PRIORITY_COUNT = 1;
const AUTO_PLAY_DELAY = 5000;
const AUTOPLAY_INITIAL_DELAY = 4000;

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

const resolveSlidesPerViewFromCss = (
  element: HTMLElement | null,
): number => {
  if (typeof window === 'undefined') {
    return MIN_PRIORITY_COUNT;
  }

  if (element) {
    const value = window
      .getComputedStyle(element)
      .getPropertyValue('--banner-slides-per-view')
      .trim();
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= MIN_PRIORITY_COUNT) {
      return parsed;
    }
  }

  return getSlidesPerView(window.innerWidth);
};

export function BannerCarouselClient({
  banners,
  className,
}: BannerCarouselClientProps) {
  const totalSlides = banners.length;
  const hasSlides = totalSlides > 0;
  const containerClassName = ['relative w-full', className]
    .filter(Boolean)
    .join(' ');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialSlidesPerView = MIN_PRIORITY_COUNT;
  const initialPreloadCount =
    totalSlides === 0 ? 0 : Math.min(MIN_PRIORITY_COUNT, totalSlides);
  const [slidesPerView, setSlidesPerView] = useState(initialSlidesPerView);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedIndices, setLoadedIndices] = useState<number[]>(() =>
    Array.from({ length: initialPreloadCount }, (_, i) => i),
  );
  const autoplayRef = useRef<number>();
  const autoplayDelayTimeoutRef = useRef<number>();
  const prefersReducedMotionRef = useRef<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateSlidesPerView = () => {
      setSlidesPerView(resolveSlidesPerViewFromCss(containerRef.current));
    };

    prefersReducedMotionRef.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    updateSlidesPerView();

    window.addEventListener('resize', updateSlidesPerView);
    return () => window.removeEventListener('resize', updateSlidesPerView);
  }, []);

  useEffect(() => {
    const preloadCount = Math.min(slidesPerView, totalSlides);
    if (preloadCount === 0) {
      setLoadedIndices([]);
      return;
    }
    setLoadedIndices((prev) => {
      const next = new Set<number>();
      for (let i = 0; i < preloadCount; i += 1) {
        next.add(i);
      }
      prev.forEach((value) => {
        if (value < totalSlides) {
          next.add(value);
        }
      });
      return Array.from(next).sort((a, b) => a - b);
    });
  }, [slidesPerView, totalSlides]);

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
        return Array.from(next).sort((a, b) => a - b);
      });
    },
    [slidesPerView, totalSlides],
  );

  useEffect(() => {
    markVisibleAsLoaded(currentIndex);
  }, [currentIndex, markVisibleAsLoaded]);

  useEffect(() => {
    if (totalSlides === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((prev) => {
      const clamped = Math.min(prev, Math.max(totalSlides - slidesPerView, 0));
      return clamped < 0 ? 0 : clamped;
    });
  }, [totalSlides, slidesPerView]);

  useEffect(() => {
    if (typeof document === 'undefined' || totalSlides === 0) {
      return;
    }

    const preloadCandidates = new Set<number>();
    preloadCandidates.add(currentIndex);

    const cleanupLinks: HTMLLinkElement[] = [];

    preloadCandidates.forEach((index) => {
      const banner = banners[index];
      if (!banner || !banner.image) {
        return;
      }
      const rawSrc = getLocalizedString(banner.image);
      if (!rawSrc) {
        return;
      }
      const href = getCdnImageUrl(rawSrc, 700, 356);
      if (!href) {
        return;
      }

      const existing = document.head.querySelector(
        `link[data-banner-preload="${href}"]`,
      );
      if (existing) {
        return;
      }

      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.fetchPriority = 'high';
      link.setAttribute('data-banner-preload', href);
      document.head.appendChild(link);
      cleanupLinks.push(link);
    });

    return () => {
      cleanupLinks.forEach((link) => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      });
    };
  }, [banners, currentIndex, totalSlides]);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.25,
      },
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

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
    if (autoplayDelayTimeoutRef.current) {
      window.clearTimeout(autoplayDelayTimeoutRef.current);
      autoplayDelayTimeoutRef.current = undefined;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    if (totalSlides <= slidesPerView || prefersReducedMotionRef.current) {
      return;
    }

    stopAutoplay();
    autoplayDelayTimeoutRef.current = window.setTimeout(() => {
      autoplayRef.current = window.setInterval(() => {
        setCurrentIndex((index) => computeNextIndex(index));
      }, AUTO_PLAY_DELAY);
    }, AUTOPLAY_INITIAL_DELAY);
  }, [computeNextIndex, slidesPerView, stopAutoplay, totalSlides]);

  useEffect(() => {
    if (isVisible) {
      startAutoplay();
      return () => stopAutoplay();
    }
    stopAutoplay();
    return undefined;
  }, [isVisible, startAutoplay, stopAutoplay]);

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

  const safeSlidesPerView = Math.max(slidesPerView, MIN_PRIORITY_COUNT);
  const pages = Math.ceil(totalSlides / safeSlidesPerView);
  const currentPage = Math.min(
    pages - 1,
    Math.floor(currentIndex / safeSlidesPerView),
  );
  const heroIndex = currentIndex;
  const loadedSet = useMemo(() => new Set(loadedIndices), [loadedIndices]);
  const trackStyle = useMemo(
    () =>
      ({
        '--banner-current-index': currentIndex,
      }) as React.CSSProperties,
    [currentIndex],
  );

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
            const priority = index === heroIndex;
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



