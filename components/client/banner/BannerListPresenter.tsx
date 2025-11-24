'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BannerItem } from './BannerItem';
import { BannerCarouselClient } from './BannerCarouselClient';
import { Banner } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';

export interface BannerListProps {
  banners: Banner[];
  className?: string;
}

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

function HeroBannerFallback({ banners, className }: BannerListProps) {
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

  const placeholderCount = useMemo(() => {
    if (banners.length === 1) {
      return 1;
    }
    if (banners.length === 2) {
      return 2;
    }
    return Math.max(Math.min(banners.length, 3), 2);
  }, [banners.length]);

  const placeholders = useMemo(
    () =>
      Array.from({ length: placeholderCount }).map((_, index) => ({
        id: banners[index]?.id ?? `placeholder-${index}`,
        title: banners[index]?.title
          ? getLocalizedString(banners[index]?.title)
          : null,
      })),
    [banners, placeholderCount],
  );

  return (
    <div className={containerClassName}>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
        {placeholders.map((placeholder, index) => (
          <div key={placeholder.id ?? index} className='space-y-3'>
            <div
              className='relative w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse'
              style={{ aspectRatio: '700 / 356' }}
            />
            {placeholder.title ? (
              <p className='text-sm font-semibold text-gray-600 line-clamp-2'>
                {placeholder.title}
              </p>
            ) : (
              <div className='h-4 bg-gray-100 rounded w-2/3 animate-pulse' />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BannerListPresenter({ banners, className }: BannerListProps) {
  const [isInteractiveReady, setIsInteractiveReady] = useState(
    banners.length <= 1,
  );
  const wrapperClassName = useMemo(
    () => ['relative w-full', className].filter(Boolean).join(' '),
    [className],
  );
  const shouldShowFallback = !isInteractiveReady && banners.length > 1;

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

  return (
    <div className={wrapperClassName}>
      <div
        className={`h-full transition-opacity duration-300 ${
          shouldShowFallback
            ? 'opacity-0 pointer-events-none select-none'
            : 'opacity-100'
        }`}
      >
        <BannerCarouselClient banners={banners} className={className} />
      </div>
      {shouldShowFallback && (
        <div className='absolute inset-0 pointer-events-none select-none'>
          <HeroBannerFallback banners={banners} className='h-full' />
        </div>
      )}
    </div>
  );
}