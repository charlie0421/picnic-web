'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  link?: string;
  order: number;
}

export interface BannerItemProps {
  banner: Banner;
}

export function BannerItem({ banner }: BannerItemProps) {
  const content = (
    <div className='relative w-full pb-[50.9%] bg-gray-200 overflow-hidden hover:shadow-lg transition-shadow'>
      {banner.imageUrl ? (
        <Image
          src={banner.imageUrl}
          alt={banner.title}
          fill
          sizes='(max-width: 639px) 50vw, (max-width: 1023px) 50vw, 33.33vw'
          className='object-cover'
          priority
        />
      ) : (
        <div className='absolute inset-0 flex items-center justify-center'>
          <span className='text-gray-600'>{banner.title}</span>
        </div>
      )}
    </div>
  );

  if (banner.link) {
    return (
      <Link href={banner.link}>
        {content}
      </Link>
    );
  }

  return content;
} 