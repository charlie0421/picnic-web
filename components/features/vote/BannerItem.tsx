'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Banner } from '@/types/interfaces';
import { getCdnImageUrl } from '@/utils/api/image';
import { getLocalizedString } from '@/utils/api/strings';

interface BannerItemProps {
  banner: Banner;
}

const BannerItem: React.FC<BannerItemProps> = ({ banner }) => {
  try {
    const image = banner.image as { [key: string]: string } | null;
    const title = typeof banner.title === 'string' ? banner.title : '배너';

    return (
      <Link href={banner.link || '#'}>
        <div className='relative w-full pb-[50.9%] bg-gray-200 overflow-hidden hover:shadow-lg transition-shadow'>
          {image ? (
            <Image
              src={getCdnImageUrl(getLocalizedString(image), 786)}
              alt={title}
              fill
              sizes='(max-width: 639px) 50vw, (max-width: 1023px) 50vw, 33.33vw'
              className='object-cover'
              priority
            />
          ) : (
            <div className='absolute inset-0 flex items-center justify-center'>
              <span className='text-gray-600'>{title}</span>
            </div>
          )}
        </div>
      </Link>
    );
  } catch (error) {
    console.error('배너 렌더링 오류:', error);
    return (
      <div className='relative w-full pb-[50.9%] bg-gray-200 overflow-hidden'>
        <div className='absolute inset-0 flex items-center justify-center'>
          <span className='text-gray-600'>배너 로드 오류</span>
        </div>
      </div>
    );
  }
};

export default BannerItem; 