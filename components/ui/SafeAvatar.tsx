'use client';

import React, { useState, useCallback } from 'react';
import { getSafeAvatarUrl, createImageErrorHandler, isFailedImageUrl } from '@/utils/image-utils';

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
  fallbackUrl = '/images/default-avatar.png',
  className = '',
  useProxy = true, // 기본적으로 프록시 사용
  onImageLoad,
  onImageError
}: SafeAvatarProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // 안전한 이미지 URL 가져오기 (Google 이미지 최적화 및 프록시 포함)
  const safeImageUrl = getSafeAvatarUrl(src, fallbackUrl, useProxy);
  
  // 이전에 실패한 URL인지 확인하여 즉시 폴백 사용
  const shouldUseFallback = src && isFailedImageUrl(src);
  const finalImageUrl = shouldUseFallback ? fallbackUrl : safeImageUrl;
  
  // 이미지 로딩 완료 핸들러
  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onImageLoad?.();
  }, [onImageLoad]);
  
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

  return (
    <div className="relative inline-block">
      {/* 로딩 중 표시 */}
      {isLoading && !shouldUseFallback && (
        <div 
          className={`
            ${baseClasses} 
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
        src={finalImageUrl}
        alt={alt}
        className={`
          ${baseClasses}
          ${isLoading && !shouldUseFallback ? 'opacity-0 absolute inset-0' : 'opacity-100'}
          transition-opacity duration-200
        `}
        onLoad={handleImageLoad}
        onError={handleError}
        loading="lazy"
      />
      
      {/* 개발 환경에서만 표시되는 상태 인디케이터 */}
      {process.env.NODE_ENV === 'development' && (
        <>
          {/* 에러 상태 표시 */}
          {hasError && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white" 
                 title={`이미지 로딩 실패: ${src}`} />
          )}
          
          {/* Google 이미지 429 에러 표시 */}
          {shouldUseFallback && src?.includes('googleusercontent.com') && (
            <div className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-500 rounded-full border border-white" 
                 title={`Google 이미지 429 에러로 폴백 사용: ${src}`} />
          )}
          
          {/* 프록시 사용 표시 */}
          {useProxy && finalImageUrl.includes('/api/proxy-image') && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white" 
                 title={`프록시를 통해 이미지 로딩: ${src}`} />
          )}
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
  fallbackUrl = '/images/default-avatar.png',
  className = '',
  useProxy = true // 기본적으로 프록시 사용
}: Omit<SafeAvatarProps, 'onImageLoad' | 'onImageError'>) {
  const safeImageUrl = getSafeAvatarUrl(src, fallbackUrl, useProxy);
  const handleImageError = createImageErrorHandler(fallbackUrl, useProxy);
  
  // 이전에 실패한 URL인지 확인하여 즉시 폴백 사용
  const shouldUseFallback = src && isFailedImageUrl(src);
  const finalImageUrl = shouldUseFallback ? fallbackUrl : safeImageUrl;

  return (
    <div className="relative inline-block">
      <img
        src={finalImageUrl}
        alt={alt}
        className={`
          rounded-full object-cover bg-gray-200 
          ${sizeClasses[size]} 
          ${className}
        `}
        onError={handleImageError}
        loading="lazy"
      />
      
      {/* 개발 환경에서만 표시되는 상태 인디케이터 */}
      {process.env.NODE_ENV === 'development' && (
        <>
          {/* Google 이미지 429 에러 표시 */}
          {shouldUseFallback && src?.includes('googleusercontent.com') && (
            <div className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-500 rounded-full border border-white" 
                 title={`Google 이미지 429 에러로 폴백 사용: ${src}`} />
          )}
          
          {/* 프록시 사용 표시 */}
          {useProxy && finalImageUrl.includes('/api/proxy-image') && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-white" 
                 title={`프록시를 통해 이미지 로딩: ${src}`} />
          )}
        </>
      )}
    </div>
  );
} 