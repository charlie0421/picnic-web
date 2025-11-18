'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createImageErrorHandler, isFailedImageUrl, resolveAvatarUrlClient } from '@/utils/image-utils';

interface SafeAvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackUrl?: string;
  className?: string;
  useProxy?: boolean; // 프록시 사용 옵션
  onImageLoad?: () => void;
  onImageError?: (originalSrc: string) => void;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12', 
  lg: 'w-16 h-16',
  xl: 'w-24 h-24'
};

const sizeDimensions = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
} as const;

/**
 * 안전한 아바타 이미지 컴포넌트
 * - 이미지 로딩 실패 시 자동 폴백
 * - URL 검증
 * - 로딩 상태 표시
 * - Google 이미지 429 에러 대응 (프록시 포함)
 */
export function SafeAvatar({
  src,
  alt = '프로필 이미지',
  size = 'md',
  fallbackUrl = '/images/default-avatar.svg',
  className = '',
  useProxy = true, // 기본적으로 프록시 사용
  onImageLoad,
  onImageError
}: SafeAvatarProps) {
  const transformOptions = useMemo(
    () => ({
      width: sizeDimensions[size],
      height: sizeDimensions[size],
      resize: 'cover' as const,
      quality: 85,
    }),
    [size],
  );

  const [imageUrl, setImageUrl] = useState<string>(fallbackUrl);
  const [isLoading, setIsLoading] = useState<boolean>(!!src);
  const [hasError, setHasError] = useState<boolean>(!src);
  const [usedFallback, setUsedFallback] = useState<boolean>(!src);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const resolve = async () => {
      if (src && isFailedImageUrl(src)) {
        setImageUrl(fallbackUrl);
        setHasError(true);
        setUsedFallback(true);
        setIsLoading(false);
        onImageError?.(src);
        return;
      }

      setIsLoading(!!src);
      setHasError(false);
      setUsedFallback(false);

      try {
        const result = await resolveAvatarUrlClient(
          src,
          transformOptions,
          {
            fallbackUrl,
            useProxy,
            signal: controller.signal,
          },
        );

        if (cancelled) {
          return;
        }

        setImageUrl(result.url);
        setHasError(result.isFallback);
        setUsedFallback(result.isFallback);
        setIsLoading(false);

        if (result.isFallback && src) {
          onImageError?.(src);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!cancelled) {
          console.warn('🖼️ [SafeAvatar] 아바타 로드 실패:', error);
          setImageUrl(fallbackUrl);
          setHasError(true);
          setUsedFallback(true);
          setIsLoading(false);
          if (src) {
            onImageError?.(src);
          }
        }
      }
    };

    resolve();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src, transformOptions, fallbackUrl, useProxy, onImageError]);

  // 이미지 로딩 완료 핸들러
  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    if (!usedFallback) {
      onImageLoad?.();
    }
  }, [onImageLoad, usedFallback]);
  
  // 이미지 에러 핸들러 (프록시 옵션 포함)
  const handleImageError = useCallback(
    createImageErrorHandler(fallbackUrl, useProxy),
    [fallbackUrl, useProxy]
  );
  
  // 커스텀 에러 핸들러
  const handleError = useCallback((event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const originalSrc = event.currentTarget.src;
    setIsLoading(false);
    setHasError(true);
    setUsedFallback(true);
    setImageUrl(fallbackUrl);
    
    // 기본 에러 핸들러 실행
    handleImageError(event);
    
    // 커스텀 에러 콜백 실행
    onImageError?.(originalSrc);
  }, [handleImageError, onImageError]);

  const baseClasses = `
    rounded-full object-cover bg-gray-200 
    ${sizeClasses[size]} 
    ${className}
  `.trim();

  // className에 크기 덮어쓰기가 있는지 확인
  const hasCustomSize = className.includes('!w-full') && className.includes('!h-full');
  
  // 로딩 플레이스홀더용 클래스 (크기 덮어쓰기 반영)
  const loadingClasses = hasCustomSize 
    ? `rounded-full object-cover bg-gray-200 !w-full !h-full ${className.replace(sizeClasses[size], '').trim()}`
    : baseClasses;

  return (
    <div className="relative inline-block">
      {/* 로딩 중 표시 */}
      {isLoading && (
        <div 
          className={`
            ${loadingClasses} 
            animate-pulse bg-gray-300 
            flex items-center justify-center
          `}
        >
          <svg 
            className="w-1/2 h-1/2 text-gray-400" 
            fill="currentColor" 
            viewBox="0 0 24 24"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
      )}
      
      {/* 실제 이미지 */}
      <img
        src={imageUrl}
        alt={alt}
        className={`
          ${baseClasses}
          ${isLoading ? 'opacity-0 absolute inset-0' : 'opacity-100'}
          transition-opacity duration-200
        `}
        onLoad={handleImageLoad}
        onError={handleError}
        loading="lazy"
      />
      
      {/* 개발 환경에서만 표시되는 상태 인디케이터 - 파란 점 제거 */}
      {false && process.env.NODE_ENV === 'development' && (
        <>
          {/* 에러 상태 표시 */}
          {hasError && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white" 
                 title={`이미지 로딩 실패: ${src}`} />
          )}
          
          {/* Google 이미지 429 에러 표시 */}
          {usedFallback && src?.includes('googleusercontent.com') && (
            <div className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-500 rounded-full border border-white" 
                 title={`Google 이미지 429 에러로 폴백 사용: ${src}`} />
          )}
          
          {/* 프록시 사용 표시 - 파란 점 제거됨 */}
          {/* {useProxy && finalImageUrl.includes('/api/proxy-image') && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white" 
                 title={`프록시를 통해 이미지 로딩: ${src}`} />
          )} */}
        </>
      )}
    </div>
  );
}

