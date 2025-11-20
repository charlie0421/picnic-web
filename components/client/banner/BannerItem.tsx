'use client';

import React from 'react';
import Link from 'next/link';
import { Banner } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

export interface BannerItemProps {
  banner: Banner;
  priority?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
}

export function BannerItem({
  banner,
  priority = false,
  fetchPriority = 'auto',
}: BannerItemProps) {
  const content = (
    <div className='relative w-full bg-gray-200 overflow-hidden hover:shadow-lg transition-shadow rounded-lg banner-aspect-ratio'>
      {banner.image ? (
        <OptimizedImage
          src={getLocalizedString(banner.image)}
          alt={getLocalizedString(banner.title)}
          fill
          sizes='(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 33vw'
          className='object-cover'
          priority={priority}
          fetchPriority={fetchPriority}
        />
      ) : (
        <div className='absolute inset-0 flex items-center justify-center'>
          <span className='text-gray-600 text-lg font-medium'>{getLocalizedString(banner.title as string)}</span>
        </div>
      )}
      
      {/* 배너 제목 오버레이 (선택사항) */}
        {banner.title && banner.image && (
        <div className='absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4'>
          <h3 className='text-white text-lg font-semibold'>{getLocalizedString(banner.title as string)}</h3>
        </div>
      )}
      
      <style jsx>{`
        .banner-aspect-ratio {
          aspect-ratio: 700/356;
        }
      `}</style>
    </div>
  );

  if (banner.link) {
    return (
      <Link
        href={banner.link}
        className='block'
        aria-label={getLocalizedString(banner.title as string)}
        title={getLocalizedString(banner.title as string)}
      >
        {content}
      </Link>
    );
  }

  return content;
} 