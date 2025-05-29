'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Banner } from '@/types/interfaces';
import { getCdnImageUrl } from '@/utils/api/image';
import { getLocalizedString } from '@/utils/api/strings';

export interface BannerItemProps {
  banner: Banner;
}

export function BannerItem({ banner }: BannerItemProps) {
  const content = (
    <div className='relative w-full bg-gray-200 overflow-hidden hover:shadow-lg transition-shadow rounded-lg banner-aspect-ratio'>
      {banner.image ? (
        <Image
          src={getCdnImageUrl(getLocalizedString(banner.image))}
          alt={getLocalizedString(banner.title)}
          fill
          sizes='(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 33vw'
          className='object-cover'
          priority
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
      <Link href={banner.link} className='block'>
        {content}
      </Link>
    );
  }

  return content;
} 