/**
 * 간단한 아바타 (로딩 상태 없음)
 */
export function SimpleAvatar({
  src,
  alt = '프로필 이미지',
  size = 'md',
  fallbackUrl = '/images/default-avatar.svg',
  className = '',
  useProxy = true // 기본적으로 프록시 사용
}: Omit<SafeAvatarProps, 'onImageLoad' | 'onImageError'>) {
  const transformOptions = useMemo(
    () => ({
      width: sizeDimensions[size],
      height: sizeDimensions[size],
      resize: 'cover' as const,
      quality: 85,
    }),
    [size],
  );

  const [imageUrl, setImageUrl] = useState<string>(fallbackUrl);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const resolve = async () => {
      if (src && isFailedImageUrl(src)) {
        setImageUrl(fallbackUrl);
        return;
      }

      try {
        const result = await resolveAvatarUrlClient(
          src,
          transformOptions,
          {
            fallbackUrl,
            useProxy,
            signal: controller.signal,
          },
        );
        if (!cancelled) {
          setImageUrl(result.url);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!cancelled) {
          console.warn('🖼️ [SimpleAvatar] 아바타 로드 실패:', error);
          setImageUrl(fallbackUrl);
        }
      }
    };

    resolve();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src, transformOptions, fallbackUrl, useProxy]);

  const handleImageError = createImageErrorHandler(fallbackUrl, useProxy);

  return (
    <div className="relative inline-block">
      <img
        src={imageUrl}
        alt={alt}
        className={`
          rounded-full object-cover bg-gray-200 
          ${sizeClasses[size]} 
          ${className}
        `}
        onError={handleImageError}
        loading="lazy"
      />
      
      {/* 개발 환경에서만 표시되는 상태 인디케이터 - 파란 점 제거 */}
      {false && process.env.NODE_ENV === 'development' && (
        <>
          {/* Google 이미지 429 에러 표시 */}
          {imageUrl === fallbackUrl && src?.includes('googleusercontent.com') && (
            <div className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-500 rounded-full border border-white" 
                 title={`Google 이미지 429 에러로 폴백 사용: ${src}`} />
          )}
          
          {/* 프록시 사용 표시 - 파란 점 제거됨 */}
          {/* {useProxy && finalImageUrl.includes('/api/proxy-image') && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white" 
                 title={`프록시를 통해 이미지 로딩: ${src}`} />
          )} */}
        </>
      )}
    </div>
  );
} 