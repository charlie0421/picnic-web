'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseBannerCarouselParams {
  totalBanners: number;
  autoSlideInterval?: number;
}

interface UseBannerCarouselReturn {
  currentIndex: number;
  isMobile: boolean;
  isTablet: boolean;
  isPaused: boolean;
  mounted: boolean;
  nextBanner: () => void;
  prevBanner: () => void;
  setIsPaused: (paused: boolean) => void;
}

/**
 * 배너 캐러셀 로직을 관리하는 훅
 */
export function useBannerCarousel({ 
  totalBanners, 
  autoSlideInterval = 5000 
}: UseBannerCarouselParams): UseBannerCarouselReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 마운트 상태 추적
  useEffect(() => {
    setMounted(true);
  }, []);

  // 화면 크기 감지
  useEffect(() => {
    if (!mounted) return;

    const checkScreenSize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setIsMobile(true);
        setIsTablet(false);
      } else if (width < 1024) {
        setIsMobile(false);
        setIsTablet(true);
      } else {
        setIsMobile(false);
        setIsTablet(false);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, [mounted]);

  // 다음 배너로 이동
  const nextBanner = useCallback(() => {
    if (totalBanners <= 3 && !isMobile && !isTablet) return;
    
    setCurrentIndex((prev) => {
      const totalGroups = isMobile || isTablet 
        ? Math.ceil(totalBanners / 2) 
        : totalBanners;

      const next = prev + 1;
      return next >= totalGroups ? 0 : next;
    });
  }, [totalBanners, isMobile, isTablet]);

  // 이전 배너로 이동
  const prevBanner = useCallback(() => {
    if (totalBanners <= 3 && !isMobile && !isTablet) return;
    
    setCurrentIndex((prev) => {
      const totalGroups = isMobile || isTablet 
        ? Math.ceil(totalBanners / 2) 
        : totalBanners;

      const next = prev - 1;
      return next < 0 ? totalGroups - 1 : next;
    });
  }, [totalBanners, isMobile, isTablet]);

  // 자동 슬라이드
  useEffect(() => {
    if (totalBanners <= 3 && !isMobile && !isTablet) return;
    if (isPaused) return;

    const interval = setInterval(nextBanner, autoSlideInterval);
    return () => clearInterval(interval);
  }, [totalBanners, isPaused, nextBanner, isMobile, isTablet, autoSlideInterval]);

  return {
    currentIndex,
    isMobile,
    isTablet,
    isPaused,
    mounted,
    nextBanner,
    prevBanner,
    setIsPaused,
  };
} 