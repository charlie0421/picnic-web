'use client';

import React from 'react';
import { SafeAvatar } from '@/components/ui/SafeAvatar';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

interface GoongHapHeaderProps {
  data: any;
  localized: any;
  artistName: string;
  artistImageUrl: string | null;
  userProfile: any;
  t: (key: string, fallback?: string) => string;
}

export function GoongHapHeader({
  data,
  localized,
  artistName,
  artistImageUrl,
  userProfile,
  t,
}: GoongHapHeaderProps) {
  return (
    <div className='relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 text-white shadow-lg'>
      <div className='absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_35%),radial-gradient(circle_at_70%_80%,white,transparent_35%)]' />
      <div className='relative px-6 py-8 sm:px-8 sm:py-10'>
        {/* 아티스트(왼쪽) - 하트 - 사용자(오른쪽) */}
        <div className='flex items-center justify-center gap-5 sm:gap-8'>
          <div className='flex flex-col items-center'>
            <div className='w-24 h-24 rounded-full overflow-hidden ring-4 ring-white/30 shadow-lg'>
              <OptimizedImage
                src={artistImageUrl || '/images/default-artist.png'}
                alt='Artist'
                width={96}
                height={96}
                className='w-full h-full object-cover'
                fallbackSrc='/images/default-artist.png'
              />
            </div>
            <span className='mt-2 text-xs sm:text-sm text-white/80'>{artistName || 'Artist'}</span>
          </div>
          <div className='text-3xl sm:text-4xl'>❤️</div>
          <div className='flex flex-col items-center'>
            <SafeAvatar src={userProfile?.avatar_url || ''} size='xl' className='rounded-full ring-4 ring-white/30 shadow-lg' />
            <span className='mt-2 text-xs sm:text-sm text-white/80'>
              {userProfile?.nickname || t('goongHap.you', 'You')}
            </span>
          </div>
        </div>
        <div className='mt-6 flex items-center justify-between'>
          <p className='text-xl sm:text-2xl font-extrabold drop-shadow'>{localized?.score_title || 'Compatibility'}</p>
          <div className='text-right'>
            <p className='text-3xl sm:text-4xl font-extrabold drop-shadow'>{data.score ?? '-'}<span className='text-base sm:text-lg font-medium ml-1 opacity-90'>pt</span></p>
            <p className='text-[10px] sm:text-xs opacity-90'>{new Date(data.created_at).toLocaleString('en-US', { timeZone: 'Asia/Seoul' })}</p>
          </div>
        </div>
        {localized?.goonghap_summary && (
          <p className='mt-3 sm:mt-4 text-sm sm:text-base text-white/95'>{localized.goonghap_summary}</p>
        )}
      </div>
    </div>
  );
}
