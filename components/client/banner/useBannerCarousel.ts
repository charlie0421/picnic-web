import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export const MIN_PRIORITY_COUNT = 1;
const AUTO_PLAY_DELAY = 5000;
const AUTOPLAY_INITIAL_DELAY = 7000;

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

export interface UseBannerCarouselReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  slidesPerView: number;
  currentIndex: number;
  maxIndex: number;
  pages: number;
  currentPage: number;
  heroIndex: number;
  loadedSet: Set<number>;
  prioritySet: Set<number>;
  trackStyle: React.CSSProperties;
  handleNext: () => void;
  handlePrev: () => void;
  goToPage: (page: number) => void;
}

export function useBannerCarousel(totalSlides: number): UseBannerCarouselReturn {
  const containerRef = useRef<HTMLDivElement>(null);

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

  useIsomorphicLayoutEffect(() => {
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
  const prioritySet = useMemo(() => {
    const indices = new Set<number>();
    const aheadCount = Math.max(slidesPerView * 2, MIN_PRIORITY_COUNT);
    const start = heroIndex;
    const end = Math.min(heroIndex + aheadCount, totalSlides);
    for (let i = start; i < end; i += 1) {
      indices.add(i);
    }
    return indices;
  }, [heroIndex, slidesPerView, totalSlides]);
  const trackStyle = useMemo(
    () =>
      ({
        '--banner-current-index': currentIndex,
      }) as React.CSSProperties,
    [currentIndex],
  );

  return {
    containerRef,
    slidesPerView,
    currentIndex,
    maxIndex,
    pages,
    currentPage,
    heroIndex,
    loadedSet,
    prioritySet,
    trackStyle,
    handleNext,
    handlePrev,
    goToPage,
  };
}
