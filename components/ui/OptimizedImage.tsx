'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { getCdnImageUrl } from '@/utils/api/image';

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
  placeholder?: 'blur' | 'skeleton' | 'none';
  fallbackSrc?: string;
  onLoad?: () => void;
  onError?: () => void;
  // Progressive loading: 작은 이미지부터 로딩
  progressive?: boolean;
  // Intersection Observer 기반 lazy loading
  intersectionThreshold?: number;
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
  placeholder = 'skeleton',
  fallbackSrc = '/images/default-artist.png',
  onLoad,
  onError,
  progressive = true,
  intersectionThreshold = 0.1,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(priority); // priority가 true면 즉시 로딩
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const imgRef = useRef<HTMLDivElement>(null);

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

  // Progressive loading: 작은 이미지 → 원본 이미지
  useEffect(() => {
    if (!isInView || !src) return;

    if (progressive) {
      // 1단계: 작은 썸네일 이미지 로딩
      const thumbnailSrc = getCdnImageUrl(src, 50); // 50px 썸네일
      setCurrentSrc(thumbnailSrc);

      // 2단계: 원본 이미지 미리 로딩
      const img = new window.Image();
      img.onload = () => {
        setCurrentSrc(getCdnImageUrl(src, width || 300));
        setIsLoaded(true);
        onLoad?.();
      };
      img.onerror = () => {
        setIsError(true);
        setCurrentSrc(fallbackSrc);
        onError?.();
      };
      img.src = getCdnImageUrl(src, width || 300);
    } else {
      setCurrentSrc(getCdnImageUrl(src, width || 300));
    }
  }, [isInView, src, progressive, width, fallbackSrc, onLoad, onError]);

  const handleImageLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleImageError = () => {
    setIsError(true);
    setCurrentSrc(fallbackSrc);
    onError?.();
  };

  // 스켈레톤 플레이스홀더
  const renderSkeleton = () => {
    if (placeholder !== 'skeleton') return null;

    const skeletonClass = fill 
      ? 'absolute inset-0' 
      : `w-full ${height ? `h-[${height}px]` : 'aspect-square'}`;

    return (
      <div 
        className={`${skeletonClass} animate-shimmer rounded-lg ${className}`}
      />
    );
  };

  return (
    <div ref={imgRef} className={`relative image-container ${fill ? 'w-full h-full' : ''}`}>
      {/* 스켈레톤 플레이스홀더 */}
      {!isLoaded && !isError && renderSkeleton()}
      
      {/* 실제 이미지 */}
      {isInView && currentSrc && (
        <Image
          src={currentSrc}
          alt={alt}
          width={width}
          height={height}
          fill={fill}
          sizes={sizes}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          priority={priority}
          quality={quality}
          loading={priority ? 'eager' : 'lazy'}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* 로딩 표시 (스켈레톤과 함께 표시) */}
      {!isLoaded && !isError && isInView && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
} 