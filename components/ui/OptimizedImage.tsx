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
  placeholder?: 'blur' | 'skeleton' | 'shimmer' | 'none';
  fallbackSrc?: string;
  onLoad?: () => void;
  onError?: () => void;
  // Intersection Observer 기반 lazy loading
  intersectionThreshold?: number;
  unoptimized?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
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
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(priority); // priority가 true면 즉시 로딩
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [showShimmer, setShowShimmer] = useState(true);
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

  // 이미지 소스 설정
  useEffect(() => {
    if (!isInView || !src) return;

    const targetWidth = width ?? (fill ? 700 : 300);
    const targetHeight = height ?? (fill ? 356 : undefined);
    const optimizedSrc = getCdnImageUrl(src, targetWidth, targetHeight);
    setCurrentSrc(optimizedSrc);
    setShowShimmer(true);
  }, [fill, height, isInView, src, width]);

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

  // Shimmer 플레이스홀더
  const renderPlaceholder = () => {
    if (!showShimmer || isLoaded || isError) return null;
    
    const placeholderClass = fill 
      ? 'absolute inset-0' 
      : `w-full ${height ? `h-[${height}px]` : 'aspect-square'}`;

    switch (placeholder) {
      case 'shimmer':
        return (
          <div 
            className={`${placeholderClass} ${className} overflow-hidden`}
          >
            <div className="w-full h-full bg-gray-200 rounded-lg animate-pulse" />
          </div>
        );
      
      case 'skeleton':
        return (
          <div 
            className={`${placeholderClass} animate-pulse bg-gray-200 rounded-lg ${className}`}
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
          unoptimized={unoptimized}
          onLoad={handleImageLoad}
          onError={handleImageError}
          fetchPriority={fetchPriority}
          decoding='async'
        />
      )}

      {/* 에러 상태 표시 */}
      {isError && (
        <div className={`${fill ? 'absolute inset-0' : `w-full ${height ? `h-[${height}px]` : 'aspect-square'}`} flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
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