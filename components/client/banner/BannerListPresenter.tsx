'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useMemo, useState } from 'react';
import { BannerItem } from './BannerItem';
import { Banner } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';

export interface BannerListProps {
  banners: Banner[];
  className?: string;
}

const BannerCarouselClient = dynamic(
  () => import('./BannerCarouselClient'),
  {
    ssr: false,
    loading: () => null,
  },
);

const runWhenIdle = (callback: () => void, timeout = 800) => {
  if (typeof window === 'undefined') return () => {};

  if ('requestIdleCallback' in window) {
    const handle = (window as typeof window & Window)['requestIdleCallback'](
      callback,
      { timeout },
    );
    return () =>
      (window as typeof window & Window)['cancelIdleCallback'](handle);
  }

  const handle = setTimeout(callback, timeout);
  return () => clearTimeout(handle);
};

function HeroBannerFallback({
  banners,
  className,
}: BannerListProps) {
  const containerClassName = useMemo(
    () => ['relative w-full', className].filter(Boolean).join(' '),
    [className],
  );

  if (banners.length === 0) {
    return (
      <div className={containerClassName}>
        <div className='bg-gray-100 p-6 rounded-lg text-center w-full min-h-[180px]'>
          <div className='flex items-center justify-center h-full'>
            <p className='text-gray-500'>현재 표시할 배너가 없습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  const hero = banners[0];
  const previewBanners = banners.slice(1, 3);

  return (
    <div className={containerClassName}>
      <BannerItem
        banner={hero}
        priority
        fetchPriority='high'
      />
      {previewBanners.length > 0 && (
        <div className='grid grid-cols-2 md:grid-cols-3 gap-3 mt-4'>
          {previewBanners.map((banner) => (
            <div
              key={banner.id}
              className='rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 p-3 shadow-inner'
              style={{ minHeight: '96px' }}
            >
              <p className='text-sm font-semibold text-gray-700 line-clamp-2'>
                {getLocalizedString(banner.title)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BannerListPresenter({ banners, className }: BannerListProps) {
  const [isInteractiveReady, setIsInteractiveReady] = useState(
    banners.length <= 1,
  );

  useEffect(() => {
    if (banners.length <= 1) {
      setIsInteractiveReady(true);
      return;
    }

    let cancelled = false;
    const dispose = runWhenIdle(() => {
      if (!cancelled) {
        setIsInteractiveReady(true);
      }
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [banners.length]);

  if (!isInteractiveReady) {
    return <HeroBannerFallback banners={banners} className={className} />;
  }

  return (
    <BannerCarouselClient banners={banners} className={className} />
  );
}