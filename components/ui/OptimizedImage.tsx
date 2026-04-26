'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { getCdnImageUrl } from '@/utils/api/image';

const CDN_HOST =
  process.env.NEXT_PUBLIC_CDN_URL && typeof process.env.NEXT_PUBLIC_CDN_URL === 'string'
    ? (() => {
        try {
          return new URL(process.env.NEXT_PUBLIC_CDN_URL).host;
        } catch {
          return null;
        }
      })()
    : null;

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
  className?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: 'blur' | 'skeleton' | 'shimmer' | 'none';
  fallbackSrc?: string;
  onLoad?: () => void;
  onError?: () => void;
  // Intersection Observer 기반 lazy loading
  intersectionThreshold?: number;
  unoptimized?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
  forceOptimized?: boolean;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  fill,
  sizes,
  className = '',
  priority = false,
  quality = 75,
  placeholder = 'shimmer',
  fallbackSrc = '/images/default-artist.png',
  onLoad,
  onError,
  intersectionThreshold = 0.1,
  unoptimized = false,
  fetchPriority = 'auto',
  forceOptimized = false,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(priority); // priority가 true면 즉시 로딩
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [showShimmer, setShowShimmer] = useState(true);
  const imgRef = useRef<HTMLDivElement>(null);

  const resolveWidthFromSizes = (): number | null => {
    if (!sizes || typeof window === 'undefined') {
      return null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rootFontSize = parseFloat(
      window.getComputedStyle(document.documentElement).fontSize || '16',
    );

    const convertToPx = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.endsWith('vw')) {
        const ratio = parseFloat(trimmed);
        return Number.isFinite(ratio)
          ? (viewportWidth * ratio) / 100
          : null;
      }
      if (trimmed.endsWith('vh')) {
        const ratio = parseFloat(trimmed);
        return Number.isFinite(ratio)
          ? (viewportHeight * ratio) / 100
          : null;
      }
      if (trimmed.endsWith('rem')) {
        const ratio = parseFloat(trimmed);
        return Number.isFinite(ratio) ? ratio * rootFontSize : null;
      }
      if (trimmed.endsWith('px')) {
        const px = parseFloat(trimmed);
        return Number.isFinite(px) ? px : null;
      }
      if (trimmed.endsWith('%')) {
        const percent = parseFloat(trimmed);
        return Number.isFinite(percent)
          ? (viewportWidth * percent) / 100
          : null;
      }
      const numeric = parseFloat(trimmed);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const segments = sizes
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const match = segment.match(/^\((.+)\)\s*(.+)$/);
      if (match) {
        const [, mediaQuery, length] = match;
        try {
          if (window.matchMedia(mediaQuery.trim()).matches) {
            const px = convertToPx(length);
            if (px) {
              return px;
            }
          }
        } catch {
          // ignore invalid media queries
        }
      } else {
        const px = convertToPx(segment);
        if (px) {
          return px;
        }
      }
    }

    return null;
  };

  // Intersection Observer로 뷰포트 감지
  useEffect(() => {
    if (priority || !imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: intersectionThreshold }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [priority, intersectionThreshold]);

  const getEffectiveDpr = () => {
    if (typeof window === 'undefined') {
      return 1;
    }
    const dpr = window.devicePixelRatio || 1;
    return Math.min(Math.max(dpr, 1), 3);
  };

  // 이미지 소스 설정
  useEffect(() => {
    if (!isInView || !src) return;

    const responsiveWidth = resolveWidthFromSizes();
    const DEFAULT_FILL_WIDTH = 700;
    const DEFAULT_FILL_HEIGHT = 356;
    const inferredWidth = (() => {
      if (width) return width;
      if (responsiveWidth) return Math.round(responsiveWidth);
      if (fill) return DEFAULT_FILL_WIDTH;
      return 300;
    })();
    const effectiveDpr = getEffectiveDpr();
    const scaledWidth = Math.round(inferredWidth * effectiveDpr);

    const baseRatio =
      width && height
        ? height / width
        : height && !width
        ? height / inferredWidth
        : DEFAULT_FILL_HEIGHT / DEFAULT_FILL_WIDTH;

    const targetWidth = scaledWidth;
    const targetHeight =
      height
        ? Math.round(height * effectiveDpr)
        : fill
        ? Math.round(scaledWidth * baseRatio)
        : undefined;

    const optimizedSrc = getCdnImageUrl(src, targetWidth, targetHeight);
    setCurrentSrc(optimizedSrc);
    setShowShimmer(true);
  }, [fill, height, isInView, src, width, sizes]);

  const handleImageLoad = () => {
    setIsLoaded(true);
    setShowShimmer(false);
    onLoad?.();
  };

  const handleImageError = () => {
    setIsError(true);
    setCurrentSrc(fallbackSrc);
    setShowShimmer(false);
    onError?.();
  };

  const shouldBypassNextImage = useMemo(() => {
    if (forceOptimized) {
      return false;
    }
    if (unoptimized) {
      return true;
    }
    if (!currentSrc) {
      return false;
    }

    try {
      const url = new URL(
        currentSrc,
        currentSrc.startsWith('http')
          ? undefined
          : typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost',
      );
      const host = url.host;
      if (CDN_HOST && host === CDN_HOST) {
        return true;
      }
      return /cdn\.picnic\.fan/i.test(host);
    } catch {
      return currentSrc.includes('cdn.picnic.fan');
    }
  }, [currentSrc, forceOptimized, unoptimized]);

  // Shimmer 플레이스홀더
  const renderPlaceholder = () => {
    if (!showShimmer || isLoaded || isError) return null;
    const placeholderClass = fill 
      ? 'absolute inset-0' 
      : 'w-full';
    const placeholderStyle =
      !fill && height ? { height: `${height}px` } : !fill ? { aspectRatio: '1 / 1' } : undefined;

    switch (placeholder) {
      case 'shimmer':
        return (
          <div 
            className={`${placeholderClass} ${className} overflow-hidden`}
            style={placeholderStyle}
          >
            <div className="w-full h-full bg-gray-200 rounded-lg animate-pulse" />
          </div>
        );
      
      case 'skeleton':
        return (
          <div 
            className={`${placeholderClass} animate-pulse bg-gray-200 rounded-lg ${className}`}
            style={placeholderStyle}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div ref={imgRef} className={`relative image-container ${fill ? 'w-full h-full' : ''}`}>
      {/* 플레이스홀더 */}
      {renderPlaceholder()}
      
      {/* 실제 이미지 */}
      {isInView && currentSrc && !isError && (
        <Image
          src={currentSrc}
          alt={alt}
          width={width}
          height={height}
          fill={fill}
          sizes={sizes}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500 ease-out`}
          priority={priority}
          quality={quality}
          loading={priority ? 'eager' : 'lazy'}
          unoptimized={shouldBypassNextImage}
          onLoad={handleImageLoad}
          onError={handleImageError}
          fetchPriority={fetchPriority}
          decoding='async'
        />
      )}

      {/* 에러 상태 표시 */}
      {isError && (
        <div
          className={`${fill ? 'absolute inset-0' : 'w-full'} flex items-center justify-center bg-gray-100 rounded-lg ${className}`}
          style={
            fill
              ? undefined
              : height
              ? { height: `${height}px` }
              : { aspectRatio: '1 / 1' }
          }
        >
          <div className="text-center text-gray-500">
            <svg className="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">이미지 로딩 실패</span>
          </div>
        </div>
      )}
    </div>
  );
} 