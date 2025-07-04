'use client';

import React from 'react';
import {Media} from '@/types/interfaces';
import {getLocalizedString} from '@/utils/api/strings';
import Link from 'next/link';
import Image from 'next/image';
import {useLanguageStore} from '@/stores/languageStore';

interface MediaListProps {
  media: Media[];
  className?: string;
}

const MediaListPresenter: React.FC<MediaListProps> = ({ media, className }) => {
  const { currentLanguage, t } = useLanguageStore();

  const getTitleString = (title: any) => {
    if (!title) return t('media_no_title');
    if (typeof title === 'string') return title;
    return getLocalizedString(title);
  };

  const renderThumbnail = (media: Media) => {
    const hasValidVideoId =
      media.video_id &&
      typeof media.video_id === 'string' &&
      media.video_id.trim() !== '';

    let thumbnailUrl = '/images/logo.png';
    if (media.thumbnail_url) {
      thumbnailUrl = media.thumbnail_url;
    } else if (hasValidVideoId) {
      thumbnailUrl = `https://img.youtube.com/vi/${media.video_id}/0.jpg`;
    }

    return (
      <div className='relative w-full aspect-video overflow-hidden rounded-lg'>
        <Image
          src={thumbnailUrl}
          alt={getTitleString(media.title)}
          fill
          className='object-cover transition-transform duration-300 hover:scale-105'
          sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
          unoptimized={thumbnailUrl.startsWith('https://img.youtube.com')}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.src = '/images/logo.png';
          }}
        />
        <div className='absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300'>
          <div className='bg-white/20 backdrop-blur-sm rounded-full p-4'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-12 w-12 text-white drop-shadow-lg'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z'
              />
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className || ''}`}>
      {media.map((mediaItem) => (
        <Link
          href={
            mediaItem.video_url ||
            `https://www.youtube.com/watch?v=${mediaItem.video_id}`
          }
          key={mediaItem.id}
          target='_blank'
          rel='noopener noreferrer'
          className='block'
        >
          <div className='bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300'>
            {renderThumbnail(mediaItem)}
            <div className='p-4 bg-white/90'>
              <h2 className='text-lg font-semibold text-gray-800 line-clamp-2 mb-2'>
                {getTitleString(mediaItem.title)}
              </h2>
              <p className='text-sm text-gray-700'>
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
        </Link>
      ))}

      {media.length === 0 && (
        <div className='text-center py-12 col-span-full'>
          <p className='text-xl text-gray-800 font-medium'>{t('media_no_items')}</p>
        </div>
      )}
    </div>
  );
};

export default MediaListPresenter;
