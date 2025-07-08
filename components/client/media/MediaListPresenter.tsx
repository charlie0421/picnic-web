'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Media } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { preloadImage, createImageErrorHandler } from '@/utils/image-utils';

interface MediaListProps {
  media: Media[];
  className?: string;
}

const MediaListPresenter: React.FC<MediaListProps> = ({ media, className }) => {
  const { currentLanguage, t } = useLanguageStore();
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const getTitleString = (title: any) => {
    if (!title) return t('media_no_title');
    if (typeof title === 'string') return title;
    return getLocalizedString(title);
  };

  // 이미지 프리로딩 및 우선순위 처리
  useEffect(() => {
    const preloadImages = async () => {
      // 첫 3개 미디어의 이미지를 프리로드
      const priorityMedia = media.slice(0, 3);
      
      const preloadPromises = priorityMedia.map(async (mediaItem, index) => {
        const imageUrl = getOptimizedImageUrl(mediaItem);
        if (imageUrl && imageUrl !== '/images/logo.png') {
          try {
            const success = await preloadImage(imageUrl);
            if (success) {
              setLoadedImages(prev => {
                const newSet = new Set(prev);
                newSet.add(imageUrl);
                return newSet;
              });
              if (process.env.NODE_ENV === 'development') {
                console.log(`🖼️ [MediaList] 이미지 프리로드 성공 [${index + 1}]:`, imageUrl);
              }
            } else {
              setImageErrors(prev => {
                const newSet = new Set(prev);
                newSet.add(imageUrl);
                return newSet;
              });
              if (process.env.NODE_ENV === 'development') {
                console.warn(`🖼️ [MediaList] 이미지 프리로드 실패 [${index + 1}]:`, imageUrl);
              }
            }
          } catch (error) {
            setImageErrors(prev => {
              const newSet = new Set(prev);
              newSet.add(imageUrl);
              return newSet;
            });
            if (process.env.NODE_ENV === 'development') {
              console.warn(`🖼️ [MediaList] 이미지 프리로드 에러 [${index + 1}]:`, imageUrl, error);
            }
          }
        }
      });

      await Promise.allSettled(preloadPromises);
    };

    if (media.length > 0) {
      preloadImages();
    }
  }, [media]);

  // 최적화된 이미지 URL 생성
  const getOptimizedImageUrl = useCallback((mediaItem: Media): string => {
    const hasValidVideoId =
      mediaItem.video_id &&
      typeof mediaItem.video_id === 'string' &&
      mediaItem.video_id.trim() !== '';

    // 1. CDN 썸네일 우선 사용 (크기 최적화)
    if (mediaItem.thumbnail_url) {
      return getCdnImageUrl(mediaItem.thumbnail_url, 400); // 400px로 최적화
    }
    
    // 2. YouTube 썸네일 (고화질 버전 사용)
    if (hasValidVideoId) {
      return `https://img.youtube.com/vi/${mediaItem.video_id}/hqdefault.jpg`;
    }
    
    // 3. 기본 이미지
    return '/images/logo.png';
  }, []);

  // 개선된 이미지 에러 핸들러
  const handleImageError = useCallback((mediaItem: Media) => {
    return createImageErrorHandler('/images/logo.png', true);
  }, []);

  // 이미지 로딩 완료 핸들러
  const handleImageLoad = useCallback((imageUrl: string) => {
    setLoadedImages(prev => {
      const newSet = new Set(prev);
      newSet.add(imageUrl);
      return newSet;
    });
  }, []);

  const renderThumbnail = (mediaItem: Media, index: number) => {
    const imageUrl = getOptimizedImageUrl(mediaItem);
    const isLoaded = loadedImages.has(imageUrl);
    const hasError = imageErrors.has(imageUrl);
    const isPriority = index < 3; // 첫 3개 이미지는 우선순위

    return (
      <div className='relative w-full aspect-video overflow-hidden rounded-lg bg-gray-100'>
        {/* 로딩 상태 표시 */}
        {!isLoaded && !hasError && (
          <div className='absolute inset-0 flex items-center justify-center bg-gray-200 animate-pulse'>
            <div className='w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin'></div>
          </div>
        )}

        <Image
          src={imageUrl}
          alt={getTitleString(mediaItem.title)}
          fill
          className={`
            object-cover transition-all duration-500 
            hover:scale-105 hover:brightness-110
            ${isLoaded ? 'opacity-100' : 'opacity-0'}
            ${hasError ? 'grayscale' : ''}
          `}
          sizes='(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw'
          priority={isPriority} // 첫 3개 이미지만 우선 로딩
          loading={isPriority ? 'eager' : 'lazy'}
          unoptimized={imageUrl.includes('youtube.com')} // YouTube 이미지만 unoptimized
          onLoad={() => handleImageLoad(imageUrl)}
          onError={handleImageError(mediaItem)}
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
        />

        {/* 플레이 버튼 오버레이 (비디오인 경우) */}
        {(mediaItem.video_url || mediaItem.video_id) && (
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='w-16 h-16 bg-black/70 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity'>
              <svg
                className='w-8 h-8 text-white ml-1'
                fill='currentColor'
                viewBox='0 0 24 24'
              >
                <path d='M8 5v14l11-7z' />
              </svg>
            </div>
          </div>
        )}

        {/* 개발 환경에서 성능 지표 표시 */}
        {process.env.NODE_ENV === 'development' && (
          <div className='absolute top-2 left-2 flex gap-1'>
            {isPriority && (
              <div className='w-3 h-3 bg-green-500 rounded-full' title='Priority 이미지' />
            )}
            {isLoaded && (
              <div className='w-3 h-3 bg-blue-500 rounded-full' title='로딩 완료' />
            )}
            {hasError && (
              <div className='w-3 h-3 bg-red-500 rounded-full' title='로딩 실패' />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className || ''}`}>
      {media.map((mediaItem, index) => (
        <Link
          href={
            mediaItem.video_url ||
            `https://www.youtube.com/watch?v=${mediaItem.video_id}`
          }
          key={mediaItem.id}
          target='_blank'
          rel='noopener noreferrer'
          className='block group'
        >
          <article className='bg-white shadow-md rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full'>
            {renderThumbnail(mediaItem, index)}
            <div className='p-4 bg-white/95 backdrop-blur-sm flex-1 flex flex-col'>
              <h2 className='text-lg font-semibold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors h-14 overflow-hidden'>
                <span className='line-clamp-2 leading-7'>
                  {getTitleString(mediaItem.title)}
                </span>
              </h2>
              <div className='flex items-center justify-between mt-auto'>
                <p className='text-sm text-gray-600'>
                  {new Date(mediaItem.created_at).toLocaleDateString(
                    currentLanguage === 'ko' ? 'ko-KR' : 'en-US',
                    {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    },
                  )}
                </p>
              </div>
            </div>
          </article>
        </Link>
      ))}

      {media.length === 0 && (
        <div className='text-center py-12 col-span-full'>
          <div className='text-6xl mb-4'>🎬</div>
          <p className='text-xl text-gray-800 font-medium mb-2'>{t('media_no_items')}</p>
          <p className='text-gray-600'>{t('media_no_items_description') || '곧 새로운 미디어가 추가될 예정입니다.'}</p>
        </div>
      )}
    </div>
  );
};

export default MediaListPresenter;
