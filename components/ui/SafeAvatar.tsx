'use client';

import React, { useState, useCallback } from 'react';
import { getSafeAvatarUrl, createImageErrorHandler } from '@/utils/image-utils';

interface SafeAvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackUrl?: string;
  className?: string;
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
 */
export function SafeAvatar({
  src,
  alt = '프로필 이미지',
  size = 'md',
  fallbackUrl = '/images/default-avatar.png',
  className = '',
  onImageLoad,
  onImageError
}: SafeAvatarProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // 안전한 이미지 URL 가져오기
  const safeImageUrl = getSafeAvatarUrl(src, fallbackUrl);
  
  // 이미지 로딩 완료 핸들러
  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onImageLoad?.();
  }, [onImageLoad]);
  
  // 이미지 에러 핸들러
  const handleImageError = useCallback(
    createImageErrorHandler(fallbackUrl),
    [fallbackUrl]
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
      {isLoading && (
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
        src={safeImageUrl}
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
      
      {/* 에러 상태 표시 (개발 환경에서만) */}
      {process.env.NODE_ENV === 'development' && hasError && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white" />
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
  className = ''
}: Omit<SafeAvatarProps, 'onImageLoad' | 'onImageError'>) {
  const safeImageUrl = getSafeAvatarUrl(src, fallbackUrl);
  const handleImageError = createImageErrorHandler(fallbackUrl);

  return (
    <img
      src={safeImageUrl}
      alt={alt}
      className={`
        rounded-full object-cover bg-gray-200 
        ${sizeClasses[size]} 
        ${className}
      `}
      onError={handleImageError}
      loading="lazy"
    />
  );
} 